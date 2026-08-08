"""Vandalism likelihood model (Section 6.4).

The proposal calls for logistic regression to predict likelihood and gradient boosting to
rank risk factors and improve accuracy. Both are built here: logistic regression is the
baseline every result is compared against, and the boosted model only ships if it beats
that baseline on a time-ordered holdout.

Two properties matter more than raw accuracy for this use case:

* **Calibration.** A manager deploying patrols needs "0.8 means roughly eight times in
  ten", not just a correct ranking. The Brier score is reported alongside the ranking
  metrics for exactly that reason.
* **Time-ordered evaluation.** Splitting randomly would let the model train on next
  month and test on last month, which flatters any model with per-site memory. The
  split here is always chronological.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from gsih_analytics.features.build import FEATURE_COLUMNS, FEATURE_LABELS

MODEL_NAME = "vandalism-risk"


@dataclass
class Evaluation:
    """Holdout metrics for one candidate model."""

    model_name: str
    roc_auc: float
    average_precision: float
    brier: float
    positive_rate: float
    n_train: int
    n_test: int

    def as_dict(self) -> dict[str, Any]:
        return {
            "model": self.model_name,
            "roc_auc": round(self.roc_auc, 4),
            "average_precision": round(self.average_precision, 4),
            "brier": round(self.brier, 4),
            "positive_rate": round(self.positive_rate, 4),
            "n_train": self.n_train,
            "n_test": self.n_test,
        }


@dataclass
class TrainingResult:
    estimator: Pipeline | HistGradientBoostingClassifier
    chosen: str
    evaluations: list[Evaluation]
    feature_importance: dict[str, float] = field(default_factory=dict)
    version: str = "0.0.0"


def time_ordered_split(
    frame: pd.DataFrame, test_fraction: float = 0.25
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Splits on the date axis: the test set is always the most recent slice."""
    if frame.empty:
        return frame, frame
    ordered = frame.sort_values("as_of_date")
    split_at = int(len(ordered) * (1 - test_fraction))
    return ordered.iloc[:split_at], ordered.iloc[split_at:]


def _baseline() -> Pipeline:
    return Pipeline(
        [
            ("scale", StandardScaler()),
            # Vandalism is rare, so most site-days are negatives. Balanced class weights
            # stop the model from taking the free 95% accuracy of predicting "no".
            (
                "clf",
                LogisticRegression(max_iter=2000, class_weight="balanced", random_state=42),
            ),
        ]
    )


def _boosted() -> HistGradientBoostingClassifier:
    return HistGradientBoostingClassifier(
        max_depth=4,
        max_iter=250,
        learning_rate=0.06,
        # The dataset is site-days, of which very few are positive; a floor on leaf size
        # keeps the model from carving out a leaf per historical incident.
        min_samples_leaf=30,
        l2_regularization=1.0,
        random_state=42,
    )


def train(frame: pd.DataFrame, version: str) -> TrainingResult:
    """Trains both candidates and returns the better one by average precision."""
    if frame.empty:
        raise ValueError("no training rows: check the warehouse window and label horizon")

    train_df, test_df = time_ordered_split(frame)
    if train_df["label"].nunique() < 2:
        raise ValueError(
            "training window contains only one class — widen the window so the model "
            "sees both quiet and incident periods"
        )

    x_train, y_train = train_df[FEATURE_COLUMNS], train_df["label"]
    x_test, y_test = test_df[FEATURE_COLUMNS], test_df["label"]

    candidates = {"logistic-regression": _baseline(), "gradient-boosting": _boosted()}
    evaluations: list[Evaluation] = []
    fitted: dict[str, Any] = {}

    for name, estimator in candidates.items():
        estimator.fit(x_train, y_train)
        fitted[name] = estimator
        evaluations.append(_evaluate(name, estimator, x_test, y_test, len(train_df)))

    best = max(evaluations, key=lambda e: e.average_precision)
    estimator = fitted[best.model_name]

    return TrainingResult(
        estimator=estimator,
        chosen=best.model_name,
        evaluations=evaluations,
        feature_importance=_importance(estimator, x_test, y_test),
        version=version,
    )


