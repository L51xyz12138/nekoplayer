import type { SourceKind, SourceKindMeta } from '@/types/source'

// SMB 扫描目前依赖 Windows 的 net use + UNC，非 Windows 下禁用（避免建出静默空源）
const isWindows = typeof window !== 'undefined' && window.nekoNative?.platform === 'win32'

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
    kind: 'local',
    label: '本机存储',
    description: '浏览本地文件夹里的视频，用外部播放器直接播放（无需服务器）',
    accent: '#4ac47d',
    fields: [
      { key: 'path', label: '文件夹', placeholder: '选择要浏览的文件夹', type: 'folder', required: true }
    ]
  },
  {
    kind: 'webdav',
    label: 'WebDAV',
    description: '连接 WebDAV（坚果云 / 群晖 / NAS 等），把里面的视频并入媒体库',
    accent: '#3aa0ff',
    fields: [
      { key: 'url', label: '地址', placeholder: 'https://dav.example.com/dav', type: 'text', required: true },
      { key: 'path', label: '子路径', placeholder: '/（默认根目录）', type: 'text' },
      { key: 'username', label: '用户名', placeholder: '账号', type: 'text' },
      { key: 'password', label: '密码', placeholder: '密码', type: 'password' }
    ]
  },
  {
    kind: 'smb',
    label: 'SMB 共享',
    description: '连接局域网 SMB / 共享文件夹（目前仅 Windows）',
    accent: '#8a6bff',
    disabled: !isWindows,
    fields: [
      { key: 'address', label: '共享地址', placeholder: '\\\\192.168.1.10\\media', type: 'text', required: true },
      { key: 'path', label: '子路径', placeholder: '（可选）', type: 'text' },
      { key: 'username', label: '用户名', placeholder: '（免密可留空）', type: 'text' },
      { key: 'password', label: '密码', placeholder: '', type: 'password' }
    ]
  },
  {
    kind: 'dlna',
    label: 'DLNA',
    description: '发现并浏览局域网 DLNA / UPnP 媒体服务器里的视频',
    accent: '#ff8f45',
    fields: [{ key: 'controlUrl', label: 'DLNA 服务器', type: 'dlna', required: true }]
  },
  {
    kind: 'plex',
    label: 'Plex',
    description: '连接 Plex Media Server，畅享海量在线元数据',
    accent: '#e5a00d',
    defaultPort: 32400,
    fields: serverFields('32400'),
    disabled: true
  }
]

export function sourceKindMeta(kind: SourceKind): SourceKindMeta {
  return sourceKinds.find((k) => k.kind === kind) ?? sourceKinds[0]
}
