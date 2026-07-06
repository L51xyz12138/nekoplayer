// 从 build/icon.svg 生成 electron-builder 需要的 build/icon.png（1024×1024）
// electron-builder 会据此自动生成 macOS(.icns) / Windows(.ico) / Linux(.png) 各尺寸
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
const svg = path.join(root, '../buildResources/icon.svg')
const png = path.join(root, '../buildResources/icon.png')

await sharp(svg, { density: 384 }).resize(1024, 1024).png().toFile(png)

console.log('✓ 已生成 build/icon.png（1024×1024）')
