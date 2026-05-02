import { useEffect } from 'react'
import { useApp } from '@/lib/store'
import { api } from '@/lib/api'
import { Home } from '@/routes/Home'
import { Recording } from '@/routes/Recording'
import { Draft } from '@/routes/Draft'
import { ToolStatus } from '@/routes/ToolStatus'
import { I18nProvider } from '@/lib/i18n'

export default function App() {
  const view = useApp(s => s.view)
  useEffect(() => {
    function isTextEntry(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false
      return Boolean(target.closest('input,textarea,select,[contenteditable="true"]'))
    }
    const onFocusIn = (event: FocusEvent) => {
      if (isTextEntry(event.target)) void api.hotkey.setEnabled(false)
    }
    const onFocusOut = (event: FocusEvent) => {
      if (isTextEntry(event.target)) void api.hotkey.setEnabled(true)
    }
    window.addEventListener('focusin', onFocusIn)
    window.addEventListener('focusout', onFocusOut)
    return () => {
      window.removeEventListener('focusin', onFocusIn)
      window.removeEventListener('focusout', onFocusOut)
      void api.hotkey.setEnabled(true)
    }
  }, [])
  return (
    <I18nProvider>
      {view.name === 'home' && <Home />}
      {view.name === 'tools' && <ToolStatus />}
      {view.name === 'recording' && <Recording session={view.session} />}
      {view.name === 'draft' && <Draft sessionId={view.sessionId} />}
    </I18nProvider>
  )
}
