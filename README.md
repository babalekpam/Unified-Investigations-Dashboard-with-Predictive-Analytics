# Global Security Intelligence Hub

A working implementation of the *Unified Investigations Dashboard with Predictive
Analytics* proposal — consolidated investigations data, three role-based dashboards, and
a vandalism risk model — built on the stack AT&T uses: **Azure**, **Databricks / Delta
Lake**, **Kafka**, **Java 21 + Spring Boot on Kubernetes**, **PySpark + Airflow**,
**Python / scikit-learn / MLflow**, and **React + TypeScript**.

The proposal's own Section 9 suggested a generic toolset (Snowflake or Synapse, Talend or
Fivetran, Power BI or Tableau). This repository implements the same architecture on the
AT&T stack instead; [`docs/STACK.md`](docs/STACK.md) maps every suggested component to
what was actually built and explains each substitution.

---

## What is here

| Section of the proposal | Implementation |
|---|---|
| 3.2 Architecture flow | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — bronze → silver → gold, then serving |
| 4.1 Source systems | `Enums.SourceSystem` — Case IQ, Resolver, Kaseware, D3, Genetec, LenelS2, ServiceNow, Ontic, ArcGIS, SAP … |
| 5.1 Integration methods | Kafka streaming (`gsih-ingest-service`), Auto Loader batch files and Delta ETL (`pipelines/spark`) |
| 5.2 Extract → Standardize → Load | `CanonicalMapper` + `Normalizer` (streaming) and `silver_standardize.py` (batch) |
| 5.3 Governance | RBAC on Entra ID, region-scoped queries, hashed badge identifiers, append-only audit log |
| 6 Predictive analytics | `analytics/` — logistic regression + gradient boosting, seasonal forecaster, DBSCAN hotspots |
| 7 Three dashboard views | `web/` — Investigator, Manager and Executive views |
| Link analysis (beyond the proposal) | `LinkGraphService` + `LinkGraphView` — entity graph across cases, sites, incidents, badges and alarms |
| 8 Roadmap | Phase 1–2 deliverables; see *Scope* below |

## For the proposal pack

The pack is two Word documents and a live walkthrough, because a proposal is read by two
different audiences and they do not want the same thing.

| Deliverable | For | What it is |
|---|---|---|
| [`docs/GSIH-Executive-Brief.docx`](docs/GSIH-Executive-Brief.docx) | Security leadership, budget holders | ~2,500 words. The situation today, what changes for each role, what the platform will *not* do, the phased plan, what is needed from the organisation, how the benefit would be measured, and the risks. No jargon, and deliberately no invented ROI figure — a measurement plan instead. |
| [`docs/GSIH-Platform-Specification.docx`](docs/GSIH-Platform-Specification.docx) | The technical review team | ~6,000 words, 20 tables, three appendices. Part I what the platform is, Part II how it works down to failure behaviour, Part III the stack with the substitutions worth defending. |
| The walkthrough build | Both, in the room | The real dashboard running offline against captured API responses — sortable, filterable, light and dark. Built from `web/demo`. |

Both documents share one house style (`docs/doc_style.js`), so they read as one pack.

```bash
npm i docx
node docs/build_brief_doc.js docs/GSIH-Executive-Brief.docx
node docs/build_spec_doc.js  docs/GSIH-Platform-Specification.docx
python3 docs/verify_spec_doc.py docs/GSIH-Executive-Brief.docx
python3 docs/verify_spec_doc.py docs/GSIH-Platform-Specification.docx
```

The verifier is what CI runs: Word's layout engine is not available there, but a table wider
than the text column is the defect that ruins a printed document, and that is checkable.

## Repository layout

```
services/          Java 21 / Spring Boot
  gsih-common/         canonical model + vendor vocabulary mapping
  gsih-investigations-api/  serving API behind the three dashboards
  gsih-ingest-service/      Kafka → warehouse normalisation
analytics/         Python — feature engineering, models, training, scoring, MLflow
pipelines/
  spark/               PySpark medallion jobs for Databricks
  airflow/dags/        daily refresh + weekly retraining
  tests/               streaming-vs-batch mapping parity guard
web/               React + TypeScript dashboards
infra/
  docker/              images for every service
  k8s/                 AKS manifests with workload identity
  terraform/           Azure footprint
data/seed/         deterministic demo data generator
```

