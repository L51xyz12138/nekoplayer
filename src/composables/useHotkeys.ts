import { onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'

// 全局键盘快捷键：
// - `/` 聚焦搜索框
// - 方向键在卡片间「空间导航」（上下按最近列、左右按 DOM 顺序），Enter/Space 由卡片自身处理
// - Esc：在输入框内则失焦；在详情/合集页则返回

function focusCard(el: HTMLElement) {
  el.focus()
  // block+inline nearest：纵向网格与横向行（剧集/最近添加）都能跟随滚动
  el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
}

function navigateCards(key: string): boolean {
  const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-nav-card]'))
  if (!cards.length) return false
  const cur = document.activeElement as HTMLElement | null
  const idx = cur ? cards.indexOf(cur) : -1

  // 没有选中卡片：方向键先聚焦第一张
  if (idx === -1) {
    focusCard(cards[0])
    return true
  }
  if (key === 'ArrowLeft') {
    if (cards[idx - 1]) focusCard(cards[idx - 1])
    return true
  }
  if (key === 'ArrowRight') {
    if (cards[idx + 1]) focusCard(cards[idx + 1])
    return true
  }

  // 上/下：找同列最近一行的卡片（空间导航，跨行/跨区块都自然）
  const cr = cards[idx].getBoundingClientRect()
  const cx = cr.left + cr.width / 2
  let best: HTMLElement | null = null
  let bestScore = Infinity
  for (const c of cards) {
    if (c === cards[idx]) continue
    const r = c.getBoundingClientRect()
    const inDir = key === 'ArrowDown' ? r.top > cr.top + 5 : r.top < cr.top - 5
    if (!inDir) continue
    const dy = Math.abs(r.top - cr.top)
    const dx = Math.abs(r.left + r.width / 2 - cx)
    const score = dy + dx * 2 // 优先同列、再取最近一行
    if (score < bestScore) {
      bestScore = score
      best = c
    }
  }
  if (best) focusCard(best)
  return true
}

export function useHotkeys() {
  const router = useRouter()

  function onKeydown(e: KeyboardEvent) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
    const el = document.activeElement as HTMLElement | null
    const typing =
      !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)

    if (e.key === '/' && !typing) {
      const input = document.querySelector<HTMLInputElement>('[data-search-input]')
      if (input) {
        e.preventDefault()
        input.focus()
      }
      return
    }

    if (e.key === 'Escape') {
      if (typing) {
        el!.blur()
        return
      }
      const name = router.currentRoute.value.name
      if (name === 'detail' || name === 'collection') router.back()
      return
    }

    if (
      !typing &&
      (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')
    ) {
      if (navigateCards(e.key)) e.preventDefault()
    }
  }

  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
}
