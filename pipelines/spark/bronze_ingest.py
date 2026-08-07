"""Bronze layer — land raw source data exactly as it arrived (Section 5.2, Step 1).

Runs on Databricks. Two entry points feed bronze:

* **Auto Loader** over the landing container, for the batch and flat-file sources of
  Section 5.1 (legacy systems, scheduled CSV exports).
* **Structured Streaming from Kafka**, for the same topics the Java ingest service reads.
  Both consumers exist on purpose: the Java service keeps the dashboard current within
  seconds, while bronze keeps the complete, replayable history that the models train on
  and that an audit can be reconstructed from.

Nothing is cleaned, renamed or deduplicated here. The single job of this layer is to make
the raw record durable and replayable, so that a mapping mistake found six months from
now can be corrected by re-running silver rather than by asking a vendor for an export.
"""

from __future__ import annotations

import argparse

from pyspark.sql import DataFrame, SparkSession
from pyspark.sql import functions as F

LANDING_FORMATS = {"csv": "csv", "json": "json", "parquet": "parquet"}

BRONZE_TABLES = {
    "gsih.incidents.raw": "bronze.incident_raw",
    "gsih.cases.raw": "bronze.case_raw",
    "gsih.access.raw": "bronze.access_raw",
    "gsih.alarms.raw": "bronze.alarm_raw",
}


def stream_from_kafka(spark: SparkSession, bootstrap: str, topic: str, checkpoint: str) -> None:
    """Appends a Kafka topic into its bronze Delta table."""
    stream = (
        spark.readStream.format("kafka")
        .option("kafka.bootstrap.servers", bootstrap)
        .option("subscribe", topic)
        .option("startingOffsets", "earliest")
        # Without this cap, a backlog replay tries to load every retained record into one
        # micro-batch and the job dies on the first trigger after an outage.
        .option("maxOffsetsPerTrigger", 200_000)
        .load()
    )

    enriched = (
        stream.select(
            F.col("key").cast("string").alias("message_key"),
            F.col("value").cast("string").alias("payload"),
            F.col("topic"),
            F.col("partition"),
            F.col("offset"),
            F.col("timestamp").alias("kafka_timestamp"),
        )
        .withColumn("ingested_at", F.current_timestamp())
        .withColumn("ingest_date", F.to_date("ingested_at"))
    )

    (
        enriched.writeStream.format("delta")
        .outputMode("append")
        .option("checkpointLocation", checkpoint)
        .partitionBy("ingest_date")
        .trigger(availableNow=True)
        .toTable(BRONZE_TABLES[topic])
    )


def load_landing_files(
    spark: SparkSession, landing_path: str, file_format: str, target_table: str, checkpoint: str
) -> None:
    """Auto Loader over the landing container, for sources with no API (Section 5.1)."""
    reader = (
        spark.readStream.format("cloudFiles")
        .option("cloudFiles.format", LANDING_FORMATS[file_format])
        .option("cloudFiles.schemaLocation", f"{checkpoint}/schema")
        # New vendor columns are added to the table instead of failing the run; the
        # mapping layer decides whether they mean anything.
        .option("cloudFiles.schemaEvolutionMode", "addNewColumns")
        .option("header", "true")
    )

    frame: DataFrame = (
        reader.load(landing_path)
        .withColumn("source_file", F.col("_metadata.file_path"))
        .withColumn("ingested_at", F.current_timestamp())
        .withColumn("ingest_date", F.to_date("ingested_at"))
    )

    (
        frame.writeStream.format("delta")
        .outputMode("append")
        .option("checkpointLocation", checkpoint)
        .option("mergeSchema", "true")
        .partitionBy("ingest_date")
        .trigger(availableNow=True)
        .toTable(target_table)
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="GSIH bronze ingest")
    parser.add_argument("--mode", choices=["kafka", "files"], required=True)
    parser.add_argument("--topic", choices=sorted(BRONZE_TABLES))
    parser.add_argument("--bootstrap")
    parser.add_argument("--landing-path")
    parser.add_argument("--file-format", default="csv", choices=sorted(LANDING_FORMATS))
    parser.add_argument("--target-table")
    parser.add_argument("--checkpoint", required=True)
    args = parser.parse_args()

    spark = SparkSession.builder.appName("gsih-bronze-ingest").getOrCreate()

    if args.mode == "kafka":
        if not (args.bootstrap and args.topic):
            parser.error("--bootstrap and --topic are required in kafka mode")
        stream_from_kafka(spark, args.bootstrap, args.topic, args.checkpoint)
    else:
        if not (args.landing_path and args.target_table):
            parser.error("--landing-path and --target-table are required in files mode")
        load_landing_files(
            spark, args.landing_path, args.file_format, args.target_table, args.checkpoint
        )


if __name__ == "__main__":
    main()
