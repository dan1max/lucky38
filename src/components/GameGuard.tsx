'use client'

import { useConfig } from '@/lib/config-context'
import Link from 'next/link'
import { ReactNode } from 'react'

export default function GameGuard({
  children,
  gameKey,
}: {
  children: ReactNode
  gameKey: string
}) {
  const config = useConfig()

  const casinoOpen = config['casino_open'] !== 'false'
  const gameOpen = config[gameKey] !== 'false'
  const isOpen = casinoOpen && gameOpen
  const msg = config['maintenance_msg'] || 'THE LUCKY 38 IS TEMPORARILY CLOSED. — MR. HOUSE'

  if (Object.keys(config).length === 0) return null // still loading

  if (!isOpen) return (
    <main style={{
      minHeight: '100vh', background: 'var(--black)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: '2rem', padding: '2rem', textAlign: 'center',
    }}>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '4px',
        background: 'linear-gradient(90deg, transparent, var(--red-bright), transparent)' }} />

      <p style={{ fontSize: '4rem', color: 'var(--red-bright)', letterSpacing: '0.2em' }}>
        ⚠
      </p>
      <h1 style={{ fontSize: '2rem', color: 'var(--red-bright)', letterSpacing: '0.3em' }}>
        GAME CLOSED
      </h1>
      <p style={{ color: 'var(--white-dim)', fontSize: '0.9rem',
        letterSpacing: '0.15em', maxWidth: '400px', lineHeight: 1.8 }}>
        {msg}
      </p>
      <Link href="/lobby">
        <button className="btn" style={{ padding: '0.6rem 2rem' }}>
          ← RETURN TO LOBBY
        </button>
      </Link>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: '4px',
        background: 'linear-gradient(90deg, transparent, var(--red-bright), transparent)' }} />
    </main>
  )

  return <>{children}</>
}