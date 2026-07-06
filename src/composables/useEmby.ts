import { computed, reactive, toRefs } from 'vue'
import { authenticate, type EmbySession } from '@/api/emby'

const SESSION_KEY = 'neko-emby-session'

function loadSession(): EmbySession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    const s = raw ? (JSON.parse(raw) as EmbySession) : null
    // 旧格式（无 serverUrl）视为失效，需重新登录
    return s && s.serverUrl ? s : null
  } catch {
    return null
  }
}

type Status = 'idle' | 'connecting' | 'connected' | 'error'

interface EmbyState {
  session: EmbySession | null
  status: Status
  error: string
}

const initial = loadSession()

// 模块级单例
const state = reactive<EmbyState>({
  session: initial,
  status: initial ? 'connected' : 'idle',
  error: ''
})

const isConnected = computed(() => state.status === 'connected' && !!state.session)

/** 登录指定服务器（地址 + 账号密码） */
async function login(serverUrl: string, username: string, password: string): Promise<EmbySession> {
  state.status = 'connecting'
  state.error = ''
  try {
    const session = await authenticate(serverUrl, username, password)
    state.session = session
    state.status = 'connected'
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    return session
  } catch (e) {
    state.status = 'error'
    state.error = e instanceof Error ? e.message : '连接失败，请检查地址与账号'
    throw e
  }
}

function logout() {
  state.session = null
  state.status = 'idle'
  state.error = ''
  localStorage.removeItem(SESSION_KEY)
}

export function useEmby() {
  return {
    ...toRefs(state),
    isConnected,
    login,
    logout
  }
}
