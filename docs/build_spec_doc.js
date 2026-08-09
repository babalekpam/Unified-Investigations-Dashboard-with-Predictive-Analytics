/**
 * Builds the technical specification for the Global Security Intelligence Hub proposal, as a
 * Word document the author can drop straight into their pack.
 *
 * Three parts, because a reviewer arrives with three questions in this order: what is this,
 * how does it work, and what is it built on. Verify the output with
 * `python docs/verify_spec_doc.py <file>` — every table has to fit the text column, which is
 * the defect that only shows up on paper.
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

// The AT&T brand palette: #067ab4, #3aa5dc, #ff7200, #fcb314. The deep blue carries the
// chrome — filled header rows with white type on them, section rules — because it is the
// only one of the four that holds its own against white (4.7:1). Headings take a darker
// step of the same hue so they survive greyscale printing, and the accent orange appears
// once, on the part divider, rather than competing with the blue throughout.
const BRAND = '067AB4'
const BRAND_LIGHT = '3AA5DC'
const ACCENT = 'FF7200'
const GOLD = 'FCB314'
const HEADING = '05537A'
const SUBHEAD = '067AB4'
const INK = '111A21'
const INK_2 = '4B5964'
const MUTED = '6F7D89'
const RULE = 'DCE3E9'
const ZEBRA = 'F2F8FC'

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

/** A full-width part divider. Three of these carve the document into its three questions. */
const part = (number, title, standfirst) => [
  new Paragraph({ children: [new PageBreak()] }),
  new Paragraph({
    spacing: { before: 200, after: 0 },
    children: [
      new TextRun({
        text: `PART ${number}`,
        font: 'Calibri',
        size: 20,
        bold: true,
        color: ACCENT,
        characterSpacing: 80,
      }),
    ],
  }),
  new Paragraph({
    spacing: { before: 60, after: 100 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: BRAND, space: 8 } },
    children: [
      new TextRun({ text: title, font: 'Calibri', size: 44, bold: true, color: HEADING }),
    ],
  }),
  new Paragraph({
    spacing: { after: 240 },
    children: [new TextRun({ text: standfirst, font: 'Calibri', size: 22, color: INK_2 })],
  }),
]

/* ------------------------------------------------------------------ content */

