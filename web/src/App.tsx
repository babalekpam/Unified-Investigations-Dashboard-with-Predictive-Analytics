import { useCallback, useEffect, useState } from 'react'
import { ApiError, api } from './api/client'
import type { ExecutiveView, InvestigatorView, ManagerView, UserRole } from './api/types'
import {
  IconCase,
  IconChevronLeft,
  IconChevronRight,
  IconGlobe,
  IconMoon,
  IconRefresh,
  IconSearch,
  IconShield,
  IconSignOut,
  IconSun,
  IconTeam,
} from './components/icons'
import { DashboardSkeleton, ErrorNotice } from './components/primitives'
import { PERSONAS, type Session, loadSession, saveSession, visibleTabs } from './lib/session'
import { type Theme, applyTheme, loadTheme, nextTheme } from './lib/theme'
import { ExecutiveDashboard } from './views/ExecutiveView'
import { InvestigatorDashboard } from './views/InvestigatorView'
import { ManagerDashboard } from './views/ManagerView'

type ViewData = InvestigatorView | ManagerView | ExecutiveView

/**
 * A payload always travels with the tab it was fetched for.
 *
 * `ActiveView` casts the payload to the type the current tab expects, so a payload paired
 * with the wrong tab reads a field that does not exist and takes the page down. Clearing
 * the data inside an effect is not enough to prevent that: clicking a tab re-renders with
 * the new tab and the old data before any effect runs. Carrying the tab in the state
 * itself makes the mismatch unrepresentable — the view renders only when the two agree.
 */
type Loaded = { tab: UserRole; data: ViewData }

const VIEWS: {
  id: UserRole
  label: string
  title: string
  subtitle: string
  icon: typeof IconCase
}[] = [
  {
    id: 'INVESTIGATOR',
    label: 'My queue',
    title: 'Investigator workspace',
    subtitle: 'Your open cases, deadlines and the sites that keep coming back',
    icon: IconCase,
  },
  {
    id: 'MANAGER',
    label: 'Team & region',
    title: 'Regional operations',
    subtitle: 'Workload, aging, closure and where the next incident is likely',
    icon: IconTeam,
  },
  {
    id: 'EXECUTIVE',
    label: 'Enterprise',
    title: 'Enterprise security posture',
    subtitle: 'Twelve-month trend, exposure, hotspots and the predicted curve',
    icon: IconGlobe,
  },
]

