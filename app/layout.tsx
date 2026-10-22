import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { cookies } from 'next/headers'

import { TOASTER_PANNELLO } from '@/components/marketing/toaster-pannello'
import { TemaProvider } from '@/components/tema/tema-provider'
import { ToasterTema } from '@/components/tema/toaster-tema'
import { DESCRIZIONE_BREVE, NOME_APP } from '@/lib/brand/nome'
import { origineCorrente } from '@/lib/auth/origine-server'
import { COOKIE_TEMA, classeTema, temaDaCookie } from '@/lib/tema/tema'

import './globals.css'

const geistSans = Geist({
  variable: '--font-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

/**
 * Absolute links in the previews of WhatsApp, Telegram, email: from the domain
 * the page is served on (checked against ours), not from the build-time
 * APP_URL, which a changed domain leaves behind until the next build.
 */
export async function generateMetadata(): Promise<Metadata> {
  return { ...metadata, metadataBase: new URL(await origineCorrente()) }
}

const metadata: Metadata = {
  title: NOME_APP,
  description: DESCRIZIONE_BREVE,
  applicationName: NOME_APP,
  openGraph: {
    title: `${NOME_APP} · Percorso Alpha`,
    description: DESCRIZIONE_BREVE,
    siteName: NOME_APP,
    locale: 'it_IT',
    type: 'website',
  },
  // a private tool: not in search results
  robots: { index: false, follow: false },
  // "Aggiungi a Home" on the iPhone opens it full screen, like an app
  appleWebApp: { capable: true, title: 'Alpha', statusBarStyle: 'black' },
}

/** The browser's own bar follows the page: --alpha-bg of the theme (the device's scheme for «Sistema»). */
export async function generateViewport(): Promise<Viewport> {
  const tema = temaDaCookie((await cookies()).get(COOKIE_TEMA)?.value)
  if (tema === 'chiaro') return { themeColor: '#f5efe8' }
  if (tema === 'sistema') {
    return {
      themeColor: [
        { media: '(prefers-color-scheme: light)', color: '#f5efe8' },
        { media: '(prefers-color-scheme: dark)', color: '#121214' },
      ],
    }
  }
  return { themeColor: '#121214' }
}

/**
 * First paint with the right theme, no flash: «Sistema» is the one case the server cannot
 * know (the device's scheme), so before anything is painted this adds the light class
 * when the device is light. «Chiaro» and «Scuro» are already in the class from the cookie.
 */
const SCRIPT_TEMA_SISTEMA =
  "try{var h=document.documentElement;if(h.classList.contains('sistema')&&matchMedia('(prefers-color-scheme: light)').matches)h.classList.add('light')}catch(e){}"

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  // the theme of this device (cookie «alpha_tema»): «scuro», as the app always was, until someone chooses
  const tema = temaDaCookie((await cookies()).get(COOKIE_TEMA)?.value)
  return (
    // suppressHydrationWarning: the first-paint script may add «light» to the class for «Sistema»
    <html
      lang="it"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased ${classeTema(tema)}`.trim()}
    >
      <head>
        {tema === 'sistema' ? <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA_SISTEMA }} /> : null}
      </head>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <TemaProvider iniziale={tema}>
        {children}
        <ToasterTema position="top-center" richColors />
        {/* the content panel's toasts (TOAST_NEL_PANNELLO): never over its header, never over the bottom bar */}
        <ToasterTema
          id={TOASTER_PANNELLO}
          position="bottom-right"
          richColors
          offset={{ bottom: 'var(--toast-pannello-basso)' }}
          mobileOffset={{ bottom: 'var(--toast-pannello-basso)' }}
          containerAriaLabel="Notifiche del contenuto"
        />
        </TemaProvider>
      </body>
    </html>
  )
}
