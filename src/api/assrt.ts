// 在线字幕下载（assrt 射手网 API v1，https://assrt.net/api/doc）。
// 文件源（本机/WebDAV/SMB/DLNA）无服务器字幕，故软件按片名在线搜字幕、下载后 mpv --sub-file 挂载。
// Emby/Jellyfin 由服务器提供字幕，不走此模块。
import { useSettings } from '@/composables/useSettings'

// assrt 官方发放的「播放器专用 token」，授权用于本软件测试 + 发布（额度已提升）→ 内置作默认兜底，开箱即用。
// 用户仍可在设置里填自己的 token 覆盖（免费注册；额度按 token+IP 共享）。
// 参考 assrt 官方 mpv 插件同款用法：https://github.com/AssrtOSS/mpv-assrt/blob/master/scripts/assrt.lua
const ASSRT_TOKEN = 'tNjXZUnOJWcHznHDyalNMYqqP6IdDdpQ'
const API_BASE = 'https://api.assrt.net/v1'

/** 生效的 token：设置里填的优先，否则用内置的播放器专用 token */
function token(): string {
  return (useSettings().settings.assrtToken || ASSRT_TOKEN).trim()
}
/** 是否可用（有 token 才启用在线字幕） */
export function assrtEnabled(): boolean {
  return !!token()
}

/** 一条搜索结果（供用户选择） */
export interface AssrtSub {
  id: number
  /** 展示名（native_name 优先，否则 videoname） */
  name: string
  /** 语言描述，如「简体中文」「简繁英」 */
  lang: string
  /** 评分（越高越可信） */
  score: number
  /** 来源站点，如「人人影视YYeTs」 */
  site: string
  /** 字幕类型，如 SRT / ASS / VobSub */
  subtype: string
}

// assrt 直链里可用于 mpv 的文本字幕扩展（VobSub/idx 等图形字幕不收）
const TEXT_SUB_RE = /\.(srt|ass|ssa|vtt)$/i

async function callApi(path: string, params: Record<string, string | number>): Promise<Record<string, unknown> | null> {
  const t = token()
  if (!t) return null
  const qs = new URLSearchParams({ token: t })
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v))
  try {
    // Electron webSecurity:false，渲染进程可跨域直连（同 tmdb.ts）；assrt 非 Cloudflare，无需 UA
    const res = await fetch(`${API_BASE}${path}?${qs.toString()}`)
    if (!res.ok) return null
    const json = await res.json()
    // status:0 成功；非 0 多为额度超限/无结果
    if (json && typeof json === 'object' && (json.status === 0 || json.sub)) return json
    return null
  } catch {
    return null
  }
}

/** 按关键词搜字幕（片名或文件名）；min 3 字符 */
export async function searchSubs(query: string): Promise<AssrtSub[]> {
  const q = query.trim()
  if (q.length < 3) return []
  const json = await callApi('/sub/search', { q, cnt: 15, pos: 0 })
  const subs = ((json?.sub as Record<string, unknown>)?.subs as Record<string, unknown>[]) ?? []
  return subs.map((s) => {
    const lang = (s.lang as Record<string, unknown>) ?? {}
    return {
      id: Number(s.id) || 0,
      name: String(s.native_name || s.videoname || '未命名字幕'),
      lang: String(lang.desc || ''),
      score: Number(s.vote_score) || 0,
      site: String(s.release_site || ''),
      subtype: String(s.subtype || '')
    }
  }).filter((s) => s.id > 0)
}

/** 取某字幕的可下载文本文件（从 filelist 里挑 srt/ass，或退回顶层 url）；返回 {url, filename} 或 null */
export async function resolveDownload(id: number): Promise<{ url: string; filename: string } | null> {
  const json = await callApi('/sub/detail', { id })
  const sub = ((json?.sub as Record<string, unknown>)?.subs as Record<string, unknown>[])?.[0]
  if (!sub) return null
  const filelist = (sub.filelist as Record<string, unknown>[]) ?? []
  // 压缩包会把内含文件逐个列在 filelist（各带直链）→ 优先挑其中的文本字幕，避免下到 .zip/.rar
  const textFiles = filelist.filter((f) => TEXT_SUB_RE.test(String(f.f || '')))
  const pick = textFiles[0] ?? filelist[0]
  if (pick?.url) return { url: String(pick.url), filename: String(pick.f || sub.filename || 'subtitle') }
  // 无 filelist（单文件字幕）→ 用顶层 url
  if (sub.url) return { url: String(sub.url), filename: String(sub.filename || 'subtitle') }
  return null
}
