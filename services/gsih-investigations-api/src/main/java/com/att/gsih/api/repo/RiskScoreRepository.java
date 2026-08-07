package com.att.gsih.api.repo;

import com.att.gsih.api.domain.RiskScore;
import com.att.gsih.common.model.Enums.RiskBand;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RiskScoreRepository extends JpaRepository<RiskScore, UUID> {

  Optional<RiskScore> findBySiteCodeAndScoreDate(String siteCode, LocalDate scoreDate);

  @Query("select max(r.scoreDate) from RiskScore r")
  Optional<LocalDate> latestScoreDate();

  @Query(
      """
      select r from RiskScore r
      where r.scoreDate = :date and (:region is null or r.region = :region)
      order by r.riskScore desc
      """)
  List<RiskScore> scoresFor(@Param("date") LocalDate date, @Param("region") String region);

  @Query(
      """
      select count(r) from RiskScore r
      where r.scoreDate = :date and r.riskBand = :band and (:region is null or r.region = :region)
      """)
  long countByBand(
      @Param("date") LocalDate date,
      @Param("band") RiskBand band,
      @Param("region") String region);

  List<RiskScore> findBySiteCodeOrderByScoreDateDesc(String siteCode);
}
