package com.att.gsih.common.model;

/**
 * Canonical vocabulary for the Global Security Intelligence Hub.
 *
 * <p>Every source system in Section 4.1 of the proposal uses its own field names and status
 * vocabulary. The integration layer maps all of them onto the enums below so that the warehouse,
 * the models and the three dashboards only ever see one set of values.
 */
public final class Enums {

  private Enums() {}

  /** Source systems the hub extracts from, read-only (Section 4.1). */
  public enum SourceSystem {
    CASE_IQ,
    RESOLVER,
    KASEWARE,
    D3_SECURITY,
    OMNIGO,
    PERSPECTIVE,
    GENETEC,
    MILESTONE,
    AVIGILON,
    LENEL_S2,
    HID,
    GENETEC_SYNERGIS,
    WORKDAY,
    SAP_SUCCESSFACTORS,
    SERVICENOW,
    JIRA,
    ONTIC,
    DATAMINR,
    LEXISNEXIS,
    ARCGIS,
    SAP_FINANCE,
    ORACLE_FINANCIALS,
    MANUAL_IMPORT
  }

  /** Canonical case lifecycle. Source statuses are mapped onto these five values. */
  public enum CaseStatus {
    NEW,
    IN_PROGRESS,
    PENDING_REVIEW,
    ESCALATED,
    CLOSED
  }

  public enum CasePriority {
    LOW,
    MEDIUM,
    HIGH,
    CRITICAL
  }

  /** Canonical case / incident categories. */
  public enum IncidentType {
    VANDALISM,
    THEFT,
    FRAUD,
    TRESPASS,
    WORKPLACE_VIOLENCE,
    POLICY_VIOLATION,
    ASSET_LOSS,
    UNAUTHORIZED_ACCESS,
    OTHER
  }

  /** Risk banding produced by the predictive layer (Section 6.3, step 3). */
  public enum RiskBand {
    LOW,
    MEDIUM,
    HIGH;

    /** Share of sites in a scoring run banded HIGH. */
    public static final double HIGH_BAND_SHARE = 0.10;

    /** Cumulative share banded HIGH or MEDIUM. */
    public static final double MEDIUM_BAND_SHARE = 0.35;

    /**
     * Bands a site by where it ranks within today's scoring run, not by an absolute
     * probability.
     *
     * <p>Vandalism on any given site-week is rare — a base rate of a few percent — so a
     * well-calibrated model almost never emits a probability above 0.66. Fixed absolute
     * thresholds would therefore paint every site LOW and the heat map would go flat the
     * moment the model started producing honest probabilities.
     *
     * <p>Ranking answers the question the security team actually asks: given that we can
     * patrol a handful of sites tonight, which ones are the worst right now? HIGH is the
     * top {@value #HIGH_BAND_SHARE} of scored sites, MEDIUM the next band up to
     * {@value #MEDIUM_BAND_SHARE}. The raw probability travels alongside the band, so
     * nobody has to infer magnitude from the label.
     *
     * @param rank zero-based position in the run, highest score first
     * @param total number of sites scored in the run
     */
    public static RiskBand fromRank(int rank, int total) {
      if (total <= 0) {
        return LOW;
      }
      // Cut-offs are counts, not raw percentiles, with at least one HIGH site in any
      // non-empty run: there is always a worst site tonight, and a run of five sites
      // should still tell the team which one to visit.
      int highCutoff = Math.max(1, (int) Math.ceil(total * HIGH_BAND_SHARE));
      int mediumCutoff = Math.max(highCutoff, (int) Math.ceil(total * MEDIUM_BAND_SHARE));

      if (rank < highCutoff) {
        return HIGH;
      }
      if (rank < mediumCutoff) {
        return MEDIUM;
      }
      return LOW;
    }
  }

  /** The three role-based views of Section 7, enforced as RBAC roles. */
  public enum UserRole {
    INVESTIGATOR,
    MANAGER,
    EXECUTIVE
  }

  /** Access control decision recorded by badge readers. */
  public enum AccessResult {
    GRANTED,
    DENIED,
    FORCED,
    HELD_OPEN
  }

  public enum AlarmType {
    MOTION,
    GLASS_BREAK,
    DOOR_FORCED,
    PERIMETER,
    CAMERA_TAMPER,
    LOITERING
  }
}
