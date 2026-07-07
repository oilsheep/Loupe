import type { ExportQuality } from '@shared/exportQuality'
import { DEFAULT_EXPORT_QUALITY, EXPORT_QUALITY_TIER_OPTIONS, normalizeExportQuality, toCustomQuality } from '@shared/exportQuality'
import { useI18n } from '@/lib/i18n'
import { SEG_ACTIVE, SEG_IDLE } from '@/lib/controlStyles'

const PRESETS = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow']

function ResetIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  )
}

export function QualitySelector({ value, onChange }: { value: ExportQuality; onChange(next: ExportQuality): void }) {
  const { t } = useI18n()
  // balanced (veryfast/crf 20) is the default and equals the legacy hard-coded
  // encode, so a preset tier of 'balanced' is fully "at default".
  const isDefault = value.tier === DEFAULT_EXPORT_QUALITY.tier
  return (
    <div className="text-xs text-zinc-400">
      <div className="mb-1 flex items-center gap-2">
        <span className="font-medium text-zinc-300">{t('export.quality')}</span>
        {!isDefault && (
          <button
            type="button"
            data-testid="quality-reset"
            onClick={() => onChange({ ...DEFAULT_EXPORT_QUALITY })}
            title={t('export.quality.reset')}
            aria-label={t('export.quality.reset')}
            className="ml-auto shrink-0 rounded p-1 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200"
          >
            <ResetIcon />
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {EXPORT_QUALITY_TIER_OPTIONS.map((tier) => (
          <button
            key={tier}
            type="button"
            data-testid={`quality-tier-${tier}`}
            onClick={() => onChange(tier === 'custom' ? toCustomQuality(value) : normalizeExportQuality({ tier }))}
            className={`rounded px-2 py-1 ${value.tier === tier ? SEG_ACTIVE : SEG_IDLE}`}
          >
            {t(`export.quality.${tier}`)}
            {tier === DEFAULT_EXPORT_QUALITY.tier && <span className="ml-1 text-[10px] opacity-70">({t('export.quality.default')})</span>}
          </button>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-zinc-500">{t('export.quality.hint')}</p>
      {value.tier === 'custom' && (
        <div className="mt-2 grid grid-cols-2 gap-2" data-testid="quality-advanced">
          <label className="block">
            <span className="block text-zinc-400">{t('export.quality.preset')}</span>
            <select
              value={value.preset}
              onChange={(e) => onChange(normalizeExportQuality({ tier: 'custom', preset: e.target.value, crf: value.crf }))}
              className="mt-1 w-full rounded bg-zinc-950 px-2 py-1 text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
            >
              {PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-zinc-400">{t('export.quality.crf')}</span>
            <input
              type="number"
              min={0}
              max={51}
              value={value.crf}
              onChange={(e) => onChange(normalizeExportQuality({ tier: 'custom', preset: value.preset, crf: Number(e.target.value) }))}
              className="mt-1 w-full rounded bg-zinc-950 px-2 py-1 text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
            />
          </label>
        </div>
      )}
    </div>
  )
}
