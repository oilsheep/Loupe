export interface ExportConfirmSummary {
  hasTarget: boolean
  targetLabels: string[]
  tone: 'publish' | 'local'
}

// Brand names are proper nouns (not translated); the surrounding phrase is i18n'd in the UI.
export function exportConfirmSummary(targets: { slack: boolean; gitlab: boolean; googleDrive: boolean }): ExportConfirmSummary {
  const targetLabels: string[] = []
  if (targets.slack) targetLabels.push('Slack')
  if (targets.gitlab) targetLabels.push('GitLab')
  if (targets.googleDrive) targetLabels.push('Google Drive')
  const hasTarget = targetLabels.length > 0
  return { hasTarget, targetLabels, tone: hasTarget ? 'publish' : 'local' }
}
