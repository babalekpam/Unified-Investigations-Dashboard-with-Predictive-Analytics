package com.att.gsih.api.domain;

import com.att.gsih.common.model.Enums.AccessResult;
import com.att.gsih.common.model.Enums.SourceSystem;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** Badge read from the access control feed (Section 4.1, row 4). */
@Entity
@Table(name = "access_event")
public class AccessEvent {

  @Id private UUID id;

  @Enumerated(EnumType.STRING)
  @Column(name = "source_system")
  private SourceSystem sourceSystem;

  @Column(name = "site_code")
  private String siteCode;

  /** Pseudonymised badge identifier — the raw badge number never leaves the source system. */
  @Column(name = "badge_hash")
  private String badgeHash;

  @Column(name = "door_id")
  private String doorId;

  @Enumerated(EnumType.STRING)
  private AccessResult result;

  @Column(name = "event_time")
  private Instant eventTime;

  @Column(name = "after_hours")
  private Boolean afterHours;

  private Boolean tailgate;

  public UUID getId() {
    return id;
  }

  public void setId(UUID id) {
    this.id = id;
  }

  public SourceSystem getSourceSystem() {
    return sourceSystem;
  }

  public void setSourceSystem(SourceSystem sourceSystem) {
    this.sourceSystem = sourceSystem;
  }

  public String getSiteCode() {
    return siteCode;
  }

  public void setSiteCode(String siteCode) {
    this.siteCode = siteCode;
  }

  public String getBadgeHash() {
    return badgeHash;
  }

  public void setBadgeHash(String badgeHash) {
    this.badgeHash = badgeHash;
  }

  public String getDoorId() {
    return doorId;
  }

  public void setDoorId(String doorId) {
    this.doorId = doorId;
  }

  public AccessResult getResult() {
    return result;
  }

  public void setResult(AccessResult result) {
    this.result = result;
  }

  public Instant getEventTime() {
    return eventTime;
  }

  public void setEventTime(Instant eventTime) {
    this.eventTime = eventTime;
  }

  public Boolean getAfterHours() {
    return afterHours;
  }

  public void setAfterHours(Boolean afterHours) {
    this.afterHours = afterHours;
  }

  public Boolean getTailgate() {
    return tailgate;
  }

  public void setTailgate(Boolean tailgate) {
    this.tailgate = tailgate;
  }
}
