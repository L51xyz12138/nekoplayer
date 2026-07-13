<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, Pencil, Unlink, Film, Captions, X } from 'lucide-vue-next'
import DetailHero from '@/components/detail/DetailHero.vue'
import EditMetaDialog from '@/components/detail/EditMetaDialog.vue'
import SubtitleSearchDialog from '@/components/detail/SubtitleSearchDialog.vue'
import EpisodeList from '@/components/detail/EpisodeList.vue'
import CastRow from '@/components/detail/CastRow.vue'
import MediaTechInfo from '@/components/detail/MediaTechInfo.vue'
import MediaInfoSkeleton from '@/components/detail/MediaInfoSkeleton.vue'
import TrackPicker from '@/components/detail/TrackPicker.vue'
import TraktActions from '@/components/detail/TraktActions.vue'
import MediaRow from '@/components/library/MediaRow.vue'
import PosterCard from '@/components/library/PosterCard.vue'
import { useLibrary } from '@/composables/useLibrary'
import { useSources } from '@/composables/useSources'
import { usePlayer, type PlayTracks } from '@/composables/usePlayer'
import { assrtEnabled } from '@/api/assrt'
import type { Episode, MediaItem, Person } from '@/types/media'

const props = defineProps<{ id: string }>()

const router = useRouter()
const {
  getById,
  items,
  toggleFavorite,
  toggleWatched,
  loadSeasons,
  saveMetaOverride,
  clearMetaOverride,
  removeManualSeries,
  disbandToMovies,
  addManualSub,
  removeManualSub,
  subLabel,
  probeFileTech,
  probeFileEpisode,
  loadEmbyTracks,
  loadEmbyEpisode,
  loadEpisodeNames
} = useLibrary()
const player = usePlayer()

const item = computed(() => getById(props.id))

// 文件源条目才可手动编辑元数据（Emby/Jellyfin 由服务器管理，不在此改）
const isFileItem = computed(() => {
  const it = item.value
  return !!it && (!!it.localPath || it.id.startsWith('local-series:'))
})
// 手动组成的剧集可「解散」
const isManualSeries = computed(() => item.value?.id.startsWith('local-series:manual:') ?? false)
// 文件源剧集（自动或手动聚合的）都能「拆成电影」——用于系列电影被误当剧集（如指环王三部曲）
const isFileSeries = computed(
  () => item.value?.type === 'series' && (item.value?.id.startsWith('local-series:') ?? false)
)
// 文件源：显示视频文件地址（电影=文件路径/URL；剧集=所在文件夹）
const filePath = computed(() => item.value?.localPath || item.value?.folder || '')

// 详情页预选的音轨/字幕（仅文件源，探测到多轨时可选）；undefined=默认（跟随设置语言偏好）
const selAid = ref<number | undefined>(undefined)
const selSid = ref<number | 'no' | undefined>(undefined)
const selectedTracks = computed<PlayTracks | undefined>(() => {
  const t: PlayTracks = {}
  if (selAid.value !== undefined) t.aid = selAid.value
  if (selSid.value !== undefined) t.sid = selSid.value
  return t.aid !== undefined || t.sid !== undefined ? t : undefined
})

const editOpen = ref(false)
function onSaveMeta(data: Partial<MediaItem>) {
  if (item.value) saveMetaOverride(item.value.id, data)
}
function onResetMeta() {
  if (item.value) clearMetaOverride(item.value.id)
}
function ungroup() {
  if (!item.value) return
  removeManualSeries(item.value.id)
  router.back()
}
function splitToMovies() {
  if (!item.value) return
  disbandToMovies(item.value)
  router.back() // 该剧集条目已不存在，回上一页
}

// 续看集 id：用于剧集列表自动定位/高亮到「正在看的那一集」
const resumeId = computed(() => (item.value ? player.resumeEpisodeOf(item.value)?.id : undefined))

// 剧集：当前「聚焦」的那一集（默认续看集，供文件信息/音轨字幕/播放）。点某集才把简介也切成该集的
const selectedEp = ref<Episode | undefined>(undefined)
const epFocused = ref(false) // 用户是否点过某集（点了简介才切成该集，否则保持整部剧的简介）
function onSelectEp(ep: Episode) {
  selectedEp.value = ep
  epFocused.value = true
}

