import { useApp } from '@/lib/store'
import { Home } from '@/routes/Home'
import { Recording } from '@/routes/Recording'
import { Draft } from '@/routes/Draft'

export default function App() {
  const view = useApp(s => s.view)
  if (view.name === 'home') return <Home />
  if (view.name === 'recording') return <Recording session={view.session} />
  if (view.name === 'draft') return <Draft sessionId={view.sessionId} />
  return null
}
