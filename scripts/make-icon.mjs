/**
 * Генератор иконки приложения: тёмный скруглённый квадрат с открытой книгой.
 * Рисуем сами в RGBA-буфер, кодируем PNG (zlib) и собираем .ico с несколькими размерами.
 * Запуск: node scripts/make-icon.mjs
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const buildDir = join(root, 'build')

/* ------------------------------------------------------------------ PNG */

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let crc = -1
  for (let index = 0; index < buffer.length; index += 1) {
    crc = CRC_TABLE[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)
  return Buffer.concat([length, typeBuffer, data, crc])
}

function encodePng(size, rgba) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // RGBA
  header[10] = 0
  header[11] = 0
  header[12] = 0

  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ------------------------------------------------------------------ рисование */

const SUPERSAMPLE = 4

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

function quadPoints(from, control, to, steps = 28) {
  const points = []
  for (let index = 1; index <= steps; index += 1) {
    const t = index / steps
    const inverse = 1 - t
    points.push([
      inverse * inverse * from[0] + 2 * inverse * t * control[0] + t * t * to[0],
      inverse * inverse * from[1] + 2 * inverse * t * control[1] + t * t * to[1],
    ])
  }
  return points
}

function insidePolygon(polygon, x, y) {
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const [xi, yi] = polygon[index]
    const [xj, yj] = polygon[previous]
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

function offsetPolygon(polygon, dx, dy) {
  return polygon.map(([x, y]) => [x + dx, y + dy])
}

function mirrorPolygon(polygon) {
  return polygon.map(([x, y]) => [1 - x, y])
}

/** Левя страница: верх и низ слегка изогнуты, внешний край — дугой. */
function leftPage() {
  const topOuter = [0.155, 0.345]
  const topInner = [0.5, 0.418]
  const bottomInner = [0.5, 0.7]
  const bottomOuter = [0.155, 0.632]

  return [
    ...quadPoints(topOuter, [0.35, 0.387], topInner),
    bottomInner,
    ...quadPoints(bottomInner, [0.35, 0.662], bottomOuter),
    ...quadPoints(bottomOuter, [0.126, 0.49], topOuter),
  ]
}

function lineQuad(fromX, toX, yAt, thickness = 0.0075, left = false) {
  const x0 = left ? fromX : 1 - fromX
  const x1 = left ? toX : 1 - toX
  const y0 = yAt(fromX)
  const y1 = yAt(toX)
  const dx = x1 - x0
  const dy = y1 - y0
  const length = Math.hypot(dx, dy) || 1
  const nx = (-dy / length) * thickness * 0.5
  const ny = (dx / length) * thickness * 0.5
  return [
    [x0 - nx, y0 - ny],
    [x1 - nx, y1 - ny],
    [x1 + nx, y1 + ny],
    [x0 + nx, y0 + ny],
  ]
}

// Линия на левой странице: считаем, где проходит страница на заданной высоте.
const pageTop = (x) => 0.345 + ((x - 0.155) / 0.345) * (0.418 - 0.345)
const pageBottom = (x) => 0.632 + ((x - 0.155) / 0.345) * (0.7 - 0.632)
const pageLine = (t) => (x) => pageTop(x) + (pageBottom(x) - pageTop(x)) * t

const leftBook = leftPage()
const rightBook = mirrorPolygon(leftBook)
const leftBlock = offsetPolygon(leftBook, 0, 0.013)
const rightBlock = offsetPolygon(rightBook, 0, 0.013)

const textLines = []
for (let index = 0; index < 4; index += 1) {
  const t = 0.34 + index * 0.14
  const short = index === 3
  textLines.push(lineQuad(0.215, short ? 0.4 : 0.455, pageLine(t), 0.0068, true))
  textLines.push(lineQuad(0.215, short ? 0.4 : 0.455, pageLine(t), 0.0068, false))
}

const bookmark = [
  [0.632, 0.402],
  [0.674, 0.407],
  [0.674, 0.585],
  [0.653, 0.562],
  [0.632, 0.585],
]

function render(size) {
  const scale = SUPERSAMPLE
  const N = size * scale
  const buffer = new Float32Array(N * N * 4) // r,g,b,a — 0..1

  const blend = (index, r, g, b, alpha) => {
    if (alpha <= 0.0001) return
    const inverse = 1 - alpha
    buffer[index] = r * alpha + buffer[index] * inverse
    buffer[index + 1] = g * alpha + buffer[index + 1] * inverse
    buffer[index + 2] = b * alpha + buffer[index + 2] * inverse
    buffer[index + 3] = alpha + buffer[index + 3] * inverse
  }

  const roundedRectSdf = (u, v) => {
    const left = 0.045
    const top = 0.045
    const right = 0.955
    const bottom = 0.955
    const radius = 0.188
    const qx = Math.abs(u - (left + right) / 2) - ((right - left) / 2 - radius)
    const qy = Math.abs(v - (top + bottom) / 2) - ((bottom - top) / 2 - radius)
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius
  }

  const shadow = (u, v) => {
    const dx = (u - 0.5) / 0.345
    const dy = (v - 0.712) / 0.036
    const distance = dx * dx + dy * dy
    return distance <= 1 ? (1 - distance) * 0.5 : 0
  }

  for (let py = 0; py < N; py += 1) {
    const v = (py + 0.5) / N
    for (let px = 0; px < N; px += 1) {
      const u = (px + 0.5) / N
      const index = (py * N + px) * 4

      if (roundedRectSdf(u, v) > 0) continue

      // Фон: тёмный градиент и мягкое синее свечение за книгой.
      const gradient = clamp(v, 0, 1)
      let r = (0.11 * (1 - gradient) + 0.045 * gradient)
      let g = (0.135 * (1 - gradient) + 0.055 * gradient)
      let b = (0.175 * (1 - gradient) + 0.075 * gradient)
      const glowDistance = Math.hypot(u - 0.5, (v - 0.47) * 1.15)
      const glow = Math.max(0, 1 - glowDistance / 0.52) ** 2 * 0.42
      r += 0.055 * glow
      g += 0.16 * glow
      b += 0.36 * glow

      blend(index, r, g, b, 1)

      const shade = shadow(u, v)
      if (shade > 0) blend(index, 0, 0, 0, shade)

      // Толщина книги — те же страницы, сдвинутые вниз.
      if (insidePolygon(leftBlock, u, v) || insidePolygon(rightBlock, u, v)) {
        blend(index, 0.62, 0.6, 0.55, 1)
      }

      const inLeft = insidePolygon(leftBook, u, v)
      const inRight = insidePolygon(rightBook, u, v)
      if (inLeft || inRight) {
        // Ближе к корешку страница темнее: так книга читается объёмной.
        const distance = Math.abs(u - 0.5)
        const light = 0.9 + Math.min(distance / 0.35, 1) * 0.1
        if (inLeft) blend(index, 0.95 * light, 0.933 * light, 0.9 * light, 1)
        else blend(index, 0.885 * light, 0.865 * light, 0.815 * light, 1)
      }

      // Тень в корешке.
      if (u > 0.47 && u < 0.53 && v > 0.4 && v < 0.71) {
        const strength = (1 - Math.abs(u - 0.5) / 0.03) * 0.55
        if (strength > 0) blend(index, 0.05, 0.05, 0.05, strength)
      }

      for (const line of textLines) {
        if (insidePolygon(line, u, v)) blend(index, 0.54, 0.51, 0.44, 0.62)
      }

      if (insidePolygon(bookmark, u, v)) {
        const edge = v > 0.57
        blend(index, edge ? 0.13 : 0.24, edge ? 0.42 : 0.61, edge ? 0.72 : 0.95, 1)
      }

      // Тонкая светлая окантовка плитки.
      if (roundedRectSdf(u, v) > -0.004) blend(index, 1, 1, 1, 0.1)
    }
  }

  // Уменьшение с усреднением: края получаются сглаженными без отдельного AA.
  const out = Buffer.alloc(size * size * 4)
  const block = scale * scale
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < scale; sy += 1) {
        for (let sx = 0; sx < scale; sx += 1) {
          const index = ((y * scale + sy) * N + (x * scale + sx)) * 4
          const alpha = buffer[index + 3]
          r += buffer[index] * alpha
          g += buffer[index + 1] * alpha
          b += buffer[index + 2] * alpha
          a += alpha
        }
      }
      const outIndex = (y * size + x) * 4
      if (a > 0) {
        out[outIndex] = Math.round(clamp(r / a, 0, 1) * 255)
        out[outIndex + 1] = Math.round(clamp(g / a, 0, 1) * 255)
        out[outIndex + 2] = Math.round(clamp(b / a, 0, 1) * 255)
      }
      out[outIndex + 3] = Math.round(clamp(a / block, 0, 1) * 255)
    }
  }

  return out
}

/* ------------------------------------------------------------------ ICO */

function buildIco(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)

  const directory = Buffer.alloc(16 * entries.length)
  let offset = 6 + directory.length

  entries.forEach((entry, index) => {
    const base = index * 16
    directory[base] = entry.size >= 256 ? 0 : entry.size
    directory[base + 1] = entry.size >= 256 ? 0 : entry.size
    directory[base + 2] = 0
    directory[base + 3] = 0
    directory.writeUInt16LE(1, base + 4)
    directory.writeUInt16LE(32, base + 6)
    directory.writeUInt32LE(entry.data.length, base + 8)
    directory.writeUInt32LE(offset, base + 12)
    offset += entry.data.length
  })

  return Buffer.concat([header, directory, ...entries.map((entry) => entry.data)])
}

mkdirSync(buildDir, { recursive: true })

const sizes = [16, 24, 32, 48, 64, 128, 256]
const pngs = sizes.map((size) => ({ size, data: encodePng(size, render(size)) }))
writeFileSync(join(buildDir, 'icon.ico'), buildIco(pngs))
writeFileSync(join(buildDir, 'icon.png'), encodePng(512, render(512)))

console.log(`[icon] build/icon.ico: ${sizes.join(', ')}; build/icon.png: 512`)
