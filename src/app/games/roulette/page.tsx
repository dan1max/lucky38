'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const RED = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]

type Bet = { type: string; value: string | number; amount: number; label: string }
type SpinResult = { result: number; color: string; totalBet: number; totalPayout: number; newBalance: number; outcome: string }

const OUTSIDE_BETS = [
  { type: 'red',    value: 'red',   label: '🔴 RED',    pays: '1:1' },
  { type: 'black',  value: 'black', label: '⚫ BLACK',  pays: '1:1' },
  { type: 'even',   value: 'even',  label: 'EVEN',      pays: '1:1' },
  { type: 'odd',    value: 'odd',   label: 'ODD',       pays: '1:1' },
  { type: 'low',    value: 'low',   label: '1–18',      pays: '1:1' },
  { type: 'high',   value: 'high',  label: '19–36',     pays: '1:1' },
  { type: 'dozen',  value: '1',     label: '1ST 12',    pays: '2:1' },
  { type: 'dozen',  value: '2',     label: '2ND 12',    pays: '2:1' },
  { type: 'dozen',  value: '3',     label: '3RD 12',    pays: '2:1' },
  { type: 'column', value: '1',     label: 'COL 1',     pays: '2:1' },
  { type: 'column', value: '2',     label: 'COL 2',     pays: '2:1' },
  { type: 'column', value: '3',     label: 'COL 3',     pays: '2:1' },
]

