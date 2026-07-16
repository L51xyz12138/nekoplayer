<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { X, Server, Eye, EyeOff } from 'lucide-vue-next'
import { sourceKinds, sourceKindMeta } from '@/data/sourceKinds'
import { useEmby } from '@/composables/useEmby'
import { useSources } from '@/composables/useSources'
import { useLibrary } from '@/composables/useLibrary'
import type { MediaSource, SourceKind } from '@/types/source'

const props = defineProps<{ open: boolean; editing?: MediaSource | null }>()
const emit = defineEmits<{
  close: []
  add: [source: MediaSource]
  update: [source: MediaSource]
}>()

const { login } = useEmby()
const { upsertEmbySource } = useSources()
const { loadFromEmby } = useLibrary()

const isEdit = computed(() => !!props.editing)

const kind = ref<SourceKind>('emby')
const name = ref('')
const form = reactive<Record<string, string>>({})
const submitting = ref(false)
const connectError = ref('')
const showPwd = ref(false)

// 按 Esc 关闭弹窗（不响应点击背景，避免误关）
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

const meta = computed(() => sourceKindMeta(kind.value))

function resetForm() {
  name.value = ''
  Object.keys(form).forEach((k) => delete form[k])
  meta.value.fields.forEach((f) => {
    form[f.key] = f.defaultValue ?? ''
  })
}

// 仅新增时允许切换类型（切换会重置表单）
function selectKind(k: SourceKind) {
  if (isEdit.value) return
  kind.value = k
  resetForm()
}

// 编辑时用源的 config 回填表单
function fillFromSource(src: MediaSource) {
  kind.value = src.kind
  name.value = src.name
  const cfg = src.config ?? {}
  Object.keys(form).forEach((k) => delete form[k])
  meta.value.fields.forEach((f) => {
    form[f.key] = cfg[f.key] ?? f.defaultValue ?? ''
  })
}

watch(
  () => props.open,
  (o) => {
    if (o) {
      document.addEventListener('keydown', onKeydown)
      if (props.editing) fillFromSource(props.editing)
      else {
        kind.value = 'emby'
        resetForm()
      }
    } else {
      document.removeEventListener('keydown', onKeydown)
    }
  }
)
resetForm()

function buildAddress() {
  const m = meta.value
  return `${form.address || 'http://host'}:${form.port || m.defaultPort}`
}

async function pickFolder(key: string) {
  const p = await window.nekoNative?.pickFolder()
  if (p) form[key] = p
}
async function pickFile(key: string) {
  const p = await window.nekoNative?.pickFile()
  if (p) form[key] = p
}

// DLNA：SSDP 发现局域网服务器，选一个填入 config
const discovering = ref(false)
const discovered = ref(false)
const dlnaServers = ref<{ name: string; controlUrl: string }[]>([])
async function runDiscover() {
  discovering.value = true
  discovered.value = false
  dlnaServers.value = []
  try {
    dlnaServers.value = (await window.nekoNative?.discoverDlna?.())?.servers ?? []
  } catch {
    dlnaServers.value = []
  } finally {
    discovering.value = false
    discovered.value = true
  }
}
function pickDlna(key: string, sv: { name: string; controlUrl: string }) {
  form[key] = sv.controlUrl
  if (!name.value.trim()) name.value = sv.name
}

const isFileKind = computed(
  () =>
    kind.value === 'local' ||
    kind.value === 'webdav' ||
    kind.value === 'smb' ||
    kind.value === 'dlna' ||
    kind.value === 'iptv'
)

// 从表单收集 config，并校验必填；返回 null 表示校验未过（已设置错误提示）
function collectConfig(): { config: Record<string, string>; address: string; derived: string } | null {
  const config: Record<string, string> = {}
  for (const f of meta.value.fields) config[f.key] = (form[f.key] || '').trim()
  const missing = meta.value.fields.find((f) => f.required && !config[f.key])
  if (missing) {
    connectError.value = `请填写「${missing.label}」`
    return null
  }
  let derived = ''
  if (config.url) {
    try {
      derived = new URL(config.url).host
    } catch {
      derived = config.url.split(/[\\/]/).filter(Boolean).pop() || '' // 本地文件路径取文件名
    }
  }
  if (!derived) derived = config.address || config.path?.split(/[\\/]/).filter(Boolean).pop() || ''
  return { config, address: config.url || config.address || config.path || '', derived }
}

