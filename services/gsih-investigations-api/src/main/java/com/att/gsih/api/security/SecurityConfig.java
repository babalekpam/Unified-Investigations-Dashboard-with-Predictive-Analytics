package com.att.gsih.api.security;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import java.util.Collection;
import java.util.List;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.convert.converter.Converter;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Section 5.3 — role-based access control on top of the enterprise identity provider.
 *
 * <p>In production the API is an OAuth2 resource server in front of Microsoft Entra ID: tokens are
 * issued by the corporate tenant, and the {@code roles} claim carries the app roles assigned to each
 * security group (Investigator, Manager, Executive). Nothing about user provisioning lives here.
 *
 * <p>The {@code local} profile swaps the Entra ID decoder for a symmetric key so the stack can be
 * demonstrated on a laptop with no tenant. The two profiles differ only in how a token is verified —
 * the authorisation rules below are identical, so what you test locally is what runs in Azure.
 */
@Configuration
@EnableMethodSecurity
public class SecurityConfig {

  @Bean
  SecurityFilterChain apiSecurity(
      HttpSecurity http, @Qualifier("corsConfigurationSource") CorsConfigurationSource cors)
      throws Exception {
    http.csrf(csrf -> csrf.disable())
        .cors(c -> c.configurationSource(cors))
        .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .authorizeHttpRequests(
            auth ->
                auth.requestMatchers(HttpMethod.GET, "/actuator/health/**", "/actuator/info")
                    .permitAll()
                    .requestMatchers("/api/v1/auth/**")
                    .permitAll()
                    .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html")
                    .permitAll()
                    // Score and forecast writes come from the analytics service's workload
                    // identity, which holds the ANALYTICS_WRITER app role.
                    .requestMatchers(HttpMethod.POST, "/api/v1/risk/**")
                    .hasAuthority("ROLE_ANALYTICS_WRITER")
                    .anyRequest()
                    .authenticated())
        .oauth2ResourceServer(oauth -> oauth.jwt(jwt -> jwt.jwtAuthenticationConverter(converter())));
    return http.build();
  }

  /** Maps Entra ID's {@code roles} claim onto Spring authorities. */
  private Converter<Jwt, AbstractAuthenticationToken> converter() {
    JwtGrantedAuthoritiesConverter scopes = new JwtGrantedAuthoritiesConverter();
    JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
    converter.setPrincipalClaimName("preferred_username");
    converter.setJwtGrantedAuthoritiesConverter(
        jwt -> {
          Collection<GrantedAuthority> authorities =
              new java.util.ArrayList<>(scopes.convert(jwt));
          List<String> roles = jwt.getClaimAsStringList("roles");
          if (roles != null) {
            roles.stream()
                .map(role -> new SimpleGrantedAuthority("ROLE_" + role.toUpperCase()))
                .forEach(authorities::add);
          }
          return authorities;
        });
    return converter;
  }

  @Bean
  CorsConfigurationSource corsConfigurationSource(
      @Value("${gsih.cors.allowed-origins:http://localhost:5173}") List<String> allowedOrigins) {
    CorsConfiguration config = new CorsConfiguration();
    config.setAllowedOrigins(allowedOrigins);
    config.setAllowedMethods(List.of("GET", "POST", "OPTIONS"));
    config.setAllowedHeaders(List.of("Authorization", "Content-Type"));
    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/api/**", config);
    return source;
  }

  /**
   * Local / demo verification key. Never active under the {@code azure} profile, where the decoder
   * is built from {@code spring.security.oauth2.resourceserver.jwt.issuer-uri} instead.
   */
  @Bean
  @Profile("local")
  JwtDecoder localJwtDecoder(@Value("${gsih.security.local-signing-key}") String key) {
    return NimbusJwtDecoder.withSecretKey(secretKey(key)).macAlgorithm(MacAlgorithm.HS256).build();
  }

  @Bean
  @Profile("local")
  JwtEncoder localJwtEncoder(@Value("${gsih.security.local-signing-key}") String key) {
    return new NimbusJwtEncoder(new ImmutableSecret<>(secretKey(key)));
  }

  private static SecretKeySpec secretKey(String key) {
    return new SecretKeySpec(key.getBytes(java.nio.charset.StandardCharsets.UTF_8), "HmacSHA256");
  }
}
