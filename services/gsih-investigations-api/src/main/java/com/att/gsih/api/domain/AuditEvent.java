package com.att.gsih.api.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * Section 5.3 — "Audit logs for all access".
 *
 * <p>Every read of case or incident data is recorded with the caller, the role they used and what
 * they asked for. The table is append-only; the API exposes no delete path.
 */
@Entity
@Table(name = "audit_event")
public class AuditEvent {

  @Id private UUID id;

  private String actor;

  @Column(name = "actor_role")
  private String actorRole;

  private String action;

  private String resource;

  @Column(name = "query_detail", length = 1000)
  private String queryDetail;

  @Column(name = "result_count")
  private Integer resultCount;

  @Column(name = "occurred_at")
  private Instant occurredAt;

  public static AuditEvent of(
      String actor, String role, String action, String resource, String detail, int count) {
    AuditEvent e = new AuditEvent();
    e.id = UUID.randomUUID();
    e.actor = actor;
    e.actorRole = role;
    e.action = action;
    e.resource = resource;
    e.queryDetail = detail;
    e.resultCount = count;
    e.occurredAt = Instant.now();
    return e;
  }

  public UUID getId() {
    return id;
  }

  public void setId(UUID id) {
    this.id = id;
  }

  public String getActor() {
    return actor;
  }

  public void setActor(String actor) {
    this.actor = actor;
  }

  public String getActorRole() {
    return actorRole;
  }

  public void setActorRole(String actorRole) {
    this.actorRole = actorRole;
  }

  public String getAction() {
    return action;
  }

  public void setAction(String action) {
    this.action = action;
  }

  public String getResource() {
    return resource;
  }

  public void setResource(String resource) {
    this.resource = resource;
  }

  public String getQueryDetail() {
    return queryDetail;
  }

  public void setQueryDetail(String queryDetail) {
    this.queryDetail = queryDetail;
  }

  public Integer getResultCount() {
    return resultCount;
  }

  public void setResultCount(Integer resultCount) {
    this.resultCount = resultCount;
  }

  public Instant getOccurredAt() {
    return occurredAt;
  }

  public void setOccurredAt(Instant occurredAt) {
    this.occurredAt = occurredAt;
  }
}