def _evaluate(name: str, estimator: Any, x_test, y_test, n_train: int) -> Evaluation:
    # A holdout slice with a single class makes ROC/AP undefined. Report NaN rather than
    # a fabricated number, so a caller cannot mistake it for a real score.
    if len(y_test) == 0 or y_test.nunique() < 2:
        return Evaluation(name, float("nan"), float("nan"), float("nan"), 0.0, n_train, len(y_test))

    probabilities = estimator.predict_proba(x_test)[:, 1]
    return Evaluation(
        model_name=name,
        roc_auc=roc_auc_score(y_test, probabilities),
        average_precision=average_precision_score(y_test, probabilities),
        brier=brier_score_loss(y_test, probabilities),
        positive_rate=float(y_test.mean()),
        n_train=n_train,
        n_test=len(y_test),
    )


def _importance(estimator: Any, x_test, y_test) -> dict[str, float]:
    """Permutation importance — model-agnostic, so both candidates report comparably."""
    if len(y_test) == 0 or y_test.nunique() < 2:
        return {}
    result = permutation_importance(
        estimator, x_test, y_test, n_repeats=5, random_state=42, scoring="average_precision"
    )
    raw = {
        column: float(max(value, 0.0))
        for column, value in zip(FEATURE_COLUMNS, result.importances_mean, strict=True)
    }
    total = sum(raw.values())
    if total == 0:
        return {column: 0.0 for column in FEATURE_COLUMNS}
    return {column: value / total for column, value in raw.items()}


def score_sites(
    estimator: Any, features: pd.DataFrame, importance: dict[str, float], top_n: int = 3
) -> pd.DataFrame:
    """Scores every site and attaches the factors that drove each score.

    The attribution is deliberately simple: a feature contributes in proportion to its
    global importance multiplied by how far this site sits above the population average
    for that feature. It answers "why is this site above the others today", which is the
    question a manager is actually asking, and it costs nothing at scoring time. It is
    not a SHAP decomposition and is not presented as one.
    """
    probabilities = estimator.predict_proba(features[FEATURE_COLUMNS])[:, 1]

    values = features[FEATURE_COLUMNS].astype(float)
    population_mean = values.mean()
    population_std = values.std().replace(0, np.nan)
    deviation = ((values - population_mean) / population_std).fillna(0.0).clip(lower=0.0)

    weights = pd.Series(
        {column: importance.get(column, 0.0) for column in FEATURE_COLUMNS}, dtype=float
    )
    contributions = deviation.mul(weights, axis=1)

    scored = pd.DataFrame(
        {
            "site_code": features["site_code"].to_numpy(),
            "region": features["region"].to_numpy(),
            "risk_score": probabilities,
        }
    )
    scored["top_factors"] = [
        _top_factors(contributions.iloc[i], top_n) for i in range(len(contributions))
    ]
    scored["peak_window"] = [
        _peak_window(features.iloc[i]) for i in range(len(features))
    ]
    return scored.sort_values("risk_score", ascending=False).reset_index(drop=True)


def _top_factors(row: pd.Series, top_n: int) -> dict[str, float]:
    ranked = row[row > 0].sort_values(ascending=False).head(top_n)
    total = ranked.sum()
    if total == 0:
        return {}
    return {FEATURE_LABELS.get(k, k): round(float(v / total), 3) for k, v in ranked.items()}


def _peak_window(row: pd.Series) -> str:
    """The window to patrol, inferred from which signal is elevated at this site.

    Coarse by design. A per-site hourly hazard model needs far more incident history than
    a first pilot has; until then this reflects the two patterns the historical data does
    support — after-hours entry attempts and overnight perimeter activity.
    """
    if row.get("after_hours_access_7d", 0) > 0 or row.get("tailgate_events_30d", 0) > 0:
        return "22:00-02:00"
    if row.get("alarm_events_7d", 0) > 0:
        return "00:00-04:00"
    return "20:00-00:00"
