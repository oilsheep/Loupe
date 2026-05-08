import type { PublishTemplateConfig, PublishTemplateTarget } from './types'

export const DEFAULT_PUBLISH_TEMPLATES: Record<PublishTemplateTarget, Required<PublishTemplateConfig>> = {
  slack: {
    title: '[{{severityLabel}}] {{note}}',
    session: 'Loupe QA Export\nBuild: {{buildVersion}}\nProject: {{project}}\nTester: {{tester}}\nMarkers: {{markerCount}}',
    marker: '[{{severityLabel}}] {{note}}\nPriority: {{priority}}\nOwner: {{owner}}\nVideo: {{videoPath}}',
  },
  gitlab: {
    title: '[{{severityLabel}}] {{note}}',
    session: 'Loupe QA Export\nBuild: {{buildVersion}}\nProject: {{project}}\nTester: {{tester}}\nMarkers: {{markerCount}}',
    marker: 'Severity: {{severityLabel}}\nNote: {{note}}\nPriority: {{priority}}\nOwner: {{owner}}\nVideo: {{videoPath}}',
  },
  'google-drive': {
    title: '[{{severityLabel}}] {{note}}',
    session: 'Loupe QA Export\nBuild: {{buildVersion}}\nProject: {{project}}\nTester: {{tester}}\nMarkers: {{markerCount}}',
    marker: '[{{severityLabel}}] {{note}}\nPriority: {{priority}}\nOwner: {{owner}}',
  },
  local: {
    title: '[{{severityLabel}}] {{note}}',
    session: 'Loupe QA Export\nBuild: {{buildVersion}}\nProject: {{project}}\nTester: {{tester}}\nMarkers: {{markerCount}}',
    marker: '[{{severityLabel}}] {{note}}\nPriority: {{priority}}\nOwner: {{owner}}\nVideo: {{videoPath}}',
  },
}

export function publishTemplateWithDefaults(target: PublishTemplateTarget, template?: PublishTemplateConfig): Required<PublishTemplateConfig> {
  const defaults = DEFAULT_PUBLISH_TEMPLATES[target]
  return {
    title: template?.title ?? defaults.title,
    session: template?.session ?? defaults.session,
    marker: template?.marker ?? defaults.marker,
  }
}
