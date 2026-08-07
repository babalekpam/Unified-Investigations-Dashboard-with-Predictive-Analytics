package com.att.gsih.api.repo;

import com.att.gsih.api.domain.CaseRecord;
import com.att.gsih.common.model.Enums.CaseStatus;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CaseRepository extends JpaRepository<CaseRecord, UUID> {

  Optional<CaseRecord> findByCaseNumber(String caseNumber);

  Page<CaseRecord> findByAssigneeEmailIgnoreCase(String assigneeEmail, Pageable pageable);

  List<CaseRecord> findByAssigneeEmailIgnoreCaseAndStatusNot(String email, CaseStatus status);

  @Query(
      """
      select c from CaseRecord c
      where (:region is null or c.region = :region)
        and (:status is null or c.status = :status)
        and (:siteCode is null or c.siteCode = :siteCode)
      """)
  Page<CaseRecord> search(
      @Param("region") String region,
      @Param("status") CaseStatus status,
      @Param("siteCode") String siteCode,
      Pageable pageable);

  @Query("select count(c) from CaseRecord c where c.status <> :closed and (:region is null or c.region = :region)")
  long countOpen(@Param("closed") CaseStatus closed, @Param("region") String region);

  @Query(
      """
      select count(c) from CaseRecord c
      where c.status <> :closed and c.dueAt < :now and (:region is null or c.region = :region)
      """)
  long countOverdue(
      @Param("closed") CaseStatus closed, @Param("now") Instant now, @Param("region") String region);

  @Query(
      """
      select count(c) from CaseRecord c
      where c.status = :closed and c.closedAt >= :since and (:region is null or c.region = :region)
      """)
  long countClosedSince(
      @Param("closed") CaseStatus closed,
      @Param("since") Instant since,
      @Param("region") String region);

  @Query(
      """
      select count(c) from CaseRecord c
      where c.status = :escalated and (:region is null or c.region = :region)
      """)
  long countEscalated(@Param("escalated") CaseStatus escalated, @Param("region") String region);

  @Query(
      """
      select coalesce(sum(c.financialImpact), 0) from CaseRecord c
      where c.status <> :closed and (:region is null or c.region = :region)
      """)
  java.math.BigDecimal openFinancialExposure(
      @Param("closed") CaseStatus closed, @Param("region") String region);

  /**
   * Open/close timestamp pairs for cases closed in the window.
   *
   * <p>The mean is computed in Java rather than in SQL: date-difference functions are not portable
   * between H2 and PostgreSQL, and the closed-case volume per window is small enough that pulling
   * two timestamps per row costs nothing.
   */
  @Query(
      """
      select c.openedAt, c.closedAt from CaseRecord c
      where c.status = :closed and c.closedAt >= :since and (:region is null or c.region = :region)
      """)
  List<Object[]> closedCaseDurations(
      @Param("closed") CaseStatus closed,
      @Param("since") Instant since,
      @Param("region") String region);

  @Query(
      """
      select c.assigneeEmail, count(c)
      from CaseRecord c
      where c.status <> :closed and (:region is null or c.region = :region)
      group by c.assigneeEmail
      order by count(c) desc
      """)
  List<Object[]> workloadByAssignee(
      @Param("closed") CaseStatus closed, @Param("region") String region);

  @Query(
      """
      select c.caseType, count(c)
      from CaseRecord c
      where c.openedAt >= :since and (:region is null or c.region = :region)
      group by c.caseType
      order by count(c) desc
      """)
  List<Object[]> volumeByType(@Param("since") Instant since, @Param("region") String region);

  @Query(
      """
      select c.region, count(c), coalesce(sum(c.financialImpact), 0)
      from CaseRecord c
      where c.openedAt >= :since
      group by c.region
      order by count(c) desc
      """)
  List<Object[]> volumeByRegion(@Param("since") Instant since);

  List<CaseRecord> findTop10ByOrderByFinancialImpactDesc();

  /** Open timestamps of every still-open case, used to build the aging buckets. */
  @Query(
      """
      select c.openedAt from CaseRecord c
      where c.status <> :closed and (:region is null or c.region = :region)
      """)
  List<Instant> openCaseStartTimes(
      @Param("closed") CaseStatus closed, @Param("region") String region);

  @Query("select count(c) from CaseRecord c where c.openedAt >= :from and c.openedAt < :to")
  long countOpenedBetween(@Param("from") Instant from, @Param("to") Instant to);
}
