import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'

import { TOASTER_PANNELLO } from '@/components/marketing/toaster-pannello'
import { Toaster } from '@/components/ui/sonner'
import { DESCRIZIONE_BREVE, NOME_APP } from '@/lib/brand/nome'
import { origineCorrente } from '@/lib/auth/origine-server'

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

export const viewport: Viewport = {
  themeColor: '#121214',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="it"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {children}
        <Toaster theme="dark" position="top-center" richColors />
        {/* the content panel's toasts (TOAST_NEL_PANNELLO): never over its header, never over the bottom bar */}
        <Toaster
          id={TOASTER_PANNELLO}
          theme="dark"
          position="bottom-right"
          richColors
          offset={{ bottom: 'var(--toast-pannello-basso)' }}
          mobileOffset={{ bottom: 'var(--toast-pannello-basso)' }}
          containerAriaLabel="Notifiche del contenuto"
        />
      </body>
    </html>
  )
}
