import type { ExecutiveView, InvestigatorView, LinkGraph, ManagerView, RiskAlert } from './types'

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, token: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`)
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) url.searchParams.set(key, value)
  }

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })

  if (!response.ok) {
    // 401 and 403 are meaningfully different to the person at the screen: one means
    // "sign in again", the other means "this is not yours to see". Keep them distinct
    // rather than collapsing both into a generic failure.
    const message =
      response.status === 401
        ? 'Your session has expired. Sign in again.'
        : response.status === 403
          ? 'Your role does not have access to this view.'
          : `Request failed (${response.status})`
    throw new ApiError(response.status, message)
  }

  return (await response.json()) as T
}

export const api = {
  investigatorView: (token: string, investigator?: string) =>
    request<InvestigatorView>('/api/v1/dashboards/investigator', token, {
      investigator: investigator ?? '',
    }),

  managerView: (token: string, region?: string) =>
    request<ManagerView>('/api/v1/dashboards/manager', token, { region: region ?? '' }),

  executiveView: (token: string) => request<ExecutiveView>('/api/v1/dashboards/executive', token),

  heatmap: (token: string, region?: string) =>
    request<RiskAlert[]>('/api/v1/risk/heatmap', token, { region: region ?? '' }),

  regions: (token: string) => request<string[]>('/api/v1/sites/regions', token),

  linkGraph: (token: string, caseNumber: string, hops = 2) =>
    request<LinkGraph>(`/api/v1/graph/cases/${encodeURIComponent(caseNumber)}`, token, {
      hops: String(hops),
    }),

  /**
   * Demo sign-in against the API's `local` profile. In deployed environments the token
   * comes from the Entra ID authorization-code flow instead and this call does not exist.
   */
  async localToken(username: string, roles: string[], region?: string): Promise<string> {
    const url = new URL(`${BASE_URL}/api/v1/auth/local-token`)
    url.searchParams.set('username', username)
    url.searchParams.set('roles', roles.join(','))
    if (region) url.searchParams.set('region', region)

    const response = await fetch(url.toString())
    if (!response.ok) {
      throw new ApiError(response.status, 'Could not obtain a demo token from the API')
    }
    const body = (await response.json()) as { access_token: string }
    return body.access_token
  },
}
