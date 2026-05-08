import type { PublishTemplateConfig, PublishTemplateTarget } from './types'

export const DEFAULT_PUBLISH_TEMPLATES: Record<PublishTemplateTarget, Required<PublishTemplateConfig>> = {
  slack: {
    title: '【{{severityLabel}}】{{project}}：{{note}} ({{分類}})',
    session: 'Loupe QA Export\nBuild: {{buildVersion}}\nProject: {{project}}\nTester: {{tester}}\nMarkers: {{markerCount}}',
    marker: '【{{severityLabel}}】{{project}}：{{note}} ({{分類}})\n[{{優先級}}] cc.\n\n回報人： {{回報人}}\n優先級： {{優先級}}\n狀態： {{狀態}}\n\n問題詳述：\n{{note}}',
  },
  gitlab: {
    title: '【{{severityLabel}}】{{project}}：{{note}} ({{分類}})',
    session: 'Loupe QA Export\nBuild: {{buildVersion}}\nProject: {{project}}\nTester: {{tester}}\nMarkers: {{markerCount}}',
    marker: '【{{severityLabel}}】{{project}}：{{note}} ({{分類}})\n\n回報人： {{回報人}}\n優先級： {{優先級}}\n狀態： {{狀態}}\n\n問題詳述：\n{{note}}\n\nVideo: {{videoPath}}',
  },
  'google-drive': {
    title: '【{{severityLabel}}】{{project}}：{{note}} ({{分類}})',
    session: 'Loupe QA Export\nBuild: {{buildVersion}}\nProject: {{project}}\nTester: {{tester}}\nMarkers: {{markerCount}}',
    marker: '【{{severityLabel}}】{{project}}：{{note}} ({{分類}})\n回報人： {{回報人}}\n優先級： {{優先級}}\n狀態： {{狀態}}\n問題詳述： {{note}}',
  },
  local: {
    title: '【{{severityLabel}}】{{project}}：{{note}} ({{分類}})',
    session: 'Loupe QA Export\nBuild: {{buildVersion}}\nProject: {{project}}\nTester: {{tester}}\nMarkers: {{markerCount}}',
    marker: '【{{severityLabel}}】{{project}}：{{note}} ({{分類}})\n回報人： {{回報人}}\n優先級： {{優先級}}\n狀態： {{狀態}}\n問題詳述： {{note}}\nVideo: {{videoPath}}',
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
