<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Film, Tv, Clock3, Star, BarChart3 } from 'lucide-vue-next'
import { useLibrary } from '@/composables/useLibrary'
import { useTrakt } from '@/composables/useTrakt'
import type { TraktStats } from '@/api/trakt'

const { items } = useLibrary()
const trakt = useTrakt()

const stats = ref<TraktStats | null>(null)
const watchDates = ref<string[]>([])
const loading = ref(false)

onMounted(async () => {
  if (!trakt.connected.value) return
  loading.value = true
  try {
    const [s, d] = await Promise.all([trakt.loadStats(), trakt.loadWatchDates()])
    stats.value = s
    watchDates.value = d
  } finally {
    loading.value = false
  }
})

// 库内「已看」条目（合集除外）——供类型/演员偏好统计
const watched = computed(() => items.value.filter((m) => m.watched && m.type !== 'collection'))

// 概览四项：优先用 Trakt 聚合统计（跨全部历史），未连接则用库内已看兜底
const overview = computed(() => {
  const s = stats.value
  if (s) {
    return [
      { icon: Film, label: '看过电影', value: s.moviesWatched, unit: '部' },
      { icon: Tv, label: '看过剧集', value: s.episodesWatched, unit: '集' },
      { icon: Clock3, label: '观看时长', value: Math.round((s.moviesMinutes + s.episodesMinutes) / 60), unit: '小时' },
      { icon: Star, label: '评分', value: s.ratingsTotal, unit: '部' }
    ]
  }
  const movies = watched.value.filter((m) => m.type === 'movie')
  const series = watched.value.filter((m) => m.type === 'series')
  const mins = movies.reduce((a, m) => a + (m.runtime || 0), 0)
  return [
    { icon: Film, label: '看过电影', value: movies.length, unit: '部' },
    { icon: Tv, label: '看过剧集', value: series.length, unit: '部' },
    { icon: Clock3, label: '电影时长', value: Math.round(mins / 60), unit: '小时' }
  ]
})

// 类型偏好（库内已看）：按出现次数取前 10
const genreBars = computed(() => {
  const c: Record<string, number> = {}
  for (const m of watched.value) for (const g of m.genres || []) c[g] = (c[g] || 0) + 1
  const arr = Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 10)
  const max = arr[0]?.[1] || 1
  return arr.map(([name, count]) => ({ name, count, pct: Math.round((count / max) * 100) }))
})

// 常看演员（库内已看的演员，按参演已看数）取前 12
const topActors = computed(() => {
  const map = new Map<string, { name: string; count: number; avatarUrl?: string }>()
  for (const m of watched.value)
    for (const p of m.cast || [])
      if (p.kind === 'actor') {
        const cur = map.get(p.name) || { name: p.name, count: 0, avatarUrl: p.avatarUrl }
        cur.count++
        if (!cur.avatarUrl && p.avatarUrl) cur.avatarUrl = p.avatarUrl
        map.set(p.name, cur)
      }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 12)
})

// 评分分布（Trakt）：1-10 分各多少部
const ratingBars = computed(() => {
  const dist = stats.value?.ratingsDist
  if (!dist) return []
  const max = Math.max(1, ...Object.values(dist).map((v) => Number(v) || 0))
  return Array.from({ length: 10 }, (_, i) => {
    const score = String(i + 1)
    const count = Number(dist[score]) || 0
    return { score: i + 1, count, pct: Math.round((count / max) * 100) }
  })
})
const hasRatings = computed(() => ratingBars.value.some((r) => r.count > 0))

// 观看日历热力图（Trakt 最近 52 周）
const heatmap = computed(() => {
  const counts: Record<string, number> = {}
  for (const d of watchDates.value) counts[d] = (counts[d] || 0) + 1
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const cur = new Date(today)
  cur.setDate(cur.getDate() - 7 * 52)
  cur.setDate(cur.getDate() - cur.getDay()) // 对齐到周日
  const weeks: { date: string; count: number; level: number }[][] = []
  let week: { date: string; count: number; level: number }[] = []
  while (cur <= today) {
    const ds = fmt(cur)
    const c = counts[ds] || 0
    const level = c === 0 ? 0 : c === 1 ? 1 : c === 2 ? 2 : c <= 4 ? 3 : 4
    week.push({ date: ds, count: c, level })
    if (cur.getDay() === 6) {
      weeks.push(week)
      week = []
    }
    cur.setDate(cur.getDate() + 1)
  }
  if (week.length) weeks.push(week)
  return weeks
})
const totalPlays = computed(() => watchDates.value.length)

const hasAnything = computed(
  () => trakt.connected.value || watched.value.length > 0
)
</script>

