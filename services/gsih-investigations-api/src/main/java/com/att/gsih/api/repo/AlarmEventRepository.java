package com.att.gsih.api.repo;

import com.att.gsih.api.domain.AlarmEvent;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AlarmEventRepository extends JpaRepository<AlarmEvent, UUID> {

  @Query("select count(a) from AlarmEvent a where a.siteCode = :siteCode and a.eventTime >= :since")
  long countSince(@Param("siteCode") String siteCode, @Param("since") Instant since);

  /**
   * Alarm counts per type at a site — the graph shows one node per alarm type rather than
   * one per event, because a site with 400 motion alarms is one fact, not 400.
   *
   * @return rows of {alarmType, count, mostRecent}
   */
  @Query(
      """
      select a.alarmType, count(a), max(a.eventTime)
      from AlarmEvent a
      where a.siteCode = :siteCode and a.eventTime >= :since
      group by a.alarmType
      order by count(a) desc
      """)
  List<Object[]> alarmTypesAtSite(@Param("siteCode") String siteCode, @Param("since") Instant since);
}
