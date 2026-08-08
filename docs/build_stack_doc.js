/**
 * Builds the technology-stack technical appendix for the Global Security Intelligence Hub
 * proposal, as a Word document the author can drop straight into their pack.
 */

const fs = require('fs')
const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
} = require('docx')

/* ------------------------------------------------------------------ tokens */

// AT&T brand: the blue (PMS 298 C) as a filled bar with white type on it — the way it is
// used on att.com — plus the brand black for body copy. Headings take a darker step of
// the same hue so they hold up in print and in greyscale.
const BRAND = '00A8E0'
const HEADING = '005E7F'
const SUBHEAD = '0089B8'
const INK = '191919'
const INK_2 = '4A4F54'
const MUTED = '6B7075'
const RULE = 'DCDFE2'
const ZEBRA = 'F4F9FC'

const CONTENT_WIDTH = 10080 // US Letter (12240) less 0.75" margins each side

/* ------------------------------------------------------------------ helpers */

const text = (value, opts = {}) =>
  new TextRun({ text: value, font: 'Calibri', size: 20, color: INK, ...opts })

const para = (value, opts = {}) => {
  const { children, ...rest } = opts
  return new Paragraph({
    spacing: { after: 140, line: 276 },
    children: children ?? [text(value)],
    ...rest,
  })
}

const h1 = (value) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: BRAND, space: 6 } },
    children: [new TextRun({ text: value, font: 'Calibri', size: 30, bold: true, color: HEADING })],
  })

const h2 = (value) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 260, after: 110 },
    children: [new TextRun({ text: value, font: 'Calibri', size: 24, bold: true, color: SUBHEAD })],
  })

const h3 = (value) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text: value, font: 'Calibri', size: 21, bold: true, color: INK })],
  })

const bullet = (value, opts = {}) =>
  new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    spacing: { after: 70, line: 276 },
    children: opts.children ?? [text(value)],
  })

const note = (value) =>
  new Paragraph({
    spacing: { before: 120, after: 160 },
    indent: { left: 240 },
    border: { left: { style: BorderStyle.SINGLE, size: 14, color: BRAND, space: 10 } },
    children: [text(value, { italics: true, color: INK_2 })],
  })

const cell = (content, opts = {}) => {
  const { width, shading, bold, color, size, align } = opts
  const paragraphs = Array.isArray(content) ? content : [content]
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: shading ? { type: ShadingType.CLEAR, fill: shading, color: 'auto' } : undefined,
    margins: { top: 70, bottom: 70, left: 110, right: 110 },
    children: paragraphs.map(
      (value) =>
        new Paragraph({
          alignment: align,
          spacing: { after: 0, line: 250 },
          children: [
            new TextRun({
              text: value,
              font: 'Calibri',
              size: size ?? 18,
              bold,
              color: color ?? INK,
            }),
          ],
        }),
    ),
  })
}

/**
 * A table with a brand-filled header row.
 *
 * Column widths must sum to the table width, and every cell repeats its own width —
 * percentage widths render incorrectly outside Word.
 */
const table = (headers, rows, widths) =>
  new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((label, i) =>
          cell(label, { width: widths[i], shading: BRAND, bold: true, color: 'FFFFFF' }),
        ),
      }),
      ...rows.map(
        (row, index) =>
          new TableRow({
            children: row.map((value, i) =>
              cell(value, {
                width: widths[i],
                shading: index % 2 === 1 ? ZEBRA : undefined,
              }),
            ),
          }),
      ),
    ],
  })

const spacer = () => new Paragraph({ spacing: { after: 200 }, children: [] })

/* ------------------------------------------------------------------ content */

