package com.att.gsih.api.repo;

import com.att.gsih.api.domain.AlarmEvent;
import java.time.Instant;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AlarmEventRepository extends JpaRepository<AlarmEvent, UUID> {

  @Query("select count(a) from AlarmEvent a where a.siteCode = :siteCode and a.eventTime >= :since")
  long countSince(@Param("siteCode") String siteCode, @Param("since") Instant since);
}
