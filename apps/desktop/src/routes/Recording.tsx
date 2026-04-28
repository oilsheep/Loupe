import type { Session } from '@shared/types'
export function Recording({ session }: { session: Session }) {
  return <div className="p-8 text-zinc-100">Recording: {session.id}</div>
}
