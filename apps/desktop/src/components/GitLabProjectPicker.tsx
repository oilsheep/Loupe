import { useRef, useState } from 'react'
import type { GitLabProject } from '@shared/types'
import { useI18n } from '@/lib/i18n'
import { useClickOutside } from '@/lib/useClickOutside'

interface GitLabProjectPickerProps {
  projects: GitLabProject[]
  value: string
  disabled?: boolean
  loading?: boolean
  onOpen?(): void
  onChange(projectId: string): void
}

export function GitLabProjectPicker({ projects, value, disabled = false, loading = false, onOpen, onChange }: GitLabProjectPickerProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = projects.find(project => project.pathWithNamespace === value)
  const normalizedQuery = query.trim().toLowerCase()
  const filteredProjects = normalizedQuery
    ? projects.filter(project => [
        project.name,
        project.nameWithNamespace,
        project.pathWithNamespace,
      ].some(text => text.toLowerCase().includes(normalizedQuery)))
    : projects
  const canUseQuery = query.trim() && !projects.some(project => project.pathWithNamespace === query.trim())

  useClickOutside(rootRef, () => setOpen(false), open)

  function toggleOpen() {
    if (disabled) return
    setOpen(prev => {
      const next = !prev
      if (next) {
        setQuery(value)
        onOpen?.()
      }
      return next
    })
  }

  function commitProject(projectId: string) {
    onChange(projectId)
    setQuery(projectId)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative mt-1" data-row-click-ignore="true">
      <button
        type="button"
        disabled={disabled}
        onClick={toggleOpen}
        className="flex w-full items-center justify-between gap-2 rounded bg-zinc-950 px-3 py-2 text-left text-sm text-zinc-200 outline-none hover:bg-zinc-900 focus:ring-1 focus:ring-blue-600 disabled:opacity-50"
      >
        <span className="min-w-0 truncate">{selected ? selected.nameWithNamespace : (value || (loading ? t('picker.loadingProjects') : t('picker.selectProject')))}</span>
        <span className="shrink-0 text-zinc-500">v</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded border border-zinc-700 bg-zinc-950 shadow-xl">
          <div className="border-b border-zinc-800 p-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && query.trim()) commitProject(query.trim())
              }}
              autoFocus
              placeholder={t('picker.searchProjects')}
              className="w-full rounded bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
            />
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            {loading && (
              <div className="px-3 py-2 text-sm text-zinc-500">{t('picker.loadingProjects')}</div>
            )}
            {!loading && canUseQuery && (
              <button
                type="button"
                onClick={() => commitProject(query.trim())}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-blue-100 hover:bg-zinc-800"
              >
                <span className="min-w-0 truncate">{t('picker.useCustom', { value: query.trim() })}</span>
                <span className="shrink-0 text-[11px] text-zinc-500">{t('picker.customTag')}</span>
              </button>
            )}
            {!loading && filteredProjects.length === 0 && !canUseQuery && (
              <div className="px-3 py-2 text-sm text-zinc-500">{projects.length === 0 ? t('picker.noProjectsLoaded') : t('picker.noMatchingProjects')}</div>
            )}
            {filteredProjects.map(project => (
              <button
                key={project.id}
                type="button"
                onClick={() => commitProject(project.pathWithNamespace)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-zinc-800 ${project.pathWithNamespace === value ? 'bg-blue-950/60 text-blue-100' : 'text-zinc-200'}`}
              >
                <span className="min-w-0 truncate">{project.nameWithNamespace}</span>
                <span className="max-w-32 shrink-0 truncate text-[11px] text-zinc-500">{project.pathWithNamespace}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
