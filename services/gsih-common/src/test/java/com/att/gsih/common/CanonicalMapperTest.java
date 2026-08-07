package com.att.gsih.common;

import static org.assertj.core.api.Assertions.assertThat;

import com.att.gsih.common.model.CanonicalMapper;
import com.att.gsih.common.model.Enums.AccessResult;
import com.att.gsih.common.model.Enums.CasePriority;
import com.att.gsih.common.model.Enums.CaseStatus;
import com.att.gsih.common.model.Enums.IncidentType;
import com.att.gsih.common.model.Enums.RiskBand;
import com.att.gsih.common.model.Enums.SourceSystem;
import org.junit.jupiter.api.Test;

class CanonicalMapperTest {

  @Test
  void collapsesVendorStatusVocabulariesOntoOneLifecycle() {
    assertThat(CanonicalMapper.caseStatus("Under Investigation")).isEqualTo(CaseStatus.IN_PROGRESS);
    assertThat(CanonicalMapper.caseStatus("OPEN-ACTIVE")).isEqualTo(CaseStatus.IN_PROGRESS);
    assertThat(CanonicalMapper.caseStatus("active")).isEqualTo(CaseStatus.IN_PROGRESS);
    assertThat(CanonicalMapper.caseStatus("Substantiated")).isEqualTo(CaseStatus.CLOSED);
    assertThat(CanonicalMapper.caseStatus("Legal Hold")).isEqualTo(CaseStatus.ESCALATED);
  }

  @Test
  void unknownValuesFallBackInsteadOfDroppingTheRecord() {
    assertThat(CanonicalMapper.caseStatus("brand new vendor status")).isEqualTo(CaseStatus.NEW);
    assertThat(CanonicalMapper.incidentType(null)).isEqualTo(IncidentType.OTHER);
    assertThat(CanonicalMapper.sourceSystem("SomeUnknownVendor"))
        .isEqualTo(SourceSystem.MANUAL_IMPORT);
    assertThat(CanonicalMapper.isUnmappedIncidentType("drone sighting")).isTrue();
    assertThat(CanonicalMapper.isUnmappedIncidentType("Graffiti")).isFalse();
  }

  @Test
  void mapsTheVandalismFamilyThePredictiveModelDependsOn() {
    assertThat(CanonicalMapper.incidentType("Graffiti")).isEqualTo(IncidentType.VANDALISM);
    assertThat(CanonicalMapper.incidentType("PROPERTY_DAMAGE")).isEqualTo(IncidentType.VANDALISM);
    assertThat(CanonicalMapper.incidentType("Criminal Damage")).isEqualTo(IncidentType.VANDALISM);
    assertThat(CanonicalMapper.incidentType("Copper Theft")).isEqualTo(IncidentType.THEFT);
  }

  @Test
  void mapsPrioritySchemesAcrossSystems() {
    assertThat(CanonicalMapper.priority("P1")).isEqualTo(CasePriority.CRITICAL);
    assertThat(CanonicalMapper.priority("Sev2")).isEqualTo(CasePriority.HIGH);
    assertThat(CanonicalMapper.priority("Normal")).isEqualTo(CasePriority.MEDIUM);
  }

  @Test
  void defaultsAccessDecisionsToDeniedWhenAmbiguous() {
    assertThat(CanonicalMapper.accessResult("Access Granted")).isEqualTo(AccessResult.GRANTED);
    assertThat(CanonicalMapper.accessResult("Door Forced Open")).isEqualTo(AccessResult.FORCED);
    assertThat(CanonicalMapper.accessResult("???")).isEqualTo(AccessResult.DENIED);
  }

  @Test
  void bandsSitesByWhereTheyRankInTheScoringRun() {
    // 100 sites: the worst 10 are HIGH, the next 25 MEDIUM, the rest LOW.
    assertThat(RiskBand.fromRank(0, 100)).isEqualTo(RiskBand.HIGH);
    assertThat(RiskBand.fromRank(9, 100)).isEqualTo(RiskBand.HIGH);
    assertThat(RiskBand.fromRank(10, 100)).isEqualTo(RiskBand.MEDIUM);
    assertThat(RiskBand.fromRank(34, 100)).isEqualTo(RiskBand.MEDIUM);
    assertThat(RiskBand.fromRank(35, 100)).isEqualTo(RiskBand.LOW);
    assertThat(RiskBand.fromRank(99, 100)).isEqualTo(RiskBand.LOW);
  }

  @Test
  void bandingHoldsUpForSmallAndEmptyRuns() {
    // A single site is the top of its own run, so it bands HIGH rather than dividing by
    // a zero population.
    assertThat(RiskBand.fromRank(0, 1)).isEqualTo(RiskBand.HIGH);
    assertThat(RiskBand.fromRank(1, 2)).isEqualTo(RiskBand.LOW);
    assertThat(RiskBand.fromRank(0, 0)).isEqualTo(RiskBand.LOW);
  }
}
