// Browser and home-screen icons from the brand artwork (run once, output in app/).
// Small sizes use the emblem only (house and figure): the lettering of the
// full logo is unreadable at 16-48 px. The iPhone home screen gets the full logo.
// Usage: node scripts/genera-icone.mjs
import { mkdir, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const SORGENTE = 'public/brand/percorso-alpha.webp' // 1424 x 1592, on black
const NERO = { r: 0, g: 0, b: 0, alpha: 1 }

// the emblem: 1200 px wide around the house, down to where the lettering starts
const emblema = await sharp(SORGENTE)
  .extract({ left: 129, top: 0, width: 1200, height: 1150 })
  .extend({ bottom: 50, background: NERO })
  .png()
  .toBuffer()

// RGBA: Next reads the .ico entries only with an alpha channel
const png = (sorgente, lato) => sharp(sorgente).resize(lato, lato).ensureAlpha().png({ compressionLevel: 9 }).toBuffer()

await writeFile('app/icon.png', await png(emblema, 192))

// the full logo, squared on black, for the iPhone home screen
const logoQuadrato = await sharp(SORGENTE)
  .extend({ left: 84, right: 84, background: NERO })
  .png()
  .toBuffer()
await writeFile('app/apple-icon.png', await png(logoQuadrato, 180))

// installed app (app/manifest.ts): the emblem, plus a "maskable" one with a
// safe margin for Android, which cuts icons into circles and squircles
await mkdir('public/icons', { recursive: true })
await writeFile('public/icons/icon-192.png', await png(emblema, 192))
await writeFile('public/icons/icon-512.png', await png(emblema, 512))
const ridotto = await sharp(emblema).resize(360, 360).png().toBuffer()
const maschera = await sharp({ create: { width: 512, height: 512, channels: 4, background: NERO } })
  .composite([{ input: ridotto, gravity: 'center' }])
  .png()
  .toBuffer()
await writeFile('public/icons/icon-maskable-512.png', await png(maschera, 512))

// favicon.ico with PNG entries (every current browser reads them)
const lati = [16, 32, 48]
const immagini = await Promise.all(lati.map((lato) => png(emblema, lato)))
const intestazione = Buffer.alloc(6)
intestazione.writeUInt16LE(0, 0) // reserved
intestazione.writeUInt16LE(1, 2) // icon
intestazione.writeUInt16LE(lati.length, 4)
let offset = 6 + 16 * lati.length
const voci = lati.map((lato, i) => {
  const voce = Buffer.alloc(16)
  voce.writeUInt8(lato, 0)
  voce.writeUInt8(lato, 1)
  voce.writeUInt8(0, 2) // no palette
  voce.writeUInt8(0, 3)
  voce.writeUInt16LE(1, 4) // colour planes
  voce.writeUInt16LE(32, 6) // bits per pixel
  voce.writeUInt32LE(immagini[i].length, 8)
  voce.writeUInt32LE(offset, 12)
  offset += immagini[i].length
  return voce
})
await writeFile('app/favicon.ico', Buffer.concat([intestazione, ...voci, ...immagini]))
console.log('icone scritte: app/favicon.ico, app/icon.png, app/apple-icon.png, public/icons/*')
