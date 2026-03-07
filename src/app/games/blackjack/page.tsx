'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import GameGuard from '@/components/GameGuard'

type GameStatus = 'idle' | 'playing' | 'bust' | 'win' | 'loss' | 'push' | 'blackjack'

export default function BlackjackPage() {
  const [balance, setBalance] = useState(0)
  const [betInput, setBetInput] = useState('50')
  const [status, setStatus] = useState<GameStatus>('idle')
  const [playerHand, setPlayerHand] = useState<string[]>([])
  const [dealerHand, setDealerHand] = useState<string[]>([])
  const [dealerHandReal, setDealerHandReal] = useState<string[]>([])
  const [deck, setDeck] = useState<string[]>([])
  const [playerTotal, setPlayerTotal] = useState(0)
  const [dealerTotal, setDealerTotal] = useState(0)
  const [message, setMessage] = useState('')
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

  const isOver = ['bust','win','loss','push','blackjack'].includes(status)
  const visibleDealerHand = isOver ? dealerHandReal : dealerHand

  async function callApi(body: object) {
    const res = await fetch('/api/games/blackjack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    return { res, data: await res.json() }
  }

  async function handleDeal() {
    const bet = parseInt(betInput)
    if (isNaN(bet) || bet < 10) { setError('MINIMUM BET IS 10 CAPS'); return }
    if (bet > balance) { setError('INSUFFICIENT CAPS'); return }
    setError(''); setLoading(true); setMessage('')

    const { res, data } = await callApi({ action: 'deal', bet })
    setLoading(false)
    if (!res.ok) { setError(data.error || 'ERROR'); return }

    setCurrentBet(bet)
    setBalance(data.newBalance)
    setDeck(data.deck)

    if (data.status === 'blackjack') {
      setPlayerHand(data.playerHand)
      setDealerHand(data.dealerHand)
      setDealerHandReal(data.dealerHand)
      setPlayerTotal(data.playerTotal)
      setDealerTotal(data.dealerTotal)
      setBalance(data.newBalance)
      setMessage(data.message)
      setStatus('blackjack')
      return
    }

    setPlayerHand(data.playerHand)
    setDealerHandReal(data.dealerHand)
    setDealerHand([data.dealerHand[0], '??'])
    setPlayerTotal(data.playerTotal)
    setDealerTotal(data.dealerTotal)
    setStatus('playing')
  }

  async function handleAction(action: 'hit' | 'stand' | 'double') {
    setLoading(true); setError('')
    const { res, data } = await callApi({
      action,
      state: { playerHand, dealerHand: dealerHandReal, deck, bet: currentBet }
    })
    setLoading(false)
    if (!res.ok) { setError(data.error || 'ERROR'); return }

    setPlayerHand(data.playerHand)
    setPlayerTotal(data.playerTotal)
    setDealerHandReal(data.dealerHand)
    setDealerTotal(data.dealerTotal)

    if (data.status === 'playing') {
      setDealerHand([data.dealerHand[0], '??'])
      setDeck(prev => prev.slice(0, -1))
    } else {
      setDealerHand(data.dealerHand)
      setBalance(data.newBalance)
      setMessage(data.message)
      setStatus(data.status)
    }
  }

  const statusColor = () => {
    if (['win','blackjack'].includes(status)) return 'var(--gold)'
    if (status === 'push') return 'var(--white-dim)'
    return 'var(--red-bright)'
  }

  function HandDisplay({ cards, label, total }: { cards: string[]; label: string; total: number }) {
    return (
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: 'var(--gold-dim)', fontSize: '0.7rem', letterSpacing: '0.2em',
          marginBottom: '0.75rem' }}>{label} {total > 0 ? `· ${total}` : ''}</p>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          {cards.map((card, i) => {
            const isRed = card.endsWith('♥') || card.endsWith('♦')
            const isHidden = card === '??'
            return (
              <div key={i} style={{
                width: '55px', height: '80px',
                background: isHidden ? 'var(--gold-dim)' : 'var(--white)',
                border: '2px solid var(--gold-dim)', borderRadius: '5px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1rem', fontWeight: 'bold',
                color: isHidden ? 'transparent' : isRed ? '#CC0000' : '#111',
                boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                flexShrink: 0,
              }}>
                {isHidden ? '?' : card}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <GameGuard gameKey="blackjack_open">
      <main style={{ minHeight: '100vh', background: 'var(--black)', padding: '2rem' }}>
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '4px',
          background: 'linear-gradient(90deg, transparent, var(--gold), transparent)' }} />

        <div style={{ maxWidth: '700px', margin: '0 auto' }}>

          <div style={{ display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h1 style={{ fontSize: '2.5rem', color: 'var(--gold)' }}>BLACKJACK</h1>
              <p style={{ color: 'var(--gold-dim)', fontSize: '0.75rem', letterSpacing: '0.2em' }}>
                DEALER STANDS ON 17 · BLACKJACK PAYS 2.5X
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

          {/* Table */}
          <div className="panel" style={{ background: 'var(--green-felt)',
            marginBottom: '1.5rem', minHeight: '280px' }}>

            {message && (
              <div style={{ textAlign: 'center', padding: '0.75rem',
                border: `1px solid ${statusColor()}`,
                background: 'rgba(0,0,0,0.4)', marginBottom: '1.5rem' }}>
                <p style={{ color: statusColor(), fontSize: '1.1rem', letterSpacing: '0.2em' }}>
                  {message}
                </p>
              </div>
            )}

            {dealerHand.length > 0 && (
              <div style={{ marginBottom: '2rem' }}>
                <HandDisplay cards={visibleDealerHand} label="DEALER"
                  total={isOver ? dealerTotal : dealerHandReal[0] ? dealerTotal : 0} />
              </div>
            )}

            {playerHand.length > 0 && (
              <HandDisplay cards={playerHand} label="YOU" total={playerTotal} />
            )}

            {playerHand.length === 0 && (
              <p style={{ textAlign: 'center', color: 'var(--gold-dim)',
                fontSize: '0.85rem', letterSpacing: '0.2em', marginTop: '3rem' }}>
                PLACE YOUR BET AND DEAL
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
            {status !== 'playing' && (
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
              {status !== 'playing' && (
                <button className="btn btn-primary" onClick={handleDeal}
                  disabled={loading} style={{ flex: 1 }}>
                  {loading ? '[ DEALING... ]' : isOver ? '[ DEAL AGAIN ]' : '[ DEAL ]'}
                </button>
              )}
              {status === 'playing' && (
                <>
                  <button className="btn btn-primary" onClick={() => handleAction('hit')}
                    disabled={loading} style={{ flex: 1 }}>
                    {loading ? '...' : '[ HIT ]'}
                  </button>
                  <button className="btn" onClick={() => handleAction('stand')}
                    disabled={loading} style={{ flex: 1 }}>
                    [ STAND ]
                  </button>
                  <button className="btn" onClick={() => handleAction('double')}
                    disabled={loading || playerHand.length !== 2} style={{ flex: 1 }}>
                    [ DOUBLE ]
                  </button>
                </>
              )}
            </div>
          </div>

        </div>

        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: '4px',
          background: 'linear-gradient(90deg, transparent, var(--gold), transparent)' }} />
      </main>
    </GameGuard>
  )
}