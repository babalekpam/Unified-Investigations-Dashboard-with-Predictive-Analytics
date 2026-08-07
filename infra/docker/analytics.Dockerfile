# Predictive analytics: training job, scoring job and the on-demand scoring API.
# One image, three entry points — the model code must be identical across all three,
# and a shared image is the only way to guarantee that.

FROM python:3.11-slim AS base
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
 && apt-get install -y --no-install-recommends gcc libpq-dev \
 && rm -rf /var/lib/apt/lists/*

COPY analytics/pyproject.toml ./
COPY analytics/gsih_analytics ./gsih_analytics
RUN pip install --no-cache-dir .

RUN groupadd --system gsih && useradd --system --gid gsih --home /app gsih \
 && mkdir -p /models && chown gsih:gsih /models
USER gsih

# Default is the scoring API; the Airflow tasks override cmds with gsih-train / gsih-score.
EXPOSE 8000
CMD ["uvicorn", "gsih_analytics.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
