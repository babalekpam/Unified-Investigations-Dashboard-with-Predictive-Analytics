export type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'gsih.theme'

/**
 * Theme preference, with "system" as the default rather than a guess.
 *
 * Investigators work night shifts and read these dashboards in a control room; forcing
 * either mode on them is worse than following the machine. An explicit choice stamps
 * `data-theme` on the root, which the stylesheet honours over the media query in both
 * directions — the palette has a validated set of steps for each mode, not an inverted
 * copy of the other.
 */
export function loadTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  if (theme === 'system') {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', theme)
  }
  try {
    if (theme === 'system') {
      window.localStorage.removeItem(STORAGE_KEY)
    } else {
      window.localStorage.setItem(STORAGE_KEY, theme)
    }
  } catch {
    /* Persisting the choice is a convenience; the applied theme still holds this session. */
  }
}

/** What the toggle would switch to, resolving "system" against the current media state. */
export function nextTheme(current: Theme): 'light' | 'dark' {
  if (current === 'light') return 'dark'
  if (current === 'dark') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'light' : 'dark'
}