const coverBlock = [
  new Paragraph({
    spacing: { before: 1400, after: 0 },
    children: [
      new TextRun({
        text: 'TECHNICAL APPENDIX',
        font: 'Calibri',
        size: 20,
        bold: true,
        color: SUBHEAD,
        characterSpacing: 60,
      }),
    ],
  }),
  new Paragraph({
    spacing: { before: 120, after: 60 },
    children: [
      new TextRun({ text: 'Technology Stack', font: 'Calibri', size: 60, bold: true, color: HEADING }),
    ],
  }),
  new Paragraph({
    spacing: { after: 260 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: BRAND, space: 10 } },
    children: [
      new TextRun({
        text: 'Global Security Intelligence Hub',
        font: 'Calibri',
        size: 30,
        color: INK_2,
      }),
    ],
  }),
  para('', {
    children: [
      text('Unified Investigations Dashboard with Predictive Analytics', { size: 22, color: INK_2 }),
    ],
  }),
  spacer(),
  table(
    ['Field', 'Detail'],
    [
      ['Document', 'Technical Appendix — Technology Stack'],
      ['Companion to', 'Global Security Intelligence Hub — Complete Project Proposal, Section 9'],
      ['Prepared by', 'Lekpam Nkawula'],
      ['Role', 'Project Manager – Investigations (Candidate)'],
      ['Version', '1.0'],
      ['Date', 'August 2026'],
      ['Status', 'For review'],
    ],
    [2600, 7480],
  ),
  new Paragraph({ children: [new PageBreak()] }),
]

