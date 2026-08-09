/**
 * Builds the executive brief — the same proposal, for the people who decide whether it
 * happens rather than the people who would build it.
 *
 * The rule this document is written to: no reader should need to know what Kafka is, and
 * no sentence should ask them to. Where a technical fact changes a business decision — that
 * video stays in the camera system, that this is not an alarm-response tool — it is stated
 * in operational terms and its consequence is spelled out.
 *
 * The other rule: no invented numbers. There is no ROI figure, no percentage saving and no
 * cost estimate in here, because none of those can be honestly produced before discovery.
 * What it gives instead is the measurement plan — the baselines to capture before anything
 * changes, so the benefit can be proven afterwards rather than asserted now.
 *
 *   npm i docx && node docs/build_brief_doc.js docs/GSIH-Executive-Brief.docx
 *   python3 docs/verify_spec_doc.py docs/GSIH-Executive-Brief.docx
 */

const fs = require('fs')
const { Document, PageBreak, Packer, Paragraph, TextRun } = require('docx')
const {
  HEADING,
  INK,
  bullet,
  cover,
  coverMeta,
  h1,
  h2,
  note,
  numbering,
  pageFooter,
  pageProperties,
  para,
  runningHead,
  table,
} = require('./doc_style')

const coverBlock = cover(
  'EXECUTIVE BRIEF',
  'Global Security Intelligence Hub',
  'One view of investigations, and a warning before the next incident',
  'A summary of the proposal for security leadership — what changes, what it takes, and how we would know it worked.',
  46,
).concat(
  coverMeta([
    ['Document', 'Executive Brief — non-technical summary'],
    ['Companion to', 'Global Security Intelligence Hub — Complete Project Proposal'],
    ['Read with', 'Platform Specification (technical appendix), for the review team'],
    ['Prepared by', 'Lekpam Nkawula'],
    ['Role', 'Project Manager – Investigations (Candidate)'],
    ['Version', '1.0'],
    ['Date', 'August 2026'],
    ['Status', 'For discussion'],
  ]),
)