## Running it

### Everything at once

```bash
docker compose up --build
```

Then seed the warehouse and run the predictive layer once:

```bash
pip install -e "analytics[dev]"
python data/seed/generate_seed.py --db-url postgresql+psycopg2://gsih:gsih@localhost:5432/gsih

TOKEN=$(curl -s "http://localhost:8080/api/v1/auth/local-token?username=analytics-svc&roles=ANALYTICS_WRITER" \
  | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

GSIH_DB_URL=postgresql+psycopg2://gsih:gsih@localhost:5432/gsih \
  python -m gsih_analytics.train --output-dir ./models

GSIH_DB_URL=postgresql+psycopg2://gsih:gsih@localhost:5432/gsih \
GSIH_API_TOKEN=$TOKEN \
  python -m gsih_analytics.scoring --model-dir ./models
```

Open <http://localhost:8090> and pick one of the three demo personas. API docs are at
<http://localhost:8080/swagger-ui.html>.

### Piece by piece

```bash
mvn -f services/pom.xml verify          # Java build and tests
pytest analytics/tests pipelines/tests  # model and mapping tests
cd web && npm ci && npm test && npm run build
```

## How sign-in works

The API is an OAuth2 resource server. In a deployed environment tokens come from
**Microsoft Entra ID** and the `roles` claim carries the app roles assigned to each
security group; the `region` claim scopes a user to their own region. Locally the `local`
Spring profile swaps the Entra ID decoder for a symmetric key and exposes
`/api/v1/auth/local-token`, so the stack can be demonstrated without a tenant. **The
authorisation rules are identical in both profiles** — only token verification differs.

There is no default profile, and the API refuses to start without one. That is deliberate:
the local token endpoint will mint a token for any role a caller asks for, so an image
started with no `SPRING_PROFILES_ACTIVE` must not quietly fall back to it. Set `azure` for
a deployed environment (the Kubernetes manifest does) or `local` for the demo stack (the
compose file does); anything else fails fast with a message saying so.

Enforced and covered by tests:

- an investigator can open only their own queue;
- a manager is confined to their own region even when they ask for another — including
  through the queue override, site risk history and the site list, each of which checked
  the role but not the region until a review caught it;
- only an executive sees the enterprise view;
- only the analytics workload identity can write risk scores;
- every read is written to an append-only audit table.

## The predictive layer

`analytics/` predicts, for each site, the probability of a vandalism incident **in the
next seven days**, from the six input families listed in Section 6.2 of the proposal.

Three decisions are worth knowing about before reading the code:

**Features never see the future.** Every feature for a `(site, date)` row is computed from
data strictly before that date, and the evaluation split is chronological, never random.
A test (`test_features_never_see_the_future`) asserts that adding an incident *after* the
scoring date changes no feature value.

**Risk bands are relative, not absolute.** Vandalism on a given site-week is rare — a base
rate of a few percent — so a well-calibrated model almost never emits a probability above
0.66. Fixed thresholds would paint every site LOW. A site is banded HIGH if it is in the
worst 10% of *today's* scoring run, which is the question a security team actually asks:
given that we can patrol a few sites tonight, which ones? The raw probability is always
shown next to the band.

**The forecast models the annual cycle.** Vandalism rises through the dark months. A
trend-only forecaster reads the summer trough as a permanent decline and projects towards
zero; this one fits two Fourier harmonics of day-of-year alongside a damped trend, and a
test pins that behaviour.

Predictions are probabilities, not certainties. The executive dashboard says so on the
chart itself.

## Verification

Everything below was run against a live PostgreSQL warehouse seeded with two years of
generated history (69 sites, 1,121 incidents, 534 cases, 275k badge reads):

