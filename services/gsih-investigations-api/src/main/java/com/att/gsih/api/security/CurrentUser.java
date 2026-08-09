package com.att.gsih.api.security;

import com.att.gsih.common.model.Enums.UserRole;
import java.util.List;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;

/**
 * The caller, as described by their Entra ID token.
 *
 * @param email the signed-in identity, used to scope the investigator queue
 * @param role the highest-privilege role on the token
 * @param region the region the caller is entitled to see; {@code null} means enterprise-wide
 */
public record CurrentUser(String email, UserRole role, String region) {

  /** Claim carrying the caller's assigned region, populated by an Entra ID claims mapping policy. */
  public static final String REGION_CLAIM = "region";

  public static CurrentUser from(Authentication authentication) {
    Jwt jwt = (Jwt) authentication.getPrincipal();
    String email = jwt.getClaimAsString("preferred_username");
    if (email == null) {
      email = jwt.getSubject();
    }
    return new CurrentUser(email, highestRole(jwt), jwt.getClaimAsString(REGION_CLAIM));
  }

  /**
   * Executives see the enterprise; everyone else is confined to their own region.
   *
   * <p>Returning the caller's region here is what keeps a regional manager from reading another
   * region's cases — every dashboard query threads this value into its {@code where} clause.
   */
  public String regionScope() {
    return role == UserRole.EXECUTIVE ? null : region;
  }

  private static UserRole highestRole(Jwt jwt) {
    List<String> roles = jwt.getClaimAsStringList("roles");
    if (roles == null) {
      return UserRole.INVESTIGATOR;
    }
    if (roles.contains(UserRole.EXECUTIVE.name())) {
      return UserRole.EXECUTIVE;
    }
    if (roles.contains(UserRole.MANAGER.name())) {
      return UserRole.MANAGER;
    }
    return UserRole.INVESTIGATOR;
  }
}
