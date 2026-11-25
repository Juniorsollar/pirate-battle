// Converts the Starling/Sparrow XML ship atlases into TexturePacker JSON, the format PixiJS loads natively.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(import.meta.dirname, '..', 'public', 'assets', 'spritesheet')
const atlases = [
  { xml: 'ships_miscellaneous_sheet.xml', scale: 1 },
  // The provided "retina" ship sheet has the same 1024x512 size and frames as the default one, so it is 1x too.
  { xml: 'ships_miscellaneous_sheet_retina.xml', scale: 1 },
]

const attr = (tag, name) => {
  const match = tag.match(new RegExp(`\\b${name}="([^"]*)"`))
  if (!match) throw new Error(`Missing attribute "${name}" in ${tag}`)
  return match[1]
}

for (const { xml, scale } of atlases) {
  const source = readFileSync(join(dir, xml), 'utf8')
  const image = attr(source.match(/<TextureAtlas[^>]*>/)[0], 'imagePath')
  const frames = {}

  for (const [tag] of source.matchAll(/<SubTexture\b[^>]*\/>/g)) {
    const name = attr(tag, 'name').replace(/\.png$/, '')
    const [x, y, w, h] = ['x', 'y', 'width', 'height'].map((key) => Number(attr(tag, key)))
    if ([x, y, w, h].some((n) => !Number.isFinite(n))) throw new Error(`Invalid frame ${name}`)
    frames[name] = {
      frame: { x, y, w, h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w, h },
      sourceSize: { w, h },
    }
  }

  if (Object.keys(frames).length === 0) throw new Error(`No frames found in ${xml}`)

  const out = xml.replace(/\.xml$/, '.json')
  const json = { frames, meta: { app: 'scripts/convert-atlas.mjs', image, format: 'RGBA8888', scale: String(scale) } }
  writeFileSync(join(dir, out), `${JSON.stringify(json, null, 2)}\n`)
  console.log(`${out}: ${Object.keys(frames).length} frames`)
}
