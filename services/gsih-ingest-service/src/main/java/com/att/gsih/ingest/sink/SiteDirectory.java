package com.att.gsih.ingest.sink;

import java.time.ZoneId;
import java.util.HashMap;
import java.util.Map;
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
 * <p>Sites change on the order of weeks, so the cache is refreshed on a timer. A missed refresh is
 * harmless: an event for an unknown site is still stored, just without a region, and the next
 * refresh backfills nothing — it only affects rows arriving while the cache was stale.
 */
@Component
public class SiteDirectory {

  private static final Logger log = LoggerFactory.getLogger(SiteDirectory.class);

  private final JdbcTemplate jdbc;
  private final AtomicReference<Map<String, SiteInfo>> cache = new AtomicReference<>(Map.of());

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
      log.debug("site directory refreshed with {} facilities", loaded.size());
    } catch (RuntimeException ex) {
      // Keep serving the previous snapshot rather than dropping regions off every inbound event.
      log.error("site directory refresh failed, continuing with the cached snapshot", ex);
    }
  }

  public String regionOf(String siteCode) {
    SiteInfo info = cache.get().get(siteCode);
    return info == null ? null : info.region();
  }

  public ZoneId zoneOf(String siteCode) {
    SiteInfo info = cache.get().get(siteCode);
    return info == null ? ZoneId.of("UTC") : info.zone();
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
