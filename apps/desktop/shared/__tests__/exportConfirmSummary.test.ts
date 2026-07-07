import { describe, it, expect } from 'vitest'
import { exportConfirmSummary } from '../exportConfirmSummary'

describe('exportConfirmSummary', () => {
  it('no targets → local tone, empty labels', () => {
    expect(exportConfirmSummary({ slack: false, gitlab: false, googleDrive: false }))
      .toEqual({ hasTarget: false, targetLabels: [], tone: 'local' })
  })
  it('one target → publish tone', () => {
    expect(exportConfirmSummary({ slack: true, gitlab: false, googleDrive: false }))
      .toEqual({ hasTarget: true, targetLabels: ['Slack'], tone: 'publish' })
  })
  it('all targets → fixed Slack, GitLab, Google Drive order', () => {
    expect(exportConfirmSummary({ slack: true, gitlab: true, googleDrive: true }).targetLabels)
      .toEqual(['Slack', 'GitLab', 'Google Drive'])
  })
})