async function submit() {
  connectError.value = ''
  // 编辑：文件源要把改后的连接信息一并保存（不止名称）；Emby/Jellyfin 只改名
  if (isEdit.value && props.editing) {
    const src = props.editing
    if (isFileKind.value) {
      const c = collectConfig()
      if (!c) return
      emit('update', {
        ...src,
        name: name.value.trim() || src.name,
        address: c.address || src.address,
        config: c.config
      })
    } else {
      emit('update', { ...src, name: name.value.trim() || src.name })
    }
    emit('close')
    return
  }
  // 文件浏览类源（本机 / WebDAV / SMB / DLNA）：免登录，直接以表单配置建源
  if (isFileKind.value) {
    const c = collectConfig()
    if (!c) return
    emit('add', {
      id: `${kind.value}-${Date.now()}`,
      kind: kind.value,
      name: name.value.trim() || c.derived || meta.value.label,
      address: c.address,
      status: 'online',
      mediaCount: 0,
      enabled: true,
      config: c.config
    })
    emit('close')
    return
  }
  // 新增：真实连接服务器（登录），成功后并入媒体源并拉库
  submitting.value = true
  try {
    const session = await login(buildAddress(), form.username, form.password)
    upsertEmbySource(session, name.value, kind.value)
    emit('close')
    // 大库拉取较慢，放后台进行（主页显示骨架屏/继续观看），不阻塞关窗
    loadFromEmby()
  } catch (e) {
    connectError.value = e instanceof Error ? e.message : '连接失败，请检查地址与账号密码'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <transition name="dialog">
    <div v-if="open" class="mask">
      <div class="dialog">
        <header class="dialog__head">
          <h2>{{ isEdit ? '编辑媒体源' : '添加媒体源' }}</h2>
          <button class="dialog__x" @click="emit('close')"><X :size="18" /></button>
        </header>

        <div class="dialog__body no-scrollbar">
          <template v-if="!isEdit">
            <p class="field-label">选择类型</p>
            <div class="kinds">
              <button
                v-for="k in sourceKinds"
                :key="k.kind"
                class="kind"
                :class="{ on: kind === k.kind, 'is-disabled': k.disabled }"
                :style="kind === k.kind ? { borderColor: k.accent } : {}"
                :disabled="k.disabled"
                @click="selectKind(k.kind)"
              >
                <span class="kind__icon" :style="{ color: k.accent, background: k.accent + '22' }">
                  <Server :size="18" />
                </span>
                <span class="kind__label">{{ k.label }}</span>
                <span v-if="k.disabled" class="kind__soon">开发中</span>
              </button>
            </div>
          </template>

          <div v-else class="edit-kind">
            <span class="kind__icon" :style="{ color: meta.accent, background: meta.accent + '22' }">
              <Server :size="18" />
            </span>
            <span class="edit-kind__label">{{ meta.label }}</span>
            <span class="edit-kind__hint">类型不可修改</span>
          </div>

          <p class="kind__desc">{{ meta.description }}</p>

          <div class="form">
            <label class="field">
              <span class="field-label">名称</span>
              <input v-model="name" type="text" :placeholder="meta.label + ' 媒体库'" />
            </label>

            <label v-for="f in meta.fields" :key="f.key" class="field">
              <span class="field-label">
                {{ f.label }}
                <i v-if="f.required" class="req">*</i>
              </span>
              <div v-if="f.type === 'folder'" class="field__folder">
                <input
                  v-model="form[f.key]"
                  type="text"
                  readonly
                  :placeholder="f.placeholder"
                  @click="pickFolder(f.key)"
                />
                <button type="button" class="field__browse" @click="pickFolder(f.key)">浏览…</button>
              </div>
              <div v-else-if="f.type === 'dlna'" class="field__dlna">
                <button type="button" class="field__browse" :disabled="discovering" @click="runDiscover">
                  {{ discovering ? '搜索中…' : '发现 DLNA 服务器' }}
                </button>
                <div v-if="dlnaServers.length" class="dlna-list">
                  <button
                    v-for="sv in dlnaServers"
                    :key="sv.controlUrl"
                    type="button"
                    class="dlna-item"
                    :class="{ on: form[f.key] === sv.controlUrl }"
                    @click="pickDlna(f.key, sv)"
                  >
                    {{ sv.name }}
                  </button>
                </div>
                <p v-else-if="discovered" class="dlna-hint">
                  没搜到服务器（确认在同一局域网、DLNA/UPnP 已开启）
                </p>
              </div>
              <div v-else-if="f.type === 'iptv'" class="field__folder">
                <input v-model="form[f.key]" type="text" :placeholder="f.placeholder" spellcheck="false" />
                <button type="button" class="field__browse" @click="pickFile(f.key)">选择文件…</button>
              </div>
              <div v-else-if="f.type === 'password'" class="field__pwd">
                <input
                  v-model="form[f.key]"
                  :type="showPwd ? 'text' : 'password'"
                  :placeholder="f.placeholder"
                />
                <button type="button" class="field__eye" @click="showPwd = !showPwd">
                  <EyeOff v-if="showPwd" :size="16" />
                  <Eye v-else :size="16" />
                </button>
              </div>
              <input
                v-else
                v-model="form[f.key]"
                :type="f.type === 'number' ? 'number' : 'text'"
                :placeholder="f.placeholder"
              />
            </label>
          </div>

          <p v-if="connectError" class="dialog__error">{{ connectError }}</p>
        </div>

        <footer class="dialog__foot">
          <button class="btn btn--ghost" @click="emit('close')">取消</button>
          <button class="btn btn--primary" :disabled="submitting" @click="submit">
            {{
              isEdit
                ? '保存更改'
                : isFileKind
                  ? '添加'
                  : submitting
                    ? '连接中…'
                    : '保存并连接'
            }}
          </button>
        </footer>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(4, 5, 8, 0.62);
  backdrop-filter: blur(6px);
}
.dialog {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 520px;
  max-height: 86vh;
  background: linear-gradient(180deg, var(--bg-2), var(--bg-1));
  border: 1px solid var(--border-strong);
  border-radius: var(--r-xl);
  box-shadow: var(--shadow-pop);
  overflow: hidden;
}

.dialog__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 22px 24px;
  border-bottom: 1px solid var(--border);
}
.dialog__head h2 {
  font-size: 19px;
  font-weight: 700;
}
.dialog__x {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  color: var(--text-dim);
  transition: background var(--dur), color var(--dur);
}
.dialog__x:hover {
  color: var(--text);
  background: var(--surface-hover);
}

