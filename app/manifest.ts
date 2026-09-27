import type { MetadataRoute } from 'next'

/**
 * The installed app ("Aggiungi a Home" / "Installa app"): full screen, dark,
 * the emblem as icon. Colours are the theme's --alpha-bg: a manifest cannot
 * read CSS variables.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Percorso Alpha',
    short_name: 'Alpha',
    description: 'Setting, vendite, incassi e progetti del team Percorso Alpha',
    lang: 'it',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#121214',
    theme_color: '#121214',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
