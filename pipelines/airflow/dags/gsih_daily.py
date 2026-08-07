"""Daily orchestration for the Global Security Intelligence Hub.

Implements the refresh cadence of Section 5.2, Step 3 ("real-time, hourly, or daily") and
the scoring cadence of Section 6.3.

Task order is the whole point of the DAG: features must not be built until silver has
finished standardising, and scores must not be published until the features they came
from are in the warehouse. Anything else and the dashboard shows a risk score derived
from yesterday's data next to today's case counts.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.empty import EmptyOperator
from airflow.providers.databricks.operators.databricks import DatabricksSubmitRunOperator
from airflow.providers.cncf.kubernetes.operators.pod import KubernetesPodOperator

DEFAULT_ARGS = {
    "owner": "global-security-intelligence",
    "depends_on_past": False,
    "email_on_failure": True,
    "retries": 2,
    "retry_delay": timedelta(minutes=5),
    # A run that has not finished in two hours is stuck, not slow: fail it so the next
    # scheduled run starts from a clean state rather than queueing behind it.
    "execution_timeout": timedelta(hours=2),
}

JOB_CLUSTER = {
    "spark_version": "15.4.x-scala2.12",
    "node_type_id": "Standard_DS4_v2",
    "num_workers": 4,
    "spark_conf": {
        "spark.databricks.delta.optimizeWrite.enabled": "true",
        "spark.databricks.delta.autoCompact.enabled": "true",
    },
}

REPO_PATH = "/Workspace/Repos/global-security/gsih/pipelines/spark"


def _spark_task(dag: DAG, task_id: str, script: str, params: list[str]) -> DatabricksSubmitRunOperator:
    return DatabricksSubmitRunOperator(
        task_id=task_id,
        dag=dag,
        new_cluster=JOB_CLUSTER,
        spark_python_task={"python_file": f"{REPO_PATH}/{script}", "parameters": params},
    )


with DAG(
    dag_id="gsih_daily",
    description="Ingest, standardise, publish and score the investigations hub",
    default_args=DEFAULT_ARGS,
    # 04:00 UTC: after the overnight batch exports from the case management systems land
    # and before the first US morning shift opens their dashboards.
    schedule="0 4 * * *",
    start_date=datetime(2026, 1, 1),
    catchup=False,
    max_active_runs=1,
    tags=["gsih", "security", "predictive"],
) as dag:

    start = EmptyOperator(task_id="start")

    bronze_tasks = [
        _spark_task(
            dag,
            f"bronze_{topic.replace('.', '_')}",
            "bronze_ingest.py",
            ["--mode", "kafka", "--topic", topic, "--bootstrap", "{{ var.value.gsih_kafka_bootstrap }}",
             "--checkpoint", f"abfss://checkpoints@gsihlake.dfs.core.windows.net/bronze/{topic}"],
        )
        for topic in ("gsih.incidents.raw", "gsih.cases.raw", "gsih.access.raw", "gsih.alarms.raw")
    ]

    bronze_files = _spark_task(
        dag,
        "bronze_landing_files",
        "bronze_ingest.py",
        ["--mode", "files", "--landing-path", "abfss://landing@gsihlake.dfs.core.windows.net/legacy/",
         "--file-format", "csv", "--target-table", "bronze.legacy_raw",
         "--checkpoint", "abfss://checkpoints@gsihlake.dfs.core.windows.net/bronze/legacy"],
    )

    silver_incidents = _spark_task(
        dag, "silver_incidents", "silver_standardize.py",
        ["--entity", "incidents", "--source-table", "bronze.incident_raw",
         "--target-table", "silver.incident"],
    )

    silver_cases = _spark_task(
        dag, "silver_cases", "silver_standardize.py",
        ["--entity", "cases", "--source-table", "bronze.case_raw",
         "--target-table", "silver.case_record"],
    )

    gold_publish = _spark_task(
        dag, "gold_publish", "gold_publish.py",
        ["--jdbc-url", "{{ var.value.gsih_jdbc_url }}",
         "--db-user", "{{ var.value.gsih_db_user }}",
         "--db-password", "{{ conn.gsih_warehouse.password }}"],
    )

    # Scoring runs on AKS rather than Databricks: it is a small scikit-learn job against
    # the serving database, and a Spark cluster would be pure overhead for it.
    score_sites = KubernetesPodOperator(
        task_id="score_sites",
        name="gsih-scoring",
        namespace="gsih",
        image="{{ var.value.gsih_analytics_image }}",
        cmds=["gsih-score"],
        arguments=["--model-dir", "/models"],
        service_account_name="gsih-analytics",
        get_logs=True,
        is_delete_operator_pod=True,
    )

    finish = EmptyOperator(task_id="finish")

    start >> bronze_tasks >> silver_incidents
    start >> bronze_files >> silver_incidents
    bronze_tasks >> silver_cases
    [silver_incidents, silver_cases] >> gold_publish >> score_sites >> finish


with DAG(
    dag_id="gsih_weekly_training",
    description="Retrain the vandalism risk model and record the run in MLflow",
    default_args=DEFAULT_ARGS,
    # Sunday 02:00 UTC — a full week of new labels, and no daily run in flight.
    schedule="0 2 * * 0",
    start_date=datetime(2026, 1, 1),
    catchup=False,
    max_active_runs=1,
    tags=["gsih", "ml"],
) as training_dag:

    train_model = KubernetesPodOperator(
        task_id="train_vandalism_model",
        name="gsih-training",
        namespace="gsih",
        image="{{ var.value.gsih_analytics_image }}",
        cmds=["gsih-train"],
        arguments=["--output-dir", "/models"],
        service_account_name="gsih-analytics",
        get_logs=True,
        is_delete_operator_pod=True,
        # Training reads a year and a half of site-days; give it room beyond the default.
        execution_timeout=timedelta(hours=3),
    )