export default function RoulettePage() {
  const [balance, setBalance] = useState(0)
  const [chipSize, setChipSize] = useState(10)
  const [bets, setBets] = useState<Bet[]>([])
  const [spinning, setSpinning] = useState(false)
  const [spinResult, setSpinResult] = useState<SpinResult | null>(null)
  const [displayNumber, setDisplayNumber] = useState<number | null>(null)
  const [error, setError] = useState('')
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

  function addBet(type: string, value: string | number, label: string) {
    const totalBet = bets.reduce((s, b) => s + b.amount, 0)
    if (totalBet + chipSize > balance) { setError('INSUFFICIENT CAPS'); return }
    setError('')
    setBets(prev => {
      const existing = prev.findIndex(b => b.type === type && b.value === value)
      if (existing >= 0) {
        const updated = [...prev]
        updated[existing] = { ...updated[existing], amount: updated[existing].amount + chipSize }
        return updated
      }
      return [...prev, { type, value, amount: chipSize, label }]
    })
  }

  function clearBets() { setBets([]); setSpinResult(null); setError('') }

  async function handleSpin() {
    if (bets.length === 0) { setError('PLACE AT LEAST ONE BET'); return }
    setError('')
    setSpinning(true)
    setSpinResult(null)

    // Animate number
    let ticks = 0
    const interval = setInterval(() => {
      setDisplayNumber(Math.floor(Math.random() * 37))
      ticks++
      if (ticks > 20) clearInterval(interval)
    }, 80)

    const res = await fetch('/api/games/roulette', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bets: bets.map(({ type, value, amount }) => ({ type, value, amount })) })
    })
    const data = await res.json()

    setTimeout(() => {
      clearInterval(interval)
      setSpinning(false)
      if (!res.ok) { setError(data.error || 'ERROR'); return }
      setDisplayNumber(data.result)
      setBalance(data.newBalance)
      setSpinResult(data)
    }, 1800)
  }

  const totalBet = bets.reduce((s, b) => s + b.amount, 0)
  const resultColor = spinResult?.outcome === 'win' ? 'var(--gold)'
    : spinResult?.outcome === 'push' ? 'var(--white-dim)' : 'var(--red-bright)'

  const wheelColor = displayNumber === null ? 'var(--gold-dim)'
    : displayNumber === 0 ? '#1a8a1a'
    : RED.includes(displayNumber) ? '#CC0000' : '#222'

  return (
    <main style={{ minHeight: '100vh', background: 'var(--black)', padding: '2rem' }}>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '4px',
        background: 'linear-gradient(90deg, transparent, var(--gold), transparent)' }} />

      <div style={{ maxWidth: '750px', margin: '0 auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '2.5rem', color: 'var(--gold)' }}>ROULETTE</h1>
            <p style={{ color: 'var(--gold-dim)', fontSize: '0.75rem', letterSpacing: '0.2em' }}>
              EUROPEAN · SINGLE ZERO · LUCKY 38
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

        {/* Wheel display */}
        <div className="panel" style={{ textAlign: 'center', marginBottom: '1.5rem', padding: '2rem' }}>
          <div style={{
            width: '120px', height: '120px', borderRadius: '50%',
            background: wheelColor,
            border: '4px solid var(--gold)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1.5rem',
            fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--white)',
            boxShadow: spinning ? '0 0 30px rgba(201,168,76,0.5)' : '0 0 10px rgba(0,0,0,0.5)',
            transition: 'background 0.3s, box-shadow 0.3s',
            fontFamily: 'VT323, monospace',
          }}>
            {displayNumber !== null ? displayNumber : '?'}
          </div>

          {spinResult && (
            <div style={{ padding: '0.75rem', border: `1px solid ${resultColor}`,
              background: 'rgba(0,0,0,0.4)', marginBottom: '1rem' }}>
              <p style={{ color: resultColor, fontSize: '1.1rem', letterSpacing: '0.2em' }}>
                {spinResult.outcome === 'win'
                  ? `YOU WIN · +${(spinResult.totalPayout - spinResult.totalBet).toLocaleString()} CAPS`
                  : spinResult.outcome === 'push' ? 'PUSH — BET RETURNED'
                  : 'HOUSE WINS'}
              </p>
            </div>
          )}

          {error && (
            <p style={{ color: 'var(--red-bright)', fontSize: '0.85rem',
              letterSpacing: '0.1em', marginBottom: '1rem' }}>
              &gt; {error}
            </p>
          )}
        </div>

        {/* Number grid 0-36 */}
        <div className="panel" style={{ marginBottom: '1.5rem' }}>
          <p style={{ color: 'var(--gold-dim)', fontSize: '0.7rem', letterSpacing: '0.2em',
            marginBottom: '1rem' }}>
            STRAIGHT UP BETS (35:1)
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: '3px' }}>
            {/* Zero */}
            <div style={{ gridColumn: 'span 1' }}>
              <button onClick={() => addBet('straight', 0, '0')}
                style={{
                  width: '100%', aspectRatio: '1', background: '#1a8a1a',
                  border: '1px solid var(--gold-dim)', borderRadius: '3px',
                  color: 'var(--white)', fontSize: '0.65rem', cursor: 'pointer',
                }}>0</button>
            </div>
            {/* 1-36 */}
            {Array.from({ length: 36 }, (_, i) => i + 1).map(n => (
              <button key={n} onClick={() => addBet('straight', n, String(n))}
                style={{
                  aspectRatio: '1', background: RED.includes(n) ? '#8B0000' : '#1a1a1a',
                  border: '1px solid var(--gold-dim)', borderRadius: '3px',
                  color: 'var(--white)', fontSize: '0.65rem', cursor: 'pointer',
                  transition: 'opacity 0.1s',
                }}>
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Outside bets */}
        <div className="panel" style={{ marginBottom: '1.5rem' }}>
          <p style={{ color: 'var(--gold-dim)', fontSize: '0.7rem', letterSpacing: '0.2em',
            marginBottom: '1rem' }}>
            OUTSIDE BETS
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.5rem' }}>
            {OUTSIDE_BETS.map((b, i) => (
              <button key={i} onClick={() => addBet(b.type, b.value, b.label)}
                className="btn"
                style={{ fontSize: '0.65rem', padding: '0.5rem 0.2rem',
                  textAlign: 'center', lineHeight: 1.4 }}>
                {b.label}<br />
                <span style={{ color: 'var(--gold-dim)', fontSize: '0.6rem' }}>{b.pays}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Chip selector + active bets + spin */}
        <div className="panel">
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center',
            flexWrap: 'wrap', marginBottom: '1rem' }}>
            <span style={{ color: 'var(--gold-dim)', fontSize: '0.75rem', letterSpacing: '0.15em' }}>
              CHIP:
            </span>
            {[10, 25, 50, 100, 250, 500].map(v => (
              <button key={v} onClick={() => setChipSize(v)}
                className={chipSize === v ? 'btn btn-primary' : 'btn'}
                style={{ padding: '0.3rem 0.7rem', fontSize: '0.75rem' }}>
                {v}
              </button>
            ))}
          </div>

          {bets.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <p style={{ color: 'var(--gold-dim)', fontSize: '0.7rem',
                letterSpacing: '0.15em', marginBottom: '0.5rem' }}>
                ACTIVE BETS:
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {bets.map((b, i) => (
                  <span key={i} className="caps-badge" style={{ fontSize: '0.7rem' }}>
                    {b.label}: {b.amount}
                  </span>
                ))}
              </div>
              <p style={{ color: 'var(--gold)', fontSize: '0.8rem',
                letterSpacing: '0.1em', marginTop: '0.5rem' }}>
                TOTAL BET: {totalBet.toLocaleString()} CAPS
              </p>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn btn-primary" onClick={handleSpin}
              disabled={spinning || bets.length === 0} style={{ flex: 1 }}>
              {spinning ? '[ SPINNING... ]' : '[ SPIN ]'}
            </button>
            <button className="btn btn-danger" onClick={clearBets}
              disabled={spinning} style={{ flex: 1 }}>
              [ CLEAR BETS ]
            </button>
          </div>
        </div>

      </div>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: '4px',
        background: 'linear-gradient(90deg, transparent, var(--gold), transparent)' }} />
    </main>
  )
}