// 在线字幕（assrt）：仅文件源、且配了 token 时可用
const subAvailable = computed(() => isFileItem.value && assrtEnabled())
const subOpen = ref(false)
// 搜索/下载目标：剧集用当前聚焦的那一集（每集一个文件），电影用条目本身
const subEpisode = computed(() => (item.value?.type === 'series' ? selectedEp.value : undefined))
const subFileId = computed(() => subEpisode.value?.id ?? item.value?.id)
// 当前条目/聚焦集已挂载的外挂字幕（下载的 + WebDAV/DLNA 扫到的），供确认「挂上了没」
const displaySubs = computed(() => (subEpisode.value ?? item.value)?.subtitles ?? [])
function onSubAdd(p: { path: string; name: string }) {
  if (subFileId.value) addManualSub(subFileId.value, p.path, p.name)
}
function onRemoveSub(path: string) {
  if (subFileId.value) removeManualSub(subFileId.value, path)
}
// 简介：点过单集才显示该集简介，否则整部剧的（界面默认不变）；文件信息/轨道则始终跟随聚焦集
const displayOverview = computed(() =>
  item.value?.type === 'series' && epFocused.value ? selectedEp.value?.overview : undefined
)
const displayTech = computed(() =>
  item.value?.type === 'series' ? selectedEp.value?.tech : item.value?.tech
)
const displayTracks = computed(() =>
  item.value?.type === 'series' ? selectedEp.value?.tracks : item.value?.tracks
)

const related = computed(() => {
  const cur = item.value
  if (!cur) return []
  return items.value
    .filter((m) => m.id !== cur.id && m.genres.some((g) => cur.genres.includes(g)))
    .slice(0, 10)
})

// 多源同片：按 tmdbId + 类型找库里所有「同一部」的版本（含当前）；>1 则详情页顶部可切换源
const { getSource } = useSources()
const sameVersions = computed(() => {
  const it = item.value
  if (!it?.tmdbId) return []
  return items.value.filter((m) => m.tmdbId === it.tmdbId && m.type === it.type)
})
function sourceLabel(m: MediaItem): string {
  return getSource(m.sourceId)?.name || (m.localPath ? '文件源' : '媒体源')
}
function switchSource(m: MediaItem) {
  if (item.value && m.id !== item.value.id) router.push({ name: 'detail', params: { id: m.id } })
}

// 文件信息/音轨字幕加载中（用于骨架占位，避免一会有一会没有）。用 token 只让最近一次的结束态生效
const infoLoading = ref(false)
let loadToken = 0
function trackLoad(p: Promise<unknown>) {
  const my = ++loadToken
  infoLoading.value = true
  void p.finally(() => {
    if (my === loadToken) infoLoading.value = false
  })
}
// 拉某一集的文件信息 + 音轨/字幕（文件源 mpv 探测 / Emby 读 MediaStreams）
function ensureEpisodeInfo(ep: Episode) {
  const it = item.value
  if (!it) return
  trackLoad(ep.localPath ? probeFileEpisode(ep) : loadEmbyEpisode(ep, it.sourceId))
}
// 电影/合集/文件条目本身的文件信息 + 音轨/字幕
function ensureItemInfo(it: MediaItem) {
  if (it.localPath) trackLoad(probeFileTech(it))
  else if (it.type !== 'collection') trackLoad(loadEmbyTracks(it))
}
// 加载中且还没数据 → 显示骨架占位
const showInfoSkeleton = computed(() => infoLoading.value && !displayTech.value)

// 剧集：懒加载季/集列表。监听 item 对象本身——loadFromEmby（刷新/播放结束）会用
// 无 seasons 的新对象替换 item，此时需为新对象重新加载，否则剧集列表会消失
watch(
  item,
  (it, prev) => {
    if (it?.id !== prev?.id) {
      selAid.value = undefined
      selSid.value = undefined
      selectedEp.value = undefined
      epFocused.value = false
    }
    if (!it) return
    if (it.type === 'series') {
      // 文件源剧集季集聚合时已建（id 前缀 local-series:），Emby 剧集需懒加载
      if (!it.seasons && !it.id.startsWith('local-series:')) loadSeasons(it.id)
      // 文件源剧集：用 TMDB 补每集真实集名/简介/剧照
      if (it.id.startsWith('local-series:')) void loadEpisodeNames(it)
      // 默认聚焦续看集（seasons 已就绪时）
      if (!selectedEp.value) selectedEp.value = player.resumeEpisodeOf(it)
    } else {
      ensureItemInfo(it)
    }
  },
  { immediate: true }
)
// Emby 剧集季集异步到位后设默认聚焦集
watch(
  () => item.value?.seasons,
  () => {
    const it = item.value
    if (it?.type === 'series' && !selectedEp.value) selectedEp.value = player.resumeEpisodeOf(it)
  }
)
// 文件源剧集 tmdbId 就绪后（异步刮削完成 / 手动重新匹配）补每集真实集名
watch(
  () => item.value?.tmdbId,
  () => {
    const it = item.value
    if (it?.id.startsWith('local-series:')) void loadEpisodeNames(it)
  }
)
// 聚焦集变化 → 加载该集文件信息/轨道 + 重置该集的轨道预选
watch(selectedEp, (ep) => {
  if (!ep) return
  ensureEpisodeInfo(ep)
  selAid.value = undefined
  selSid.value = undefined
})

