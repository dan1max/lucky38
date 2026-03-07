'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const SYMBOLS = ['🍒', '🔔', '⭐', '💎', '7️⃣', '🎰']

const PAYTABLE = [
  { combo: '🎰 🎰 🎰', mult: 160, label: 'JACKPOT' },
  { combo: '7️⃣ 7️⃣ 7️⃣', mult: 75,  label: 'LUCKY SEVENS' },
  { combo: '💎 💎 💎', mult: 32,  label: 'DIAMONDS' },
  { combo: '⭐ ⭐ ⭐', mult: 16,  label: 'STARS' },
  { combo: '🔔 🔔 🔔', mult: 9,   label: 'BELLS' },
  { combo: '🍒 🍒 🍒', mult: 6,   label: 'CHERRIES' },
  { combo: '🍒 🍒 —',  mult: 3,   label: 'TWO CHERRIES' },
]

export default function SlotsPage() {
  const [balance, setBalance] = useState(0)
  const [betInput, setBetInput] = useState('50')
  const [displayReels, setDisplayReels] = useState(['🎰', '🎰', '🎰'])
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState<{
    outcome: string, payout: number, multiplier: number, label: string
  } | null>(null)
  const [error, setError] = useState('')

  const spinInterval = useRef<NodeJS.Timeout | null>(null)
  const pendingResult = useRef<any>(null)

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
    setError('')
    setResult(null)
    setSpinning(true)
    pendingResult.current = null

    let ticks = 0
    spinInterval.current = setInterval(() => {
      ticks++
      if (ticks >= 16) {
        if (spinInterval.current) clearInterval(spinInterval.current)
        spinInterval.current = null
        if (pendingResult.current) {
          const r = pendingResult.current
          setDisplayReels(r.reels)
          setBalance(r.newBalance)
          setResult({ outcome: r.outcome, payout: r.payout, multiplier: r.multiplier, label: r.label })
          setSpinning(false)
          pendingResult.current = null
        }
        return
      }
      setDisplayReels([
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
      ])
    }, 80)

    const res = await fetch('/api/games/slots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bet })
    })
    const data = await res.json()

    if (!res.ok) {
      if (spinInterval.current) clearInterval(spinInterval.current)
      setSpinning(false)
      setError(data.error || 'ERROR')
      return
    }

    if (!spinInterval.current) {
      setDisplayReels(data.reels)
      setBalance(data.newBalance)
      setResult({ outcome: data.outcome, payout: data.payout, multiplier: data.multiplier, label: data.label })
      setSpinning(false)
    } else {
      pendingResult.current = data
    }
  }

  const resultColor = result?.outcome === 'win' ? 'var(--gold)' : 'var(--red-bright)'

  return (
    <main style={{ minHeight: '100vh', background: 'var(--black)', padding: '2rem' }}>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '4px',
        background: 'linear-gradient(90deg, transparent, var(--gold), transparent)' }} />

      <div style={{ maxWidth: '600px', margin: '0 auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '2.5rem', color: 'var(--gold)' }}>SLOTS</h1>
            <p style={{ color: 'var(--gold-dim)', fontSize: '0.75rem', letterSpacing: '0.2em' }}>
              LUCKY 38 · NEW VEGAS
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

        <div className="panel" style={{ textAlign: 'center', marginBottom: '1.5rem', padding: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
            {displayReels.map((symbol, i) => (
              <div key={i} style={{
                width: '100px', height: '100px',
                background: 'var(--black)',
                border: `2px solid ${spinning ? 'var(--gold-bright)' : 'var(--gold-dim)'}`,
                borderRadius: '8px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '3rem',
                boxShadow: spinning ? '0 0 15px rgba(201,168,76,0.4)' : 'none',
                transition: 'box-shadow 0.2s',
              }}>
                {symbol}
              </div>
            ))}
          </div>

          {result && !spinning && (
            <div style={{
              padding: '0.75rem',
              border: `1px solid ${resultColor}`,
              background: 'rgba(0,0,0,0.4)',
              marginBottom: '1rem',
            }}>
              <p style={{ color: resultColor, fontSize: '1.1rem', letterSpacing: '0.2em' }}>
                {result.outcome === 'win'
                  ? `${result.label} · ${result.multiplier}x · +${result.payout.toLocaleString()} CAPS`
                  : 'NO MATCH — HOUSE WINS'}
              </p>
            </div>
          )}

          {error && (
            <p style={{ color: 'var(--red-bright)', fontSize: '0.85rem',
              letterSpacing: '0.1em', marginBottom: '1rem' }}>
              &gt; {error}
            </p>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center',
            justifyContent: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <div>
              <label style={{ color: 'var(--gold-dim)', fontSize: '0.75rem',
                letterSpacing: '0.2em', display: 'block', marginBottom: '0.4rem' }}>
                BET (CAPS)
              </label>
              <input className="input" type="number" min="10" max={balance}
                value={betInput} onChange={e => setBetInput(e.target.value)}
                style={{ width: '120px', textAlign: 'center' }} />
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              {[10, 25, 50, 100, 250].map(v => (
                <button key={v} className="btn"
                  style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                  onClick={() => setBetInput(String(v))}>
                  {v}
                </button>
              ))}
            </div>
          </div>

          <button className="btn btn-primary" onClick={handleSpin}
            disabled={spinning}
            style={{ width: '100%', fontSize: '1.1rem', padding: '0.9rem' }}>
            {spinning ? '[ SPINNING... ]' : '[ PULL LEVER ]'}
          </button>
        </div>

        <div className="panel">
          <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem', letterSpacing: '0.2em' }}>
            PAYTABLE
          </h3>
          <p style={{ color: 'var(--gold-dim)', fontSize: '0.7rem', letterSpacing: '0.15em',
            marginBottom: '1rem' }}>
            RTP ~81% · WEIGHTED REELS · 🍒 MOST COMMON · 🎰 RAREST
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {PAYTABLE.map((row, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0.4rem 0',
                borderBottom: i < PAYTABLE.length - 1 ? '1px solid rgba(201,168,76,0.1)' : 'none',
              }}>
                <span style={{ fontSize: '1rem', letterSpacing: '0.1em' }}>{row.combo}</span>
                <span style={{ color: 'var(--gold-dim)', fontSize: '0.75rem', letterSpacing: '0.1em' }}>
                  {row.label}
                </span>
                <span style={{ color: 'var(--gold)', fontSize: '0.85rem', letterSpacing: '0.1em' }}>
                  {row.mult}x
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: '4px',
        background: 'linear-gradient(90deg, transparent, var(--gold), transparent)' }} />
    </main>
  )
}