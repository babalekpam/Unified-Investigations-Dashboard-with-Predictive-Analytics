package com.att.gsih.api.repo;

import com.att.gsih.api.domain.Incident;
import com.att.gsih.common.model.Enums.IncidentType;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface IncidentRepository extends JpaRepository<Incident, UUID> {

  Optional<Incident> findBySourceSystemAndSourceId(
      com.att.gsih.common.model.Enums.SourceSystem sourceSystem, String sourceId);

  @Query(
      """
      select i from Incident i
      where (:region is null or i.region = :region)
        and (:siteCode is null or i.siteCode = :siteCode)
        and (:type is null or i.incidentType = :type)
        and i.occurredAt >= :since
      """)
  Page<Incident> search(
      @Param("region") String region,
      @Param("siteCode") String siteCode,
      @Param("type") IncidentType type,
      @Param("since") Instant since,
      Pageable pageable);

  /** Repeat-incident signal for the investigator view: same site, same type, recent. */
  List<Incident> findBySiteCodeAndIncidentTypeAndOccurredAtAfterOrderByOccurredAtDesc(
      String siteCode, IncidentType incidentType, Instant after);

  @Query(
      """
      select i.siteCode, count(i)
      from Incident i
      where i.incidentType = :type and i.occurredAt >= :since
      group by i.siteCode
      order by count(i) desc
      """)
  List<Object[]> countByTypeAndSite(@Param("type") IncidentType type, @Param("since") Instant since);

  @Query(
      """
      select count(i) from Incident i
      where i.incidentType = :type and i.occurredAt >= :since
        and (:region is null or i.region = :region)
      """)
  long countByTypeSince(
      @Param("type") IncidentType type,
      @Param("since") Instant since,
      @Param("region") String region);

  @Query("select i.occurredAt from Incident i where i.occurredAt >= :since and (:region is null or i.region = :region)")
  List<Instant> occurrenceTimestamps(
      @Param("since") Instant since, @Param("region") String region);
}
