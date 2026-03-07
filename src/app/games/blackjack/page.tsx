'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type GameState = {
  status: 'idle' | 'playing' | 'win' | 'loss' | 'bust' | 'push' | 'blackjack'
  playerHand: string[]
  dealerHand: string[]
  deck: string[]
  playerTotal: number
  dealerTotal: number
  bet: number
  payout: number
  message: string
}

const INIT: GameState = {
  status: 'idle', playerHand: [], dealerHand: [], deck: [],
  playerTotal: 0, dealerTotal: 0, bet: 0, payout: 0, message: ''
}

function CardDisplay({ card }: { card: string }) {
  const isHidden = card === '??'
  const isRed = card.endsWith('♥') || card.endsWith('♦')
  return (
    <div style={{
      width: '60px', height: '90px', background: isHidden ? 'var(--gold-dim)' : 'var(--white)',
      border: '2px solid var(--gold)', borderRadius: '6px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: isHidden ? '1.5rem' : '1.2rem', fontWeight: 'bold',
      color: isHidden ? 'var(--black)' : isRed ? '#CC0000' : '#111',
      boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
      flexShrink: 0,
    }}>
      {isHidden ? '?' : card}
    </div>
  )
}

export default function BlackjackPage() {
  const [balance, setBalance] = useState(0)
  const [betInput, setBetInput] = useState('50')
  const [game, setGame] = useState<GameState>(INIT)
  const [loading, setLoading] = useState(false)
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

  async function callAPI(action: string, extra: object = {}) {
    setLoading(true)
    setError('')
    const res = await fetch('/api/games/blackjack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...extra })
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error || 'ERROR'); return null }
    return data
  }

  async function handleDeal() {
    const bet = parseInt(betInput)
    if (isNaN(bet) || bet < 10) { setError('MINIMUM BET IS 10 CAPS'); return }
    if (bet > balance) { setError('INSUFFICIENT CAPS'); return }
    const data = await callAPI('deal', { bet })
    if (!data) return
    setBalance(data.newBalance)
    setGame({ ...data, bet, deck: data.deck || [] })
  }

  async function handleAction(action: 'hit' | 'stand' | 'double') {
    const data = await callAPI(action, {
      state: {
        playerHand: game.playerHand,
        dealerHand: action === 'hit'
          ? [...game.dealerHand.slice(0, 1), game.dealerHand[1]]
          : game.dealerHand,
        deck: game.deck,
        bet: game.bet
      }
    })
    if (!data) return
    if (data.newBalance !== undefined) setBalance(data.newBalance)
    setGame(prev => ({
      ...prev, ...data,
      bet: action === 'double' ? prev.bet * 2 : prev.bet,
      deck: data.deck || prev.deck
    }))
  }

  const isPlaying = game.status === 'playing'
  const isOver = ['win','loss','bust','push','blackjack'].includes(game.status)
  const statusColor = {
    win: 'var(--gold)', blackjack: 'var(--gold-bright)',
    loss: 'var(--red-bright)', bust: 'var(--red-bright)',
    push: 'var(--white-dim)', idle: 'transparent', playing: 'transparent'
  }[game.status]

  return (
    <main style={{ minHeight: '100vh', background: 'var(--black)', padding: '2rem' }}>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '4px',
        background: 'linear-gradient(90deg, transparent, var(--gold), transparent)' }} />

      <div style={{ maxWidth: '700px', margin: '0 auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '2.5rem', color: 'var(--gold)' }}>BLACKJACK</h1>
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

        <div className="panel" style={{ background: 'var(--green-felt)', marginBottom: '1.5rem',
          minHeight: '340px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          <div>
            <p style={{ color: 'var(--gold-dim)', fontSize: '0.7rem', letterSpacing: '0.2em',
              marginBottom: '0.75rem' }}>
              DEALER — {game.status === 'playing' ? `SHOWING ${game.dealerTotal}` : `TOTAL: ${game.dealerTotal}`}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {game.dealerHand.length > 0
                ? game.dealerHand.map((c, i) => <CardDisplay key={i} card={c} />)
                : <p style={{ color: 'var(--gold-dim)', fontSize: '0.8rem' }}>—</p>}
            </div>
          </div>

          {game.message && (
            <div style={{ textAlign: 'center', padding: '0.75rem',
              border: `1px solid ${statusColor}`, background: 'rgba(0,0,0,0.4)' }}>
              <p style={{ color: statusColor, fontSize: '1.2rem', letterSpacing: '0.2em' }}>
                {game.message}
              </p>
              {isOver && game.payout > 0 && (
                <p style={{ color: 'var(--gold-dim)', fontSize: '0.8rem', marginTop: '0.3rem' }}>
                  PAYOUT: {game.payout} CAPS
                </p>
              )}
            </div>
          )}

          <div>
            <p style={{ color: 'var(--gold-dim)', fontSize: '0.7rem', letterSpacing: '0.2em',
              marginBottom: '0.75rem' }}>
              YOUR HAND — TOTAL: {game.playerTotal || '—'}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {game.playerHand.length > 0
                ? game.playerHand.map((c, i) => <CardDisplay key={i} card={c} />)
                : <p style={{ color: 'var(--gold-dim)', fontSize: '0.8rem' }}>—</p>}
            </div>
          </div>
        </div>

        {error && (
          <p style={{ color: 'var(--red-bright)', fontSize: '0.85rem',
            letterSpacing: '0.1em', marginBottom: '1rem' }}>
            &gt; {error}
          </p>
        )}

        <div className="panel">
          {!isPlaying && (
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

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {!isPlaying && (
              <button className="btn btn-primary" onClick={handleDeal}
                disabled={loading} style={{ flex: 1 }}>
                {loading ? '[ DEALING... ]' : isOver ? '[ DEAL AGAIN ]' : '[ DEAL ]'}
              </button>
            )}
            {isPlaying && (
              <>
                <button className="btn btn-primary" onClick={() => handleAction('hit')}
                  disabled={loading} style={{ flex: 1 }}>
                  [ HIT ]
                </button>
                <button className="btn" onClick={() => handleAction('stand')}
                  disabled={loading} style={{ flex: 1 }}>
                  [ STAND ]
                </button>
                {game.playerHand.length === 2 && balance >= game.bet && (
                  <button className="btn" onClick={() => handleAction('double')}
                    disabled={loading} style={{ flex: 1 }}>
                    [ DOUBLE ]
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <div style={{ marginTop: '1rem', color: 'var(--gold-dim)',
          fontSize: '0.7rem', letterSpacing: '0.1em', textAlign: 'center' }}>
          DEALER STANDS ON 17 · BLACKJACK PAYS 2.5x · MINIMUM BET 10 CAPS
        </div>

      </div>
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: '4px',
        background: 'linear-gradient(90deg, transparent, var(--gold), transparent)' }} />
    </main>
  )
}