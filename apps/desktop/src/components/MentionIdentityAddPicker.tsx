import { useMemo, useRef, useState } from 'react'
import type { GitLabMentionUser, MentionIdentity, SlackMentionUser } from '@shared/types'
import { useI18n } from '@/lib/i18n'
import { useClickOutside } from '@/lib/useClickOutside'

interface MentionIdentityAddPickerProps {
  slackUsers: SlackMentionUser[]
  gitlabUsers: GitLabMentionUser[]
  mentionIdentities: MentionIdentity[]
  onAdd(seed?: Partial<MentionIdentity>): void
}

interface AddOption {
  key: string
  provider: 'slack' | 'gitlab'
  label: string
  hint: string
  seed: Partial<MentionIdentity>
}

const MAX_OPTIONS = 200

export function MentionIdentityAddPicker({ slackUsers, gitlabUsers, mentionIdentities, onAdd }: MentionIdentityAddPickerProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  useClickOutside(rootRef, () => setOpen(false), open)

  const options: AddOption[] = useMemo(() => {
    const mappedSlackIds = new Set(mentionIdentities.map(i => i.slackUserId).filter(Boolean) as string[])
    const mappedGitlabNames = new Set(mentionIdentities.map(i => i.gitlabUsername).filter(Boolean) as string[])
    const slack = slackUsers
      .filter(u => !u.deleted && !u.isBot && !mappedSlackIds.has(u.id))
      .map<AddOption>(u => {
        const label = u.displayName || u.realName || u.name || u.id
        return {
          key: `slack:${u.id}`,
          provider: 'slack',
          label,
          hint: u.email || (u.name ? `@${u.name}` : u.id),
          seed: { displayName: label, ...(u.email ? { email: u.email } : {}), slackUserId: u.id },
        }
      })
    const gitlab = gitlabUsers
      .filter(u => (!u.state || u.state === 'active') && !mappedGitlabNames.has(u.username))
      .map<AddOption>(u => {
        const label = u.name || u.username
        return {
          key: `gitlab:${u.username}`,
          provider: 'gitlab',
          label,
          hint: u.email || `@${u.username}`,
          seed: { displayName: label, ...(u.email ? { email: u.email } : {}), gitlabUsername: u.username },
        }
      })
    return [...slack, ...gitlab].sort((a, b) => a.label.localeCompare(b.label))
  }, [slackUsers, gitlabUsers, mentionIdentities])

  const normalizedQuery = query.trim().toLowerCase()
  const filtered = normalizedQuery
    ? options.filter(opt => [opt.label, opt.hint].some(text => text.toLowerCase().includes(normalizedQuery)))
    : options
  const visible = filtered.slice(0, MAX_OPTIONS)

  function pick(seed: Partial<MentionIdentity> | undefined) {
    onAdd(seed)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
      >
        {t('settings.mentionIdentities.addPerson')}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-80 rounded border border-zinc-700 bg-zinc-950 shadow-xl">
          <div className="border-b border-zinc-800 p-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              placeholder={t('settings.mentionIdentities.searchPeople')}
              className="w-full rounded bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
            />
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => pick(undefined)}
              className="flex w-full items-center justify-between gap-2 border-b border-zinc-900 px-3 py-2 text-left text-xs text-zinc-300 hover:bg-zinc-800"
            >
              <span>+ {t('settings.mentionIdentities.addEmpty')}</span>
            </button>
            {options.length === 0 && (
              <div className="px-3 py-2 text-xs text-zinc-500">{t('settings.mentionIdentities.syncForSuggestions')}</div>
            )}
            {options.length > 0 && visible.length === 0 && (
              <div className="px-3 py-2 text-xs text-zinc-500">{t('settings.mentionIdentities.noMatch')}</div>
            )}
            {visible.map(opt => (
              <button
                key={opt.key}
                type="button"
                onClick={() => pick(opt.seed)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-zinc-800"
              >
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${opt.provider === 'slack' ? 'bg-emerald-950/60 text-emerald-300' : 'bg-sky-950/60 text-sky-300'}`}>
                  {opt.provider}
                </span>
                <span className="min-w-0 flex-1 truncate text-zinc-200">{opt.label}</span>
                <span className="min-w-0 max-w-[40%] shrink-0 truncate text-[11px] text-zinc-500">{opt.hint}</span>
              </button>
            ))}
            {filtered.length > MAX_OPTIONS && (
              <div className="px-3 py-2 text-[11px] text-zinc-500">{t('settings.mentionIdentities.refineToSeeMore')}</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
