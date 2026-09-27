import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'

import { Toaster } from '@/components/ui/sonner'

import './globals.css'

const geistSans = Geist({
  variable: '--font-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Alpha Economics',
  description: 'Setting, vendite ed economia di Percorso Alpha',
  applicationName: 'Percorso Alpha',
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
      </body>
    </html>
  )
}