const coverBlock = [
  new Paragraph({
    spacing: { before: 1400, after: 0 },
    children: [
      new TextRun({
        text: 'TECHNICAL SPECIFICATION',
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
  ...part('I', 'The platform', 'What it is, what it produces, and who it is for.'),

  h1('1. Executive summary'),
  para(
    'The Global Security Intelligence Hub consolidates the records that global security ' +
      'investigations currently hold in separate systems — cases, incidents, physical access ' +
      'events, alarm events and the facility list — into one governed data model, and presents ' +
      'them through three role-scoped dashboards. On top of that consolidated history it runs a ' +
      'predictive layer that estimates, for every site, the probability of a vandalism incident in ' +
      'the next seven days, together with the hours that site is most exposed.',
  ),
  para(
    'The operational claim is narrow and worth stating precisely. The platform does not detect ' +
      'intrusions and does not dispatch anyone: that is the monitoring centre’s job, and it happens ' +
      'in seconds. This platform answers a different question on a different clock — which sites ' +
      'deserve a patrol this week, which investigations are ageing past the point where they are ' +
      'still recoverable, and where the enterprise’s exposure is concentrated.',
  ),
  table(
    ['What it replaces', 'What it adds'],
    [
      ['Nothing. Every source system stays in place and keeps its own workflow.', 'One vocabulary across all of them, so "open cases" means the same thing to an investigator, their manager and the executive reading the quarterly posture.'],
      ['Manual consolidation of exports into spreadsheets before each review.', 'A queue an investigator works from, with deadlines, repeat-site flags and the link graph around each case.'],
      ['Retrospective reporting on what already happened.', 'A seven-day risk score per site with the factors behind it, and a ninety-day projection with its uncertainty shown.'],
    ],
    [4600, 5480],
  ),

  h1('2. The problem'),
  para(
    'The systems that hold security records were each bought to do one job well. Case management ' +
      'tracks investigations, incident reporting captures what happened, access control records ' +
      'badge reads, the video management system records alarms. None of them was bought to answer a ' +
      'question that crosses two of them.',
  ),
  para('The consequences are specific rather than abstract:'),
  bullet(
    'The same site is described four ways. One system calls an event "Property Damage", another ' +
      '"Criminal Damage", a third "Vandalism". Counting them requires someone who knows all three.',
  ),
  bullet(
    'Nobody can see that the badge used at a site the night before an incident was also used, ' +
      'after hours, at two other sites that month — because the badge lives in one system and the ' +
      'incident in another.',
  ),
  bullet(
    'Reporting is retrospective by construction. A quarterly review can say where incidents ' +
      'happened; it cannot say where the next ones are likely.',
  ),
  bullet(
    'Every number in a management pack is assembled by hand, which makes it both expensive and ' +
      'unauditable — two people producing the same figure from the same systems can legitimately ' +
      'disagree.',
  ),

  h1('3. What the platform does'),
  table(
    ['Capability', 'What it means in practice'],
    [
      ['Consolidation', 'Read-only feeds from case management, incident reporting, access control, alarm and video-management systems, HR and facilities are resolved onto one canonical record with one vocabulary.'],
      ['Deduplication and identity', 'Each source record gets a deterministic identifier derived from its source system and source id, so the same record arriving twice — live and again in a batch replay — updates one row rather than creating two.'],
      ['Three role-scoped dashboards', 'An investigator’s work queue, a regional manager’s workload and risk view, and an enterprise posture view. Each shows one role’s question, not one report filtered three ways.'],
      ['Predictive risk', 'A per-site probability of a vandalism incident in the next seven days, banded relative to today’s run, with the contributing factors and the peak exposure window named.'],
      ['Incident projection', 'A 30/60/90-day forecast of incident volume with an 80% prediction interval, fitted with an annual seasonal cycle rather than a straight-line trend.'],
      ['Observed timing', 'Incidents by weekday and hour over the last six months, in each site’s own local time — the pattern the roster is built against.'],
      ['Geospatial hotspots', 'Density clustering over incident coordinates, so isolated events are reported as noise rather than promoted to hotspots.'],
      ['Link analysis', 'The entity graph around a case: its site, everything that happened there, the badges read after hours, and the second site a shared badge reaches.'],
      ['Governance', 'Role-based access, region confinement on every query, pseudonymised badge identifiers, and an append-only audit record of every read.'],
    ],
    [2600, 7480],
  ),

  h1('4. Who uses it'),
  para(
    'The proposal describes three audiences with genuinely different questions. They are built as ' +
      'three views rather than one report with a filter, because a filtered report answers the ' +
      'author’s question three times rather than three people’s questions once each.',
  ),
  table(
    ['Role', 'The question they arrive with', 'What the view leads with'],
    [
      [
        'Investigator (Section 7.1)',
        'What is on my desk, what is late, and what else touches this case?',
        'A sortable queue with priority, deadline, age and exposure; repeat-incident flags for their sites; risk alerts for the sites they hold cases at; and a link graph around any case in the queue.',
      ],
      [
        'Regional manager (Section 7.2)',
        'Is my team’s load balanced, is anything ageing, and where should I put a patrol?',
        'Open cases and closure rate; workload per investigator split into on-track and overdue; case aging; case mix by type; the region’s weekday-by-hour incident pattern; and the risk map with the highest-risk sites and why.',
      ],
      [
        'Executive (Section 7.3)',
        'What is the posture, what is it costing, and where is it going?',
        'Twelve-month investigation volume with its year-over-year direction; open financial exposure; the projected incident curve; risk posture of the estate; cases and exposure by region; and the largest investigations.',
      ],
    ],
    [2100, 3400, 4580],
  ),
  note(
    'Access follows the token, not the tab. A manager who opens a colleague’s queue sees only ' +
      'their own region’s cases in it; an investigator cannot open the enterprise view at all. The ' +
      'interface hides what a role cannot use, but the server is what refuses it.',
  ),

  h1('5. What the platform deliberately is not'),
  h2('5.1 It is not a real-time intrusion response system'),
  para(
    'Alarm events from the video-management and access-control systems are ingested, and they feed ' +
      'both the link graph and the risk model — camera tampering before an incident is a documented ' +
      'precursor and is weighted as one. But an intrusion in progress is answered by the monitoring ' +
      'centre and the guard force, in seconds. This platform’s cadence is streaming-to-warehouse ' +
      'plus a daily analytical run. Promising second-level response on this architecture would be a ' +
      'commitment discovered to be false during implementation.',
  ),
  h2('5.2 Video never enters the platform'),
  para(
    'The video-management systems publish alarm events — site, camera identifier, alarm type, ' +
      'severity, timestamp. Footage stays in the VMS. Three reasons, each of which stands on its own: ' +
      'the volume is orders of magnitude larger than everything else combined and duplicating it buys ' +
      'nothing; chain of custody, retention policy and legal hold for footage already live in the VMS ' +
      'and copying clips out breaks them; and video of identifiable people carries privacy obligations ' +
      'that an analytics warehouse should not inherit. Where a case needs footage, the right pattern ' +
      'is a reference — camera and timestamp — that a user follows into the VMS and authenticates ' +
      'there. The hub holds the pointer; the VMS holds the pixels.',
  ),
  h2('5.3 It does not write to any source system'),
  para(
    'There is no write path to any connected system anywhere in the codebase. Connectors publish ' +
      'into the platform; nothing consumes back out of it. This is a structural property rather than ' +
      'a policy — it cannot be violated by configuration.',
  ),
  h2('5.4 It does not replace ad-hoc analysis'),
  para(
    'The gold tables are ordinary warehouse tables. Power BI against them remains the right tool ' +
      'for a question nobody anticipated, and nothing in this design prevents it. What a BI report ' +
      'cannot be is an operational work queue, which is what Section 7.1 describes.',
  ),

  ...part('II', 'How it works', 'From a vendor record to a number on a dashboard, and what happens when something goes wrong.'),

  h1('6. End to end'),
  para(
    'The hub connects to the systems of Section 4.1, standardises what it reads, stores it twice ' +
      'for two different purposes, analyses it, and presents it.',
  ),
  table(
    ['Stage', 'What happens', 'Technology'],
    [
      ['Connect', 'Read-only extraction from case management, incident reporting, access control, alarm/video and GIS. Streaming feeds publish onto topics; flat-file sources land in a container.', 'Kafka topics; Auto Loader over a landing container'],
      ['Standardise', 'Vendor vocabularies are mapped onto one canonical model; timestamps are normalised to UTC; badge identifiers are salted-hashed.', 'CanonicalMapper (streaming); silver_standardize (batch)'],
      ['Store', 'Bronze holds the raw record as the vendor sent it; silver holds the canonical form; gold holds the serving shape, published to the warehouse the dashboards query.', 'Delta Lake on Databricks; PostgreSQL 16'],
      ['Analyse', 'Feature engineering, risk scoring, seasonal projection and geospatial clustering; results are posted back through the API under a workload identity.', 'Python, scikit-learn, MLflow'],
      ['Present', 'Three role-scoped dashboards, with the caller’s region threaded into every query and every read written to an audit table.', 'Spring Boot API; React dashboards'],
    ],
    [1300, 5580, 3200],
  ),

  h1('7. Source systems and the canonical model'),
  para(
    'The platform recognises the source systems below. Each publishes a documented event envelope; ' +
      'the connector that produces it is written in Phase 1, once discovery confirms which systems ' +
      'are actually in use.',
  ),
  table(
    ['Feed', 'Typical systems', 'Canonical entity'],
    [
      ['Case management', 'Case IQ, Resolver, Kaseware', 'Case — number, type, status, priority, assignee, site, opened/due/closed, financial impact'],
      ['Incident reporting', 'D3 Security, Omnigo', 'Incident — type, severity, description, site, occurred-at, loss amount'],
      ['Physical access control', 'Lenel S2, Genetec Synergis', 'Access event — site, hashed badge, door, result, after-hours flag'],
      ['Alarm and video management', 'Genetec, Milestone, Avigilon', 'Alarm event — site, camera identifier, alarm type, severity, event time'],
      ['Facilities and GIS', 'ArcGIS, internal facility register', 'Site — code, name, region, coordinates, timezone, lighting, foot traffic, camera count, fencing, criticality'],
      ['Enterprise systems', 'ServiceNow, SAP, Ontic', 'Supporting reference data'],
    ],
    [2200, 3000, 4880],
  ),
  para(
    'The canonical model is the whole point of the platform, and the mapping is where the value ' +
      'is created. Twelve vendor spellings of a vandalism category collapse to one enumerated type; ' +
      'five status vocabularies collapse to five canonical statuses. A value the mapping table does ' +
      'not recognise is mapped to a documented default, kept, and counted on a metric — never ' +
      'silently dropped — so the discovery team can extend the table from evidence rather than guesswork.',
  ),

  h1('8. Ingestion: two paths on purpose'),
  para('The same records travel two routes, and both are needed.'),
  bullet(
    'A streaming path in Java consumes the raw topics, maps them onto the canonical model and ' +
      'upserts into the serving warehouse. This is what keeps a manager’s dashboard current within ' +
      'seconds of an alarm firing.',
  ),
  bullet(
    'A batch path in PySpark lands the same topics — plus the flat-file sources that have no API — ' +
      'into bronze Delta, standardises them into silver and publishes gold. This is the replayable ' +
      'history the models train on and an audit reconstructs from.',
  ),
  para(
    'The cost of that decision is one duplicated piece of logic: the canonical vocabulary exists in ' +
      'both Java and PySpark, because the two run in different engines. The risk is that they drift, ' +
      'and the same incident is typed one way when it arrives live and another when it is replayed. ' +
      'A parity test in continuous integration parses both mapping tables and fails the build on any ' +
      'difference.',
  ),
  h2('8.1 Idempotency'),
  para('Every write is keyed so that repeating it is harmless:'),
  bullet(
    'Warehouse rows use a UUID derived deterministically from source system plus source id, so ' +
      'replaying a Kafka partition updates rows rather than creating duplicates. Both engines derive ' +
      'that identifier identically, which is asserted by test.',
  ),
  bullet('Risk scores are keyed on site and score date, so re-running a scoring task overwrites the day.'),
  bullet(
    'Gold publication rewrites rather than appends, because a late correction from a source system ' +
      'changes history and an incrementally-maintained counter would keep the old number.',
  ),
  h2('8.2 What the stream does under stress'),
  table(
    ['Concern', 'Handling'],
    [
      ['Delivery guarantee', 'At-least-once from Kafka; upserts on the natural key make warehouse state effectively-once.'],
      ['Offset commits', 'Only after the warehouse write returns, so a crash replays rather than loses.'],
      ['Malformed payloads', 'Parsed per record, not per batch. An unreadable payload is quarantined to a dead-letter topic with its source topic; the rest of the batch still lands.'],
      ['Unknown vendor values', 'Mapped to a documented default and counted on a metric, never dropped.'],
      ['A site published mid-window', 'The facility cache falls through to a single-row lookup on a miss, so an event for a facility added since the last refresh still carries its region and its timezone.'],
      ['Schema drift in files', 'Auto Loader adds new columns rather than failing the run; the mapping layer decides whether they mean anything.'],
      ['Backlog replay', 'An offset-per-trigger cap, so a replay after an outage does not attempt one enormous micro-batch.'],
    ],
    [2600, 7480],
  ),

  h1('9. The warehouse'),
  para(
    'Delta Lake on Azure Databricks holds the complete, replayable history in a medallion layout. ' +
      'PostgreSQL holds the serving copy the dashboards actually query. One job moves data between ' +
      'them; nothing else does.',
  ),
  table(
    ['Layer', 'Holds', 'Why it exists'],
    [
      ['Bronze', 'The raw payload exactly as the vendor sent it, with its ingest timestamp.', 'An audit reconstructs from here, and a mapping error found six months later is corrected by re-running silver rather than re-requesting exports.'],
      ['Silver', 'The canonical model: one vocabulary, one timestamp convention, one row per real-world event.', 'Everything downstream reads a single shape, whichever system the record came from.'],
      ['Gold', 'The serving shape, published into PostgreSQL.', 'Dashboard traffic is small, indexed and highly concurrent — the workload a transactional database is built for and a lakehouse query engine is not.'],
    ],
    [1500, 3600, 4980],
  ),
  para(
    'Two stores is a real cost, paid for a specific reason: the model needs a year and a half of ' +
      'history and an auditor needs the raw record, which is what Delta keeps; the dashboards need ' +
      'sub-second point reads under concurrency, which is what PostgreSQL gives. Collapsing to one ' +
      'store means either slow dashboards or no audit history.',
  ),

  h1('10. The serving API'),
  para(
    'A Spring Boot service, running as an OAuth2 resource server in front of Microsoft Entra ID. ' +
      'Tokens are issued by the corporate tenant; the application never sees a credential. The ' +
      'roles claim carries the app roles assigned to each security group, and a region claim scopes ' +
      'the caller to their own estate.',
  ),
  para(
    'Every dashboard is one request. The API composes the KPIs, the chart series and the tables ' +
      'server-side rather than shipping raw rows to the browser, because the aggregation rules — ' +
      'what "closure rate" means, how a case is aged — belong with the data, not in three separate ' +
      'front-end implementations of them.',
  ),

  h1('11. The dashboards and how they report'),
  para(
    'Each view opens on the one figure that would make its reader act, then supports it. A grid of ' +
      'identical tiles is an admission that nobody decided which number mattered.',
  ),
  h2('11.1 The reporting forms'),
  para(
    'Five chart forms are used, each chosen for the question it can answer and no other. The form ' +
      'follows the data’s job — magnitude, identity, share, relationship or density — rather than ' +
      'variety for its own sake.',
  ),
  table(
    ['Form', 'Used for', 'The question it answers'],
    [
      ['Line', 'The projected incident curve, with its 80% interval and the endpoint labelled.', 'How is this changing over continuous time, and how confident are we?'],
      ['Bar and column', 'Cases by region; workload per investigator split on-track/overdue; case aging as an ordered ramp.', 'How do these distinct categories compare, and which is largest?'],
      ['Donut', 'Risk posture of the estate; case mix by type, with the tail folded into "Other".', 'What share of the whole does each part hold?'],
      ['Scatter', 'Case age against financial exposure, one mark per major investigation.', 'Do these two measures move together, and what sits in the corner that matters?'],
      ['Heat map', 'Incidents by weekday and hour over six months, in each site’s local time.', 'Where is the density in a set too large to read as a table?'],
    ],
    [1400, 4400, 4280],
  ),
  note(
    'The heat map is computed in each site’s own local time rather than in UTC. A database-side ' +
      'hour extraction has to pick one zone for an estate that spans several, which smears a real ' +
      '22:00 pattern across three columns and hides it.',
  ),
  h2('11.2 Reading them without effort'),
  bullet('Every table sorts on any column, and one filter box narrows every table on the page at once.'),
  bullet('A single number with no distribution behind it is a stat tile, not a chart.'),
  bullet('Two series always carry a legend and direct labels, so identity is never colour alone.'),
  bullet('Risk bands ship with an icon and the word, so the band survives greyscale printing and colour-blind readers.'),
  bullet('Every chart has a table equivalent of the same data on the same page or one disclosure away.'),

  h1('12. The predictive layer'),
  para(
    'The model predicts, for each site, the probability of a vandalism incident in the next seven ' +
      'days, from the six input families listed in Section 6.2 of the proposal: incident history, ' +
      'temporal patterns, access and badge activity, alarm and camera events, site characteristics ' +
      'and regional context. Three properties matter more than headline accuracy.',
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
      'and flatten the map. A site is banded high if it falls in the worst ten per cent of today’s ' +
      'run — which is the question a security team actually asks: given that we can patrol a few ' +
      'sites tonight, which ones? The raw probability is always shown beside the band.',
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
      'previous model stays in service. No forecast is better than one the security team learns to ' +
      'ignore. Every score is served with the factors that drove it, because a number a supervisor ' +
      'cannot explain to a guard is a number they will not act on.',
  ),

  h1('13. Link analysis'),
  para(
    'Beyond the proposal’s scope, but the capability an investigations platform reaches for once a ' +
      'case stops being about one incident. The graph walks outward from a case — its site, ' +
      'everything that happened there, the badges read after hours, and the second site a shared ' +
      'badge reaches.',
  ),
  para('Three bounds keep it useful rather than a hairball:'),
  bullet('Hops — two by default; three follows a shared badge to a second site.'),
  bullet(
    'A node budget, with the response stating when it truncated, so the interface can claim "the ' +
      'strongest N connections" rather than completeness.',
  ),
  bullet(
    'A selectivity rule: a badge read after hours at more than four sites is a roaming credential — ' +
      'a technician’s route — and is drawn but never expanded through, because expanding one ' +
      'connects every site to every other.',
  ),
  para(
    'Region confinement applies to every site the traversal reaches, not only the seed, so the ' +
      'graph cannot become a way around access control. Badge identifiers appear as a short hash ' +
      'prefix; naming the holder is a separate, access-controlled request.',
  ),

  h1('14. Security, privacy and governance'),
  para(
    'Section 5.3 of the proposal sets six requirements. Each is met by a specific mechanism rather ' +
      'than by policy alone.',
  ),
  table(
    ['Requirement (Section 5.3)', 'Mechanism'],
    [
      ['Read-only access to source systems', 'No write path exists in the codebase. Connectors publish; nothing consumes back.'],
      ['Role-based access control', 'Entra ID app roles map to Spring authorities, enforced per endpoint. Investigators see only their own queue; only executives see the enterprise view.'],
      ['Region confinement', 'The caller’s region claim is threaded into the where clause of every query, including single-record reads, the site list, risk history and every site a link-analysis traversal reaches. A manager asking for another region receives their own.'],
      ['Encryption in transit and at rest', 'TLS throughout; Azure platform encryption on storage and database. The warehouse has no public endpoint.'],
      ['Audit logs for all access', 'An append-only record per read, with actor, role, query and result count. Audit writes run in their own transaction so a logging failure cannot roll back an investigator’s query, or be rolled back by it.'],
      ['Data minimisation', 'Badge identifiers are salted-hashed at ingest and shown only as a short prefix; the raw badge number never enters the warehouse. Identifying a badge holder is a separate, access-controlled request.'],
      ['Secret handling', 'Workload identity federation: no pod holds a database password. The badge salt lives in Key Vault and is versioned with the warehouse, since rotating it re-keys every hash.'],
      ['No accidental demo authentication', 'The API selects no security profile by default and refuses to start without one, so an image deployed without configuration cannot fall back to the local token issuer.'],
    ],
    [3100, 6980],
  ),

  h1('15. Operations'),
  h2('15.1 Refresh cadence'),
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
    'Task order in the orchestration is the point, not decoration: features are not built until ' +
      'silver has finished standardising, and scores are not published until the features they came ' +
      'from are in the warehouse. Otherwise a dashboard shows a risk score derived from yesterday’s ' +
      'data beside today’s case counts.',
  ),
  h2('15.2 Failure behaviour'),
  para(
    'What a platform does when something is wrong is the part worth specifying. The behaviours ' +
      'below are implemented, not aspirational.',
  ),
  table(
    ['Situation', 'Behaviour'],
    [
      ['Vendor sends an unrecognised status or category', 'Mapped to a documented default, never dropped, and counted so the mapping table can be extended.'],
      ['A payload cannot be parsed', 'Quarantined to the dead-letter topic with its source topic, per record. One malformed message never poisons its batch.'],
      ['A record arrives with no source identifier', 'Rejected rather than keyed, because every such record would otherwise derive the same identifier and collapse the feed onto one row while still reporting a healthy ingest rate.'],
      ['An event arrives for an unknown site', 'Stored and counted. A risk score for an unknown site is dropped rather than plotted at coordinates the platform does not have.'],
      ['The predictive layer has not run', 'Dashboards render an explicit "no scores yet" state rather than empty charts.'],
      ['A retrained model is worse than the guardrail', 'Recorded in MLflow and discarded; the previous model stays in service.'],
      ['Model explanation data is unreadable', 'The score is still served, without its factor breakdown.'],
      ['The audit table is unreachable', 'The user’s query still succeeds and the failure is logged. Blocking an investigator from their case queue because a logging table is down is the worse outcome.'],
      ['A region has too little history to forecast', 'That region is skipped with a warning; the other curves are unaffected.'],
    ],
    [3400, 6680],
  ),
  h2('15.3 What is monitored'),
  bullet('Ingest throughput and lag per topic, and dead-letter volume — a rising quarantine count is a connector problem, not a platform one.'),
  bullet('Unmapped category and unknown-site counters, which drive the mapping backlog.'),
  bullet('Scoring run completion, model metrics per run, and promotion decisions, in MLflow.'),
  bullet('API latency and error rate per endpoint, and audit write failures.'),

  ...part('III', 'Technology stack', 'What was selected for each layer, why, and what remains to be confirmed.'),

  h1('16. Purpose of this part'),
  para(
    'Section 9 of the proposal listed a menu of candidate tools. This part records what was ' +
      'actually selected for each layer, why, and what would need to be confirmed before build. It ' +
      'is written to be read by a technical reviewer and to survive challenge from one.',
  ),
  para(
    'The organising principle throughout is to build on technology the organisation already runs. ' +
      'A security-investigations platform that picks different technology at every layer is a ' +
      'platform that needs its own on-call rota, its own hiring pipeline and its own security ' +
      'review. Each choice below is therefore justified twice: on its technical merits, and on ' +
      'whether the organisation already operates it.',
  ),

  h1('17. The stack at a glance'),
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
      ['CI', '—', 'GitHub Actions', 'Six jobs: services against a real database, analytics, mapping parity, dashboard, migrations, infrastructure validation.'],
    ],
    [1250, 2350, 2600, 3880],
  ),

  h1('18. Substitutions worth defending'),
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

  h1('19. Visual language'),
  para(
    'The dashboards are coloured from the AT&T brand palette: #067AB4, #3AA5DC, #FF7200 and ' +
      '#FCB314.',
  ),
  para(
    'One measurement drives the whole implementation. Three of those four are identity fills rather ' +
      'than data marks: against white, #3AA5DC measures 2.69:1, #FF7200 measures 2.74:1 and #FCB314 ' +
      'measures 1.76:1 — all below the 3:1 a chart mark must clear. Only the deep blue #067AB4 ' +
      'stands on its own, at 4.72:1. The brand hues therefore drive the chrome — the navigation ' +
      'rail, the identity mark, the accent rules — and data marks take hue-locked darker steps of ' +
      'the same colours that do clear the floor. The hue is the brand’s; the lightness is whatever ' +
      'accessibility demands.',
  ),
  para(
    'Status colours (good, warning, serious, critical) are reserved and sit outside the brand hues, ' +
      'so a state can never be mistaken for a data series; each ships with an icon and a word as ' +
      'well as a colour. Two ramps exist rather than one: a sequential ramp for continuous ' +
      'magnitude, whose lightest step may recede toward the surface meaning "near zero", and an ' +
      'ordinal ramp for discrete ordered buckets, held to a stricter floor so the lightest bucket ' +
      'still reads. Every palette value was checked programmatically against the exact surface it ' +
      'renders on, in both light and dark mode, for lightness, chroma, colour-blind separation and ' +
      'contrast.',
  ),
  note(
    'No AT&T data-visualisation standard is published. These hex values come from AT&T’s publicly ' +
      'visible brand usage, not an internal brand book — confirm them against AT&T Brand Central in ' +
      'Phase 1. All tokens live in one file, so a correction is a find-and-replace, not a redesign.',
  ),

  h1('20. Versions'),
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
      ['Terraform', '1.9+, azurerm ~> 3.100', 'Azure footprint'],
    ],
    [3000, 3200, 3880],
  ),

  h1('21. Delivery status'),
  para('Stated plainly, because a reviewer will ask which parts are real.'),
  h2('21.1 Built and verified'),
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
      ['Java', '60 tests', 'Canonical mapping, normalisation, RBAC and region confinement, dashboard KPIs, risk ingest, link analysis, the weekday-by-hour heat map'],
      ['Python', '28 tests', 'Leakage guard, model quality, forecaster behaviour, clustering, streaming/batch mapping parity'],
      ['Dashboard', '31 tests', 'The three views, tab isolation, sorting and filtering, the five chart forms, role gating, chart accessibility, link graph'],
    ],
    [1700, 1500, 6880],
  ),
  h2('21.2 Integration coverage'),
  para(
    'Three parts of the platform were written as production code and could only be proven by ' +
      'running them, which is now done in continuous integration:',
  ),
  bullet(
    'The deployed security profile — the API boots as an OAuth2 resource server against a stub ' +
      'OpenID provider with a generated RSA key, and the tests assert discovery, JWKS retrieval, ' +
      'signature, issuer, audience and expiry validation, the role and region mapping, and that the ' +
      'local demonstration token endpoint does not exist under that profile.',
  ),
  bullet(
    'The streaming path — an in-process Kafka broker through the real sink into a real PostgreSQL ' +
      'warehouse: a message becomes a canonical row, a redelivery updates it rather than ' +
      'duplicating it, a malformed payload does not stop the feed, and badge identifiers reach the ' +
      'warehouse only as hashes.',
  ),
  bullet(
    'The infrastructure definitions — Terraform validation and Kubernetes manifest validation ' +
      'against the API schemas. Valid and internally consistent; not the same claim as applied to a ' +
      'subscription.',
  ),
  h2('21.3 Production-path, not yet executed'),
  para(
    'Written as production code but requiring the platforms they target: the PySpark medallion jobs ' +
      '(Databricks), the Airflow DAGs (an Airflow deployment) and the Terraform footprint (an Azure ' +
      'subscription). The parity test covers the one correctness risk that spans the boundary ' +
      'between the Spark path and the Java path.',
  ),
  h2('21.4 Deliberately not built'),
  para(
    'Connectors to any specific vendor system. Phase 1 of the roadmap exists precisely to confirm ' +
      'which systems are in use before that code is written; the event contracts define what each ' +
      'connector will publish.',
  ),
  note(
    'One claim this document does not make: the model’s measured accuracy says nothing about this ' +
      'organisation. It is trained on generated history, so what is demonstrated is that the ' +
      'pipeline is free of temporal leakage and the method is sound — not that it predicts anything ' +
      'about real sites. The number to judge is the one from Phase 3, on the organisation’s own data.',
  ),

  h1('22. To confirm in Phase 1'),
  para(
    'This document makes assumptions that discovery should either confirm or correct. Listing them ' +
      'is cheaper than defending them later.',
  ),
  bullet('The actual case management, incident reporting, access control and video-management systems in use, and which expose APIs.'),
  bullet('Whether an alarm feed already leaves the video-management system today, and to what — an existing PSIM or monitoring centre this platform should sit beside rather than duplicate.'),
  bullet('Who owns real-time monitoring-centre response, and whether any part of it is in scope.'),
  bullet('Any existing policy on video leaving the VMS, which this design already respects and should cite.'),
  bullet('Whether Azure Databricks and Event Hubs are available to this business unit, or whether a shared platform team owns them.'),
  bullet('The Entra ID app-role and group model, and how region entitlement is represented in a token claim.'),
  bullet('Data-retention and residency requirements per region, which may constrain a single warehouse.'),
  bullet('The exact brand tokens, confirmed against AT&T Brand Central, and whether an internal data-visualisation standard exists.'),
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
      ['web/demo', 'Offline walkthrough build — the same application against captured API responses, for demonstration without a database'],
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
      ['/api/v1/dashboards/manager', 'Manager and above', 'Workload, case aging, closure and escalation rates, regional risk, weekday-by-hour incident grid'],
      ['/api/v1/dashboards/executive', 'Executive', 'Enterprise posture, regional breakdown, hotspots, incident projection, weekday-by-hour incident grid'],
      ['/api/v1/cases, /api/v1/incidents', 'Investigator and above', 'Region-scoped search over the consolidated records'],
      ['/api/v1/risk/alerts, /heatmap, /forecast', 'Varies by view', 'Current risk scores, mapped sites, trend projection'],
      ['/api/v1/graph/cases/{caseNumber}', 'Investigator and above', 'Entity link graph around a case, bounded by hops and a node budget'],
      ['/api/v1/risk/scores, /forecasts (POST)', 'Analytics workload identity only', 'Write path for a scoring run; idempotent per site and date'],
    ],
    [3400, 2600, 4080],
  ),

  h1('Appendix C — Canonical entities'),
  para(
    'The shape everything downstream reads, whichever system the record came from. Each entity ' +
      'carries its source system and source identifier, so any row can be traced back to the ' +
      'record that produced it.',
  ),
  table(
    ['Entity', 'Key fields'],
    [
      ['Case', 'Case number, title, type, status, priority, assignee, site, region, opened / due / closed timestamps, financial impact, source system and id'],
      ['Incident', 'Type, severity, description, reported by, site, region, occurred-at, loss amount, related case number, source system and id'],
      ['Access event', 'Site, hashed badge, door, result, event time, after-hours flag (evaluated in the site’s own timezone), tailgate flag'],
      ['Alarm event', 'Site, camera identifier, alarm type, severity, event time'],
      ['Site', 'Code, name, region, country, city, type, timezone, coordinates, lighting score, foot-traffic score, camera count, perimeter fencing, criticality'],
      ['Risk score', 'Site, score date, probability, band, peak window, contributing factors, model version'],
      ['Forecast point', 'Scope (enterprise, region or site), date, predicted value, lower and upper bound, horizon'],
      ['Audit event', 'Actor, role, action, resource, query, result count, timestamp'],
    ],
    [1900, 8180],
  ),
]

/* ------------------------------------------------------------------ document */

const doc = new Document({
  creator: 'Lekpam Nkawula',
  title: 'Platform Specification — Global Security Intelligence Hub',
  description:
    'What the platform is, how it works, and the technology stack it is built on — technical ' +
    'appendix to the Global Security Intelligence Hub project proposal',
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
                  text: 'Global Security Intelligence Hub  ·  Platform Specification',
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
  const out = process.argv[2] || 'GSIH-Platform-Specification.docx'
  fs.writeFileSync(out, buffer)
  console.log(`wrote ${out} (${(buffer.length / 1024).toFixed(0)} KB)`)
})