<template>
  <div class="stats">
    <header class="stats__head">
      <h1 class="stats__title"><BarChart3 :size="24" /> 观看统计</h1>
      <p v-if="!trakt.connected.value" class="stats__hint">
        连接 Trakt 后可显示完整的观看时长、集数、评分与日历（当前仅统计库内已标记「已看」的内容）
      </p>
    </header>

    <div v-if="!hasAnything" class="stats__empty">
      <BarChart3 :size="44" />
      <p>还没有可统计的数据</p>
      <span>连接 Trakt（用 mpv 播放会自动同步），或在详情页标记「已看」，这里就会出现你的观影统计</span>
    </div>

    <template v-else>
      <!-- 概览 -->
      <section class="cards">
        <div v-for="o in overview" :key="o.label" class="card">
          <div class="card__icon"><component :is="o.icon" :size="20" /></div>
          <div class="card__num">{{ o.value.toLocaleString() }}<span class="card__unit">{{ o.unit }}</span></div>
          <div class="card__label">{{ o.label }}</div>
        </div>
      </section>

      <!-- 观看日历热力图 -->
      <section v-if="trakt.connected.value && totalPlays" class="panel">
        <h2 class="panel__title">观看日历<span class="panel__sub">近一年 · 共 {{ totalPlays }} 次观看</span></h2>
        <div class="heat">
          <div v-for="(w, wi) in heatmap" :key="wi" class="heat__col">
            <span
              v-for="(d, di) in w"
              :key="di"
              class="heat__cell"
              :data-level="d.level"
              :title="`${d.date} · ${d.count} 次`"
            />
          </div>
        </div>
        <div class="heat__legend">
          <span>少</span>
          <span class="heat__cell" data-level="0" />
          <span class="heat__cell" data-level="1" />
          <span class="heat__cell" data-level="2" />
          <span class="heat__cell" data-level="3" />
          <span class="heat__cell" data-level="4" />
          <span>多</span>
        </div>
      </section>

      <div class="grid2">
        <!-- 类型偏好 -->
        <section v-if="genreBars.length" class="panel">
          <h2 class="panel__title">类型偏好<span class="panel__sub">库内已看</span></h2>
          <div class="bars">
            <div v-for="g in genreBars" :key="g.name" class="bar">
              <span class="bar__name">{{ g.name }}</span>
              <div class="bar__track"><span class="bar__fill" :style="{ width: g.pct + '%' }" /></div>
              <span class="bar__val">{{ g.count }}</span>
            </div>
          </div>
        </section>

        <!-- 评分分布 -->
        <section v-if="hasRatings" class="panel">
          <h2 class="panel__title">评分分布<span class="panel__sub">Trakt</span></h2>
          <div class="bars">
            <div v-for="r in ratingBars" :key="r.score" class="bar">
              <span class="bar__name bar__name--score">★ {{ r.score }}</span>
              <div class="bar__track"><span class="bar__fill" :style="{ width: r.pct + '%' }" /></div>
              <span class="bar__val">{{ r.count }}</span>
            </div>
          </div>
        </section>
      </div>

      <!-- 常看演员 -->
      <section v-if="topActors.length" class="panel">
        <h2 class="panel__title">常看演员<span class="panel__sub">库内已看</span></h2>
        <div class="actors">
          <div v-for="a in topActors" :key="a.name" class="actor">
            <div class="actor__ava">
              <img v-if="a.avatarUrl" :src="a.avatarUrl" :alt="a.name" loading="lazy" />
              <span v-else>{{ a.name.charAt(0) }}</span>
            </div>
            <span class="actor__name">{{ a.name }}</span>
            <span class="actor__count">{{ a.count }} 部</span>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.stats {
  height: 100%;
  overflow-y: auto;
  padding: 26px 34px 50px;
}
.stats__head {
  margin-bottom: 24px;
}
.stats__title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 26px;
  font-weight: 800;
}
.stats__hint {
  margin-top: 8px;
  font-size: 13px;
  color: var(--text-mute);
}
.stats__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 80px 20px;
  text-align: center;
  color: var(--text-mute);
}
.stats__empty p {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-dim);
}
.stats__empty span {
  max-width: 380px;
  font-size: 13px;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 14px;
  margin-bottom: 20px;
}
.card {
  padding: 18px 20px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
}
.card__icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  margin-bottom: 14px;
}
.card__num {
  font-size: 32px;
  font-weight: 800;
  line-height: 1;
}
.card__unit {
  margin-left: 4px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-mute);
}
.card__label {
  margin-top: 6px;
  font-size: 13px;
  color: var(--text-dim);
}

.panel {
  padding: 20px 22px;
  margin-bottom: 18px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
}
.panel__title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 17px;
  font-weight: 700;
  margin-bottom: 16px;
}
.panel__sub {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-mute);
}
.grid2 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 18px;
}
.grid2 .panel {
  margin-bottom: 0;
}
.grid2 {
  margin-bottom: 18px;
}

.bars {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.bar {
  display: flex;
  align-items: center;
  gap: 12px;
}
.bar__name {
  flex-shrink: 0;
  width: 76px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bar__name--score {
  width: 44px;
  color: var(--accent);
}
.bar__track {
  flex: 1;
  height: 10px;
  border-radius: var(--r-pill);
  background: var(--surface-2);
  overflow: hidden;
}
.bar__fill {
  display: block;
  height: 100%;
  border-radius: var(--r-pill);
  background: linear-gradient(90deg, var(--accent), var(--accent-2));
  transition: width 0.5s var(--ease);
}
.bar__val {
  flex-shrink: 0;
  width: 34px;
  text-align: right;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text-mute);
}

/* 热力图 */
.heat {
  display: flex;
  gap: 3px;
  overflow-x: auto;
  padding-bottom: 4px;
}
.heat__col {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.heat__cell {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  background: var(--surface-2);
  flex-shrink: 0;
}
.heat__cell[data-level='1'] {
  background: color-mix(in srgb, var(--accent) 30%, transparent);
}
.heat__cell[data-level='2'] {
  background: color-mix(in srgb, var(--accent) 52%, transparent);
}
.heat__cell[data-level='3'] {
  background: color-mix(in srgb, var(--accent) 74%, transparent);
}
.heat__cell[data-level='4'] {
  background: var(--accent);
}
.heat__legend {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 12px;
  font-size: 12px;
  color: var(--text-mute);
}

.actors {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 14px;
}
.actor {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
}
.actor__ava {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--surface-2);
  display: grid;
  place-items: center;
  font-size: 22px;
  font-weight: 700;
  color: var(--text-mute);
}
.actor__ava img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.actor__name {
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 92px;
}
.actor__count {
  font-size: 11.5px;
  color: var(--text-mute);
}
</style>
