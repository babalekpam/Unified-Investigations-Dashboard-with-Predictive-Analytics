package com.att.gsih.api.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** A physical location from the facilities / GIS feed (Section 4.1, row 8). */
@Entity
@Table(name = "site")
public class Site {

  @Id
  @Column(name = "site_code", length = 32)
  private String siteCode;

  private String name;
  private String region;
  private String country;
  private String city;

  @Column(name = "site_type")
  private String siteType;

  /** IANA zone id; after-hours access is evaluated in the facility's own local time. */
  private String timezone;

  private Double latitude;
  private Double longitude;

  /** 1 (dark) to 5 (well lit) — a documented vandalism driver (Section 6.2). */
  @Column(name = "lighting_score")
  private Integer lightingScore;

  /** 1 (isolated) to 5 (busy) daytime foot traffic. */
  @Column(name = "foot_traffic_score")
  private Integer footTrafficScore;

  @Column(name = "camera_count")
  private Integer cameraCount;

  @Column(name = "perimeter_fenced")
  private Boolean perimeterFenced;

  @Column(name = "critical_asset")
  private Boolean criticalAsset;

  public String getSiteCode() {
    return siteCode;
  }

  public void setSiteCode(String siteCode) {
    this.siteCode = siteCode;
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public String getRegion() {
    return region;
  }

  public void setRegion(String region) {
    this.region = region;
  }

  public String getCountry() {
    return country;
  }

  public void setCountry(String country) {
    this.country = country;
  }

  public String getCity() {
    return city;
  }

  public void setCity(String city) {
    this.city = city;
  }

  public String getSiteType() {
    return siteType;
  }

  public void setSiteType(String siteType) {
    this.siteType = siteType;
  }

  public String getTimezone() {
    return timezone;
  }

  public void setTimezone(String timezone) {
    this.timezone = timezone;
  }

  public Double getLatitude() {
    return latitude;
  }

  public void setLatitude(Double latitude) {
    this.latitude = latitude;
  }

  public Double getLongitude() {
    return longitude;
  }

  public void setLongitude(Double longitude) {
    this.longitude = longitude;
  }

  public Integer getLightingScore() {
    return lightingScore;
  }

  public void setLightingScore(Integer lightingScore) {
    this.lightingScore = lightingScore;
  }

  public Integer getFootTrafficScore() {
    return footTrafficScore;
  }

  public void setFootTrafficScore(Integer footTrafficScore) {
    this.footTrafficScore = footTrafficScore;
  }

  public Integer getCameraCount() {
    return cameraCount;
  }

  public void setCameraCount(Integer cameraCount) {
    this.cameraCount = cameraCount;
  }

  public Boolean getPerimeterFenced() {
    return perimeterFenced;
  }

  public void setPerimeterFenced(Boolean perimeterFenced) {
    this.perimeterFenced = perimeterFenced;
  }

  public Boolean getCriticalAsset() {
    return criticalAsset;
  }

  public void setCriticalAsset(Boolean criticalAsset) {
    this.criticalAsset = criticalAsset;
  }
}
