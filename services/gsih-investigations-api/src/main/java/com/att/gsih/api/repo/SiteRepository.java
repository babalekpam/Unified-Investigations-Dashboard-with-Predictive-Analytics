package com.att.gsih.api.repo;

import com.att.gsih.api.domain.Site;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface SiteRepository extends JpaRepository<Site, String> {

  List<Site> findByRegion(String region);

  @Query("select distinct s.region from Site s order by s.region")
  List<String> distinctRegions();
}