// 滚过 Hero 一定距离后，顶栏渐显磨砂背景 + 标题
const scrolled = ref(false)
function onScroll(e: Event) {
  scrolled.value = (e.target as HTMLElement).scrollTop > 400
}

function play() {
  const it = item.value
  if (!it) return
  if (it.type === 'series') {
    // 剧集：播当前聚焦的那一集（默认续看集）
    const ep = selectedEp.value ?? player.resumeEpisodeOf(it)
    if (ep) player.play(it, ep, selectedTracks.value)
  } else {
    player.play(it, undefined, selectedTracks.value)
  }
}
function playEpisode(ep: Episode) {
  // 轨道预选只对当前聚焦集有效（选的是它的轨道）
  const tracks = ep.id === selectedEp.value?.id ? selectedTracks.value : undefined
  if (item.value) player.play(item.value, ep, tracks)
}
function playWith(playerName: string) {
  const it = item.value
  if (!it) return
  if (it.type === 'series') {
    const ep = selectedEp.value ?? player.resumeEpisodeOf(it)
    if (ep) player.playWith(it, ep, playerName, selectedTracks.value)
  } else {
    player.playWith(it, undefined, playerName, selectedTracks.value)
  }
}
function fav() {
  if (item.value) toggleFavorite(item.value.id)
}
function watched() {
  if (item.value) toggleWatched(item.value.id)
}
function playItem(m: MediaItem) {
  player.play(m)
}
// 点演职人员 → 发现作品页（带上源 id + 人物 id + 名字/职务/头像）
function onPerson(person: Person) {
  const it = item.value
  if (!it) return
  router.push({
    name: 'person',
    query: {
      sid: it.sourceId,
      pid: person.id,
      name: person.name,
      role: person.role,
      avatar: person.avatarUrl || ''
    }
  })
}
</script>

<template>
  <div v-if="item" class="detail">
    <header class="detail__topbar" :class="{ 'is-scrolled': scrolled }">
      <button class="detail__back" title="返回" @click="router.back()">
        <ArrowLeft :size="20" />
      </button>
      <transition name="fade">
        <span v-if="scrolled" class="detail__topbar-title">{{ item.title }}</span>
      </transition>
      <div v-if="isFileItem" class="detail__actions">
        <button v-if="isFileSeries" class="detail__edit" title="拆成单独的电影（系列电影被误当剧集时）" @click="splitToMovies">
          <Film :size="15" /> 拆成电影
        </button>
        <button v-if="isManualSeries" class="detail__edit" title="解散为单个视频" @click="ungroup">
          <Unlink :size="15" /> 解散剧集
        </button>
        <button v-if="subAvailable" class="detail__edit" title="在线搜索并下载字幕（assrt）" @click="subOpen = true">
          <Captions :size="16" /> 在线字幕
        </button>
        <button class="detail__edit" title="编辑元数据" @click="editOpen = true">
          <Pencil :size="16" /> 编辑
        </button>
      </div>
    </header>

    <div class="detail__scroll" @scroll="onScroll">
      <DetailHero
        :item="item"
        :override-overview="displayOverview"
        @play="play"
        @favorite="fav"
        @play-with="playWith"
        @toggle-watched="watched"
      />

      <div class="detail__body">
        <!-- 多源同片：切换用哪个媒体源的版本 -->
        <div v-if="sameVersions.length > 1" class="detail__sources">
          <span class="detail__sources-label">媒体源</span>
          <button
            v-for="v in sameVersions"
            :key="v.id"
            class="detail__source"
            :class="{ on: v.id === item.id }"
            @click="switchSource(v)"
          >
            {{ sourceLabel(v) }}
          </button>
        </div>

        <div v-if="filePath && !displayTech && !infoLoading" class="detail__file" :title="filePath">
          <span class="detail__file-label">{{ item.localPath ? '文件' : '文件夹' }}</span>
          <code class="detail__file-path">{{ filePath }}</code>
        </div>
        <MediaInfoSkeleton v-if="showInfoSkeleton" />
        <template v-else>
          <MediaTechInfo v-if="displayTech" :tech="displayTech" />
          <TrackPicker
            v-if="displayTracks"
            :tracks="displayTracks"
            v-model:aid="selAid"
            v-model:sid="selSid"
          />
        </template>

        <!-- 外挂字幕（下载的 + WebDAV/DLNA 扫到的同名字幕）：确认挂载 + 可移除；播放时 mpv 自动加载首条 -->
        <div v-if="displaySubs.length" class="detail__subs">
          <span class="detail__subs-label"><Captions :size="15" /> 外挂字幕</span>
          <div class="detail__subs-list">
            <span v-for="s in displaySubs" :key="s" class="detail__sub" :title="s">
              <span class="detail__sub-name">{{ subLabel(s) }}</span>
              <button class="detail__sub-x" title="移除此字幕" @click="onRemoveSub(s)"><X :size="12" /></button>
            </span>
          </div>
        </div>

        <TraktActions :item="item" />
        <EpisodeList
          v-if="item.type === 'series' && item.seasons"
          :seasons="item.seasons"
          :resume-id="resumeId"
          :selected-id="selectedEp?.id"
          @select="onSelectEp"
          @play="playEpisode"
        />
        <CastRow v-if="item.cast.length" title="演职人员" :people="item.cast" @select="onPerson" />
        <MediaRow v-if="related.length" title="相关推荐" item-width="158px">
          <PosterCard
            v-for="it in related"
            :key="it.id"
            :item="it"
            @favorite="toggleFavorite"
            @play="playItem"
          />
        </MediaRow>
      </div>
    </div>

    <EditMetaDialog
      :open="editOpen"
      :item="item || null"
      @close="editOpen = false"
      @save="onSaveMeta"
      @reset="onResetMeta"
    />
    <SubtitleSearchDialog
      :open="subOpen"
      :item="item || null"
      :episode="subEpisode"
      @close="subOpen = false"
      @add="onSubAdd"
    />
  </div>

  <div v-else class="detail-missing">
    <p>找不到这个内容喵 (⊙﹏⊙)</p>
    <button @click="router.push('/')">返回媒体库</button>
  </div>