const body = [
  h1('1. Purpose'),
  para(
    'Section 9 of the proposal listed a menu of candidate tools. This appendix records what was ' +
      'actually selected for each layer of the platform, why, and what would need to be confirmed ' +
      'before build. It is written to be read by a technical reviewer and to survive challenge from one.',
  ),
  para(
    'The organising principle throughout is to build on technology the organisation already runs. ' +
      'A security-investigations platform that picks different technology at every layer is a ' +
      'platform that needs its own on-call rota, its own hiring pipeline and its own security ' +
      'review. Each choice below is therefore justified twice: on its technical merits, and on ' +
      'whether the organisation already operates it.',
  ),
  note(
    'Every component listed here has been implemented and exercised end to end against a seeded ' +
      'warehouse, not merely specified. Section 11 states precisely what is running and what remains ' +
      'production-path code awaiting the platforms it targets.',
  ),

  h1('2. The stack at a glance'),
  para(
    'The right-hand column gives the short reason. Section 4 covers each layer in detail and ' +
      'Section 5 defends the choices most likely to be questioned.',
  ),
  table(
    ['Layer', 'Proposal suggested', 'Selected', 'Why'],
    [
      ['Cloud', '—', 'Microsoft Azure', 'The existing strategic cloud. Identity, network and compliance posture are inherited rather than duplicated.'],
      ['Lakehouse', 'Snowflake / Synapse / Redshift', 'Azure Databricks + Delta Lake', 'Already the data platform. Delta time travel gives the replayability the audit requirements need.'],
      ['Serving store', '—', 'PostgreSQL 16', 'Dashboard queries are small, indexed and concurrent — a transactional database, not a query engine.'],
      ['Streaming', '—', 'Apache Kafka (Event Hubs in Azure)', 'The existing streaming backbone; keeps dashboards current within seconds.'],
      ['Batch / ETL', 'Data Factory / Talend / Fivetran', 'PySpark + Auto Loader on Databricks', 'Same engine as the lakehouse; handles the flat-file sources that have no API.'],
      ['Orchestration', '—', 'Apache Airflow', 'Already orchestrates the data platform, so these DAGs sit beside existing ones.'],
      ['Analytics / ML', 'Python / Azure ML / SageMaker', 'Python, scikit-learn, MLflow', 'Covers every model the proposal asks for with no GPU and no training cluster.'],
      ['Services', '—', 'Java 21 + Spring Boot 3', 'The house backend language. Entra ID integration becomes configuration, not implementation.'],
      ['Runtime', '—', 'Azure Kubernetes Service', 'Standard workload platform; workload identity removes secrets from pods.'],
      ['Presentation', 'Power BI / Tableau / custom', 'React 18 + TypeScript', 'Three genuinely different applications, one of which is an operational work queue.'],
      ['Identity', 'Azure AD / Okta', 'Microsoft Entra ID', 'The corporate tenant. The application never handles a credential.'],
      ['Secrets', '—', 'Azure Key Vault + workload identity', 'No pod holds a database password.'],
      ['Observability', '—', 'Micrometer / Prometheus, Log Analytics, App Insights', 'Standard for AKS; exports the counters that matter operationally.'],
      ['Infrastructure', '—', 'Terraform (azurerm)', 'The whole footprint is code and reviewable, including the network rules.'],
      ['CI', '—', 'GitHub Actions', 'Five jobs: services, analytics, mapping parity, dashboard, migrations against real PostgreSQL.'],
    ],
    [1250, 2350, 2600, 3880],
  ),

  h1('3. How the layers connect'),
  para(
    'The hub connects to the existing systems of Section 4.1, standardises what it reads, and ' +
      'presents it. It replaces nothing and writes back to nothing: no write path to any source ' +
      'system exists in the codebase.',
  ),
  h2('3.1 The flow'),
  table(
    ['Stage', 'What happens', 'Technology'],
    [
      ['Connect', 'Read-only extraction from case management, incident reporting, access control, video and GIS.', 'Kafka topics; Auto Loader over a landing container'],
      ['Standardise', 'Vendor vocabularies are mapped onto one canonical model, so "open cases" means one thing everywhere.', 'CanonicalMapper (streaming); silver_standardize (batch)'],
      ['Store', 'Bronze (raw, replayable) to silver (canonical) to gold (serving), then published to the warehouse.', 'Delta Lake on Databricks; PostgreSQL'],
      ['Analyse', 'Risk scores, a seasonal incident projection and geospatial hotspots.', 'scikit-learn, MLflow'],
      ['Display', 'Three role-scoped dashboards; the caller’s region is threaded into every query.', 'Spring Boot API; React dashboards'],
    ],
    [1500, 5380, 3200],
  ),

  h2('3.2 Two ingestion paths, on purpose'),
  para(
    'The same records travel two routes, and both are needed:',
  ),
  bullet(
    'A streaming path in Java consumes the raw topics, maps them onto the canonical model and ' +
      'upserts into the serving warehouse. This is what keeps a manager’s dashboard current ' +
      'within seconds of an alarm firing.',
  ),
  bullet(
    'A batch path in PySpark lands the same topics — plus the flat-file sources that have no API — ' +
      'into bronze Delta, standardises them into silver and publishes gold. This is the replayable ' +
      'history the models train on and an audit reconstructs from.',
  ),
  para(
    'The cost of that decision is one duplicated piece of logic: the canonical vocabulary exists in ' +
      'both Java and PySpark, because the two run in different engines. The risk is that they drift ' +
      'and the same incident is typed one way when it arrives live and another when it is replayed. ' +
      'A parity test in CI parses both mapping tables and fails the build on any difference.',
  ),

  h2('3.3 Idempotency'),
  para('Every write in the platform is keyed so that repeating it is harmless:'),
  bullet(
    'Warehouse rows use a UUID derived deterministically from source system plus source id, so ' +
      'replaying a Kafka partition updates rows rather than creating duplicates.',
  ),
  bullet('Risk scores are keyed on site and score date, so re-running a scoring task overwrites the day.'),
  bullet(
    'Gold publication truncates and rewrites rather than appending, because a late correction from a ' +
      'source system changes history and an incrementally-maintained counter would keep the old number.',
  ),

  h1('4. Component detail'),

  h2('4.1 Lakehouse and serving store'),
  para(
    'Delta Lake on Azure Databricks holds the complete, replayable history in a medallion layout. ' +
      'PostgreSQL holds the serving copy the dashboards actually query. One job moves data between ' +
      'them; nothing else does.',
  ),
  para(
    'Two stores is a real cost, paid for a specific reason. Dashboard traffic is small, indexed, ' +
      'highly concurrent point-and-range reads — the workload a transactional database is built for ' +
      'and a lakehouse query engine is not. Meanwhile the model needs a year and a half of history ' +
      'and an audit needs the raw record as the vendor sent it, which is what Delta keeps.',
  ),

  h2('4.2 Streaming and batch'),
  table(
    ['Concern', 'Handling'],
    [
      ['Delivery guarantee', 'At-least-once from Kafka; upserts on the natural key make warehouse state effectively-once.'],
      ['Offset commits', 'Only after the warehouse write returns, so a crash replays rather than loses.'],
      ['Malformed payloads', 'Parsed per record, not per batch. An unreadable payload is quarantined to a dead-letter topic with its source topic; the rest of the batch still lands.'],
      ['Unknown vendor values', 'Mapped to a documented default and counted on a metric, never dropped, so the discovery team can extend the mapping table.'],
      ['Schema drift in files', 'Auto Loader adds new columns rather than failing the run; the mapping layer decides whether they mean anything.'],
      ['Backlog replay', 'Offset-per-trigger cap, so a replay after an outage does not attempt one enormous micro-batch.'],
    ],
    [2600, 7480],
  ),

  h2('4.3 Predictive analytics'),
  para(
    'The model predicts, for each site, the probability of a vandalism incident in the next seven ' +
      'days, from the six input families listed in Section 6.2 of the proposal. Three properties ' +
      'matter more than headline accuracy:',
  ),
  h3('No temporal leakage'),
  para(
    'Every feature for a given site and date is computed strictly from data before that date, and ' +
      'the evaluation split is chronological, never random. A test asserts that adding an incident ' +
      'after the scoring date changes no feature value. A model that peeks at the future scores ' +
      'beautifully in validation and is useless on the morning it actually runs.',
  ),
  h3('Calibration, and honest banding'),
  para(
    'Vandalism on a given site-week is rare, so a well-calibrated model almost never emits a ' +
      'probability above 0.66. Fixed absolute thresholds would therefore paint every site low risk ' +
      'and flatten the heat map. A site is banded high if it falls in the worst ten per cent of ' +
      'today’s scoring run — which is the question a security team actually asks: given that we ' +
      'can patrol a few sites tonight, which ones? The raw probability is always shown beside the band.',
  ),
  h3('Seasonality'),
  para(
    'Vandalism rises through the darker months. A trend-only forecaster reads the summer trough as ' +
      'a permanent decline and projects towards zero. The forecaster fits two Fourier harmonics of ' +
      'day-of-year alongside a damped trend, and a test pins that behaviour.',
  ),
  table(
    ['Model', 'Role', 'Library'],
    [
      ['Logistic regression', 'Baseline every result is compared against; predicts likelihood.', 'scikit-learn'],
      ['Gradient boosting', 'Challenger; ranks risk factors and usually improves ranking.', 'scikit-learn'],
      ['Harmonic trend forecaster', '30 / 60 / 90-day incident projection with a prediction interval.', 'NumPy'],
      ['DBSCAN (haversine)', 'Geospatial hotspot clustering; isolated incidents return as noise, not hotspots.', 'scikit-learn'],
      ['MLflow', 'Run tracking, metrics and model promotion history.', 'MLflow'],
    ],
    [2500, 5180, 2400],
  ),
  note(
    'A retrained model that does not clear its promotion guardrail is recorded and discarded; the ' +
      'previous model stays in service. No forecast is better than one the security team learns to ignore.',
  ),

  h2('4.4 Services and presentation'),
  para(
    'The API is a Spring Boot OAuth2 resource server in front of Entra ID. The front end is a React ' +
      'and TypeScript application rather than a BI report, because Section 7.1 describes an ' +
      'operational work queue — deadlines, repeat-incident flags, next steps — not a report. Power BI ' +
      'remains the right tool for ad-hoc analysis on top of the same gold tables, and nothing here ' +
      'prevents that.',
  ),

  h1('5. Substitutions worth defending'),
  para('The five decisions most likely to be challenged in review, with the argument for each.'),
  table(
    ['Decision', 'Argument'],
    [
      [
        'Delta Lake instead of Snowflake',
        'Not a performance argument — an ownership one. The lakehouse already exists, the security data sits under the same governance as everything else, and Delta time travel means a mapping error found six months from now is corrected by re-running silver from bronze rather than re-requesting exports from vendors.',
      ],
      [
        'PostgreSQL alongside Delta, not instead of it',
        'Delta keeps the complete replayable history; PostgreSQL serves the dashboards. One job moves data between them. Collapsing to one store means either slow dashboards or no audit history.',
      ],
      [
        'Kafka and Spark both reading the same topics',
        'Latency and history are different requirements. The streaming path serves the dashboard; the batch path serves the model and the auditor. The duplicated vocabulary this creates is guarded by a parity test in CI.',
      ],
      [
        'A custom front end rather than Power BI',
        'An investigator’s view must show a queue with deadlines, related-incident flags and next steps. That is an application. The executive view alone would make a fine Power BI report against the same tables.',
      ],
      [
        'scikit-learn rather than Azure ML or SageMaker',
        'These models train in seconds. A managed training service adds a control plane, a cost centre and a deployment surface for no accuracy. If a later phase brings image analytics on camera feeds that trade changes; the training job is a container either way.',
      ],
    ],
    [2900, 7180],
  ),

  h1('6. Security and governance'),
  para(
    'Section 5.3 of the proposal sets six requirements. Each is met by a specific mechanism rather ' +
      'than by policy alone.',
  ),
  table(
    ['Requirement (Section 5.3)', 'Mechanism'],
    [
      ['Read-only access to source systems', 'No write path exists in the codebase. Connectors publish; nothing consumes back.'],
      ['Role-based access control', 'Entra ID app roles map to Spring authorities, enforced per endpoint. Investigators see only their own queue; only executives see the enterprise view.'],
      ['Region confinement', 'The caller’s region claim is threaded into the where clause of every query, including single-record reads and every site a link-analysis traversal reaches. A manager asking for another region receives their own.'],
      ['Encryption in transit and at rest', 'TLS throughout; Azure platform encryption on storage and database. The warehouse has no public endpoint.'],
      ['Audit logs for all access', 'An append-only record per read, with actor, role, query and result count. Audit writes run in their own transaction so a logging failure cannot roll back an investigator’s query, or be rolled back by it.'],
      ['Data minimisation', 'Badge identifiers are salted-hashed at ingest and shown only as a short prefix; the raw badge number never enters the warehouse. Identifying a badge holder is a separate, access-controlled request.'],
      ['Secret handling', 'Workload identity federation: no pod holds a database password. The badge salt lives in Key Vault and is versioned with the warehouse, since rotating it re-keys every hash.'],
    ],
    [3100, 6980],
  ),

  h1('7. Failure behaviour'),
  para(
    'What a platform does when something is wrong is the part worth specifying. The behaviours below ' +
      'are implemented, not aspirational.',
  ),
  table(
    ['Situation', 'Behaviour'],
    [
      ['Vendor sends an unrecognised status or category', 'Mapped to a documented default, never dropped, and counted so the mapping table can be extended.'],
      ['A payload cannot be parsed', 'Quarantined to the dead-letter topic with its source topic, per record. One malformed message never poisons its batch.'],
      ['An event arrives for an unknown site', 'Stored without a region and counted. A risk score for an unknown site is dropped rather than plotted at coordinates the platform does not have.'],
      ['The predictive layer has not run', 'Dashboards render an explicit "no scores yet" state rather than empty charts.'],
      ['A retrained model is worse than the guardrail', 'Recorded in MLflow and discarded; the previous model stays in service.'],
      ['Model explanation data is unreadable', 'The score is still served, without its factor breakdown.'],
      ['The audit table is unreachable', 'The user’s query still succeeds and the failure is logged. Blocking an investigator from their case queue because a logging table is down is the worse outcome.'],
      ['A region has too little history to forecast', 'That region is skipped with a warning; the other curves are unaffected.'],
    ],
    [3400, 6680],
  ),

  h1('8. Refresh and orchestration'),
  table(
    ['Path', 'Cadence', 'Driven by'],
    [
      ['Streaming ingest', 'Continuous', 'Kafka consumer group'],
      ['Bronze to silver to gold', 'Daily, 04:00 UTC', 'After overnight source exports, before the first shift'],
      ['Risk scoring', 'Daily, after gold publishes', 'Same DAG, downstream task'],
      ['Model retraining', 'Weekly, Sunday 02:00 UTC', 'A full week of new labels, no daily run in flight'],
    ],
    [2900, 3100, 4080],
  ),
  para(
    'Task order in the DAG is the point, not decoration: features are not built until silver has ' +
      'finished standardising, and scores are not published until the features they came from are in ' +
      'the warehouse. Otherwise a dashboard shows a risk score derived from yesterday’s data beside ' +
      'today’s case counts.',
  ),

  h1('9. Visual language'),
  para(
    'The dashboards are coloured from the AT&T brand palette: the brand blue #00A8E0 (PMS 298 C), ' +
      'with one-hue ramps derived from it, and the brand black #191919 and light grey #F2F2F2 as ' +
      'neutrals.',
  ),
  para(
    'One point is worth stating because it drives the implementation. The brand blue is an identity ' +
      'fill, not a data mark: against white it measures 2.74:1, below the 3:1 a chart mark needs. ' +
      'That is exactly how AT&T use it — a filled bar with type on top, never thin marks on a white ' +
      'ground. It therefore drives the chrome, and data marks take a hue-locked darker step that ' +
      'clears the contrast floor. Against the brand black it reaches 6.4:1 and needs no substitute.',
  ),
  para(
    'Status colours (good, warning, critical) are reserved and sit outside the brand hues, so a ' +
      'state can never be mistaken for a data series; each ships with an icon and a word as well as ' +
      'a colour. Two ramps exist rather than one: a sequential ramp for continuous magnitude, whose ' +
      'lightest step may recede toward the surface meaning "near zero", and an ordinal ramp for ' +
      'discrete ordered buckets, held to a stricter floor so the lightest bucket still reads.',
  ),
  note(
    'No AT&T data-visualisation standard is published. These hex values come from AT&T’s publicly ' +
      'visible brand usage, not an internal brand book — confirm them against AT&T Brand Central in ' +
      'Phase 1. All tokens live in one file, so a correction is a find-and-replace, not a redesign.',
  ),

  h1('10. Versions'),
  table(
    ['Component', 'Version', 'Note'],
    [
      ['Java', '21 (LTS)', 'Language level and runtime'],
      ['Spring Boot', '3.3', 'Web, Data JPA, Security, OAuth2 resource server, Actuator'],
      ['Python', '3.11', 'Analytics service and Spark jobs'],
      ['scikit-learn', '1.4+', 'Models and clustering'],
      ['Databricks Runtime', '15.4 LTS', 'Spark 3.5'],
      ['PostgreSQL', '16', 'Serving warehouse; Flyway-managed schema'],
      ['Kafka protocol', '3.7', 'Azure Event Hubs in deployed environments'],
      ['Node', '22', 'Front-end build only'],
      ['React', '18', 'With TypeScript 5.5'],
      ['Terraform', '1.7+, azurerm ~> 3.100', 'Azure footprint'],
    ],
    [3000, 3200, 3880],
  ),

  h1('11. Delivery status'),
  para('Stated plainly, because a reviewer will ask which parts are real.'),
  h2('11.1 Built and verified'),
  para(
    'The canonical data model, both ingestion paths, the serving API, the predictive layer, the ' +
      'three dashboards and the infrastructure definitions are implemented. The stack was exercised ' +
      'end to end against a live PostgreSQL warehouse seeded with two years of generated history: ' +
      'seed, train, score, results posted back through the API, all three dashboards rendered, and ' +
      'every access-control denial returning the correct status.',
  ),
  table(
    ['Suite', 'Count', 'Covers'],
    [
      ['Java', '49 tests', 'Canonical mapping, normalisation, RBAC, dashboard KPIs, risk ingest, link analysis'],
      ['Python', '28 tests', 'Leakage guard, model quality, forecaster behaviour, clustering, streaming/batch parity'],
      ['Dashboard', '19 tests', 'The three views, role gating, chart accessibility, link graph'],
    ],
    [2000, 1700, 6380],
  ),
  h2('11.2 Production-path, not yet executed'),
  para(
    'Written as production code but requiring the platforms they target: the PySpark medallion jobs ' +
      '(Databricks), the Airflow DAGs (an Airflow deployment) and the Terraform footprint (an Azure ' +
      'subscription). The parity test covers the one correctness risk that spans the boundary between ' +
      'the Spark path and the Java path.',
  ),
  h2('11.3 Deliberately not built'),
  para(
    'Connectors to any specific vendor system. Phase 1 of the roadmap exists precisely to confirm ' +
      'which systems are in use before that code is written; the event contracts define what each ' +
      'connector will publish.',
  ),

  h1('12. To confirm in Phase 1'),
  para(
    'This appendix makes assumptions that discovery should either confirm or correct. Listing them ' +
      'is cheaper than defending them later.',
  ),
  bullet('The actual case management, incident reporting, access control and video systems in use, and which expose APIs.'),
  bullet('Whether Azure Databricks and Event Hubs are available to this business unit, or whether a shared platform team owns them.'),
  bullet('The Entra ID app-role and group model, and how region entitlement is represented in a token claim.'),
  bullet('Data-retention and residency requirements per region, which may constrain a single warehouse.'),
  bullet('The exact brand tokens, confirmed against AT&T Brand Central.'),
  bullet('Whether an internal data-visualisation standard exists that the dashboards should follow.'),
  bullet('Volume estimates per feed, which set Event Hubs throughput units and the warehouse sizing.'),

  new Paragraph({ children: [new PageBreak()] }),
  h1('Appendix A — Repository layout'),
  table(
    ['Path', 'Contents'],
    [
      ['services/gsih-common', 'Canonical data model and the vendor vocabulary mapping shared by both ingestion paths'],
      ['services/gsih-investigations-api', 'Serving API behind the three dashboards; RBAC, audit, risk and link-analysis endpoints'],
      ['services/gsih-ingest-service', 'Kafka consumers, normalisation and idempotent warehouse upserts'],
      ['analytics/', 'Feature engineering, models, training and scoring jobs, on-demand scoring API'],
      ['pipelines/spark', 'PySpark bronze, silver and gold jobs for Databricks'],
      ['pipelines/airflow', 'Daily refresh and weekly retraining DAGs'],
      ['pipelines/tests', 'Streaming-versus-batch mapping parity guard'],
      ['web/', 'React and TypeScript dashboards'],
      ['infra/docker, infra/k8s, infra/terraform', 'Container images, AKS manifests with workload identity, Azure footprint'],
      ['data/seed', 'Deterministic demonstration data generator'],
    ],
    [3200, 6880],
  ),

  h1('Appendix B — API surface'),
  table(
    ['Endpoint', 'Role required', 'Returns'],
    [
      ['/api/v1/dashboards/investigator', 'Investigator and above', 'Personal case queue, deadlines, repeat-incident flags, site risk'],
      ['/api/v1/dashboards/manager', 'Manager and above', 'Workload, case aging, closure and escalation rates, regional risk'],
      ['/api/v1/dashboards/executive', 'Executive', 'Enterprise posture, regional breakdown, hotspots, incident projection'],
      ['/api/v1/cases, /api/v1/incidents', 'Investigator and above', 'Region-scoped search over the consolidated records'],
      ['/api/v1/risk/alerts, /heatmap, /forecast', 'Varies by view', 'Current risk scores, mapped sites, trend projection'],
      ['/api/v1/graph/cases/{caseNumber}', 'Investigator and above', 'Entity link graph around a case, bounded by hops and a node budget'],
      ['/api/v1/risk/scores, /forecasts (POST)', 'Analytics workload identity only', 'Write path for a scoring run; idempotent per site and date'],
    ],
    [3400, 2600, 4080],
  ),
]

