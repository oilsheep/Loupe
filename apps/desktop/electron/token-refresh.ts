import type { SettingsStore } from './settings'

export interface RefreshGoogleResult {
  token: string
  tokenExpiresAt: number
  refreshToken?: string
}

export interface RefreshDeps {
  refreshGoogle: (args: { refreshToken: string; accountEmail: string }) => Promise<RefreshGoogleResult>
}

const inFlight = new Map<string, Promise<void>>()

export async function refreshAllExpiringTokens(store: SettingsStore, deps: RefreshDeps): Promise<void> {
  const settings = store.get()
  const seenAccounts = new Set<string>()
  const tasks: Array<Promise<void>> = []

  for (const project of settings.projects) {
    const account = project.google.accountEmail
    const refreshToken = project.google.refreshToken
    if (!account || !refreshToken) continue
    if (seenAccounts.has(account)) continue
    seenAccounts.add(account)

    const flightKey = `google:${account}`
    let task = inFlight.get(flightKey)
    if (!task) {
      const projectId = project.id
      task = (async () => {
        try {
          const result = await deps.refreshGoogle({ refreshToken, accountEmail: account })
          // Re-read the latest project shape so concurrent edits to other
          // google fields (e.g. driveFolderId) aren't clobbered by a stale
          // snapshot. Mirrors the failure branch.
          const latest = store.get().projects.find(p => p.id === projectId)
          if (!latest) return
          // setProject triggers syncProjectToken → propagates to siblings sharing accountEmail.
          store.setProject(projectId, {
            google: {
              ...latest.google,
              token: result.token,
              tokenExpiresAt: result.tokenExpiresAt,
              ...(result.refreshToken ? { refreshToken: result.refreshToken } : {}),
              refreshError: undefined,
            },
          })
        } catch (err: any) {
          const code = err?.code || err?.message || 'refresh_failed'
          // Re-read the latest project shape so we don't clobber concurrent edits.
          const latest = store.get().projects.find(p => p.id === projectId)
          if (latest) {
            store.setProject(projectId, {
              google: { ...latest.google, refreshError: { at: Date.now(), code: String(code) } },
            })
          }
        } finally {
          inFlight.delete(flightKey)
        }
      })()
      inFlight.set(flightKey, task)
    }
    tasks.push(task)
  }

  await Promise.allSettled(tasks)
}
