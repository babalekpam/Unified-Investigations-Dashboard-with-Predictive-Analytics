/**
 * Offline demo build of the dashboard.
 *
 * This entry exists so the interface can be shown — sorted, filtered, hovered, switched
 * between roles and themes — without a database, an API or a network. It is deliberately
 * *outside* `src/`: nothing here is imported by the application, so the shipped app has no
 * code path that can serve made-up data. The only thing this file does is install a fetch
 * stub before React mounts and then hand over to the real `App`.
 *
 * The payloads in `fixtures.json` were captured verbatim from a running instance of the
 * API against the seeded warehouse. They are a snapshot of real responses, not
 * hand-written examples, so what the demo renders is what the service returned.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../src/App'
import '../src/styles.css'
import fixtures from './fixtures.json'

type Fixtures = {
  investigator: unknown
  manager: unknown
  executive: unknown
  graphs: Record<string, unknown>
}

const data = fixtures as Fixtures

function respond(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function route(url: URL): Response {
  const path = url.pathname

  if (path.endsWith('/auth/local-token')) {
    // The persona picker still runs; it just gets a token that nothing verifies.
    return respond({ access_token: 'demo-token', token_type: 'Bearer', expires_in: 28800 })
  }
  if (path.endsWith('/dashboards/investigator')) return respond(data.investigator)
  if (path.endsWith('/dashboards/manager')) return respond(data.manager)
  if (path.endsWith('/dashboards/executive')) return respond(data.executive)

  const graph = path.match(/\/graph\/cases\/([^/]+)$/)
  if (graph) {
    const caseNumber = decodeURIComponent(graph[1])
    const hops = url.searchParams.get('hops') ?? '2'
    const captured = data.graphs[`${caseNumber}|${hops}`]
    if (captured) return respond(captured)
  }

  // Anything not captured says so plainly rather than rendering an empty panel that
  // looks like a real "nothing found" answer.
  return new Response(
    JSON.stringify({ message: `Not captured in this offline demo: ${path}` }),
    { status: 501, headers: { 'Content-Type': 'application/json' } },
  )
}

window.fetch = async (input: RequestInfo | URL) => {
  const href =
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  // A short delay so the skeleton state is visible rather than flashing past — this is a
  // walkthrough, and the loading behaviour is part of what is being shown.
  await new Promise((resolve) => setTimeout(resolve, 220))
  return route(new URL(href, window.location.origin))
}

/**
 * A standing label on the demo build.
 *
 * The sites, cases, badges and names in the captured payloads are generated, not real
 * records — anyone looking at this needs to know that without having to ask, and the
 * label belongs to the walkthrough rather than to the product, so it is added here
 * instead of inside the application.
 */
const banner = document.createElement('div')
banner.textContent = 'Offline walkthrough · synthetic demonstration data'
banner.setAttribute(
  'style',
  [
    'position:fixed',
    'right:12px',
    'bottom:12px',
    'z-index:60',
    'padding:6px 12px',
    'border-radius:999px',
    'border:1px solid var(--border)',
    'background:var(--surface-1)',
    'color:var(--text-secondary)',
    'box-shadow:var(--shadow-2)',
    'font:600 11px/1.2 var(--mono)',
    'letter-spacing:0.08em',
    'text-transform:uppercase',
    'pointer-events:none',
  ].join(';'),
)
document.body.appendChild(banner)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
