import { describe, expect, it } from 'vitest'
import { normalizeTranscriptJson } from '../audio-analysis/transcript'
import { transcriptToMarkerSuggestions } from '../audio-analysis/classifier'
import type { SeveritySettings } from '@shared/types'

describe('audio analysis transcript normalization', () => {
  it('normalizes whisper.cpp transcription offsets and tokens', () => {
    const segments = normalizeTranscriptJson({
      transcription: [
        {
          offsets: { from: 1200, to: 4500 },
          text: 'this is broken',
          tokens: [
            { offsets: { from: 1200, to: 2000 }, text: 'this' },
            { offsets: { from: 3500, to: 4000 }, text: 'is' },
            { offsets: { from: 4000, to: 4500 }, text: 'broken' },
          ],
        },
        { timestamps: { from: '00:00:05.000', to: '00:00:06.000' }, text: 'UI animation is slow' },
      ],
    })

    expect(segments).toEqual([
      {
        startMs: 1200,
        endMs: 4500,
        text: 'this is broken',
        tokens: [
          { startMs: 1200, endMs: 2000, text: 'this' },
          { startMs: 3500, endMs: 4000, text: 'is' },
          { startMs: 4000, endMs: 4500, text: 'broken' },
        ],
      },
      { startMs: 5000, endMs: 6000, text: 'UI animation is slow' },
    ])
  })
})