/* ------------------------------------------------------------------ document */

const doc = new Document({
  creator: 'Lekpam Nkawula',
  title: 'Technology Stack — Global Security Intelligence Hub',
  description: 'Technical appendix to the Global Security Intelligence Hub project proposal',
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: '•',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 460, hanging: 240 } } },
          },
        ],
      },
    ],
  },
  styles: {
    default: {
      document: { run: { font: 'Calibri', size: 20, color: INK } },
    },
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              spacing: { after: 60 },
              border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 4 } },
              children: [
                new TextRun({
                  text: 'Global Security Intelligence Hub  ·  Technology Stack',
                  font: 'Calibri',
                  size: 16,
                  color: MUTED,
                }),
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({
                  text: 'Page ',
                  font: 'Calibri',
                  size: 16,
                  color: MUTED,
                }),
                new TextRun({ children: [PageNumber.CURRENT], font: 'Calibri', size: 16, color: MUTED }),
                new TextRun({ text: ' of ', font: 'Calibri', size: 16, color: MUTED }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], font: 'Calibri', size: 16, color: MUTED }),
              ],
            }),
          ],
        }),
      },
      children: [
        ...coverBlock,
        new Paragraph({
          spacing: { after: 200 },
          children: [
            new TextRun({ text: 'Contents', font: 'Calibri', size: 30, bold: true, color: HEADING }),
          ],
        }),
        new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-2' }),
        new Paragraph({ children: [new PageBreak()] }),
        ...body,
      ],
    },
  ],
})

Packer.toBuffer(doc).then((buffer) => {
  const out = process.argv[2] || 'GSIH-Technology-Stack.docx'
  fs.writeFileSync(out, buffer)
  console.log(`wrote ${out} (${(buffer.length / 1024).toFixed(0)} KB)`)
})
