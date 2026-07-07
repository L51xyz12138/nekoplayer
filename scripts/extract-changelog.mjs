// 从 CHANGELOG.md 提取指定版本的更新说明，写入 RELEASE_NOTES.md（供 CI 作为 Release 正文）
// 用法：node scripts/extract-changelog.mjs v0.1.2
import { readFileSync, writeFileSync } from 'node:fs'

const version = (process.argv[2] || '').replace(/^v/, '')
const md = readFileSync('CHANGELOG.md', 'utf-8')
const lines = md.split('\n')
const out = []
let capture = false

for (const line of lines) {
  if (/^##\s+/.test(line)) {
    if (capture) break // 遇到下一个版本标题就停止
    if (new RegExp(`^##\\s+v?${version.replace(/\./g, '\\.')}\\b`).test(line)) {
      capture = true
      continue
    }
  }
  if (capture) out.push(line)
}

const notes = out.join('\n').trim()
writeFileSync('RELEASE_NOTES.md', (notes || `版本 ${version}`) + '\n')
console.log('Release notes for ' + version + ':\n' + notes)
