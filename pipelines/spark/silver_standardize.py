"""Silver layer — clean and standardise (Section 5.2, Step 2).

Bronze holds whatever the vendor sent. Silver holds the canonical model: one vocabulary,
one timestamp convention, one row per real-world event.

The mapping tables here mirror ``CanonicalMapper`` in the Java services. That duplication
is deliberate and bounded: the streaming path (Java) and the batch path (Spark) must reach
the same answer, and each runs in a different engine. ``tests/test_mappings`` in CI diffs
the two tables so they cannot drift apart silently.
"""

from __future__ import annotations

import argparse

from pyspark.sql import Column, DataFrame, SparkSession
from pyspark.sql import functions as F
from pyspark.sql.window import Window

CASE_STATUS_MAP = {
    "new": "NEW", "open": "NEW", "reported": "NEW", "intake": "NEW",
    "active": "IN_PROGRESS", "in progress": "IN_PROGRESS", "in_progress": "IN_PROGRESS",
    "under investigation": "IN_PROGRESS", "open-active": "IN_PROGRESS", "assigned": "IN_PROGRESS",
    "pending review": "PENDING_REVIEW", "review": "PENDING_REVIEW", "qa": "PENDING_REVIEW",
    "awaiting approval": "PENDING_REVIEW",
    "escalated": "ESCALATED", "referred": "ESCALATED", "legal hold": "ESCALATED",
    "closed": "CLOSED", "resolved": "CLOSED", "completed": "CLOSED",
    "substantiated": "CLOSED", "unsubstantiated": "CLOSED",
}

INCIDENT_TYPE_MAP = {
    "vandalism": "VANDALISM", "graffiti": "VANDALISM", "property damage": "VANDALISM",
    "criminal damage": "VANDALISM",
    "theft": "THEFT", "copper theft": "THEFT", "burglary": "THEFT", "larceny": "THEFT",
    "fraud": "FRAUD", "financial fraud": "FRAUD", "embezzlement": "FRAUD",
    "trespass": "TRESPASS", "trespassing": "TRESPASS", "intrusion": "TRESPASS",
    "workplace violence": "WORKPLACE_VIOLENCE", "threat": "WORKPLACE_VIOLENCE",
    "harassment": "WORKPLACE_VIOLENCE",
    "policy violation": "POLICY_VIOLATION", "coc violation": "POLICY_VIOLATION",
    "asset loss": "ASSET_LOSS", "equipment loss": "ASSET_LOSS",
    "unauthorized access": "UNAUTHORIZED_ACCESS", "badge misuse": "UNAUTHORIZED_ACCESS",
    "tailgating": "UNAUTHORIZED_ACCESS",
}

PRIORITY_MAP = {
    "p1": "CRITICAL", "critical": "CRITICAL", "sev1": "CRITICAL", "urgent": "CRITICAL",
    "p2": "HIGH", "high": "HIGH", "sev2": "HIGH",
    "p3": "MEDIUM", "medium": "MEDIUM", "normal": "MEDIUM", "moderate": "MEDIUM",
    "p4": "LOW", "low": "LOW", "minor": "LOW",
}


def normalise_key(column: Column) -> Column:
    """Lower-cased, trimmed, underscores folded to spaces — same rule as the Java mapper."""
    return F.regexp_replace(F.lower(F.trim(column)), "_", " ")


def map_with_default(column: Column, mapping: dict[str, str], default: str) -> Column:
    """Builds a CASE expression from a mapping table, with an explicit fallback.

    A ``create_map`` lookup would return NULL for unknown values, which then propagates
    through every downstream aggregate as a silently missing row. An explicit default
    keeps the record and makes the gap countable instead.
    """
    expression = F.lit(default)
    for source_value, canonical in mapping.items():
        expression = F.when(column == F.lit(source_value), F.lit(canonical)).otherwise(expression)
    return expression


def deduplicate(frame: DataFrame, keys: list[str], order_by: str) -> DataFrame:
    """Keeps the latest version of each source record.

    Source systems resend updated records, and bronze appends every send. Without this,
    a case edited five times would count as five cases in the manager's workload KPI.
    """
    window = Window.partitionBy(*keys).orderBy(F.col(order_by).desc())
    return (
        frame.withColumn("_row", F.row_number().over(window))
        .filter(F.col("_row") == 1)
        .drop("_row")
    )


