package com.att.gsih.api.web;

import io.swagger.v3.oas.annotations.Operation;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Issues demo tokens shaped exactly like the ones Entra ID returns, so the dashboard and the API can
 * be exercised end to end without a tenant.
 *
 * <p>Bound to the {@code local} profile only. In every deployed environment this controller does not
 * exist and the front end runs the standard MSAL authorisation-code flow against the corporate
 * tenant.
 */
@RestController
@RequestMapping("/api/v1/auth")
@Profile("local")
public class LocalTokenController {

  private final JwtEncoder encoder;

  public LocalTokenController(JwtEncoder encoder) {
    this.encoder = encoder;
  }

  @GetMapping("/local-token")
  @Operation(summary = "Mint a demo token (local profile only) mirroring Entra ID claim shape")
  public ResponseEntity<Map<String, Object>> token(
      @RequestParam String username,
      @RequestParam List<String> roles,
      @RequestParam(required = false) String region) {

    Instant now = Instant.now();
    JwtClaimsSet.Builder claims =
        JwtClaimsSet.builder()
            .issuer("https://gsih.local/dev")
            .issuedAt(now)
            .expiresAt(now.plus(8, ChronoUnit.HOURS))
            .subject(username)
            .claim("preferred_username", username)
            .claim("roles", roles);
    if (region != null && !region.isBlank()) {
      claims.claim("region", region);
    }

    // The header algorithm has to be stated explicitly: the encoder defaults to RS256 and
    // would look for an RSA key that a symmetric local profile does not have.
    JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
    String token = encoder.encode(JwtEncoderParameters.from(header, claims.build())).getTokenValue();
    return ResponseEntity.ok(
        Map.of("access_token", token, "token_type", "Bearer", "expires_in", 8 * 3600));
  }
}