export default function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession())
  const [tab, setTab] = useState<UserRole>('INVESTIGATOR')
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [theme, setTheme] = useState<Theme>(() => loadTheme())
  const [railCollapsed, setRailCollapsed] = useState(false)
  const [filter, setFilter] = useState('')
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => applyTheme(theme), [theme])

  // The default tab follows the signed-in role: an executive should land on the
  // enterprise view, not on somebody's personal queue.
  useEffect(() => {
    if (!session) return
    const allowed = visibleTabs(session.roles)
    setTab(allowed[allowed.length - 1])
  }, [session])

  const load = useCallback(
    async (current: Session, which: UserRole, isCurrent: () => boolean) => {
      setLoading(true)
      setError(null)
      try {
        const next =
          which === 'INVESTIGATOR'
            ? await api.investigatorView(current.token)
            : which === 'MANAGER'
              ? await api.managerView(current.token, current.region)
              : await api.executiveView(current.token)
        if (isCurrent()) {
          setLoaded({ tab: which, data: next })
          setRefreshedAt(new Date())
        }
      } catch (cause) {
        if (!isCurrent()) return
        setLoaded(null)
        if (cause instanceof ApiError && cause.status === 401) {
          // The token is no longer good for anything; drop it rather than leaving the
          // user clicking tabs that will all fail.
          setSession(null)
          saveSession(null)
        }
        setError(cause instanceof Error ? cause.message : 'Something went wrong')
      } finally {
        if (isCurrent()) setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    if (!session) return
    // The cancellation guard drops a slow response for a tab the user has already left;
    // the tab stamped on `loaded` is what keeps a stale payload off the wrong view.
    let cancelled = false
    void load(session, tab, () => !cancelled)
    return () => {
      cancelled = true
    }
  }, [session, tab, load, reloadToken])

  // The filter belongs to the view being read, not to the app: carrying "overdue" from
  // the queue into the enterprise tables would silently hide most of what is there.
  useEffect(() => setFilter(''), [tab])

  if (!session) {
    return (
      <SignIn
        onSignIn={(next) => {
          setSession(next)
          saveSession(next)
        }}
      />
    )
  }

  const allowed = visibleTabs(session.roles)
  const active = VIEWS.find((view) => view.id === tab) ?? VIEWS[0]
  const initials = session.username
    .split('@')[0]
    .split(/[._-]/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')

  return (
    <div className="shell" data-rail={railCollapsed ? 'collapsed' : 'expanded'}>
      <nav className="rail" aria-label="Dashboard views">
        <div className="rail-brand">
          <span className="rail-mark">
            <IconShield size={20} />
          </span>
          <span className="rail-wordmark">
            <strong>Intelligence Hub</strong>
            <span>Global Security</span>
          </span>
        </div>

        <p className="rail-section">Dashboards</p>
        {VIEWS.map((view) => {
          const Icon = view.icon
          const permitted = allowed.includes(view.id)
          return (
            <button
              key={view.id}
              className="rail-item"
              aria-current={tab === view.id ? 'page' : undefined}
              disabled={!permitted}
              title={permitted ? view.title : 'Your role does not have access to this view'}
              onClick={() => setTab(view.id)}
            >
              <Icon size={18} />
              <span className="rail-label">{view.label}</span>
              {permitted ? null : (
                <span className="rail-lock" aria-hidden="true">
                  🔒
                </span>
              )}
            </button>
          )
        })}

        <div className="rail-spacer" />

        <div className="rail-user">
          <span className="rail-avatar" aria-hidden="true">
            {initials}
          </span>
          <span className="rail-identity">
            <strong>{session.username.split('@')[0].replace(/[._]/g, ' ')}</strong>
            <span>{session.region ?? 'Enterprise'}</span>
          </span>
          <button
            className="icon-button"
            title="Sign out"
            aria-label="Sign out"
            onClick={() => {
              setSession(null)
              saveSession(null)
              setLoaded(null)
            }}
          >
            <IconSignOut size={17} />
          </button>
        </div>

        <button
          className="icon-button"
          style={{ alignSelf: railCollapsed ? 'center' : 'flex-end' }}
          aria-label={railCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          title={railCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          onClick={() => setRailCollapsed((value) => !value)}
        >
          {railCollapsed ? <IconChevronRight size={16} /> : <IconChevronLeft size={16} />}
        </button>
      </nav>

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-heading">
            <h1>{active.title}</h1>
            <p>{active.subtitle}</p>
          </div>

          <div className="topbar-tools">
            <label className="search-field">
              <IconSearch size={15} />
              <span className="visually-hidden">Filter the tables on this dashboard</span>
              <input
                type="search"
                value={filter}
                placeholder="Filter cases, sites, people…"
                onChange={(event) => setFilter(event.target.value)}
              />
            </label>

            <button
              className="icon-button"
              title={
                refreshedAt
                  ? `Refresh · last updated ${refreshedAt.toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}`
                  : 'Refresh'
              }
              aria-label="Refresh dashboard"
              onClick={() => setReloadToken((value) => value + 1)}
            >
              <IconRefresh size={17} />
            </button>

            <button
              className="icon-button"
              title="Switch between light and dark"
              aria-label="Switch between light and dark"
              onClick={() => setTheme(nextTheme(theme))}
            >
              {theme === 'dark' ? <IconSun size={17} /> : <IconMoon size={17} />}
            </button>
          </div>
        </header>

        <main>
          {error ? <ErrorNotice message={error} /> : null}
          {loading || loaded?.tab !== tab ? <DashboardSkeleton /> : null}
          {!loading && !error && loaded?.tab === tab ? (
            <ActiveView tab={tab} data={loaded.data} token={session.token} filter={filter} />
          ) : null}
        </main>
      </div>
    </div>
  )
}

function ActiveView({
  tab,
  data,
  token,
  filter,
}: {
  tab: UserRole
  data: ViewData
  token: string
  filter: string
}) {
  if (tab === 'INVESTIGATOR')
    return <InvestigatorDashboard data={data as InvestigatorView} token={token} filter={filter} />
  if (tab === 'MANAGER') return <ManagerDashboard data={data as ManagerView} filter={filter} />
  return <ExecutiveDashboard data={data as ExecutiveView} filter={filter} />
}

const PERSONA_ICON = [IconCase, IconTeam, IconGlobe]

function SignIn({ onSignIn }: { onSignIn: (session: Session) => void }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const choose = async (persona: (typeof PERSONAS)[number]) => {
    setBusy(persona.username)
    setError(null)
    try {
      const token = await api.localToken(persona.username, persona.roles, persona.region)
      onSignIn({
        token,
        username: persona.username,
        roles: persona.roles,
        region: persona.region,
      })
    } catch {
      setError('Could not reach the investigations API. Is it running on port 8080?')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="signin-page">
      <aside className="signin-aside">
        <div>
          <span className="rail-mark" style={{ marginBottom: 26 }}>
            <IconShield size={20} />
          </span>
          <h1>Global Security Intelligence Hub</h1>
          <p>
            One view of investigations, incidents, access events and physical-security
            telemetry — with a model that says which sites are likely to be hit next.
          </p>
          <ul className="signin-points">
            <li>
              <span className="tick" aria-hidden="true">
                ✓
              </span>
              Case, incident, access and alarm feeds resolved to one canonical record
            </li>
            <li>
              <span className="tick" aria-hidden="true">
                ✓
              </span>
              Seven-day vandalism risk per site, with the factors behind each score
            </li>
            <li>
              <span className="tick" aria-hidden="true">
                ✓
              </span>
              Role-based views, region confinement and an append-only audit trail
            </li>
          </ul>
        </div>
        <p className="signin-footnote">Global Security Intelligence Hub · v1.0</p>
      </aside>

      <main className="signin-main">
        <div className="signin-card">
          <h2>Choose a role to explore</h2>
          <p className="lede">
            Deployed environments sign in through Microsoft Entra ID and take their roles from
            the directory. These demo personas exist only under the API's local profile.
          </p>

          {error ? <ErrorNotice message={error} /> : null}

          <div className="persona-list">
            {PERSONAS.map((persona, index) => {
              const Icon = PERSONA_ICON[index] ?? IconCase
              return (
                <button
                  key={persona.username}
                  className="persona"
                  disabled={busy !== null}
                  onClick={() => void choose(persona)}
                >
                  <span className="persona-mark">
                    <Icon size={19} />
                  </span>
                  <span className="persona-text">
                    <span className="persona-role">{persona.label}</span>
                    <span className="persona-detail">{persona.detail}</span>
                  </span>
                  <span className="persona-go">
                    {busy === persona.username ? '…' : <IconChevronRight size={17} />}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </main>
    </div>
  )
}