def standardise_incidents(bronze: DataFrame, sites: DataFrame) -> DataFrame:
    parsed = bronze.select(
        F.get_json_object("payload", "$.sourceSystem").alias("source_system_raw"),
        F.get_json_object("payload", "$.sourceId").alias("source_id"),
        F.get_json_object("payload", "$.siteCode").alias("site_code_raw"),
        F.get_json_object("payload", "$.category").alias("category_raw"),
        F.get_json_object("payload", "$.severity").alias("severity_raw"),
        F.get_json_object("payload", "$.description").alias("description"),
        F.get_json_object("payload", "$.reportedBy").alias("reported_by"),
        F.get_json_object("payload", "$.occurredAt").alias("occurred_at_raw"),
        F.get_json_object("payload", "$.lossAmount").cast("decimal(14,2)").alias("loss_amount"),
        F.col("ingested_at"),
    )

    canonical = (
        parsed.withColumn("source_system", F.upper(F.regexp_replace(F.col("source_system_raw"), "[- ]", "_")))
        .withColumn("site_code", F.upper(F.trim(F.col("site_code_raw"))))
        .withColumn(
            "incident_type",
            map_with_default(normalise_key(F.col("category_raw")), INCIDENT_TYPE_MAP, "OTHER"),
        )
        .withColumn("severity", F.upper(F.coalesce(F.col("severity_raw"), F.lit("MEDIUM"))))
        .withColumn("occurred_at", F.to_timestamp("occurred_at_raw"))
        # Negative amounts are reversal entries in some finance feeds; clamping keeps the
        # loss KPIs monotonic.
        .withColumn("loss_amount", F.when(F.col("loss_amount") < 0, F.lit(0)).otherwise(F.col("loss_amount")))
        .withColumn("id", F.expr("uuid()"))
    )

    deduped = deduplicate(canonical, ["source_system", "source_id"], "ingested_at")

    return (
        deduped.join(sites.select("site_code", "region"), on="site_code", how="left")
        .filter(F.col("occurred_at").isNotNull())
        .select(
            "id", "source_system", "source_id", "site_code", "region", "incident_type",
            "severity", "description", "reported_by", "occurred_at", "loss_amount", "ingested_at",
        )
    )


def standardise_cases(bronze: DataFrame, sites: DataFrame) -> DataFrame:
    parsed = bronze.select(
        F.get_json_object("payload", "$.sourceSystem").alias("source_system_raw"),
        F.get_json_object("payload", "$.sourceId").alias("source_id"),
        F.get_json_object("payload", "$.caseNumber").alias("case_number"),
        F.get_json_object("payload", "$.title").alias("title"),
        F.get_json_object("payload", "$.category").alias("category_raw"),
        F.get_json_object("payload", "$.status").alias("status_raw"),
        F.get_json_object("payload", "$.priority").alias("priority_raw"),
        F.get_json_object("payload", "$.assigneeEmail").alias("assignee_email_raw"),
        F.get_json_object("payload", "$.siteCode").alias("site_code_raw"),
        F.get_json_object("payload", "$.openedAt").alias("opened_at_raw"),
        F.get_json_object("payload", "$.dueAt").alias("due_at_raw"),
        F.get_json_object("payload", "$.closedAt").alias("closed_at_raw"),
        F.get_json_object("payload", "$.financialImpact").cast("decimal(14,2)").alias("financial_impact"),
        F.col("ingested_at"),
    )

    canonical = (
        parsed.withColumn("source_system", F.upper(F.regexp_replace(F.col("source_system_raw"), "[- ]", "_")))
        .withColumn("site_code", F.upper(F.trim(F.col("site_code_raw"))))
        .withColumn("assignee_email", F.lower(F.trim(F.col("assignee_email_raw"))))
        .withColumn("status", map_with_default(normalise_key(F.col("status_raw")), CASE_STATUS_MAP, "NEW"))
        .withColumn("priority", map_with_default(normalise_key(F.col("priority_raw")), PRIORITY_MAP, "MEDIUM"))
        .withColumn("case_type", map_with_default(normalise_key(F.col("category_raw")), INCIDENT_TYPE_MAP, "OTHER"))
        .withColumn("opened_at", F.to_timestamp("opened_at_raw"))
        .withColumn("due_at", F.to_timestamp("due_at_raw"))
        # A case marked closed with no close timestamp would otherwise be skipped by every
        # aging and resolution-time KPI. Falling back to the last time we saw the record
        # is approximate, and stated as such in the data dictionary.
        .withColumn(
            "closed_at",
            F.when(
                (F.col("status") == "CLOSED") & F.to_timestamp("closed_at_raw").isNull(),
                F.col("ingested_at"),
            ).otherwise(F.to_timestamp("closed_at_raw")),
        )
        .withColumn("id", F.expr("uuid()"))
    )

    deduped = deduplicate(canonical, ["source_system", "source_id"], "ingested_at")

    return (
        deduped.join(sites.select("site_code", "region"), on="site_code", how="left")
        .filter(F.col("opened_at").isNotNull())
        .select(
            "id", "case_number", "title", "case_type", "status", "priority", "assignee_email",
            "site_code", "region", "opened_at", "due_at", "closed_at", "financial_impact",
            "source_system", "source_id", F.col("ingested_at").alias("updated_at"),
        )
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="GSIH silver standardisation")
    parser.add_argument("--entity", choices=["incidents", "cases"], required=True)
    parser.add_argument("--source-table", required=True)
    parser.add_argument("--target-table", required=True)
    parser.add_argument("--site-table", default="silver.site")
    args = parser.parse_args()

    spark = SparkSession.builder.appName(f"gsih-silver-{args.entity}").getOrCreate()
    bronze = spark.table(args.source_table)
    sites = spark.table(args.site_table)

    if args.entity == "incidents":
        result = standardise_incidents(bronze, sites)
    else:
        result = standardise_cases(bronze, sites)

    (
        result.write.format("delta")
        .mode("overwrite")
        .option("overwriteSchema", "true")
        .saveAsTable(args.target_table)
    )


if __name__ == "__main__":
    main()
