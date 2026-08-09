package com.att.gsih.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.att.gsih.api.repo.CaseRepository;
import com.att.gsih.api.repo.SiteRepository;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The deployed security profile, exercised rather than assumed.
 *
 * <p>Every other test in this suite runs under the {@code local} profile, which verifies tokens
 * with a symmetric key. That leaves the profile the service actually runs under in Azure — an
 * OAuth2 resource server pointed at Microsoft Entra ID — covered by nothing but the fact that it
 * compiles. This test closes that gap: it stands up a stub OpenID provider on a loopback port,
 * serving a discovery document and a JWKS built from a freshly generated RSA key, boots the
 * application with {@code azure} active against it, and signs its own RS256 tokens.
 *
 * <p>What that proves is the whole verification path: discovery, JWKS fetch, signature check,
 * issuer and audience validation, expiry, and the mapping from Entra's {@code roles} and
 * {@code region} claims onto Spring authorities and the region predicate. What it deliberately
 * cannot prove is the tenant configuration itself — the app registration, the group-to-app-role
 * assignments and the audience value are things only a real directory can confirm, and they are
 * listed as Phase 1 confirmations rather than claimed here.
 *
 * <p>No new dependencies: the provider is the JDK's own HTTP server and the keys and tokens come
 * from the Nimbus library Spring Security already ships.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles({"azure", "test"})
class EntraResourceServerTest {

  private static final String AUDIENCE = "api://gsih-investigations";

  private static final HttpServer PROVIDER;
  private static final RSAKey SIGNING_KEY;
  private static final String ISSUER;

  static {
    try {
      KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
      generator.initialize(2048);
      var pair = generator.generateKeyPair();
      SIGNING_KEY =
          new RSAKey.Builder((RSAPublicKey) pair.getPublic())
              .privateKey((RSAPrivateKey) pair.getPrivate())
              .keyID(UUID.randomUUID().toString())
              .build();

      PROVIDER = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
      ISSUER = "http://127.0.0.1:" + PROVIDER.getAddress().getPort();

      PROVIDER.createContext(
          "/.well-known/openid-configuration",
          exchange ->
              respond(
                  exchange,
                  """
                  {"issuer":"%s","jwks_uri":"%s/keys",\
                  "authorization_endpoint":"%s/authorize","token_endpoint":"%s/token",\
                  "response_types_supported":["code"],"subject_types_supported":["public"],\
                  "id_token_signing_alg_values_supported":["RS256"]}"""
                      .formatted(ISSUER, ISSUER, ISSUER, ISSUER)));

      // Only the public half is published, exactly as a real JWKS endpoint does.
      PROVIDER.createContext(
          "/keys",
          exchange -> respond(exchange, new JWKSet(SIGNING_KEY.toPublicJWK()).toString()));

      PROVIDER.start();
    } catch (Exception cannotStart) {
      throw new IllegalStateException("could not start the stub identity provider", cannotStart);
    }
  }

  private static void respond(com.sun.net.httpserver.HttpExchange exchange, String body)
      throws IOException {
    byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
    exchange.getResponseHeaders().add("Content-Type", "application/json");
    exchange.sendResponseHeaders(200, bytes.length);
    try (OutputStream out = exchange.getResponseBody()) {
      out.write(bytes);
    }
  }

  @AfterAll
  static void stopProvider() {
    PROVIDER.stop(0);
  }

  @DynamicPropertySource
  static void pointTheResourceServerAtTheStub(DynamicPropertyRegistry registry) {
    registry.add("spring.security.oauth2.resourceserver.jwt.issuer-uri", () -> ISSUER);
    registry.add("spring.security.oauth2.resourceserver.jwt.audiences", () -> AUDIENCE);
  }

  @Autowired MockMvc mvc;
  @Autowired CaseRepository cases;
  @Autowired SiteRepository sites;

  @BeforeEach
  void seed() {
    cases.deleteAll();
    sites.deleteAll();
    sites.save(TestData.site("SW-SITE", "SOUTHWEST"));
    sites.save(TestData.site("NE-SITE", "NORTHEAST"));
    cases.save(
        TestData.openCase(
            "SW-1", "dana@att.com", "SW-SITE", "SOUTHWEST", Instant.now().minus(4, ChronoUnit.DAYS)));
    cases.save(
        TestData.openCase(
            "NE-1", "sam@att.com", "NE-SITE", "NORTHEAST", Instant.now().minus(4, ChronoUnit.DAYS)));
  }

