'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import GameGuard from '@/components/GameGuard'

const PAYTABLE = [
  { name: 'ROYAL FLUSH',     mult: 800 },
  { name: 'STRAIGHT FLUSH',  mult: 50  },
  { name: 'FOUR OF A KIND',  mult: 25  },
  { name: 'FULL HOUSE',      mult: 9   },
  { name: 'FLUSH',           mult: 6   },
  { name: 'STRAIGHT',        mult: 4   },
  { name: 'THREE OF A KIND', mult: 3   },
  { name: 'TWO PAIR',        mult: 2   },
  { name: 'JACKS OR BETTER', mult: 1   },
]

type GameStatus = 'idle' | 'dealt' | 'win' | 'loss'

function CardDisplay({ card, held, onClick, selectable }:
  { card: string; held: boolean; onClick: () => void; selectable: boolean }) {
  const isRed = card.endsWith('♥') || card.endsWith('♦')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
      {selectable && (
        <div style={{ fontSize: '0.65rem', letterSpacing: '0.15em',
          color: held ? 'var(--gold-bright)' : 'transparent', fontWeight: 'bold' }}>
          HOLD
        </div>
      )}
      <div onClick={selectable ? onClick : undefined} style={{
        width: '70px', height: '100px',
        background: 'var(--white)',
        border: `2px solid ${held ? 'var(--gold-bright)' : 'var(--gold-dim)'}`,
        borderRadius: '6px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1.1rem', fontWeight: 'bold',
        color: isRed ? '#CC0000' : '#111',
        cursor: selectable ? 'pointer' : 'default',
        boxShadow: held ? '0 0 12px rgba(255,215,0,0.6)' : '0 2px 8px rgba(0,0,0,0.5)',
        transition: 'all 0.15s', flexShrink: 0,
      }}>
        {card}
      </div>
    </div>
  )
}

