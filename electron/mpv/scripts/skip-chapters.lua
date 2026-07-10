-- 自动跳过片头/片尾章节（按章节名匹配）。
-- 默认关闭，由 NekoPlayer 在设置开启时传 --script-opts=skipchapters-enabled=yes。
-- 仅对「带命名章节」的媒体有效（如部分番剧/蓝光 rip 的 Intro/OP/ED 章节）。
local mp = require 'mp'
local options = require 'mp.options'

local o = { enabled = false }
options.read_options(o, 'skipchapters')

-- 精确匹配（op/ed 太短，只在整名相等时才算，避免误伤）
local exact = {
  ['op'] = true, ['ed'] = true, ['ncop'] = true, ['nced'] = true,
  ['片头'] = true, ['片尾'] = true, ['オープニング'] = true, ['エンディング'] = true
}
-- 词边界匹配的英文关键词（用 %f 前沿避免误伤，如 "Ascending" 不该命中 "ending"）
local words = {
  'intro', 'outro', 'opening', 'ending', 'avant', 'preview',
  'next episode', 'credits'
}
-- 原样子串匹配的中文关键词（CJK 不适用 %w 词边界）
local cjk = { '预告', '下集' }

local function is_skip(title)
  if not title then return false end
  local t = title:lower():gsub('^%s+', ''):gsub('%s+$', '')
  if exact[t] then return true end
  for _, p in ipairs(words) do
    if t:find('%f[%w]' .. p .. '%f[%W]') then return true end
  end
  for _, p in ipairs(cjk) do
    if t:find(p, 1, true) then return true end
  end
  return false
end

local function on_chapter(_, idx)
  if not o.enabled or not idx or idx < 0 then return end
  local chapters = mp.get_property_native('chapter-list')
  if not chapters then return end
  local cur = chapters[idx + 1] -- Lua 表 1 起始
  if cur and is_skip(cur.title) then
    local nxt = chapters[idx + 2]
    if nxt then
      mp.commandv('seek', nxt.time, 'absolute', 'exact')
      mp.osd_message('已跳过：' .. (cur.title or ''))
    end
  end
end

mp.observe_property('chapter', 'number', on_chapter)
