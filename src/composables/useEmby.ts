import { reactive, toRefs } from 'vue'
import { authenticate, type EmbySession } from '@/api/emby'

type Status = 'idle' | 'connecting' | 'connected' | 'error'

interface EmbyState {
  status: Status
  error: string
}

// 模块级单例：仅服务「添加媒体源」对话框的登录鉴权与状态反馈。
// 会话本身由 useSources 每源持有，此处不保存 session、不做持久化。
const state = reactive<EmbyState>({ status: 'idle', error: '' })

/** 登录指定服务器（地址 + 账号密码），成功返回会话交由 useSources 保存 */
async function login(serverUrl: string, username: string, password: string): Promise<EmbySession> {
  state.status = 'connecting'
  state.error = ''
  try {
    const session = await authenticate(serverUrl, username, password)
    state.status = 'connected'
    return session
  } catch (e) {
    state.status = 'error'
    state.error = e instanceof Error ? e.message : '连接失败，请检查地址与账号'
    throw e
  }
}

export function useEmby() {
  return {
    ...toRefs(state),
    login
  }
}
