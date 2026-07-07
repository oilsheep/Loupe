export function SlackIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 122.8 122.8" width="18" height="18" className={className} aria-hidden="true">
      <path fill="#e01e5a" d="M25.8 77.6a12.9 12.9 0 1 1-12.9-12.9h12.9zm6.5 0a12.9 12.9 0 0 1 25.8 0v32.3a12.9 12.9 0 0 1-25.8 0z"/>
      <path fill="#36c5f0" d="M45.2 25.8a12.9 12.9 0 1 1 12.9-12.9v12.9zm0 6.5a12.9 12.9 0 0 1 0 25.8H12.9a12.9 12.9 0 0 1 0-25.8z"/>
      <path fill="#2eb67d" d="M97 45.2a12.9 12.9 0 1 1 12.9 12.9H97zm-6.5 0a12.9 12.9 0 0 1-25.8 0V12.9a12.9 12.9 0 0 1 25.8 0z"/>
      <path fill="#ecb22e" d="M77.6 97a12.9 12.9 0 1 1-12.9 12.9V97zm0-6.5a12.9 12.9 0 0 1 0-25.8h32.3a12.9 12.9 0 0 1 0 25.8z"/>
    </svg>
  )
}

// TODO before ship: swap in the official GitLab tanuki SVG (this is an approximation).
export function GitLabIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 25 24" width="18" height="18" className={className} aria-hidden="true">
      <path fill="#e24329" d="M24.51 9.45l-.03-.09-3.4-8.87a.9.9 0 0 0-1.68.03l-2.3 7.02H8.16l-2.3-7.02a.9.9 0 0 0-1.68-.03L.78 9.36l-.04.09a6.3 6.3 0 0 0 2.09 7.28l.04.03 5.17 3.87 2.56 1.94 1.56 1.18a1.04 1.04 0 0 0 1.26 0l1.56-1.18 2.56-1.94 5.21-3.9a6.3 6.3 0 0 0 2.01-7.28z"/>
      <path fill="#fc6d26" d="M24.51 9.45l-.03-.09a11.46 11.46 0 0 0-4.57 2.05l-7.42 5.62 4.73 3.58 7.3-5.48a6.3 6.3 0 0 0 1.99-5.68z"/>
      <path fill="#fca326" d="M7.72 20.61l2.56 1.94 1.56 1.18a1.04 1.04 0 0 0 1.26 0l1.56-1.18 2.56-1.94-4.73-3.58z"/>
      <path fill="#fc6d26" d="M5.07 11.41A11.46 11.46 0 0 0 .49 9.36l-.04.09a6.3 6.3 0 0 0 2.09 7.28l.04.03 5.17 3.87 4.73-3.58z"/>
    </svg>
  )
}

export function GoogleDriveIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 87.3 78" width="20" height="20" preserveAspectRatio="xMidYMid meet" className={className} aria-hidden="true">
      <path fill="#0066da" d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z"/>
      <path fill="#00ac47" d="M43.65 25L29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z"/>
      <path fill="#ea4335" d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 11.5z"/>
      <path fill="#00832d" d="M43.65 25L57.4 1.2c-1.35-.8-2.9-1.2-4.5-1.2H34.4c-1.6 0-3.15.45-4.5 1.2z"/>
      <path fill="#2684fc" d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"/>
      <path fill="#ffba00" d="M73.4 26.5L60.7 4.5c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25l16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z"/>
    </svg>
  )
}
