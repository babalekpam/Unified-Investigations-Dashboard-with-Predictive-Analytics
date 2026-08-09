package com.att.gsih.ingest.sink;

import java.time.ZoneId;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * In-memory view of the facility list, used to attach a region and a timezone to every inbound
 * event without a database round trip per message.
 *
 * <p>Sites change on the order of weeks, so the whole list is refreshed on a timer. A site that
 * appears between two refreshes is not harmless, though, which is why the timer is not the only
 * path: region drives access confinement and every regional KPI, and the site's timezone decides
 * whether a badge read counts as after hours. An event written with a null region during the
 * refresh window is invisible to that region's manager and lands under "unassigned" for the
 * executive — and nothing backfills it later. So a cache miss falls through to a single-row lookup
 * and the answer is remembered, including the answer "no such site", so a genuinely unknown site
 * costs one query per refresh interval rather than one per message.
 */
@Component
public class SiteDirectory {

  private static final Logger log = LoggerFactory.getLogger(SiteDirectory.class);

  private final JdbcTemplate jdbc;
  private final AtomicReference<Map<String, SiteInfo>> cache = new AtomicReference<>(Map.of());

  /** Sites resolved one at a time since the last bulk refresh, including confirmed absences. */
  private final Map<String, Optional<SiteInfo>> resolvedSinceRefresh = new ConcurrentHashMap<>();

  public SiteDirectory(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
    refresh();
  }

  public record SiteInfo(String siteCode, String region, ZoneId zone) {}

  @Scheduled(fixedDelayString = "${gsih.ingest.site-refresh-ms:900000}")
  public final void refresh() {
    try {
      Map<String, SiteInfo> loaded = new HashMap<>();
      jdbc.query(
          "select site_code, region, coalesce(timezone, 'UTC') as timezone from site",
          rs -> {
            loaded.put(
                rs.getString("site_code"),
                new SiteInfo(
                    rs.getString("site_code"), rs.getString("region"), zone(rs.getString("timezone"))));
          });
      cache.set(Map.copyOf(loaded));
      // The bulk snapshot supersedes anything looked up individually, absences included: a site
      // that did not exist an hour ago may exist now.
      resolvedSinceRefresh.clear();
      log.debug("site directory refreshed with {} facilities", loaded.size());
    } catch (RuntimeException ex) {
      // Keep serving the previous snapshot rather than dropping regions off every inbound event.
      log.error("site directory refresh failed, continuing with the cached snapshot", ex);
    }
  }

  public String regionOf(String siteCode) {
    SiteInfo info = info(siteCode);
    return info == null ? null : info.region();
  }

  public ZoneId zoneOf(String siteCode) {
    SiteInfo info = info(siteCode);
    return info == null ? ZoneId.of("UTC") : info.zone();
  }

  /** The cached snapshot first, then one lookup, then a remembered answer either way. */
  private SiteInfo info(String siteCode) {
    if (siteCode == null) {
      return null;
    }
    SiteInfo cached = cache.get().get(siteCode);
    if (cached != null) {
      return cached;
    }
    return resolvedSinceRefresh.computeIfAbsent(siteCode, this::loadOne).orElse(null);
  }

  private Optional<SiteInfo> loadOne(String siteCode) {
    try {
      return jdbc
          .query(
              "select site_code, region, coalesce(timezone, 'UTC') as timezone from site where site_code = ?",
              (rs, rowNum) ->
                  new SiteInfo(
                      rs.getString("site_code"),
                      rs.getString("region"),
                      zone(rs.getString("timezone"))),
              siteCode)
          .stream()
          .findFirst();
    } catch (RuntimeException ex) {
      // A failed lookup is not a confirmed absence; do not remember it as one.
      log.warn("could not resolve site {} on demand: {}", siteCode, ex.getMessage());
      throw ex;
    }
  }

  public int size() {
    return cache.get().size();
  }

  private static ZoneId zone(String raw) {
    try {
      return ZoneId.of(raw);
    } catch (RuntimeException ex) {
      log.warn("site has an unrecognised timezone '{}', falling back to UTC", raw);
      return ZoneId.of("UTC");
    }
  }
}
