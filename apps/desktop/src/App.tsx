import { useEffect } from 'react'
import { useApp } from '@/lib/store'
import { api } from '@/lib/api'
import { Home } from '@/routes/Home'
import { Recording } from '@/routes/Recording'
import { Draft } from '@/routes/Draft'

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
  if (view.name === 'home') return <Home />
  if (view.name === 'recording') return <Recording session={view.session} />
  if (view.name === 'draft') return <Draft sessionId={view.sessionId} />
  return null
}
