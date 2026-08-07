import type { UserRole } from '../api/types'

export interface Session {
  token: string
  username: string
  roles: UserRole[]
  region?: string
}

/**
 * Demo personas for the local profile.
 *
 * Deployed environments have no persona picker: the app runs the Entra ID
 * authorization-code flow and the roles come from the user's assigned app roles. These
 * exist so the three views can be walked through without a tenant.
 */
export const PERSONAS: { label: string; detail: string; username: string; roles: UserRole[]; region?: string }[] = [
  {
    label: 'Investigator',
    detail: 'dana.reyes@att.com · Southwest · personal case queue',
    username: 'dana.reyes@att.com',
    roles: ['INVESTIGATOR'],
    region: 'SOUTHWEST',
  },
  {
    label: 'Regional manager',
    detail: 'marcus.hall@att.com · Southwest · team workload and regional risk',
    username: 'marcus.hall@att.com',
    roles: ['MANAGER'],
    region: 'SOUTHWEST',
  },
  {
    label: 'Executive',
    detail: 'priya.nair@att.com · enterprise posture and predictive trend',
    username: 'priya.nair@att.com',
    roles: ['EXECUTIVE'],
  },
]

export const TABS: { id: UserRole; label: string }[] = [
  { id: 'INVESTIGATOR', label: 'Investigator' },
  { id: 'MANAGER', label: 'Manager' },
  { id: 'EXECUTIVE', label: 'Executive' },
]

/**
 * Which tabs a session may open.
 *
 * This mirrors the API's `@PreAuthorize` rules so the UI does not offer a view the
 * server will refuse. The server is still the authority — hiding a tab is a courtesy,
 * not a control.
 */
export function visibleTabs(roles: UserRole[]): UserRole[] {
  if (roles.includes('EXECUTIVE')) return ['INVESTIGATOR', 'MANAGER', 'EXECUTIVE']
  if (roles.includes('MANAGER')) return ['INVESTIGATOR', 'MANAGER']
  return ['INVESTIGATOR']
}

const STORAGE_KEY = 'gsih.session'

export function loadSession(): Session | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    // A corrupt or unavailable store (private browsing, cleared mid-session) should
    // land the user on the sign-in screen, not crash the app shell.
    return null
  }
}

export function saveSession(session: Session | null): void {
  try {
    if (session) {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    } else {
      window.sessionStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    /* Session persistence is a convenience; failing to store it is not fatal. */
  }
}
