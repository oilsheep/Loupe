import React, { useState } from 'react'
import { useI18n } from '@/lib/i18n'
import type { ProjectSettings } from '@shared/types'

export interface AddProjectDialogProps {
  open: boolean
  existingProjects: ProjectSettings[]
  onClose: () => void
  onSubmit: (args: { name: string; duplicateFromId?: string }) => Promise<void>
}

export function AddProjectDialog({ open, existingProjects, onClose, onSubmit }: AddProjectDialogProps) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [duplicateFromId, setDuplicateFromId] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)

  if (!open) return null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError(t('preferences.projectNameRequired'))
      return
    }
    if (existingProjects.some(p => p.name === trimmed)) {
      setError(t('preferences.projectNameTaken'))
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await onSubmit({ name: trimmed, duplicateFromId: duplicateFromId || undefined })
      setName('')
      setDuplicateFromId('')
      onClose()
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <form onSubmit={submit} className="w-96 rounded border border-zinc-700 bg-zinc-900 p-4">
        <h2 className="text-sm font-semibold text-zinc-200">{t('preferences.addProjectTitle')}</h2>
        <label className="mt-3 block text-xs text-zinc-500">
          {t('preferences.projectName')}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Cytus"
            autoFocus
            className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600"
          />
        </label>
        <label className="mt-3 block text-xs text-zinc-500">
          {t('preferences.duplicateFrom')}
          <select
            value={duplicateFromId}
            onChange={(e) => setDuplicateFromId(e.target.value)}
            className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600"
          >
            <option value="">{t('preferences.startBlank')}</option>
            {existingProjects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700">{t('common.cancel')}</button>
          <button type="submit" disabled={submitting} className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-500 disabled:opacity-50">
            {submitting ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </form>
    </div>
  )
}
