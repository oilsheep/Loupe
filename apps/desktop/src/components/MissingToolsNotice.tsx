import { useI18n } from '@/lib/i18n'
import type { ToolCheck } from '@shared/types'

interface MissingToolsNoticeProps {
  missingTools: ToolCheck[]
  onOpenTools(): void
}

export function MissingToolsNotice({ missingTools, onOpenTools }: MissingToolsNoticeProps) {
  const { t } = useI18n()
  if (missingTools.length === 0) return null

  return (
    <button
      type="button"
      onClick={onOpenTools}
      className="mb-4 block w-full border border-yellow-800 bg-yellow-950/30 px-3 py-2 text-left text-xs leading-5 text-yellow-100 hover:bg-yellow-950/50"
    >
      <span className="font-medium">{t('home.toolStatusMissing', { count: missingTools.length })}</span>
      <span className="ml-2 text-yellow-200/70">{missingTools.map(check => check.name).join(', ')}</span>
    </button>
  )
}
