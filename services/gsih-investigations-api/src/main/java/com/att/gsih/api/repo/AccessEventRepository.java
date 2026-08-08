package com.att.gsih.api.repo;

import com.att.gsih.api.domain.AccessEvent;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AccessEventRepository extends JpaRepository<AccessEvent, UUID> {

  @Query(
      """
      select count(a) from AccessEvent a
      where a.siteCode = :siteCode and a.eventTime >= :since and a.afterHours = true
      """)
  long countAfterHours(@Param("siteCode") String siteCode, @Param("since") Instant since);

  @Query(
      """
      select count(a) from AccessEvent a
      where a.siteCode = :siteCode and a.eventTime >= :since and a.tailgate = true
      """)
  long countTailgates(@Param("siteCode") String siteCode, @Param("since") Instant since);

  /**
   * Badges seen after hours at a site, busiest first — the link-analysis entry point.
   *
   * <p>Only after-hours reads are surfaced. A site's daytime badge traffic runs to
   * thousands of ordinary entries and would bury the graph in noise; the investigative
   * question is who was there when nobody should have been.
   *
   * @return rows of {badgeHash, readCount, mostRecent, tailgateCount}
   */
  @Query(
      """
      select a.badgeHash, count(a), max(a.eventTime),
             sum(case when a.tailgate = true then 1 else 0 end)
      from AccessEvent a
      where a.siteCode = :siteCode and a.eventTime >= :since and a.afterHours = true
        and a.badgeHash is not null
      group by a.badgeHash
      order by count(a) desc
      """)
  List<Object[]> afterHoursBadgesAtSite(
      @Param("siteCode") String siteCode, @Param("since") Instant since);

  /**
   * Sites the same badge was read at after hours — how one badge links two locations.
   *
   * @return rows of {siteCode, readCount, mostRecent}
   */
  @Query(
      """
      select a.siteCode, count(a), max(a.eventTime)
      from AccessEvent a
      where a.badgeHash = :badgeHash and a.eventTime >= :since and a.afterHours = true
      group by a.siteCode
      order by count(a) desc
      """)
  List<Object[]> sitesForBadge(@Param("badgeHash") String badgeHash, @Param("since") Instant since);
}