export default function PokerPage() {
  const [balance, setBalance] = useState(0)
  const [betInput, setBetInput] = useState('50')
  const [status, setStatus] = useState<GameStatus>('idle')
  const [hand, setHand] = useState<string[]>([])
  const [deck, setDeck] = useState<string[]>([])
  const [held, setHeld] = useState<boolean[]>([false,false,false,false,false])
  const [result, setResult] = useState<{
    handName: string; multiplier: number; payout: number; message: string
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [currentBet, setCurrentBet] = useState(0)
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

  function toggleHold(i: number) {
    if (status !== 'dealt') return
    setHeld(prev => { const n = [...prev]; n[i] = !n[i]; return n })
  }

  async function handleDeal() {
    const bet = parseInt(betInput)
    if (isNaN(bet) || bet < 10) { setError('MINIMUM BET IS 10 CAPS'); return }
    if (bet > balance) { setError('INSUFFICIENT CAPS'); return }
    setError(''); setLoading(true); setResult(null)
    setHeld([false,false,false,false,false])

    const res = await fetch('/api/games/poker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'deal', bet })
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error || 'ERROR'); return }

    setHand(data.hand); setDeck(data.deck)
    setBalance(data.newBalance); setCurrentBet(bet)
    setStatus('dealt')
  }

  async function handleDraw() {
    setLoading(true); setError('')
    const res = await fetch('/api/games/poker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'draw', bet: currentBet, hand, deck, held })
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error || 'ERROR'); return }

    setHand(data.hand); setBalance(data.newBalance)
    setResult({ handName: data.handName, multiplier: data.multiplier,
      payout: data.payout, message: data.message })
    setStatus(data.status)
  }

  const isDealt = status === 'dealt'
  const isOver = status === 'win' || status === 'loss'
  const resultColor = result?.multiplier && result.multiplier > 0
    ? 'var(--gold)' : 'var(--red-bright)'

  return (
    <GameGuard gameKey="poker_open">
      <main style={{ minHeight: '100vh', background: 'var(--black)', padding: '2rem' }}>
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '4px',
          background: 'linear-gradient(90deg, transparent, var(--gold), transparent)' }} />

        <div style={{ maxWidth: '750px', margin: '0 auto' }}>

          <div style={{ display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h1 style={{ fontSize: '2.5rem', color: 'var(--gold)' }}>VIDEO POKER</h1>
              <p style={{ color: 'var(--gold-dim)', fontSize: '0.75rem', letterSpacing: '0.2em' }}>
                JACKS OR BETTER · LUCKY 38
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

          {/* Paytable */}
          <div className="panel" style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.3rem' }}>
              {PAYTABLE.map((row) => (
                <div key={row.name} style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '0.25rem 0.5rem',
                  background: result?.handName === row.name ? 'rgba(201,168,76,0.15)' : 'transparent',
                  border: result?.handName === row.name ? '1px solid var(--gold)' : '1px solid transparent',
                  borderRadius: '2px',
                }}>
                  <span style={{ color: result?.handName === row.name ? 'var(--gold)' : 'var(--white-dim)',
                    fontSize: '0.7rem', letterSpacing: '0.05em' }}>
                    {row.name}
                  </span>
                  <span style={{ color: 'var(--gold)', fontSize: '0.7rem' }}>{row.mult}x</span>
                </div>
              ))}
            </div>
          </div>

          {/* Cards */}
          <div className="panel" style={{ background: 'var(--green-felt)',
            marginBottom: '1.5rem', minHeight: '180px' }}>
            {result && (
              <div style={{ textAlign: 'center', padding: '0.6rem',
                border: `1px solid ${resultColor}`, background: 'rgba(0,0,0,0.4)',
                marginBottom: '1rem' }}>
                <p style={{ color: resultColor, fontSize: '1.1rem', letterSpacing: '0.2em' }}>
                  {result.message}
                </p>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              {hand.length > 0
                ? hand.map((card, i) => (
                  <CardDisplay key={i} card={card} held={held[i]}
                    onClick={() => toggleHold(i)} selectable={isDealt} />
                ))
                : (
                  <p style={{ color: 'var(--gold-dim)', fontSize: '0.85rem',
                    letterSpacing: '0.2em', margin: 'auto' }}>
                    PLACE YOUR BET AND DEAL
                  </p>
                )
              }
            </div>
            {isDealt && (
              <p style={{ textAlign: 'center', color: 'var(--gold-dim)',
                fontSize: '0.7rem', letterSpacing: '0.2em', marginTop: '1rem' }}>
                TAP CARDS TO HOLD · THEN DRAW
              </p>
            )}
          </div>

          {error && (
            <p style={{ color: 'var(--red-bright)', fontSize: '0.85rem',
              letterSpacing: '0.1em', marginBottom: '1rem' }}>
              &gt; {error}
            </p>
          )}

          {/* Controls */}
          <div className="panel">
            {!isDealt && (
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end',
                flexWrap: 'wrap', marginBottom: '1rem' }}>
                <div style={{ flex: 1, minWidth: '120px' }}>
                  <label style={{ color: 'var(--gold-dim)', fontSize: '0.75rem',
                    letterSpacing: '0.2em', display: 'block', marginBottom: '0.4rem' }}>
                    BET (CAPS)
                  </label>
                  <input className="input" type="number" min="10" max={balance}
                    value={betInput} onChange={e => setBetInput(e.target.value)} />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {[10, 25, 50, 100, 250].map(v => (
                    <button key={v} className="btn"
                      style={{ padding: '0.4rem 0.7rem', fontSize: '0.75rem' }}
                      onClick={() => setBetInput(String(v))}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              {!isDealt && (
                <button className="btn btn-primary" onClick={handleDeal}
                  disabled={loading} style={{ flex: 1 }}>
                  {loading ? '[ DEALING... ]' : isOver ? '[ DEAL AGAIN ]' : '[ DEAL ]'}
                </button>
              )}
              {isDealt && (
                <button className="btn btn-primary" onClick={handleDraw}
                  disabled={loading} style={{ flex: 1 }}>
                  {loading ? '[ DRAWING... ]' : '[ DRAW ]'}
                </button>
              )}
            </div>
          </div>

          <div style={{ marginTop: '1rem', color: 'var(--gold-dim)', fontSize: '0.7rem',
            letterSpacing: '0.1em', textAlign: 'center' }}>
            JACKS OR BETTER · HOLD CARDS BEFORE DRAWING · MINIMUM BET 10 CAPS
          </div>

        </div>

        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: '4px',
          background: 'linear-gradient(90deg, transparent, var(--gold), transparent)' }} />
      </main>
    </GameGuard>
  )
}