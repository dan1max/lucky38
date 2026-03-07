import type { Metadata } from 'next'
import { VT323, Share_Tech_Mono } from 'next/font/google'
import './globals.css'
import BroadcastListener from '@/components/BroadcastListener'

const vt323 = VT323({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-vt323',
})

const shareTechMono = Share_Tech_Mono({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-share-tech-mono',
})

export const metadata: Metadata = {
  title: 'Lucky 38 Casino',
  description: 'New Vegas never sleeps.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${vt323.variable} ${shareTechMono.variable}`}>
        {children}
        <BroadcastListener />
      </body>
    </html>
  )
}