- **60 Java tests** — canonical mapping, normalisation, RBAC, dashboard KPIs, risk ingest,
  link analysis, the weekday × hour heat map
- **25 Python tests** — leakage guard, model quality, forecaster behaviour, clustering
- **3 parity tests** — streaming and batch vocabularies agree
- **31 dashboard tests** — the three views, tab isolation, sorting and filtering, the five
  chart forms, RBAC gating, chart accessibility, link graph
- **the deployed security profile** — the API booted as an OAuth2 resource server against a
  stub OpenID provider with a generated RSA key: discovery, JWKS fetch, signature, issuer,
  audience and expiry all enforced, roles and region mapped, and the demo token endpoint
  absent. Only the tenant configuration itself remains for Phase 1.
- **the streaming path** — an in-process Kafka broker to the real sink to a real PostgreSQL
  warehouse: a message becomes a canonical row, a redelivery updates it instead of
  duplicating it, one malformed payload does not stop the feed, and badge identifiers reach
  the warehouse only as hashes
- **the infrastructure definitions** — `terraform validate` and `kubeconform -strict`
  against the Kubernetes 1.29 schemas, in CI. Valid and internally consistent; not the same
  as applied to a subscription.
- **end-to-end**: seed → train → score → 69 scores and a 90-day projection posted through
  the API → all three dashboards rendered, and every RBAC denial returned 403/401

On this synthetic data the promoted model reaches ROC-AUC 0.60 and average precision
0.103 against a 7.6% base rate — a real but modest lift, which is what one should expect
from generated data. The number to judge is the one from Phase 3 of the roadmap, on the
organisation's own history; the training job refuses to promote a model that does not
clear its guardrail, so a bad retrain leaves the previous model in service.

## Link analysis

Beyond the proposal's scope, but the thing an investigations platform reaches for once a
case stops being about one incident: `GET /api/v1/graph/cases/{caseNumber}` walks the
entity graph outward from a case — its site, everything that happened there, and the badges
read after hours — and the investigator view draws it.

Three bounds keep it useful rather than a hairball. Hops (two by default; three follows a
shared badge to a second site). A node budget, with the response saying when it truncated
so the UI can claim "the strongest N connections" rather than completeness. And a
selectivity rule: a badge read after hours at more than four sites is a roaming credential
— a technician's route — and is drawn but never expanded through, because expanding one
connects every site to every other. Region confinement applies to every site the traversal
reaches, not only the seed, so the graph cannot become a way around it.

Graph visualisation has AT&T lineage worth noting in a proposal: Graphviz was created at
AT&T Bell Labs in 1991 and developed by AT&T Labs Research.

## Scope

Built and running: the canonical model, both ingestion paths, the serving API, the
predictive layer, the three dashboards, and the infrastructure definitions.

Written as production-path code but not executed here, because they need the platforms
themselves: the PySpark medallion jobs (Databricks), the Airflow DAGs (an Airflow
deployment), and the Terraform footprint (an Azure subscription — the HCL is validated in
CI, which is a different claim from applied). The mapping-parity test covers the one
correctness risk that spans the boundary between the Spark path and the Java path.

Two things the integration tests found the first time they ran, both of which had been
sitting behind "it compiles": the ingest service could not start at all, because a headless
Kafka consumer gets no `ObjectMapper` from Boot's auto-configuration; and a site published
between two directory refreshes had its events written with no region, which is the field
access confinement and every regional KPI depend on. Both are fixed and both now have a
test that fails without the fix.

Deliberately not built: connectors to any specific vendor system. Section 8's Phase 1
exists precisely to confirm which systems are in use before that code is written — the
`RawEvents` envelopes define the contract each connector will publish to.

Two claims this repository does not make. The model's numbers say nothing about AT&T: it
is trained on generated history, so what is proven is that the pipeline is leak-free and
the method sound, not that it predicts anything about real sites. And video never enters
the platform — the VMS feeds publish alarm events, which carry a camera id and an alarm
type; footage stays in the VMS, where retention, chain of custody and access control for it
already live.