.dialog__body {
  padding: 22px 24px;
  overflow-y: auto;
}
.field-label {
  display: block;
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 650;
  color: var(--text-dim);
}
.req {
  color: var(--accent);
  font-style: normal;
}

.kinds {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.kind {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 9px;
  padding: 14px 8px;
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: var(--r-md);
  transition: background var(--dur) var(--ease), border-color var(--dur) var(--ease);
}
.kind:hover {
  background: var(--surface-2);
}
.kind.on {
  background: var(--surface-2);
}
.kind__icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: var(--r-sm);
}
.kind__label {
  font-size: 12.5px;
  font-weight: 600;
}
.kind.is-disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.kind.is-disabled:hover {
  background: var(--surface);
}
.kind__soon {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: var(--r-pill);
  color: var(--text-mute);
  background: var(--surface-2);
}
.kind__desc {
  margin: 16px 0 4px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-mute);
}

.edit-kind {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 0 2px;
}
.edit-kind__label {
  font-size: 16px;
  font-weight: 700;
}
.edit-kind__hint {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-mute);
}

.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 18px;
}
.dialog__error {
  margin-top: 14px;
  padding: 10px 14px;
  font-size: 13px;
  color: #ff8b8b;
  background: rgba(255, 107, 107, 0.1);
  border: 1px solid rgba(255, 107, 107, 0.25);
  border-radius: var(--r-md);
}
.btn:disabled {
  opacity: 0.6;
  cursor: default;
}
.field {
  display: block;
}
.field input {
  width: 100%;
  height: 44px;
  padding: 0 14px;
  font-size: 14px;
  color: var(--text);
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  outline: none;
  transition: border-color var(--dur) var(--ease);
}
.field input::placeholder {
  color: var(--text-mute);
}
.field input:focus {
  border-color: var(--accent);
}
.field__folder {
  display: flex;
  gap: 10px;
}
.field__folder input {
  cursor: pointer;
}
.field__browse {
  flex-shrink: 0;
  padding: 0 16px;
  height: 44px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-dim);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  transition: color var(--dur) var(--ease), border-color var(--dur) var(--ease);
}
.field__browse:hover {
  color: var(--text);
  border-color: var(--border-strong);
}
.field__browse:disabled {
  opacity: 0.6;
  cursor: default;
}
.field__dlna {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.dlna-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.dlna-item {
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-dim);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  transition: color var(--dur), border-color var(--dur), background var(--dur);
}
.dlna-item:hover {
  color: var(--text);
  border-color: var(--border-strong);
}
.dlna-item.on {
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  border-color: transparent;
}
.dlna-hint {
  font-size: 12.5px;
  color: var(--text-mute);
}
.field__pwd {
  position: relative;
}
.field__pwd input {
  padding-right: 46px;
}
.field__eye {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: var(--r-sm);
  color: var(--text-mute);
  transition: color var(--dur) var(--ease);
}
.field__eye:hover {
  color: var(--text);
}

.dialog__foot {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 18px 24px;
  border-top: 1px solid var(--border);
}
.btn {
  height: 44px;
  padding: 0 22px;
  font-size: 14px;
  font-weight: 650;
  border-radius: var(--r-pill);
  transition: transform var(--dur), background var(--dur), border-color var(--dur);
}
.btn:active {
  transform: scale(0.96);
}
.btn--ghost {
  color: var(--text-dim);
  border: 1px solid var(--border);
}
.btn--ghost:hover {
  color: var(--text);
  background: var(--surface);
}
.btn--primary {
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  box-shadow: 0 8px 22px var(--accent-glow);
}

.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.22s var(--ease);
}
.dialog-enter-active .dialog,
.dialog-leave-active .dialog {
  transition: transform 0.22s var(--ease);
}
.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}
.dialog-enter-from .dialog,
.dialog-leave-to .dialog {
  transform: translateY(16px) scale(0.98);
}
</style>
