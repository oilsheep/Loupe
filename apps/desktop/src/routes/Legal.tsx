import { useMemo } from 'react'
import { useApp } from '@/lib/store'
import { useI18n } from '@/lib/i18n'

interface ThirdPartyItem {
  name: string
  license: string
  usageKey: string
  distributionKey: string
  source: string
}

interface ThirdPartySection {
  titleKey: string
  items: ThirdPartyItem[]
}

const THIRD_PARTY_SECTIONS: ThirdPartySection[] = [
  {
    titleKey: 'legal.section.app',
    items: [
      {
        name: 'Electron',
        license: 'MIT',
        usageKey: 'legal.usage.electron',
        distributionKey: 'legal.distribution.includeLicense',
        source: 'https://github.com/electron/electron',
      },
      {
        name: 'React / React DOM',
        license: 'MIT',
        usageKey: 'legal.usage.react',
        distributionKey: 'legal.distribution.includeLicense',
        source: 'https://react.dev',
      },
      {
        name: 'Zustand',
        license: 'MIT',
        usageKey: 'legal.usage.zustand',
        distributionKey: 'legal.distribution.includeLicense',
        source: 'https://github.com/pmndrs/zustand',
      },
      {
        name: 'better-sqlite3',
        license: 'MIT',
        usageKey: 'legal.usage.sqlite',
        distributionKey: 'legal.distribution.includeLicense',
        source: 'https://github.com/WiseLibs/better-sqlite3',
      },
      {
        name: 'FFmpeg / @ffmpeg-installer/ffmpeg',
        license: 'LGPL / GPL depending on bundled build',
        usageKey: 'legal.usage.ffmpeg',
        distributionKey: 'legal.distribution.ffmpeg',
        source: 'https://ffmpeg.org',
      },
    ],
  },
  {
    titleKey: 'legal.section.tools',
    items: [
      {
        name: 'Android SDK Platform Tools / adb',
        license: 'Android SDK Platform Tools license',
        usageKey: 'legal.usage.adb',
        distributionKey: 'legal.distribution.platformTools',
        source: 'https://developer.android.com/tools/releases/platform-tools',
      },
      {
        name: 'scrcpy',
        license: 'Apache-2.0',
        usageKey: 'legal.usage.scrcpy',
        distributionKey: 'legal.distribution.includeLicense',
        source: 'https://github.com/Genymobile/scrcpy',
      },
      {
        name: 'UxPlay',
        license: 'GPL-3.0',
        usageKey: 'legal.usage.uxplay',
        distributionKey: 'legal.distribution.gpl',
        source: 'https://github.com/FDH2/UxPlay',
      },
      {
        name: 'go-ios',
        license: 'MIT',
        usageKey: 'legal.usage.goIos',
        distributionKey: 'legal.distribution.includeLicense',
        source: 'https://github.com/danielpaulus/go-ios',
      },
    ],
  },
  {
    titleKey: 'legal.section.speech',
    items: [
      {
        name: 'whisper.cpp',
        license: 'MIT',
        usageKey: 'legal.usage.whisperCpp',
        distributionKey: 'legal.distribution.includeLicense',
        source: 'https://github.com/ggml-org/whisper.cpp',
      },
      {
        name: 'faster-whisper',
        license: 'MIT',
        usageKey: 'legal.usage.fasterWhisper',
        distributionKey: 'legal.distribution.includeLicense',
        source: 'https://github.com/SYSTRAN/faster-whisper',
      },
      {
        name: 'CTranslate2',
        license: 'MIT',
        usageKey: 'legal.usage.ctranslate2',
        distributionKey: 'legal.distribution.includeLicense',
        source: 'https://github.com/OpenNMT/CTranslate2',
      },
      {
        name: 'Systran/faster-whisper-small model',
        license: 'Model card license / upstream terms',
        usageKey: 'legal.usage.whisperModel',
        distributionKey: 'legal.distribution.model',
        source: 'https://huggingface.co/Systran/faster-whisper-small',
      },
    ],
  },
  {
    titleKey: 'legal.section.services',
    items: [
      {
        name: 'Slack API',
        license: 'Slack API Terms',
        usageKey: 'legal.usage.slack',
        distributionKey: 'legal.distribution.serviceTerms',
        source: 'https://api.slack.com/terms',
      },
      {
        name: 'Google APIs',
        license: 'Google API Services terms',
        usageKey: 'legal.usage.google',
        distributionKey: 'legal.distribution.serviceTerms',
        source: 'https://developers.google.com/terms',
      },
      {
        name: 'GitLab API',
        license: 'GitLab terms and API documentation',
        usageKey: 'legal.usage.gitlab',
        distributionKey: 'legal.distribution.serviceTerms',
        source: 'https://docs.gitlab.com/api/',
      },
    ],
  },
]

export function Legal() {
  const { t } = useI18n()
  const goHome = useApp(s => s.goHome)
  const totalItems = useMemo(
    () => THIRD_PARTY_SECTIONS.reduce((count, section) => count + section.items.length, 0),
    [],
  )

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={goHome}
              className="text-xs text-zinc-400 hover:text-zinc-200"
            >
              {t('legal.backHome')}
            </button>
            <h1 className="mt-2 text-xl font-semibold">{t('legal.title')}</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-500">{t('legal.subtitle')}</p>
          </div>
          <div className="shrink-0 border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-right">
            <div className="text-xs uppercase tracking-wide text-zinc-500">{t('legal.total')}</div>
            <div className="mt-1 font-mono text-2xl text-zinc-100">{totalItems}</div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 p-6">
        <section className="border border-yellow-900/70 bg-yellow-950/20 p-4">
          <h2 className="text-sm font-semibold text-yellow-100">{t('legal.noticeTitle')}</h2>
          <p className="mt-2 text-sm leading-6 text-yellow-100/80">{t('legal.noticeBody')}</p>
        </section>

        {THIRD_PARTY_SECTIONS.map(section => (
          <section key={section.titleKey} className="space-y-3">
            <h2 className="text-sm font-semibold text-zinc-200">{t(section.titleKey)}</h2>
            <div className="grid gap-3 lg:grid-cols-2">
              {section.items.map(item => (
                <article key={item.name} className="border border-zinc-800 bg-zinc-900/35 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="min-w-0 break-words text-base font-semibold text-zinc-100">{item.name}</h3>
                    <span className="shrink-0 rounded bg-zinc-950 px-2 py-1 font-mono text-[11px] text-zinc-300">
                      {item.license}
                    </span>
                  </div>
                  <dl className="mt-3 space-y-3 text-sm leading-6">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-zinc-500">{t('legal.usedFor')}</dt>
                      <dd className="mt-1 text-zinc-300">{t(item.usageKey)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-zinc-500">{t('legal.distribution')}</dt>
                      <dd className="mt-1 text-zinc-400">{t(item.distributionKey)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-zinc-500">{t('legal.source')}</dt>
                      <dd className="mt-1">
                        <a
                          href={item.source}
                          target="_blank"
                          rel="noreferrer"
                          className="break-all text-blue-300 hover:text-blue-200"
                        >
                          {item.source}
                        </a>
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  )
}
