import type { SourceKind, SourceKindMeta } from '@/types/source'

const serverFields = (defaultPort: string): SourceKindMeta['fields'] => [
  { key: 'address', label: '服务器地址', placeholder: 'http://192.168.1.10', type: 'text', required: true },
  { key: 'port', label: '端口', placeholder: defaultPort, type: 'number', defaultValue: defaultPort },
  { key: 'username', label: '用户名', placeholder: '登录账号', type: 'text', required: true },
  { key: 'password', label: '密码', placeholder: '登录密码', type: 'password' }
]

export const sourceKinds: SourceKindMeta[] = [
  {
    kind: 'emby',
    label: 'Emby',
    description: '连接 Emby 媒体服务器，同步影视库与观看进度',
    accent: '#52b54b',
    defaultPort: 8096,
    fields: serverFields('8096')
  },
  {
    kind: 'jellyfin',
    label: 'Jellyfin',
    description: '开源免费的媒体服务器，功能与 Emby 类似',
    accent: '#9a4bff',
    defaultPort: 8096,
    fields: serverFields('8096')
  },
  {
    kind: 'plex',
    label: 'Plex',
    description: '连接 Plex Media Server，畅享海量在线元数据',
    accent: '#e5a00d',
    defaultPort: 32400,
    fields: serverFields('32400')
  }
]

export function sourceKindMeta(kind: SourceKind): SourceKindMeta {
  return sourceKinds.find((k) => k.kind === kind) ?? sourceKinds[0]
}
