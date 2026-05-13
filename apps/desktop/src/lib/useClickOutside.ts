import { useEffect, useRef, type RefObject } from 'react'

export function useClickOutside(ref: RefObject<HTMLElement>, onOutside: () => void, enabled: boolean): void {
  const callbackRef = useRef(onOutside)
  callbackRef.current = onOutside
  useEffect(() => {
    if (!enabled) return
    function onDoc(event: globalThis.MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) callbackRef.current()
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [enabled, ref])
}
