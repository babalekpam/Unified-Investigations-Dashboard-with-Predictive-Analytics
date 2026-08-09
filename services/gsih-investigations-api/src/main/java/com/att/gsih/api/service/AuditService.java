package com.att.gsih.api.service;

import com.att.gsih.api.domain.AuditEvent;
import com.att.gsih.api.repo.AuditEventRepository;
import com.att.gsih.api.security.CurrentUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Section 5.3 — "Audit logs for all access".
 *
 * <p>Writes run in their own transaction so an audit failure can never roll back, or be rolled back
 * by, the query the user actually asked for. If the audit table is unreachable the request still
 * succeeds and the failure is logged for the platform team; blocking investigators from their case
 * queue because a logging table is down is the worse outcome.
 */
@Service
public class AuditService {

  private static final Logger log = LoggerFactory.getLogger(AuditService.class);

  private final AuditEventRepository repository;

  public AuditService(AuditEventRepository repository) {
    this.repository = repository;
  }

  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public void record(CurrentUser user, String action, String resource, String detail, int count) {
    try {
      repository.save(
          AuditEvent.of(user.email(), user.role().name(), action, resource, detail, count));
    } catch (RuntimeException ex) {
      log.error("failed to write audit record for {} on {}", user.email(), resource, ex);
    }
  }
}