describe('audio marker classification', () => {
  const severities: SeveritySettings = {
    note: { label: 'note', color: '#a1a1aa' },
    major: { label: 'Critical', color: '#ff4d4f' },
    normal: { label: 'Bug', color: '#f59e0b' },
    minor: { label: 'Polish', color: '#22b8f0' },
    improvement: { label: 'Note', color: '#22c55e' },
    custom1: { label: '', color: '#8b5cf6' },
    custom2: { label: '', color: '#ec4899' },
    custom3: { label: '', color: '#14b8a6' },
    custom4: { label: '', color: '#eab308' },
  }

  it('does not create markers from QA speech without an explicit command', () => {
    const suggestions = transcriptToMarkerSuggestions([
      { startMs: 0, endMs: 1000, text: 'critical crash' },
      { startMs: 2000, endMs: 3000, text: 'there is a bug here' },
      { startMs: 4000, endMs: 5000, text: 'UI animation feels slow polish' },
      { startMs: 6000, endMs: 7000, text: 'note this for later' },
    ], { severities })

    expect(suggestions).toEqual([])
  })

  it('recognizes common faster-whisper romanizations of Chinese trigger words and bug labels', () => {
    const suggestions = transcriptToMarkerSuggestions([
      {
        startMs: 0,
        endMs: 61_000,
        text: 'Ziru note, Ziru pack, Ziru note.',
        tokens: [
          { startMs: 1620, endMs: 2120, text: 'Z' },
          { startMs: 2120, endMs: 2200, text: 'ir' },
          { startMs: 2200, endMs: 2320, text: 'u' },
          { startMs: 2320, endMs: 2580, text: 'note,' },
          { startMs: 7770, endMs: 8030, text: 'Z' },
          { startMs: 8030, endMs: 8170, text: 'ir' },
          { startMs: 8170, endMs: 8250, text: 'u' },
          { startMs: 8250, endMs: 8590, text: 'pack,' },
          { startMs: 11_870, endMs: 12_110, text: 'Z' },
          { startMs: 12_110, endMs: 12_250, text: 'ir' },
          { startMs: 12_250, endMs: 12_370, text: 'u' },
          { startMs: 12_370, endMs: 12_610, text: 'note.' },
        ],
      },
    ], { severities })

    expect(suggestions).toHaveLength(3)
    expect(suggestions.map(s => s.severity)).toEqual(['improvement', 'normal', 'improvement'])
    expect(suggestions.map(s => s.offsetMs)).toEqual([1620, 7770, 11_870])
  })

  it('matches simplified Chinese ASR output for user-defined traditional trigger keywords', () => {
    const suggestions = transcriptToMarkerSuggestions([
      {
        startMs: 0,
        endMs: 18_000,
        text: '\u6807\u8bb0 Bug button freezes',
        tokens: [
          { startMs: 4000, endMs: 4500, text: '\u6807\u8bb0' },
          { startMs: 4550, endMs: 4900, text: 'Bug' },
          { startMs: 5000, endMs: 7000, text: 'button freezes' },
        ],
      },
    ], { severities, triggerKeywords: '\u6a19\u8a18' })

    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]).toMatchObject({
      offsetMs: 4000,
      severity: 'normal',
      note: 'button freezes',
    })
  })

  it('matches current faster-whisper Chinese variants from real sessions', () => {
    const suggestions = transcriptToMarkerSuggestions([
      {
        startMs: 3470,
        endMs: 15140,
        text: '\u8bb0\u5f55note,\u8bb0\u5f55note,\u8bb0\u5f55note,\u8bb0\u5f55pullage,\u8bb0\u5f55critical',
        tokens: [
          { startMs: 3470, endMs: 3800, text: '\u8bb0\u5f55' },
          { startMs: 3800, endMs: 4200, text: 'note' },
          { startMs: 5200, endMs: 5600, text: '\u8bb0\u5f55' },
          { startMs: 5600, endMs: 6000, text: 'note' },
          { startMs: 7200, endMs: 7600, text: '\u8bb0\u5f55' },
          { startMs: 7600, endMs: 8000, text: 'note' },
          { startMs: 9400, endMs: 9800, text: '\u8bb0\u5f55' },
          { startMs: 9800, endMs: 10_400, text: 'pullage' },
          { startMs: 12_000, endMs: 12_400, text: '\u8bb0\u5f55' },
          { startMs: 12_400, endMs: 13_100, text: 'critical' },
        ],
      },
    ], { severities, triggerKeywords: '\u8a18\u9304, \u7d00\u9304' })

    expect(suggestions.map(s => s.severity)).toEqual(['improvement', 'improvement', 'improvement', 'minor', 'major'])
    expect(suggestions.map(s => s.offsetMs)).toEqual([3470, 5200, 7200, 9400, 12_000])
  })

  it('matches live custom labels with traditional and simplified Chinese variants', () => {
    const configured = {
      ...severities,
      custom1: { label: '\u6f14\u51fa', color: '#8b5cf6' },
      custom2: { label: '\u7f8e\u8853', color: '#ec4899' },
    }

    const suggestions = transcriptToMarkerSuggestions([
      {
        startMs: 8000,
        endMs: 13_000,
        text: '\u8a18\u9304\u6f14\u51fa',
        tokens: [
          { startMs: 8200, endMs: 8600, text: '\u8a18\u9304' },
          { startMs: 8600, endMs: 9100, text: '\u6f14\u51fa' },
        ],
      },
      {
        startMs: 14_000,
        endMs: 20_000,
        text: '\u8bb0\u5f55\u7f8e\u672f \u8bb0\u5f55bug',
        tokens: [
          { startMs: 14_300, endMs: 14_700, text: '\u8bb0\u5f55' },
          { startMs: 14_700, endMs: 15_200, text: '\u7f8e\u672f' },
          { startMs: 17_000, endMs: 17_400, text: '\u8bb0\u5f55' },
          { startMs: 17_400, endMs: 17_800, text: 'bug' },
        ],
      },
    ], { severities: configured, triggerKeywords: '\u8a18\u9304, \u7d00\u9304' })

    expect(suggestions.map(s => s.severity)).toEqual(['custom1', 'custom2', 'normal'])
    expect(suggestions.map(s => s.offsetMs)).toEqual([8200, 14_300, 17_000])
  })

  it('matches live ASR trigger aliases such as zilu note', () => {
    const suggestions = transcriptToMarkerSuggestions([
      {
        startMs: 0,
        endMs: 5000,
        text: 'Zilu Note',
        tokens: [
          { startMs: 900, endMs: 1200, text: 'Zilu' },
          { startMs: 1200, endMs: 1600, text: 'Note' },
        ],
      },
    ], { severities, triggerKeywords: '\u8a18\u9304, \u7d00\u9304' })

    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]).toMatchObject({
      offsetMs: 900,
      severity: 'improvement',
      note: '',
    })
  })

  it('matches common live ASR trigger aliases and polish misrecognition', () => {
    const configured = {
      ...severities,
      custom1: { label: '\u6f14\u51fa', color: '#8b5cf6' },
      custom2: { label: '\u7f8e\u8853', color: '#ec4899' },
    }
    const suggestions = transcriptToMarkerSuggestions([
      {
        startMs: 0,
        endMs: 6000,
        text: '\u57fa\u7763Critical \u57fa\u7763Bug \u8bb0\u4f4fcritical',
        tokens: [
          { startMs: 700, endMs: 1100, text: '\u57fa\u7763' },
          { startMs: 1100, endMs: 1700, text: 'Critical' },
          { startMs: 3000, endMs: 3400, text: '\u57fa\u7763' },
          { startMs: 3400, endMs: 3800, text: 'Bug' },
          { startMs: 4400, endMs: 4800, text: '\u8bb0\u4f4f' },
          { startMs: 4800, endMs: 5400, text: 'critical' },
        ],
      },
      {
        startMs: 9000,
        endMs: 16_000,
        text: '\u8a18\u9304pullish \u8a18\u9304PALISH \u8a18\u9304\u6f14\u51fa',
        tokens: [
          { startMs: 9400, endMs: 9800, text: '\u8a18\u9304' },
          { startMs: 9800, endMs: 10_500, text: 'pullish' },
          { startMs: 11_000, endMs: 11_400, text: '\u8a18\u9304' },
          { startMs: 11_400, endMs: 12_100, text: 'PALISH' },
          { startMs: 13_000, endMs: 13_400, text: '\u8a18\u9304' },
          { startMs: 13_400, endMs: 13_900, text: '\u6f14\u51fa' },
        ],
      },
    ], { severities: configured, triggerKeywords: '\u8a18\u9304, \u7d00\u9304' })

    expect(suggestions.map(s => s.severity)).toEqual(['major', 'normal', 'major', 'minor', 'minor', 'custom1'])
    expect(suggestions.map(s => s.offsetMs)).toEqual([700, 3000, 4400, 9400, 11_000, 13_000])
  })

  it('matches later live ASR misrecognitions for Chinese record bug commands', () => {
    const suggestions = transcriptToMarkerSuggestions([
      {
        startMs: 0,
        endMs: 5000,
        text: '\u5730\u7344 \u5df4\u514b',
        tokens: [
          { startMs: 800, endMs: 1300, text: '\u5730\u7344' },
          { startMs: 1400, endMs: 1900, text: '\u5df4\u514b' },
        ],
      },
    ], { severities, triggerKeywords: '\u8a18\u9304, \u7d00\u9304' })

    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]).toMatchObject({
      offsetMs: 800,
      severity: 'normal',
      note: '',
    })
  })

  it('recognizes critical when faster-whisper shortens it to crito', () => {
    const suggestions = transcriptToMarkerSuggestions([
      {
        startMs: 16_740,
        endMs: 26_600,
        text: '\u8a18\u9304bug \u7576\u6a5f\u7684\u611f\u89ba \u8a18\u9304crito \u9019\u908a\u6574\u500b\u5361\u4f4f\u4e86',
        tokens: [
          { startMs: 16_740, endMs: 17_120, text: '\u8a18\u9304' },
          { startMs: 17_120, endMs: 17_480, text: 'bug' },
          { startMs: 18_700, endMs: 19_780, text: '\u7576\u6a5f\u7684\u611f\u89ba' },
          { startMs: 22_010, endMs: 22_430, text: '\u8a18\u9304' },
          { startMs: 22_430, endMs: 23_030, text: 'crito' },
          { startMs: 25_020, endMs: 26_600, text: '\u9019\u908a\u6574\u500b\u5361\u4f4f\u4e86' },
        ],
      },
    ], { severities, triggerKeywords: '\u8a18\u9304, \u7d00\u9304' })

    expect(suggestions).toHaveLength(2)
    expect(suggestions.map(s => s.severity)).toEqual(['normal', 'major'])
    expect(suggestions[0].note).toBe('\u7576\u6a5f\u7684\u611f\u89ba')
    expect(suggestions[1].note).toBe('\u9019\u908a\u6574\u500b\u5361\u4f4f\u4e86')
  })

  it('matches live short-window ASR variants for note, critical, and custom labels', () => {
    const configured = {
      ...severities,
      custom1: { label: '\u6f14\u51fa', color: '#8b5cf6' },
    }
    const suggestions = transcriptToMarkerSuggestions([
      {
        startMs: 0,
        endMs: 8000,
        text: 'Zero note \u8a18\u9304\u6f14\u51fa \u8bb0\u4f4fCREATICAL \u63a5\u4f4fNote',
        tokens: [
          { startMs: 400, endMs: 800, text: 'Zero' },
          { startMs: 800, endMs: 1200, text: 'note' },
          { startMs: 2400, endMs: 2800, text: '\u8a18\u9304' },
          { startMs: 2800, endMs: 3300, text: '\u6f14\u51fa' },
          { startMs: 4300, endMs: 4700, text: '\u8bb0\u4f4f' },
          { startMs: 4700, endMs: 5400, text: 'CREATICAL' },
          { startMs: 6200, endMs: 6600, text: '\u63a5\u4f4f' },
          { startMs: 6600, endMs: 7000, text: 'Note' },
        ],
      },
    ], { severities: configured, triggerKeywords: '\u8a18\u9304, \u7d00\u9304' })

    expect(suggestions.map(s => s.severity)).toEqual(['improvement', 'custom1', 'major', 'improvement'])
    expect(suggestions.map(s => s.offsetMs)).toEqual([400, 2400, 4300, 6200])
  })

  it('creates markers only when a trigger keyword is spoken near a label', () => {
    const [suggestion] = transcriptToMarkerSuggestions([
      {
        startMs: 10_000,
        endMs: 18_000,
        text: 'please record bug this button is stuck',
        tokens: [
          { startMs: 10_200, endMs: 10_700, text: 'please' },
          { startMs: 12_340, endMs: 12_900, text: 'record' },
          { startMs: 13_050, endMs: 13_500, text: 'bug' },
          { startMs: 14_000, endMs: 15_000, text: 'this button is stuck' },
        ],
      },
    ], { severities })

    expect(suggestion.severity).toBe('normal')
    expect(suggestion.offsetMs).toBe(12_340)
    expect(suggestion.preSec).toBe(10)
    expect(suggestion.postSec).toBe(10)
  })

  it('recognizes multilingual default trigger words near English labels', () => {
    const suggestions = transcriptToMarkerSuggestions([
      {
        startMs: 0,
        endMs: 4000,
        text: 'マーク Bug button is stuck',
        tokens: [
          { startMs: 500, endMs: 900, text: 'マーク' },
          { startMs: 950, endMs: 1300, text: 'Bug' },
          { startMs: 1400, endMs: 2400, text: 'button is stuck' },
        ],
      },
      {
        startMs: 5000,
        endMs: 9000,
        text: '마크 Critical crash',
        tokens: [
          { startMs: 5500, endMs: 5900, text: '마크' },
          { startMs: 5950, endMs: 6600, text: 'Critical' },
          { startMs: 6700, endMs: 7400, text: 'crash' },
        ],
      },
      {
        startMs: 10_000,
        endMs: 14_000,
        text: 'marcar Polish animation is rough',
        tokens: [
          { startMs: 10_500, endMs: 11_000, text: 'marcar' },
          { startMs: 11_050, endMs: 11_600, text: 'Polish' },
          { startMs: 11_700, endMs: 13_000, text: 'animation is rough' },
        ],
      },
    ], { severities })

    expect(suggestions.map(s => s.severity)).toEqual(['normal', 'major', 'minor'])
    expect(suggestions.map(s => s.offsetMs)).toEqual([500, 5500, 10_500])
    expect(suggestions.map(s => s.note)).toEqual(['button is stuck', 'crash', 'animation is rough'])
  })

  it('uses the configured trigger keyword and configured label names', () => {
    const [suggestion] = transcriptToMarkerSuggestions([
      {
        startMs: 0,
        endMs: 9000,
        text: '幫我 紀錄 阻斷 這裡不能繼續',
        tokens: [
          { startMs: 1000, endMs: 1800, text: '幫我' },
          { startMs: 2200, endMs: 2700, text: '紀錄' },
          { startMs: 3000, endMs: 3600, text: '阻斷' },
          { startMs: 4000, endMs: 6200, text: '這裡不能繼續' },
        ],
      },
    ], {
      triggerKeywords: '紀錄',
      severities: {
        ...severities,
        major: { label: '阻斷', color: '#ff4d4f' },
      },
    })

    expect(suggestion.severity).toBe('major')
    expect(suggestion.offsetMs).toBe(2200)
  })

  it('fills the note with transcript context around the marker without an audio prefix', () => {
    const [suggestion] = transcriptToMarkerSuggestions([
      { startMs: 0, endMs: 5000, text: '先進入這個頁面' },
      {
        startMs: 11_000,
        endMs: 15_000,
        text: 'record critical crash after pressing confirm',
        tokens: [
          { startMs: 11_500, endMs: 11_900, text: 'record' },
          { startMs: 12_000, endMs: 12_700, text: 'critical' },
          { startMs: 13_000, endMs: 14_000, text: 'crash after pressing confirm' },
        ],
      },
      { startMs: 17_000, endMs: 20_000, text: '後面回到首頁' },
      { startMs: 25_000, endMs: 27_000, text: 'too far away' },
    ], { severities })

    expect(suggestion.note).toBe('crash after pressing confirm 後面回到首頁')
    expect(suggestion.note).not.toContain('[Audio]')
  })

  it('splits consecutive spoken record commands into separate markers and notes', () => {
    const suggestions = transcriptToMarkerSuggestions([
      {
        startMs: 90_000,
        endMs: 108_000,
        text: 'record bug the screen flashed record note there is no sound delay feeling',
        tokens: [
          { startMs: 99_000, endMs: 99_200, text: 'record' },
          { startMs: 99_250, endMs: 99_500, text: 'bug' },
          { startMs: 99_700, endMs: 101_500, text: 'the screen flashed' },
          { startMs: 103_000, endMs: 103_200, text: 'record' },
          { startMs: 103_250, endMs: 103_500, text: 'note' },
          { startMs: 103_700, endMs: 106_000, text: 'there is no sound delay feeling' },
        ],
      },
    ], { severities })

    expect(suggestions).toHaveLength(2)
    expect(suggestions.map(s => s.severity)).toEqual(['normal', 'improvement'])
    expect(suggestions[0].offsetMs).toBe(99_000)
    expect(suggestions[1].offsetMs).toBe(103_000)
    expect(suggestions[0].note).toContain('the screen flashed')
    expect(suggestions[0].note).not.toContain('there is no sound delay feeling')
    expect(suggestions[1].note).toContain('there is no sound delay feeling')
    expect(suggestions[1].note).not.toContain('the screen flashed')
  })

  it('does not pull the next command into the previous marker note across untokenized segments', () => {
    const suggestions = transcriptToMarkerSuggestions([
      { startMs: 0, endMs: 3500, text: 'record Bug app starts recording' },
      { startMs: 3500, endMs: 6500, text: 'record Critical no voice later' },
    ], { severities, triggerKeywords: 'record' })

    expect(suggestions).toHaveLength(2)
    expect(suggestions[0].severity).toBe('normal')
    expect(suggestions[0].note).toBe('app starts recording')
    expect(suggestions[0].note).not.toContain('record Critical')
    expect(suggestions[1].severity).toBe('major')
    expect(suggestions[1].note).toBe('no voice later')
  })

  it('omits command text from the note by default when repeated commands have no spoken detail', () => {
    const suggestions = transcriptToMarkerSuggestions([
      {
        startMs: 0,
        endMs: 4000,
        text: 'record Note record Note',
      },
    ], { severities })

    expect(suggestions).toHaveLength(2)
    expect(suggestions.map(s => s.severity)).toEqual(['improvement', 'improvement'])
    expect(suggestions.map(s => s.note)).toEqual(['', ''])
  })

  it('removes embedded command phrases from generated notes', () => {
    const suggestions = transcriptToMarkerSuggestions([
      {
        startMs: 0,
        endMs: 30_000,
        text: '記錄 Note 記錄 Bug 第一個沒有記下來',
        tokens: [
          { startMs: 17_000, endMs: 17_200, text: '記' },
          { startMs: 17_200, endMs: 17_400, text: '錄' },
          { startMs: 17_400, endMs: 17_700, text: 'Note' },
          { startMs: 22_000, endMs: 22_200, text: '記' },
          { startMs: 22_200, endMs: 22_400, text: '錄' },
          { startMs: 22_400, endMs: 22_700, text: 'Bug' },
          { startMs: 23_000, endMs: 26_000, text: '第一個沒有記下來' },
        ],
      },
    ], { severities })

    expect(suggestions).toHaveLength(2)
    expect(suggestions[0].note).toBe('')
    expect(suggestions[1].note).toBe('第一個沒有記下來')
  })

  it('removes Chinese trigger commands from consecutive generated notes', () => {
    const suggestions = transcriptToMarkerSuggestions([
      {
        startMs: 0,
        endMs: 30_000,
        text: '\u8a18\u9304 Note \u8a18\u9304 Bug \u7b2c\u4e00\u500b\u6c92\u6709\u8a18\u4e0b\u4f86',
        tokens: [
          { startMs: 17_000, endMs: 17_400, text: '\u8a18\u9304' },
          { startMs: 17_400, endMs: 17_700, text: 'Note' },
          { startMs: 22_000, endMs: 22_400, text: '\u8a18\u9304' },
          { startMs: 22_400, endMs: 22_700, text: 'Bug' },
          { startMs: 23_000, endMs: 26_000, text: '\u7b2c\u4e00\u500b\u6c92\u6709\u8a18\u4e0b\u4f86' },
        ],
      },
    ], { severities, triggerKeywords: '\u8a18\u9304, \u7d00\u9304' })

    expect(suggestions).toHaveLength(2)
    expect(suggestions[0].severity).toBe('improvement')
    expect(suggestions[0].note).toBe('')
    expect(suggestions[1].severity).toBe('normal')
    expect(suggestions[1].note).toBe('\u7b2c\u4e00\u500b\u6c92\u6709\u8a18\u4e0b\u4f86')
  })

  it('estimates command timing from text position when token timestamps are unavailable', () => {
    const [suggestion] = transcriptToMarkerSuggestions([
      { startMs: 30_000, endMs: 59_000, text: '前面說明很多內容 然後 記錄 Bug 這裡卡住' },
    ], { severities })

    expect(suggestion.offsetMs).toBeGreaterThan(45_000)
    expect(suggestion.offsetMs).toBeLessThan(59_000)
  })
})
