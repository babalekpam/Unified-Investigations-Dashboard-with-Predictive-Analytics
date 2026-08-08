import { useCallback, useEffect, useState } from 'react'
import { ApiError, api } from './api/client'
import type { ExecutiveView, InvestigatorView, ManagerView, UserRole } from './api/types'
import { ErrorNotice, Loading } from './components/primitives'
import { PERSONAS, TABS, type Session, loadSession, saveSession, visibleTabs } from './lib/session'
import { ExecutiveDashboard } from './views/ExecutiveView'
import { InvestigatorDashboard } from './views/InvestigatorView'
import { ManagerDashboard } from './views/ManagerView'

type ViewData = InvestigatorView | ManagerView | ExecutiveView

export default function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession())
  const [tab, setTab] = useState<UserRole>('INVESTIGATOR')
  const [data, setData] = useState<ViewData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // The default tab follows the signed-in role: an executive should land on the
  // enterprise view, not on somebody's personal queue.
  useEffect(() => {
    if (!session) return
    const allowed = visibleTabs(session.roles)
    setTab(allowed[allowed.length - 1])
  }, [session])

  const load = useCallback(
    async (current: Session, which: UserRole) => {
      setLoading(true)
      setError(null)
      try {
        if (which === 'INVESTIGATOR') {
          setData(await api.investigatorView(current.token))
        } else if (which === 'MANAGER') {
          setData(await api.managerView(current.token, current.region))
        } else {
          setData(await api.executiveView(current.token))
        }
      } catch (cause) {
        setData(null)
        if (cause instanceof ApiError && cause.status === 401) {
          // The token is no longer good for anything; drop it rather than leaving the
          // user clicking tabs that will all fail.
          setSession(null)
          saveSession(null)
        }
        setError(cause instanceof Error ? cause.message : 'Something went wrong')
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    if (session) void load(session, tab)
  }, [session, tab, load])

  if (!session) {
    return <SignIn onSignIn={(next) => { setSession(next); saveSession(next) }} />
  }

  const allowed = visibleTabs(session.roles)

  return (
    <>
      <header className="app-header">
        <div>
          <h1 className="app-title">Global Security Intelligence Hub</h1>
          <p className="app-subtitle">Unified investigations dashboard with predictive analytics</p>
        </div>
        <div className="toolbar">
          <span className="app-subtitle">
            {session.username}
            {session.region ? ` · ${session.region}` : ' · Enterprise'}
          </span>
          <button
            className="action"
            onClick={() => {
              setSession(null)
              saveSession(null)
              setData(null)
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <nav className="tabs" role="tablist" aria-label="Dashboard views">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            className="tab"
            role="tab"
            aria-selected={tab === entry.id}
            disabled={!allowed.includes(entry.id)}
            title={
              allowed.includes(entry.id)
                ? undefined
                : 'Your role does not have access to this view'
            }
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      <main>
        {loading ? <Loading what="dashboard" /> : null}
        {error ? <ErrorNotice message={error} /> : null}
        {!loading && !error && data ? (
          <ActiveView tab={tab} data={data} token={session.token} />
        ) : null}
      </main>
    </>
  )
}

function ActiveView({ tab, data, token }: { tab: UserRole; data: ViewData; token: string }) {
  if (tab === 'INVESTIGATOR')
    return <InvestigatorDashboard data={data as InvestigatorView} token={token} />
  if (tab === 'MANAGER') return <ManagerDashboard data={data as ManagerView} />
  return <ExecutiveDashboard data={data as ExecutiveView} />
}

function SignIn({ onSignIn }: { onSignIn: (session: Session) => void }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const choose = async (persona: (typeof PERSONAS)[number]) => {
    setBusy(true)
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
      setBusy(false)
    }
  }

  return (
    <main className="sign-in">
      <div>
        <h1 className="app-title">Global Security Intelligence Hub</h1>
        <p className="app-subtitle">
          Choose a role to explore. Deployed environments sign in through Microsoft Entra ID
          instead; these demo personas exist only under the API's local profile.
        </p>
      </div>

      {error ? <ErrorNotice message={error} /> : null}

      <div className="persona-list">
        {PERSONAS.map((persona) => (
          <button
            key={persona.username}
            className="persona"
            disabled={busy}
            onClick={() => void choose(persona)}
          >
            <div className="persona-role">{persona.label}</div>
            <div className="persona-detail">{persona.detail}</div>
          </button>
        ))}
      </div>
    </main>
  )
}
