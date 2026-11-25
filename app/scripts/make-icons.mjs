// Draws the Daily Reps app icon and writes every PNG size the PWA needs into public/.
// Run: node scripts/make-icons.mjs
import sharp from "sharp"
import { mkdirSync } from "node:fs"

mkdirSync("public", { recursive: true })

// A progress ring three-quarters closed around a dumbbell, on near-black.
// `scale` shrinks the artwork for the maskable icon, whose edges Android may crop.
function svg(scale = 1) {
  const r = 300 * scale
  const c = 2 * Math.PI * r
  const sw = 92 * scale
  const k = scale
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#0b0b0f"/>
  <circle cx="512" cy="512" r="${r}" fill="none" stroke="#3a1714" stroke-width="${sw}"/>
  <circle cx="512" cy="512" r="${r}" fill="none" stroke="#ff453a" stroke-width="${sw}" stroke-linecap="round"
    stroke-dasharray="${c * 0.74} ${c}" transform="rotate(-90 512 512)"/>
  <g fill="#ffffff" transform="translate(512 512) scale(${k}) translate(-512 -512)">
    <rect x="352" y="497" width="320" height="30" rx="15"/>
    <rect x="372" y="412" width="44" height="200" rx="22"/>
    <rect x="608" y="412" width="44" height="200" rx="22"/>
    <rect x="322" y="447" width="38" height="130" rx="19"/>
    <rect x="664" y="447" width="38" height="130" rx="19"/>
  </g>
</svg>`
}

const out = [
  ["public/pwa-512x512.png", 512, 1],
  ["public/pwa-192x192.png", 192, 1],
  ["public/apple-touch-icon.png", 180, 1],
  ["public/maskable-512x512.png", 512, 0.78],
  ["public/favicon-64.png", 64, 1],
]
for (const [file, size, scale] of out) {
  await sharp(Buffer.from(svg(scale))).resize(size, size).png().toFile(file)
  console.log("wrote", file)
}
