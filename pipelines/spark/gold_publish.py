"""Gold layer — publish the serving tables (Section 5.2, Step 3).

Silver is the canonical history in Delta. Gold is what the dashboards actually query:
the same rows, plus the pre-aggregated KPI tables, pushed into the PostgreSQL serving
database the API reads.

Why two stores rather than pointing the API at Delta? Dashboard queries are small,
indexed, highly concurrent point-and-range reads — the workload a transactional database
is built for and a lakehouse query engine is not. Delta keeps the full history, the
warehouse keeps the serving copy, and this job is the only thing that moves data between
them.
"""

from __future__ import annotations

import argparse

from pyspark.sql import DataFrame, SparkSession
from pyspark.sql import functions as F

SERVING_TABLES = {
    "silver.incident": "incident",
    "silver.case_record": "case_record",
    "silver.access_event": "access_event",
    "silver.alarm_event": "alarm_event",
    "silver.site": "site",
}


def daily_incident_rollup(incidents: DataFrame) -> DataFrame:
    """Per site, per day, per type — the aggregate the trend charts read."""
    return (
        incidents.withColumn("incident_date", F.to_date("occurred_at"))
        .groupBy("site_code", "region", "incident_type", "incident_date")
        .agg(
            F.count("*").alias("incident_count"),
            F.coalesce(F.sum("loss_amount"), F.lit(0)).alias("total_loss"),
        )
    )


def case_kpi_rollup(cases: DataFrame) -> DataFrame:
    """Region-level case KPIs, recomputed each run rather than accumulated.

    Recomputation is the point: a late-arriving correction from a source system changes
    history, and an incrementally-maintained counter would keep the old, wrong number.
    """
    return (
        cases.groupBy("region")
        .agg(
            F.count("*").alias("total_cases"),
            F.sum(F.when(F.col("status") != "CLOSED", 1).otherwise(0)).alias("open_cases"),
            F.sum(F.when(F.col("status") == "CLOSED", 1).otherwise(0)).alias("closed_cases"),
            F.sum(F.when(F.col("status") == "ESCALATED", 1).otherwise(0)).alias("escalated_cases"),
            F.avg(
                F.when(
                    F.col("closed_at").isNotNull(),
                    F.datediff(F.col("closed_at"), F.col("opened_at")),
                )
            ).alias("avg_resolution_days"),
            F.coalesce(
                F.sum(F.when(F.col("status") != "CLOSED", F.col("financial_impact"))), F.lit(0)
            ).alias("open_financial_exposure"),
        )
        .withColumn("computed_at", F.current_timestamp())
    )


def write_to_serving(frame: DataFrame, jdbc_url: str, table: str, properties: dict[str, str]) -> None:
    """Overwrites a serving table in one transaction.

    ``truncate=true`` keeps the table definition — and therefore its indexes and the
    Flyway-managed schema — instead of letting Spark drop and recreate it with types of
    its own choosing.
    """
    (
        frame.write.format("jdbc")
        .option("url", jdbc_url)
        .option("dbtable", table)
        .option("user", properties["user"])
        .option("password", properties["password"])
        .option("driver", "org.postgresql.Driver")
        .option("truncate", "true")
        .option("batchsize", 5_000)
        .mode("overwrite")
        .save()
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="GSIH gold publish")
    parser.add_argument("--jdbc-url", required=True)
    parser.add_argument("--db-user", required=True)
    parser.add_argument("--db-password", required=True)
    parser.add_argument("--tables", nargs="*", default=sorted(SERVING_TABLES))
    args = parser.parse_args()

    spark = SparkSession.builder.appName("gsih-gold-publish").getOrCreate()
    credentials = {"user": args.db_user, "password": args.db_password}

    for source_table in args.tables:
        target = SERVING_TABLES[source_table]
        write_to_serving(spark.table(source_table), args.jdbc_url, target, credentials)

    incidents = spark.table("silver.incident")
    cases = spark.table("silver.case_record")

    daily_incident_rollup(incidents).write.format("delta").mode("overwrite").saveAsTable(
        "gold.incident_daily"
    )
    case_kpi_rollup(cases).write.format("delta").mode("overwrite").saveAsTable("gold.case_kpi")


if __name__ == "__main__":
    main()
