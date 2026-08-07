"""Guards the one place this platform deliberately duplicates logic.

The streaming path standardises vendor vocabularies in Java (``CanonicalMapper``) and the
batch path does the same in PySpark (``silver_standardize``). They run in different
engines, so the tables cannot simply be shared — but if they ever disagree, the same
incident would be typed one way when it arrives over Kafka and another way when it is
replayed from bronze, and no KPI downstream would be trustworthy.

This test parses both sources and fails on any difference.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
JAVA_MAPPER = (
    ROOT
    / "services/gsih-common/src/main/java/com/att/gsih/common/model/CanonicalMapper.java"
)
SPARK_MAPPER = ROOT / "pipelines/spark/silver_standardize.py"

# Java constant name -> Python dict name.
TABLES = {
    "CASE_STATUS": "CASE_STATUS_MAP",
    "INCIDENT_TYPE": "INCIDENT_TYPE_MAP",
    "PRIORITY": "PRIORITY_MAP",
}

JAVA_ENTRY = re.compile(r'Map\.entry\(\s*"([^"]+)"\s*,\s*(?:\w+\.)?(\w+)\s*\)')
PYTHON_ENTRY = re.compile(r'"([^"]+)"\s*:\s*"([^"]+)"')


def _java_table(name: str) -> dict[str, str]:
    source = JAVA_MAPPER.read_text()
    start = source.index(f"{name} =")
    end = source.index(");", start)
    return {key: value for key, value in JAVA_ENTRY.findall(source[start:end])}


def _spark_table(name: str) -> dict[str, str]:
    source = SPARK_MAPPER.read_text()
    start = source.index(f"{name} = {{")
    end = source.index("}", start)
    return {key: value for key, value in PYTHON_ENTRY.findall(source[start:end])}


@pytest.mark.parametrize(("java_name", "spark_name"), TABLES.items())
def test_streaming_and_batch_mappings_agree(java_name: str, spark_name: str) -> None:
    java = _java_table(java_name)
    spark = _spark_table(spark_name)

    assert java, f"failed to parse {java_name} from the Java mapper"
    assert spark, f"failed to parse {spark_name} from the Spark job"

    only_java = {k: v for k, v in java.items() if k not in spark}
    only_spark = {k: v for k, v in spark.items() if k not in java}
    conflicting = {k: (v, spark[k]) for k, v in java.items() if k in spark and spark[k] != v}

    assert not only_java, f"{java_name}: present in Java, missing from Spark: {only_java}"
    assert not only_spark, f"{spark_name}: present in Spark, missing from Java: {only_spark}"
    assert not conflicting, f"{java_name}: mapped to different values: {conflicting}"