  /** A token shaped the way Entra ID issues them for this API. */
  private String token(Map<String, Object> overrides) throws Exception {
    Instant now = Instant.now();
    JWTClaimsSet.Builder claims =
        new JWTClaimsSet.Builder()
            .issuer(ISSUER)
            .audience(AUDIENCE)
            .subject("00000000-0000-0000-0000-000000000001")
            .claim("preferred_username", "dana@att.com")
            .claim("roles", List.of("INVESTIGATOR"))
            .claim("region", "SOUTHWEST")
            .issueTime(Date.from(now))
            .expirationTime(Date.from(now.plus(1, ChronoUnit.HOURS)));

    overrides.forEach(
        (name, value) -> {
          switch (name) {
            case "iss" -> claims.issuer((String) value);
            case "aud" -> claims.audience((String) value);
            case "exp" -> claims.expirationTime(Date.from((Instant) value));
            default -> claims.claim(name, value);
          }
        });

    SignedJWT jwt =
        new SignedJWT(
            new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(SIGNING_KEY.getKeyID()).build(),
            claims.build());
    jwt.sign(new RSASSASigner(SIGNING_KEY.toPrivateKey()));
    return jwt.serialize();
  }

  @Test
  void aTokenFromTheDirectoryIsAcceptedAndItsRoleAndRegionAreHonoured() throws Exception {
    mvc.perform(
            get("/api/v1/dashboards/investigator")
                .header("Authorization", "Bearer " + token(Map.of())))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.investigator").value("dana@att.com"))
        // The `region` claim confines the query exactly as it does under the local profile.
        .andExpect(jsonPath("$.openCases").value(1));
  }

  @Test
  void theLocalTokenEndpointDoesNotExistUnderTheDeployedProfile() throws Exception {
    // The demo mint is @Profile("local"). If it were ever reachable in Azure, anyone could
    // issue themselves an executive token.
    mvc.perform(get("/api/v1/auth/local-token?username=x&roles=EXECUTIVE"))
        .andExpect(status().isNotFound());
  }

  @Test
  void aTokenForAnotherApiIsRefused() throws Exception {
    // Audience validation is the control that stops a token minted for a different
    // application in the same tenant from opening this one.
    mvc.perform(
            get("/api/v1/dashboards/investigator")
                .header("Authorization", "Bearer " + token(Map.of("aud", "api://some-other-app"))))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void aTokenFromAnotherIssuerIsRefused() throws Exception {
    mvc.perform(
            get("/api/v1/dashboards/investigator")
                .header("Authorization", "Bearer " + token(Map.of("iss", "https://evil.example"))))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void anExpiredTokenIsRefused() throws Exception {
    mvc.perform(
            get("/api/v1/dashboards/investigator")
                .header(
                    "Authorization",
                    "Bearer " + token(Map.of("exp", Instant.now().minus(5, ChronoUnit.MINUTES)))))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void aTokenSignedWithTheWrongKeyIsRefused() throws Exception {
    KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
    generator.initialize(2048);
    var impostor = generator.generateKeyPair();
    SignedJWT jwt =
        new SignedJWT(
            new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(SIGNING_KEY.getKeyID()).build(),
            new JWTClaimsSet.Builder()
                .issuer(ISSUER)
                .audience(AUDIENCE)
                .claim("preferred_username", "dana@att.com")
                .claim("roles", List.of("EXECUTIVE"))
                .expirationTime(Date.from(Instant.now().plus(1, ChronoUnit.HOURS)))
                .build());
    jwt.sign(new RSASSASigner((RSAPrivateKey) impostor.getPrivate()));

    mvc.perform(
            get("/api/v1/dashboards/executive").header("Authorization", "Bearer " + jwt.serialize()))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void theRoleClaimStillGatesTheEnterpriseView() throws Exception {
    mvc.perform(
            get("/api/v1/dashboards/executive")
                .header("Authorization", "Bearer " + token(Map.of())))
        .andExpect(status().isForbidden());

    mvc.perform(
            get("/api/v1/dashboards/executive")
                .header(
                    "Authorization",
                    "Bearer "
                        + token(
                            Map.of(
                                "roles",
                                List.of("EXECUTIVE"),
                                "preferred_username",
                                "priya@att.com"))))
        .andExpect(status().isOk());
  }

  @Test
  void anUnauthenticatedRequestIsRefusedRatherThanServedAnonymously() throws Exception {
    mvc.perform(get("/api/v1/dashboards/investigator")).andExpect(status().isUnauthorized());
  }
}
