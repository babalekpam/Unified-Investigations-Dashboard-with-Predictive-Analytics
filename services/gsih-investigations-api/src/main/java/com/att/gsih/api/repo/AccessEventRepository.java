package com.att.gsih.api.repo;

import com.att.gsih.api.domain.AccessEvent;
import java.time.Instant;
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
}
