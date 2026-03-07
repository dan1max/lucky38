'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import GameGuard from '@/components/GameGuard'

const ALL_SYMBOLS = ['🍒','🔔','⭐','💎','7️⃣','🎰']

const PAYTABLE = [
  { combo: '🎰🎰🎰', mult: 160 },
  { combo: '7️⃣7️⃣7️⃣',  mult: 75  },
  { combo: '💎💎💎',  mult: 32  },
  { combo: '⭐⭐⭐',   mult: 16  },
  { combo: '🔔🔔🔔',  mult: 9   },
  { combo: '🍒🍒🍒',  mult: 6   },
  { combo: '🍒🍒 —', mult: 3   },
]

export default function SlotsPage() {
  const [balance, setBalance] = useState(0)
  const [betInput, setBetInput] = useState('10')
  const [reels, setReels] = useState(['🎰','🎰','🎰'])
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState<{ multiplier: number; label: string; payout: number } | null>(null)
  const [error, setError] = useState('')
  const pendingResult = useRef<{ reels: string[]; multiplier: number; label: string; payout: number; newBalance: number } | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase.from('profiles').select('caps_balance').eq('id', user.id).single()
      if (data) setBalance(data.caps_balance)
    }
    load()
  }, [])

  async function handleSpin() {
    const bet = parseInt(betInput)
    if (isNaN(bet) || bet < 10) { setError('MINIMUM BET IS 10 CAPS'); return }
    if (bet > balance) { setError('INSUFFICIENT CAPS'); return }
    setError(''); setSpinning(true); setResult(null)
    pendingResult.current = null

    const res = await fetch('/api/games/slots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bet })
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'ERROR'); setSpinning(false); return }
    pendingResult.current = data

    let ticks = 0
    const total = 16
    const interval = setInterval(() => {
      ticks++
      if (ticks >= total) {
        clearInterval(interval)
        const r = pendingResult.current!
        setReels(r.reels)
        setBalance(r.newBalance)
        setResult({ multiplier: r.multiplier, label: r.label, payout: r.payout })
        setSpinning(false)
      } else {
        setReels(ALL_SYMBOLS.sort(() => Math.random() - 0.5).slice(0, 3))
      }
    }, 80)
  }

  const resultColor = result
    ? result.multiplier > 0 ? 'var(--gold)' : 'var(--red-bright)'
    : 'transparent'

  return (
    <GameGuard gameKey="slots_open">
      <main style={{ minHeight: '100vh', background: 'var(--black)', padding: '2rem' }}>
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '4px',
          background: 'linear-gradient(90deg, transparent, var(--gold), transparent)' }} />

        <div style={{ maxWidth: '550px', margin: '0 auto' }}>

          <div style={{ display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h1 style={{ fontSize: '2.5rem', color: 'var(--gold)' }}>SLOTS</h1>
              <p style={{ color: 'var(--gold-dim)', fontSize: '0.75rem', letterSpacing: '0.2em' }}>
                THREE REELS · LUCKY 38
              </p>
            </div>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <span className="caps-badge">💰 {balance.toLocaleString()} CAPS</span>
              <Link href="/lobby">
                <button className="btn" style={{ padding: '0.4rem 1rem', fontSize: '0.75rem' }}>
                  ← LOBBY
                </button>
              </Link>
            </div>
          </div>

          {/* Machine */}
          <div className="panel" style={{ textAlign: 'center', marginBottom: '1.5rem', padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
              {reels.map((sym, i) => (
                <div key={i} style={{
                  width: '90px', height: '90px',
                  background: 'var(--black-soft)', border: '2px solid var(--gold)',
                  borderRadius: '8px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '2.5rem',
                  boxShadow: spinning ? '0 0 20px rgba(201,168,76,0.3)' : 'none',
                  transition: 'box-shadow 0.2s',
                }}>
                  {sym}
                </div>
              ))}
            </div>

            {result && (
              <div style={{ padding: '0.75rem', border: `1px solid ${resultColor}`,
                background: 'rgba(0,0,0,0.4)' }}>
                <p style={{ color: resultColor, fontSize: '1.1rem', letterSpacing: '0.2em' }}>
                  {result.multiplier > 0
                    ? `${result.label} · +${(result.payout).toLocaleString()} CAPS`
                    : 'NO MATCH — HOUSE WINS'}
                </p>
              </div>
            )}
          </div>

          {/* Paytable */}
          <div className="panel" style={{ marginBottom: '1.5rem' }}>
            <p style={{ color: 'var(--gold-dim)', fontSize: '0.7rem',
              letterSpacing: '0.2em', marginBottom: '0.75rem' }}>
              PAYTABLE
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              {PAYTABLE.map((row, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '0.2rem 0',
                  borderBottom: '1px solid rgba(201,168,76,0.08)',
                }}>
                  <span style={{ fontSize: '0.9rem' }}>{row.combo}</span>
                  <span style={{ color: 'var(--gold)', fontSize: '0.8rem' }}>{row.mult}×</span>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <p style={{ color: 'var(--red-bright)', fontSize: '0.85rem',
              letterSpacing: '0.1em', marginBottom: '1rem' }}>
              &gt; {error}
            </p>
          )}

          {/* Controls */}
          <div className="panel">
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end',
              flexWrap: 'wrap', marginBottom: '1rem' }}>
              <div style={{ flex: 1, minWidth: '100px' }}>
                <label style={{ color: 'var(--gold-dim)', fontSize: '0.75rem',
                  letterSpacing: '0.2em', display: 'block', marginBottom: '0.4rem' }}>
                  BET (CAPS)
                </label>
                <input className="input" type="number" min="10" max={balance}
                  value={betInput} onChange={e => setBetInput(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {[10, 25, 50, 100].map(v => (
                  <button key={v} className="btn"
                    style={{ padding: '0.4rem 0.7rem', fontSize: '0.75rem' }}
                    onClick={() => setBetInput(String(v))}>
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <button className="btn btn-primary" onClick={handleSpin}
              disabled={spinning} style={{ width: '100%', fontSize: '1rem', padding: '0.75rem' }}>
              {spinning ? '[ SPINNING... ]' : '[ PULL ]'}
            </button>
          </div>

        </div>

        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: '4px',
          background: 'linear-gradient(90deg, transparent, var(--gold), transparent)' }} />
      </main>
    </GameGuard>
  )
}