</template>

<style scoped>
.detail {
  position: relative;
  height: 100%;
  overflow: hidden;
}

.detail__topbar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px 26px;
  border-bottom: 1px solid transparent;
  transition: background var(--dur) var(--ease), border-color var(--dur) var(--ease);
}
.detail__topbar.is-scrolled {
  background: rgba(11, 12, 17, 0.72);
  backdrop-filter: var(--blur);
  border-bottom-color: var(--border);
}

.detail__back {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  border-radius: 50%;
  color: #fff;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid var(--border);
  backdrop-filter: var(--blur);
  transition: background var(--dur) var(--ease);
}
.detail__back:hover {
  background: rgba(0, 0, 0, 0.62);
}
.detail__topbar.is-scrolled .detail__back {
  background: var(--surface-2);
}
.detail__topbar-title {
  font-size: 17px;
  font-weight: 700;
}
.detail__actions {
  margin-left: auto;
  display: flex;
  gap: 10px;
}
.detail__edit {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 38px;
  padding: 0 16px;
  font-size: 13.5px;
  font-weight: 600;
  color: #fff;
  border-radius: var(--r-pill);
  background: rgba(0, 0, 0, 0.42);
  border: 1px solid var(--border);
  backdrop-filter: var(--blur);
  transition: background var(--dur) var(--ease);
}
.detail__edit:hover {
  background: rgba(0, 0, 0, 0.62);
}
.detail__topbar.is-scrolled .detail__edit {
  background: var(--surface-2);
}

.detail__scroll {
  height: 100%;
  overflow-y: auto;
}
.detail__body {
  padding: 30px 44px 50px;
}
.detail__sources {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 24px;
}
.detail__sources-label {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text-dim);
}
.detail__source {
  height: 34px;
  padding: 0 15px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-dim);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
  transition: color var(--dur), background var(--dur), border-color var(--dur);
}
.detail__source:hover {
  color: var(--text);
  border-color: var(--border-strong);
}
.detail__source.on {
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  border-color: transparent;
}
.detail__file {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
  padding: 11px 15px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
}
.detail__file-label {
  flex-shrink: 0;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text-dim);
}
.detail__file-path {
  min-width: 0;
  font-family: 'SF Mono', ui-monospace, monospace;
  font-size: 12.5px;
  color: var(--text-mute);
  word-break: break-all;
  user-select: text;
}

.detail__subs {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 24px;
}
.detail__subs-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding-top: 5px;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text-dim);
}
.detail__subs-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.detail__sub {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 340px;
  padding: 5px 6px 5px 11px;
  font-size: 12.5px;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
}
.detail__sub-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.detail__sub-x {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border-radius: 50%;
  color: var(--text-mute);
  transition: background var(--dur), color var(--dur);
}
.detail__sub-x:hover {
  color: var(--text);
  background: var(--surface-hover);
}

.detail-missing {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  height: 100%;
  color: var(--text-dim);
}
.detail-missing button {
  padding: 10px 22px;
  border-radius: var(--r-pill);
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  font-weight: 600;
}
</style>
