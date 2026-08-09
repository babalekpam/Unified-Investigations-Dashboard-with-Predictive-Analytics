"""Training entry point — the job Airflow runs weekly (Section 6.3, steps 1 and 2).

Reads the labelled history from the warehouse, trains both candidate models, records the
run in MLflow and writes the winner to disk for the scoring job to pick up. A model that
fails the promotion guardrail is recorded and then discarded: the previous model stays in
service rather than being replaced by something worse.
"""

from __future__ import annotations

import argparse
import json
import logging
import pickle
from pathlib import Path

import pandas as pd

from gsih_analytics.config import Settings, get_settings
from gsih_analytics.features.build import build_training_frame
from gsih_analytics.models import vandalism
from gsih_analytics.warehouse import engine_for, load_sources

log = logging.getLogger(__name__)

MODEL_FILENAME = "vandalism_model.pkl"
METADATA_FILENAME = "vandalism_model.json"


def run(settings: Settings, output_dir: Path) -> dict:
    engine = engine_for(settings.db_url)
    end = pd.Timestamp.now(tz="UTC").normalize()
    start = end - pd.Timedelta(days=settings.training_window_days)

    sources = load_sources(engine, since=start)
    log.info(
        "loaded %d sites, %d incidents, %d access events, %d alarms",
        len(sources.sites),
        len(sources.incidents),
        len(sources.access_events),
        len(sources.alarm_events),
    )

    frame = build_training_frame(sources, start=start, end=end)
    result = vandalism.train(frame, version=settings.model_version)

    metrics = [e.as_dict() for e in result.evaluations]
    chosen = next(m for m in metrics if m["model"] == result.chosen)
    promoted = _meets_guardrail(chosen, settings)

    _record_to_mlflow(settings, result, metrics, promoted)

    if promoted:
        output_dir.mkdir(parents=True, exist_ok=True)
        with (output_dir / MODEL_FILENAME).open("wb") as handle:
            pickle.dump(
                {"estimator": result.estimator, "importance": result.feature_importance},
                handle,
            )
        (output_dir / METADATA_FILENAME).write_text(
            json.dumps(
                {
                    "model_version": settings.model_version,
                    "chosen": result.chosen,
                    "metrics": metrics,
                    "feature_importance": result.feature_importance,
                    "trained_at": pd.Timestamp.now(tz="UTC").isoformat(),
                    "training_rows": len(frame),
                },
                indent=2,
            )
        )
        log.info("promoted %s (%s)", settings.model_name, result.chosen)
    else:
        log.warning(
            "model not promoted: average precision %.4f is below the %.4f guardrail; "
            "the previous model stays in service",
            chosen["average_precision"],
            settings.min_average_precision,
        )

    return {"promoted": promoted, "chosen": result.chosen, "metrics": metrics}


def _meets_guardrail(chosen: dict, settings: Settings) -> bool:
    average_precision = chosen["average_precision"]
    # NaN fails the comparison, which is the behaviour we want: an unmeasurable model is
    # not a passing model.
    return bool(average_precision >= settings.min_average_precision)


def _record_to_mlflow(settings, result, metrics, promoted: bool) -> None:
    """Logs the run. A tracking server outage must not fail the training job."""
    try:
        import mlflow

        mlflow.set_tracking_uri(settings.mlflow_tracking_uri)
        mlflow.set_experiment(settings.mlflow_experiment)
        with mlflow.start_run(run_name=settings.model_name):
            mlflow.log_param("chosen_model", result.chosen)
            mlflow.log_param("model_version", settings.model_version)
            mlflow.log_param("training_window_days", settings.training_window_days)
            mlflow.log_param("promoted", promoted)
            for entry in metrics:
                prefix = entry["model"].replace("-", "_")
                for key in ("roc_auc", "average_precision", "brier", "positive_rate"):
                    value = entry[key]
                    if value == value:  # skip NaN
                        mlflow.log_metric(f"{prefix}__{key}", value)
            for feature, importance in result.feature_importance.items():
                mlflow.log_metric(f"importance__{feature}", importance)
    except Exception as exc:  # noqa: BLE001 - tracking is observability, not the job
        log.warning("MLflow logging skipped: %s", exc)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="Train the vandalism risk model")
    parser.add_argument("--output-dir", default="/models", type=Path)
    args = parser.parse_args()

    summary = run(get_settings(), args.output_dir)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