const body = [
  h1('In one page'),
  para(
    'Global security investigations run on several separate systems. Cases live in one, ' +
      'incident reports in another, badge records in a third, camera alarms in a fourth. Each ' +
      'system does its own job well. None of them can answer a question that crosses two of ' +
      'them, and most questions worth asking do.',
  ),
  para(
    'The Global Security Intelligence Hub reads from all of those systems, puts what it finds ' +
      'into one consistent record, and gives three groups of people a screen built for the ' +
      'question they actually ask: an investigator working a queue, a regional manager running a ' +
      'team, and an executive reviewing posture. It changes nothing about how the existing ' +
      'systems are used and adds no work to anyone’s day.',
  ),
  para(
    'On top of that consolidated history it does one thing none of the current systems can: it ' +
      'estimates which sites are most likely to be hit in the coming week, and during which ' +
      'hours. That turns a security operation from one that documents what happened into one ' +
      'that can put a patrol somewhere before it does.',
  ),
  table(
    ['What it is', 'What it is not'],
    [
      ['A single, consistent view of investigations, incidents, access and alarm records.', 'A replacement for any existing system. Every current system stays exactly as it is.'],
      ['A work queue for investigators, with deadlines and the sites that keep recurring.', 'An alarm-monitoring or intrusion-response tool. That remains the monitoring centre’s job.'],
      ['A weekly risk estimate per site, with the reasons behind it and the hours of exposure.', 'A system that stores or watches video. Footage stays in the camera system it already lives in.'],
      ['A reporting layer leadership can trust, because every figure comes from the same source.', 'A guarantee. The risk numbers are probabilities that direct attention, not predictions of events.'],
    ],
    [5040, 5040],
  ),

  new Paragraph({ children: [new PageBreak()] }),
  h1('1. The situation today'),
  para(
    'None of what follows is a criticism of the teams or the systems. It is the normal ' +
      'consequence of buying good tools one at a time, for one job each, over many years.',
  ),
  table(
    ['What happens now', 'What it costs'],
    [
      [
        'The same kind of event is recorded under different names in different systems — "property damage" in one, "criminal damage" in another, "vandalism" in a third.',
        'Any count of anything requires someone who knows all the systems, and two people can produce different numbers from the same records without either being wrong.',
      ],
      [
        'A badge used at a site the night before an incident, and at two other sites after hours that month, sits in a system nobody looks at alongside the incident.',
        'Connections that would be obvious if the records were side by side are found late, by chance, or not at all.',
      ],
      [
        'Reporting describes what already happened.',
        'Resources are allocated to where trouble was, not where it is going to be. A quarterly review cannot answer "where should the patrol go next month".',
      ],
      [
        'Management packs are assembled by hand from exports.',
        'Days of skilled time per cycle, and figures that cannot be audited back to a source.',
      ],
      [
        'Each investigator tracks their own workload their own way.',
        'Ageing cases surface when someone notices, and workload imbalance is invisible until somebody is overloaded.',
      ],
    ],
    [5040, 5040],
  ),

  h1('2. What we are proposing'),
  para(
    'One platform that reads from the existing systems — read-only, with no ability to change ' +
      'anything in them — and turns what it reads into a single consistent record. On top of that ' +
      'record sit three screens and one predictive model.',
  ),
  h2('2.1 What changes for each group'),
  table(
    ['Who', 'Today', 'With the hub'],
    [
      [
        'Investigator',
        'Tracks their own cases in the case system, checks other systems by hand when something looks connected, and finds out a case is overdue when someone asks.',
        'Opens one queue showing every case they hold, sorted by whatever matters that morning — deadline, age, or financial exposure. Sites that keep having the same problem are flagged. One click shows everything connected to a case: the site, what else happened there, and whether the same badge appears at another site after hours.',
      ],
      [
        'Regional manager',
        'Asks for a status update to find out how the team is loaded, and learns about an ageing case when it becomes a problem.',
        'Sees workload per investigator with overdue work separated out, how long the queue has been open, what kinds of case are coming in, and where the model says risk is concentrated this week — with the reason and the hours of exposure for each site.',
      ],
      [
        'Executive',
        'Receives a pack assembled by hand, describing the last quarter.',
        'Opens a live view: twelve-month volume and its direction, open financial exposure, where incidents actually cluster, the projected trend for the next ninety days, and the largest investigations ranked by what they are costing.',
      ],
    ],
    [1700, 4100, 4280],
  ),
  note(
    'Everyone sees only their own region, and only what their role permits. That is enforced by ' +
      'the system, not by convention, and every single read is recorded in an audit log.',
  ),

  h1('3. What it delivers'),
  para(
    'Deliberately stated as capabilities rather than as savings. Section 7 explains how the ' +
      'value would be measured once it is running, which is a more useful commitment than a ' +
      'number invented before discovery.',
  ),
  bullet(
    'One version of the truth. "Open cases" means the same thing to the investigator, the ' +
      'manager and the executive, because all three numbers come from the same record.',
  ),
  bullet(
    'Time back. Management reporting that is assembled by hand today becomes a screen that is ' +
      'always current.',
  ),
  bullet(
    'Earlier connections. Relationships across cases, sites, badges and alarms are visible ' +
      'immediately rather than discovered later.',
  ),
  bullet(
    'Prevention rather than documentation. A weekly ranking of which sites are most exposed, ' +
      'with the hours that matter, so patrols and hardening go where the risk is.',
  ),
  bullet(
    'Defensible reporting. Every figure traces back to a source record, and every access to it ' +
      'is logged — which matters when a case reaches legal or regulatory scrutiny.',
  ),
  bullet(
    'A foundation. Once the records are consolidated and governed, further questions are new ' +
      'reports rather than new projects.',
  ),

  h1('4. What it will not do'),
  para(
    'Setting this out now is cheaper than discovering it during delivery. Each of these is a ' +
      'deliberate design decision with a reason behind it.',
  ),
  table(
    ['Limit', 'Why', 'What still covers it'],
    [
      [
        'It does not respond to intrusions as they happen.',
        'A break-in needs a response in seconds. This platform works on a daily analytical cycle — a different clock and a different job.',
        'The monitoring centre and the guard force, as today. The hub can be extended later to show a filtered live alert panel if that is wanted; it is not what it is for.',
      ],
      [
        'It does not store or watch video.',
        'The volume is enormous, the legal handling of footage already lives in the camera system, and copying video of identifiable people into an analytics platform creates privacy obligations with no benefit.',
        'The camera system, which keeps the footage and its access controls. The hub records that an alarm happened, on which camera and when, and can link straight to the clip in the system that holds it.',
      ],
      [
        'It does not change or write to any existing system.',
        'Read-only access removes an entire category of risk from the review. There is simply no mechanism in the software to alter a source record.',
        'The existing systems keep their own workflows and remain the system of record.',
      ],
      [
        'It does not predict individual events.',
        'No system can. The model produces probabilities that rank sites against each other.',
        'The output is "these five sites are the most exposed this week, for these reasons" — which is the question a patrol rota can actually answer.',
      ],
    ],
    [2300, 3900, 3880],
  ),

  h1('5. How it would be delivered'),
  para(
    'Phased, with something usable at the end of each phase rather than a single delivery at ' +
      'the end. Durations are indicative and would be firmed up in discovery.',
  ),
  table(
    ['Phase', 'What happens', 'What exists at the end'],
    [
      [
        'Phase 1 — Discovery',
        'Confirm which systems are actually in use, who owns them, what they can export, and how access and regions are represented in the corporate directory. Agree the definitions behind each figure.',
        'A confirmed source list, agreed KPI definitions, and the security and privacy review passed.',
      ],
      [
        'Phase 2 — Consolidation',
        'Connect the confirmed systems, map their vocabularies onto one record, and stand up the three dashboards on real data.',
        'Live dashboards on the organisation’s own records. The reporting benefit lands here, before any model.',
      ],
      [
        'Phase 3 — Prediction',
        'Train the risk model on the organisation’s own history, validate it against what actually happened, and publish scores only if it clears an agreed quality bar.',
        'Weekly site risk with reasons and exposure windows — or a documented decision not to publish it, if the data does not support it.',
      ],
      [
        'Phase 4 — Adoption',
        'Train the teams, embed the views in the weekly and quarterly rhythm, and retire the manual reporting it replaces.',
        'The platform is how the work is done, rather than another screen nobody opens.',
      ],
    ],
    [1900, 4200, 3980],
  ),
  note(
    'Phase 2 delivers value on its own. If the predictive layer in Phase 3 does not clear its ' +
      'quality bar on real data, the consolidation and reporting benefit is already banked and ' +
      'the model is simply not published. That is the intended failure mode, and it is why the ' +
      'phases are ordered this way.',
  ),

  h1('6. What we would need'),
  table(
    ['From', 'What is needed', 'Roughly when'],
    [
      ['Security leadership', 'A decision on scope — particularly whether real-time alerting is in or out — and a named owner for the agreed definitions.', 'Phase 1'],
      ['System owners', 'Read-only access to each confirmed source system, and someone who can explain its data for a few sessions.', 'Phase 1'],
      ['IT and security review', 'Approval of the data handling, and the identity and access model.', 'Phase 1'],
      ['Privacy and legal', 'Review of how badge and personal records are handled, and of the retention position.', 'Phase 1'],
      ['Data platform team', 'Capacity on the existing cloud and data platform. The design deliberately uses what the organisation already runs.', 'Phase 2'],
      ['Investigations teams', 'A small group who will use the dashboards early and say what is wrong with them.', 'Phase 2 onward'],
    ],
    [2200, 6080, 1800],
  ),
  para(
    'The design principle behind the technology choices is worth stating in business terms: ' +
      'everything is built on platforms the organisation already operates. That is not a ' +
      'technical preference. It means no new vendor to contract, no new platform for someone to ' +
      'support at three in the morning, and a security review that extends an existing approval ' +
      'rather than starting a new one.',
  ),

  h1('7. How we would know it worked'),
  para(
    'This brief contains no return-on-investment figure, because an honest one cannot be ' +
      'produced before discovery, and a dishonest one is worse than none. What can be committed ' +
      'to now is the measurement: capture these baselines before anything changes, then measure ' +
      'the same things afterwards.',
  ),
  table(
    ['Measure', 'Baseline to capture first', 'What good looks like'],
    [
      ['Time to produce management reporting', 'Person-hours per reporting cycle today, across everyone who contributes.', 'Most of that time returned; the pack becomes a review of a live screen.'],
      ['Case ageing', 'How many open cases are past their due date today, and how long the oldest have been open.', 'Fewer cases ageing unnoticed, because overdue work is visible daily rather than quarterly.'],
      ['Repeat incidents at the same site', 'Sites with more than one incident of the same type in a quarter.', 'Fewer repeats at sites that were flagged and acted on — the clearest test of whether prediction changed anything.'],
      ['Patrol targeting', 'How patrol locations are chosen today, and on what evidence.', 'Patrols allocated against the weekly risk ranking, with the hit rate tracked.'],
      ['Time to connect related records', 'How a connection between a case and another site is found today, and how long it takes.', 'The connection is visible on the case, in the moment.'],
      ['Confidence in the numbers', 'Whether two teams asked the same question today give the same answer.', 'One number, traceable to its source, that nobody has to reconcile.'],
    ],
    [2400, 3900, 3780],
  ),

  h1('8. Risks, and how they are handled'),
  table(
    ['Risk', 'How it is handled'],
    [
      ['The source systems turn out not to expose the data cleanly.', 'This is exactly what Phase 1 is for, before any build commitment. The platform accepts both live feeds and file exports, so a system with no interface is still usable.'],
      ['The predictive model is not accurate enough on real data to be useful.', 'It is only published if it clears an agreed quality bar, and a retrained model that gets worse is discarded automatically rather than shipped. Phase 2’s benefit does not depend on it.'],
      ['People do not use it.', 'The views are built around what each role already does daily rather than around what is easy to report. A small early user group in Phase 2 exists to catch this while it is still cheap to change.'],
      ['Privacy or works-council concerns about badge and personal data.', 'Badge identifiers are irreversibly disguised before they are stored, and identifying a holder is a separate controlled request. Video never enters the platform at all. Privacy review is in Phase 1, not after build.'],
      ['It becomes a reporting layer nobody trusts.', 'Every figure traces to a source record and every read is logged. Where a number is an estimate, the screen says so — the risk charts state on their face that they are probabilities.'],
      ['Scope creep into real-time monitoring.', 'Stated out of scope in this brief and in the specification. If it is wanted, it is a separate decision with its own design, not an extension assumed along the way.'],
    ],
    [3400, 6680],
  ),

  h1('9. What exists today'),
  para(
    'A working prototype, not a slide deck. The consolidated data model, the connections into ' +
      'it, the three dashboards, the predictive layer and the security controls are all built and ' +
      'running, demonstrated against two years of realistic but generated data.',
  ),
  para(
    'Two things that prototype cannot show, stated plainly because they will be asked. It has ' +
      'never been connected to a real source system — that is Phase 1 and 2 work. And the model’s ' +
      'measured accuracy says nothing about this organisation, because it learned from generated ' +
      'history; what it demonstrates is that the method is sound and the numbers are produced ' +
      'honestly. The accuracy that matters is measured in Phase 3, on real records.',
  ),
  note(
    'The prototype can be walked through live in a review — all three views, with working ' +
      'filters, sorting and charts — without connecting to anything.',
  ),

  h1('10. The decision'),
  para(
    'What is being asked for now is Phase 1: a short discovery to confirm the source systems, ' +
      'agree the definitions, and pass the security and privacy review. It is the phase that ' +
      'costs least and removes most of the uncertainty from everything after it.',
  ),
  para('Three questions worth settling in that conversation:'),
  bullet('Is real-time alerting in scope, or does that stay with the monitoring centre?'),
  bullet('Who owns the definitions — whose answer is final on what "open case" means?'),
  bullet('Which region or business unit goes first, so the first phase proves the approach on a manageable estate?'),
]

const doc = new Document({
  creator: 'Lekpam Nkawula',
  title: 'Executive Brief — Global Security Intelligence Hub',
  description:
    'Non-technical summary of the Global Security Intelligence Hub proposal for security leadership',
  numbering,
  styles: { default: { document: { run: { font: 'Calibri', size: 20, color: INK } } } },
  sections: [
    {
      properties: pageProperties,
      headers: {
        default: runningHead('Global Security Intelligence Hub  ·  Executive Brief'),
      },
      footers: { default: pageFooter() },
      children: [...coverBlock, ...body],
    },
  ],
})

Packer.toBuffer(doc).then((buffer) => {
  const out = process.argv[2] || 'GSIH-Executive-Brief.docx'
  fs.writeFileSync(out, buffer)
  console.log(`wrote ${out} (${(buffer.length / 1024).toFixed(0)} KB)`)
})
