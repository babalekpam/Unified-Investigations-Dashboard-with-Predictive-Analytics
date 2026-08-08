package com.att.gsih.api.repo;

import com.att.gsih.api.domain.Forecast;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ForecastRepository extends JpaRepository<Forecast, UUID> {

  /**
   * One curve, not several concatenated.
   *
   * <p>A null {@code region} means the enterprise roll-up, which is stored with a null
   * region — it does not mean "no filter". Treating it as an absent filter returns the
   * enterprise curve interleaved with every regional curve, and the chart then draws a
   * saw-tooth of six overlapping series that looks like a real trend.
   */
  @Query(
      """
      select f from Forecast f
      where ((:region is null and f.region is null) or f.region = :region)
        and ((:siteCode is null and f.siteCode is null) or f.siteCode = :siteCode)
        and f.forecastDate >= :from
      order by f.forecastDate
      """)
  List<Forecast> curve(
      @Param("region") String region,
      @Param("siteCode") String siteCode,
      @Param("from") java.time.LocalDate from);

  /**
   * Clears a scope before a new projection is written.
   *
   * <p>Without this the table gains a run's worth of rows every day and never loses one, so
   * the executive curve slowly grows a tail of past-dated points from superseded runs.
   */
  @org.springframework.data.jpa.repository.Modifying
  @Query(
      """
      delete from Forecast f
      where ((:region is null and f.region is null) or f.region = :region)
        and ((:siteCode is null and f.siteCode is null) or f.siteCode = :siteCode)
      """)
  void deleteScope(@Param("region") String region, @Param("siteCode") String siteCode);
}
