import type { EmbySession } from '@/api/emby'

export type SourceKind = 'emby' | 'jellyfin' | 'plex'

export type SourceStatus = 'online' | 'offline' | 'connecting'

export interface MediaSource {
  id: string
  kind: SourceKind
  name: string
  /** 展示用地址，如 http://192.168.1.10:8096 */
  address: string
  status: SourceStatus
  mediaCount: number
  enabled: boolean
  /** 原始表单字段值，用于编辑回填 */
  config?: Record<string, string>
  /** Emby/Jellyfin 连接会话（登录后派生，用于拉库与鉴权） */
  session?: EmbySession
}

/** 动态表单字段定义 */
export interface SourceField {
  key: string
  label: string
  placeholder?: string
  type: 'text' | 'password' | 'number'
  required?: boolean
  defaultValue?: string
}

export interface SourceKindMeta {
  kind: SourceKind
  label: string
  description: string
  /** 品牌强调色 */
  accent: string
  defaultPort?: number
  fields: SourceField[]
}
