package com.att.gsih.api.domain;

import com.att.gsih.common.model.Enums.AlarmType;
import com.att.gsih.common.model.Enums.SourceSystem;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** Camera / alarm event from the physical security feed (Section 4.1, row 3). */
@Entity
@Table(name = "alarm_event")
public class AlarmEvent {

  @Id private UUID id;

  @Enumerated(EnumType.STRING)
  @Column(name = "source_system")
  private SourceSystem sourceSystem;

  @Column(name = "site_code")
  private String siteCode;

  @Column(name = "camera_id")
  private String cameraId;

  @Enumerated(EnumType.STRING)
  @Column(name = "alarm_type")
  private AlarmType alarmType;

  private String severity;

  @Column(name = "event_time")
  private Instant eventTime;

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

  public String getCameraId() {
    return cameraId;
  }

  public void setCameraId(String cameraId) {
    this.cameraId = cameraId;
  }

  public AlarmType getAlarmType() {
    return alarmType;
  }

  public void setAlarmType(AlarmType alarmType) {
    this.alarmType = alarmType;
  }

  public String getSeverity() {
    return severity;
  }

  public void setSeverity(String severity) {
    this.severity = severity;
  }

  public Instant getEventTime() {
    return eventTime;
  }

  public void setEventTime(Instant eventTime) {
    this.eventTime = eventTime;
  }
}
