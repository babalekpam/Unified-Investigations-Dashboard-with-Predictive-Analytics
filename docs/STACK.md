# Technology stack

The proposal's Section 9 offered a menu of options ("Snowflake, Azure Synapse, AWS
Redshift"; "Power BI, Tableau, custom web application"). This document records what was
actually chosen, and why — every substitution is a decision someone will eventually ask
about.

The organising principle: build on what AT&T already runs. The company's data platform is
an Azure lakehouse on Databricks and Delta Lake, its services are Java and Spring Boot on
Kubernetes, its streaming backbone is Kafka, its identity provider is Microsoft Entra ID,
and its analytics work is Python. A security-investigations platform that picks different
technology for each layer is a platform that needs its own on-call rota, its own hiring
pipeline and its own security review.

## Layer by layer

| Layer | Proposal suggested | Built with | Why |
|---|---|---|---|
| Cloud | — | **Microsoft Azure** | The strategic cloud partnership. Entra ID, AKS, Event Hubs and Azure Databricks are already governed here, so the hub inherits the existing network, identity and compliance posture instead of proposing a second one. |
| Data warehouse | Snowflake / Synapse / Redshift | **Azure Databricks + Delta Lake**, with **PostgreSQL** as the serving store | Databricks is the existing lakehouse; Delta gives the time travel and replayability that Section 5.3's audit requirements need. Dashboard queries are small, indexed, concurrent point-reads — a transactional database serves those far better than a lakehouse query engine, so gold tables are published to PostgreSQL. |
| Integration / ETL | Azure Data Factory / Talend / Fivetran | **Kafka + Spark Structured Streaming** (real time), **Auto Loader + PySpark** (batch), **Airflow** (orchestration) | Section 5.1 lists five integration methods with different latency needs. Kafka carries the real-time feeds the dashboard depends on; Auto Loader handles the flat-file sources that have no API. Airflow already orchestrates the data platform, so the DAG sits beside existing pipelines rather than in a separate scheduler. |
| Analytics / ML | Python / Azure ML / SageMaker | **Python, scikit-learn, MLflow** | scikit-learn covers everything Section 6.4 asks for — logistic regression, gradient boosting, clustering — with no GPU and no training cluster. MLflow is the tracking layer Databricks already provides, so runs and metrics land where the data science team looks for them. |
| Services | — | **Java 21 + Spring Boot 3 on AKS** | The house language for backend services. Spring Security's OAuth2 resource server support is what makes the Entra ID integration a configuration change rather than an authentication implementation. |
| Dashboard / BI | Power BI / Tableau / custom web app | **React + TypeScript** | Section 7 needs three genuinely different applications: a personal work queue, a team management view, and an executive summary. A BI tool renders the executive view well and the investigator queue poorly — a case queue with deadlines, repeat-incident flags and next steps is an application, not a report. Power BI stays the right tool for ad-hoc analysis *on top of* the same gold tables. |
| Security | Azure AD / Okta, RBAC, encryption | **Microsoft Entra ID**, workload identity, RBAC, Key Vault | Users authenticate against the corporate tenant and the app never sees a credential. Services authenticate to Azure with federated workload identities, so no pod holds a database password. |
| Observability | — | **Micrometer / Prometheus, Log Analytics, App Insights** | Standard for AKS workloads; the ingest service exports the counters that matter operationally (records per feed, unmapped categories, quarantined payloads). |
| Infrastructure | — | **Terraform** | The whole footprint is code and reviewable, including the network rules that keep the warehouse off the public internet. |

## Substitutions worth defending

**Delta Lake instead of Snowflake.** Not a performance argument — an ownership one. The
lakehouse already exists, the security data can sit under the same Unity Catalog
governance as everything else, and Delta's time travel means a mapping error found six
months from now can be corrected by re-running silver from bronze rather than re-requesting
exports from vendors.

**PostgreSQL alongside Delta, rather than instead of it.** Two stores is a cost, and it is
paid for a reason: Delta keeps the complete replayable history, PostgreSQL serves the
dashboards. `gold_publish.py` is the only thing that moves data between them.

**Kafka and Spark both reading the same topics.** The Java ingest service keeps the
dashboard current within seconds; the bronze streaming job keeps the complete history the
models train on. This is the one place the platform duplicates logic — the canonical
vocabulary exists in Java and in PySpark — and `pipelines/tests/test_mapping_parity.py`
fails the build if the two ever disagree.

**A custom front end rather than Power BI.** Stated above, but the deciding factor is
Section 7.1: an investigator's view has to show a queue with deadlines, related-incident
flags and next steps. That is an operational application. The executive view alone would
be a fine Power BI report, and nothing here stops one being built against the same tables.

**scikit-learn rather than Azure ML or SageMaker.** The models in Section 6.4 train in
seconds on a laptop. A managed training service adds a control plane, a cost centre and a
deployment surface for no accuracy. If Phase 4 brings deep models or image analytics on
camera feeds, that trade changes; the training job is a container either way.

## Palette

The dashboards and the charts are coloured from the AT&T brand palette: the brand blue
`#00A8E0` (PMS 298 C), with one-hue ramps derived from it, and the brand black `#191919`
and light grey `#F2F2F2` as the neutrals.

The brand blue is an **identity fill, not a data mark**. On white it measures 2.74:1,
below the 3:1 a mark needs — which is exactly how AT&T use it themselves: a filled bar
with type on top, never thin marks on a white ground. So it drives the chrome, and data
marks take a hue-locked darker step (`#0089B8`) that clears the floor. On the brand black
it reaches 6.4:1 and needs no substitute. Status colours (good / warning /
critical) stay reserved and outside the brand hues, so a state can never be mistaken for a
data series; each one ships with an icon and a word as well as a colour.

Two ramps rather than one. The *sequential* ramp encodes a continuous magnitude — the risk
score on the heat map — and its lightest step is allowed to recede toward the surface,
meaning "near zero". The *ordinal* ramp encodes discrete ordered buckets — case aging — and
is held to a stricter floor so the lightest bucket still reads against the surface.

Every value was checked with a palette validator against the exact surfaces it renders on,
in both light and dark: the categorical pair passes the lightness band, chroma floor,
colour-vision separation and contrast checks; the ordinal ramp passes monotonicity, step
spacing and light-end contrast; and small text clears WCAG AA on both grounds.

No AT&T data-visualisation standard is published; searching the design-system directories
that index IBM Carbon, Red Hat PatternFly, Ant Design and USWDS turns up nothing for AT&T.
The chart forms here are therefore chosen from the shape of each dataset, not from a house
style, and confirming the visual language against Brand Central belongs in Phase 1.

These hex values are taken from AT&T's publicly visible brand usage rather than from an
internal brand book. Confirm them against AT&T Brand Central before the deck goes in front
of anyone — the tokens live in one place (`web/src/styles.css`), so a correction is a
find-and-replace, not a redesign.

## Versions

| Component | Version |
|---|---|
| Java | 21 (LTS) |
| Spring Boot | 3.3 |
| Python | 3.11 |
| Databricks Runtime | 15.4 LTS (Spark 3.5) |
| PostgreSQL | 16 |
| Kafka protocol | 3.7 (Event Hubs in Azure) |
| Node | 22 |
| React | 18 |
| Terraform | ≥ 1.7, azurerm ~> 3.100 |
