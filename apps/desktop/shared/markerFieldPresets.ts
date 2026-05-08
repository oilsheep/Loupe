import type { MarkerFieldPreset } from './types'

export const DEFAULT_MARKER_FIELD_PRESETS: MarkerFieldPreset[] = [
  {
    key: '分類',
    defaultValue: 'List',
    options: ['List', 'Bug', 'UI', '劇情', '關卡', '商店'],
  },
  {
    key: '回報人',
    defaultValue: '內部回報',
    options: ['內部回報', '玩家回報', 'QA回報'],
  },
  {
    key: '優先級',
    defaultValue: '一般',
    options: ['緊急', '高', '一般', '低'],
  },
  {
    key: '狀態',
    defaultValue: ':zzz: 等待分配',
    options: [':zzz: 等待分配', '處理中', '已修復', '待驗證', '已關閉'],
  },
]
