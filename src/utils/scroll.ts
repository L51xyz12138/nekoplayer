// 把鼠标滚轮的纵向滚动转成横向滚动，供带左右按钮的横向列表（筹码/卡片行/演职人员）用。
// 智能放行：本身横向滚不动、或已滚到该方向尽头时，不拦截 → 让页面继续纵向滚，不「困住」滚轮。
export function wheelToHorizontal(e: WheelEvent) {
  const el = e.currentTarget as HTMLElement | null
  if (!el || e.deltaY === 0) return
  if (el.scrollWidth <= el.clientWidth) return // 没有横向溢出
  const atStart = el.scrollLeft <= 0
  const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1
  if ((e.deltaY < 0 && atStart) || (e.deltaY > 0 && atEnd)) return // 已到头，放行给页面
  e.preventDefault()
  el.scrollLeft += e.deltaY
}
