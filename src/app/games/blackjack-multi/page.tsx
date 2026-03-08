'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import GameGuard from '@/components/GameGuard'

type TableStatus = 'waiting' | 'betting' | 'playing' | 'dealer_turn' | 'finished'
type SeatStatus = 'idle' | 'ready' | 'playing' | 'standing' | 'bust' | 'blackjack' | 'done'

type TableData = {
  id: string
  status: TableStatus
  dealer_hand: string[]
  dealer_hand_real: string[]
}

type Seat = {
  id: string
  table_id: string
  user_id: string
  username: string
  seat_number: number
  status: SeatStatus
  hand: string[]
  bet: number
  payout: number
}

function cardValue(card: string): number {
  const r = card.slice(0, -1)
  if (['J','Q','K'].includes(r)) return 10
  if (r === 'A') return 11
  return parseInt(r)
}

function handTotal(hand: string[]): number {
  let total = hand.reduce((s, c) => s + cardValue(c), 0)
  let aces = hand.filter(c => c.startsWith('A')).length
  while (total > 21 && aces > 0) { total -= 10; aces-- }
  return total
}

function Card({ card }: { card: string }) {
  const isRed = card.endsWith('♥') || card.endsWith('♦')
  const isHidden = card === '??'
  return (
    <div style={{
      width: '48px', height: '68px', flexShrink: 0,
      background: isHidden ? 'var(--gold-dim)' : 'var(--white)',
      border: '2px solid var(--gold-dim)', borderRadius: '4px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '0.8rem', fontWeight: 'bold',
      color: isHidden ? 'transparent' : isRed ? '#CC0000' : '#111',
      boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
    }}>
      {isHidden ? '?' : card}
    </div>
  )
}

function SeatStatusBadge({ status }: { status: SeatStatus }) {
  const map: Record<SeatStatus, [string, string]> = {
    idle:      ['WAITING',   'var(--gold-dim)'],
    ready:     ['READY',     'var(--gold)'],
    playing:   ['PLAYING',   '#44aaff'],
    standing:  ['STAND',     'var(--white-dim)'],
    bust:      ['BUST',      'var(--red-bright)'],
    blackjack: ['BLACKJACK', 'var(--gold-bright)'],
    done:      ['DONE',      'var(--white-dim)'],
  }
  const [label, color] = map[status] ?? ['—', 'var(--gold-dim)']
  return (
    <span style={{ color, fontSize: '0.65rem', letterSpacing: '0.15em' }}>
      {label}
    </span>
  )
}

function outcomeLabel(seat: Seat, tableStatus: TableStatus): string {
  if (tableStatus !== 'finished') return ''
  if (seat.status === 'done') {
    if (seat.payout === 0) return '— LOST'
    if (seat.payout === seat.bet) return '— PUSH'
    return `+${(seat.payout - seat.bet).toLocaleString()}`
  }
  return ''
}

export default function BlackjackMultiPage() {
  const [tableId, setTableId] = useState<string | null>(null)
  const [tableData, setTableData] = useState<TableData | null>(null)
  const [seats, setSeats] = useState<Seat[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [balance, setBalance] = useState(0)
  const [betInput, setBetInput] = useState('50')
  const [loading, setLoading] = useState(false)
  const [joining, setJoining] = useState(true)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const api = useCallback(async (body: object) => {
    const res = await fetch('/api/games/blackjack-multi', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    return res.json()
  }, [])

  // Init: auth + join table
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserId(user.id)

      const { data: prof } = await supabase.from('profiles')
        .select('caps_balance').eq('id', user.id).single()
      if (prof) setBalance(prof.caps_balance)

      const data = await api({ action: 'join' })
      if (data.error) { setError(data.error); setJoining(false); return }

      setTableId(data.tableId)
      setJoining(false)
    }
    init()
  }, [])

  // Cleanup al cerrar pestaña o navegar sin pulsar LEAVE
  useEffect(() => {
    return () => {
      if (tableId) {
        navigator.sendBeacon(
          '/api/games/blackjack-multi',
          new Blob([JSON.stringify({ action: 'leave', tableId })],
            { type: 'application/json' })
        )
      }
    }
  }, [tableId])

  // Fetch table + seats
  const fetchTable = useCallback(async (tid: string) => {
    const [{ data: t }, { data: s }] = await Promise.all([
      supabase.from('blackjack_tables').select('*').eq('id', tid).single(),
      supabase.from('blackjack_seats').select('*').eq('table_id', tid).order('seat_number'),
    ])
    if (t) setTableData(t as TableData)
    if (s) setSeats(s as Seat[])
  }, [supabase])

  // Realtime: table + seats
  useEffect(() => {
    if (!tableId) return
    fetchTable(tableId)

    const ch = supabase.channel(`table-${tableId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'blackjack_tables',
        filter: `id=eq.${tableId}` }, () => fetchTable(tableId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'blackjack_seats',
        filter: `table_id=eq.${tableId}` }, () => fetchTable(tableId))
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [tableId, fetchTable])

  // Realtime: balance
  useEffect(() => {
    if (!userId) return
    const ch = supabase.channel(`balance-${userId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'profiles',
        filter: `id=eq.${userId}`
      }, (payload: { new: { caps_balance: number } }) => {
        setBalance(payload.new.caps_balance)
      }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [userId])

  async function handleBet() {
    const bet = parseInt(betInput)
    if (isNaN(bet) || bet < 10) { setError('MINIMUM BET IS 10 CAPS'); return }
    if (bet > balance) { setError('INSUFFICIENT CAPS'); return }
    setError(''); setLoading(true)
    const data = await api({ action: 'bet', tableId, bet })
    setLoading(false)
    if (data.error) setError(data.error)
    else if (data.newBalance !== undefined) setBalance(data.newBalance)
  }

  async function handleDeal() {
    setError(''); setLoading(true)
    const data = await api({ action: 'deal', tableId })
    setLoading(false)
    if (data.error) setError(data.error)
  }

  async function handleAction(action: 'hit' | 'stand' | 'double') {
    setError(''); setLoading(true)
    const data = await api({ action, tableId })
    setLoading(false)
    if (data.error) setError(data.error)
  }

  async function handleNewRound() {
    setError(''); setLoading(true)
    const data = await api({ action: 'new_round', tableId })
    setLoading(false)
    if (data.error) setError(data.error)
  }

  async function handleLeave() {
    if (tableId) await api({ action: 'leave', tableId })
    router.push('/lobby')
  }

  const mySeat = seats.find(s => s.user_id === userId)
  const tableStatus = tableData?.status ?? 'waiting'
  const dealerHand = tableData?.dealer_hand ?? []
  const dealerTotal = dealerHand.length > 0 && !dealerHand.includes('??')
    ? handTotal(dealerHand) : dealerHand.length > 0 ? cardValue(dealerHand[0]) : 0

  const isMyTurn = mySeat?.status === 'playing'
  const myBetPlaced = mySeat?.status !== 'idle'
  const canDeal = ['waiting','betting'].includes(tableStatus) &&
    seats.some(s => s.status === 'ready') && myBetPlaced

  const statusColor = (s: SeatStatus) => {
    if (s === 'bust') return 'var(--red-bright)'
    if (s === 'blackjack') return 'var(--gold-bright)'
    if (s === 'done') return 'var(--white-dim)'
    return 'var(--white)'
  }

  if (joining) return (
    <main style={{ minHeight: '100vh', background: 'var(--black)',
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--gold)', letterSpacing: '0.3em' }}>FINDING TABLE...</p>
    </main>
  )

  return (
    <GameGuard gameKey="blackjack_open">
      <main style={{ minHeight: '100vh', background: 'var(--black)', padding: '1.5rem' }}>
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '4px',
          background: 'linear-gradient(90deg, transparent, var(--gold), transparent)' }} />

        <div style={{ maxWidth: '900px', margin: '0 auto' }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h1 style={{ fontSize: '2rem', color: 'var(--gold)', lineHeight: 1 }}>
                BLACKJACK
              </h1>
              <p style={{ color: 'var(--gold-dim)', fontSize: '0.7rem', letterSpacing: '0.2em' }}>
                MULTIPLAYER · TABLE {tableId?.slice(0, 8).toUpperCase()}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <span className="caps-badge">💰 {balance.toLocaleString()} CAPS</span>
              <button className="btn btn-danger" onClick={handleLeave}
                style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem' }}>
                [ LEAVE ]
              </button>
              <Link href="/lobby">
                <button className="btn" style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem' }}>
                  ← LOBBY
                </button>
              </Link>
            </div>
          </div>

          {/* Table status */}
          <div style={{ textAlign: 'center', marginBottom: '0.75rem' }}>
            <span style={{
              fontSize: '0.7rem', letterSpacing: '0.25em', padding: '0.3rem 0.75rem',
              border: `1px solid ${['playing','dealer_turn'].includes(tableStatus) ? '#44aaff' : 'var(--gold-dim)'}`,
              color: ['playing','dealer_turn'].includes(tableStatus) ? '#44aaff' : 'var(--gold-dim)',
            }}>
              {tableStatus === 'waiting'     && '● WAITING FOR PLAYERS'}
              {tableStatus === 'betting'     && '● PLACE YOUR BETS'}
              {tableStatus === 'playing'     && '● ROUND IN PROGRESS'}
              {tableStatus === 'dealer_turn' && '● DEALER PLAYING'}
              {tableStatus === 'finished'    && '● ROUND COMPLETE'}
            </span>
          </div>

          {/* Dealer */}
          <div className="panel" style={{
            background: 'var(--green-felt)', marginBottom: '1rem',
            textAlign: 'center', padding: '1.25rem'
          }}>
            <p style={{ color: 'var(--gold-dim)', fontSize: '0.65rem',
              letterSpacing: '0.25em', marginBottom: '0.75rem' }}>
              DEALER {dealerTotal > 0 ? `· ${dealerTotal}` : ''}
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              {dealerHand.length > 0
                ? dealerHand.map((c, i) => <Card key={i} card={c} />)
                : <p style={{ color: 'rgba(201,168,76,0.3)', fontSize: '0.75rem',
                    letterSpacing: '0.2em' }}>NO CARDS YET</p>
              }
            </div>
          </div>

          {/* Seats */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.max(seats.length, 1)}, 1fr)`,
            gap: '0.75rem', marginBottom: '1rem'
          }}>
            {seats.map(seat => {
              const isMe = seat.user_id === userId
              const total = seat.hand.length > 0 ? handTotal(seat.hand as string[]) : 0
              const outcome = outcomeLabel(seat, tableStatus)
              return (
                <div key={seat.id} className="panel" style={{
                  padding: '0.75rem',
                  borderColor: isMe ? 'var(--gold)' : 'var(--gold-dim)',
                  background: isMe ? 'rgba(201,168,76,0.05)' : 'var(--black-soft)',
                  textAlign: 'center',
                }}>
                  <p style={{ color: statusColor(seat.status), fontSize: '0.75rem',
                    letterSpacing: '0.1em', marginBottom: '0.25rem',
                    fontWeight: isMe ? 'bold' : 'normal' }}>
                    {seat.username}
                    {isMe && <span style={{ color: 'var(--gold-dim)', fontSize: '0.6rem',
                      marginLeft: '0.3rem' }}>(YOU)</span>}
                  </p>

                  <div style={{ display: 'flex', justifyContent: 'center',
                    gap: '3px', flexWrap: 'wrap', marginBottom: '0.5rem', minHeight: '72px',
                    alignItems: 'center' }}>
                    {seat.hand.length > 0
                      ? (seat.hand as string[]).map((c, i) => <Card key={i} card={c} />)
                      : <span style={{ color: 'rgba(201,168,76,0.2)', fontSize: '0.7rem' }}>—</span>
                    }
                  </div>

                  {total > 0 && (
                    <p style={{ fontSize: '0.7rem', color: seat.status === 'bust'
                      ? 'var(--red-bright)' : 'var(--white-dim)', marginBottom: '0.25rem' }}>
                      {total}
                    </p>
                  )}

                  <SeatStatusBadge status={seat.status} />

                  {seat.bet > 0 && (
                    <p style={{ color: 'var(--gold-dim)', fontSize: '0.65rem', marginTop: '0.25rem' }}>
                      BET: {seat.bet.toLocaleString()}
                    </p>
                  )}

                  {outcome && (
                    <p style={{ fontSize: '0.75rem', marginTop: '0.25rem',
                      color: outcome.startsWith('+') ? 'var(--gold)'
                        : outcome === '— PUSH' ? 'var(--white-dim)' : 'var(--red-bright)' }}>
                      {outcome}
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          {error && (
            <p style={{ color: 'var(--red-bright)', fontSize: '0.8rem',
              letterSpacing: '0.1em', marginBottom: '0.75rem', textAlign: 'center' }}>
              &gt; {error}
            </p>
          )}

          {/* Controls */}
          <div className="panel">

            {/* Betting phase */}
            {['waiting','betting'].includes(tableStatus) && (
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                {!myBetPlaced ? (
                  <>
                    <div style={{ flex: 1, minWidth: '100px' }}>
                      <label style={{ color: 'var(--gold-dim)', fontSize: '0.7rem',
                        letterSpacing: '0.2em', display: 'block', marginBottom: '0.3rem' }}>
                        YOUR BET
                      </label>
                      <input className="input" type="number" min="10" max={balance}
                        value={betInput} onChange={e => setBetInput(e.target.value)} />
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      {[10, 25, 50, 100, 250].map(v => (
                        <button key={v} className="btn"
                          style={{ padding: '0.4rem 0.6rem', fontSize: '0.7rem' }}
                          onClick={() => setBetInput(String(v))}>
                          {v}
                        </button>
                      ))}
                    </div>
                    <button className="btn btn-primary" onClick={handleBet}
                      disabled={loading} style={{ fontSize: '0.8rem', padding: '0.6rem 1.5rem' }}>
                      {loading ? '...' : '[ BET ]'}
                    </button>
                  </>
                ) : (
                  <p style={{ color: 'var(--gold)', fontSize: '0.85rem',
                    letterSpacing: '0.15em', flex: 1 }}>
                    ✓ BET PLACED: {mySeat?.bet.toLocaleString()} CAPS — WAITING FOR OTHERS
                  </p>
                )}

                {canDeal && (
                  <button className="btn btn-primary" onClick={handleDeal}
                    disabled={loading}
                    style={{ fontSize: '0.85rem', padding: '0.6rem 1.5rem',
                      background: 'var(--gold-bright)', borderColor: 'var(--gold-bright)' }}>
                    {loading ? '...' : '[ DEAL ]'}
                  </button>
                )}
              </div>
            )}

            {/* Playing phase */}
            {tableStatus === 'playing' && (
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                {isMyTurn ? (
                  <>
                    <p style={{ color: 'var(--gold-bright)', fontSize: '0.8rem',
                      letterSpacing: '0.15em', flex: 1 }}>
                      ▶ YOUR TURN
                    </p>
                    <button className="btn btn-primary" onClick={() => handleAction('hit')}
                      disabled={loading} style={{ flex: 1, fontSize: '0.85rem' }}>
                      {loading ? '...' : '[ HIT ]'}
                    </button>
                    <button className="btn" onClick={() => handleAction('stand')}
                      disabled={loading} style={{ flex: 1, fontSize: '0.85rem' }}>
                      [ STAND ]
                    </button>
                    <button className="btn"
                      onClick={() => handleAction('double')}
                      disabled={loading || (mySeat?.hand?.length ?? 0) !== 2 || balance < (mySeat?.bet ?? 0)}
                      style={{ flex: 1, fontSize: '0.85rem' }}>
                      [ DOUBLE ]
                    </button>
                  </>
                ) : (
                  <p style={{ color: 'var(--gold-dim)', fontSize: '0.8rem',
                    letterSpacing: '0.2em', flex: 1, textAlign: 'center' }}>
                    {mySeat?.status === 'bust'      ? '💥 BUST — WAITING FOR OTHERS'
                      : mySeat?.status === 'standing'  ? '✓ STANDING — WAITING FOR OTHERS'
                      : mySeat?.status === 'blackjack' ? '🃏 BLACKJACK! WAITING FOR OTHERS'
                      : mySeat?.status === 'idle'      ? 'SPECTATING THIS ROUND'
                      : 'WAITING...'}
                  </p>
                )}
              </div>
            )}

            {/* Dealer turn */}
            {tableStatus === 'dealer_turn' && (
              <p style={{ color: '#44aaff', fontSize: '0.85rem',
                letterSpacing: '0.2em', textAlign: 'center' }}>
                DEALER IS PLAYING...
              </p>
            )}

            {/* Finished */}
            {tableStatus === 'finished' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <p style={{ color: 'var(--gold)', fontSize: '0.85rem',
                  letterSpacing: '0.15em', flex: 1 }}>
                  ROUND COMPLETE
                </p>
                <button className="btn btn-primary" onClick={handleNewRound}
                  disabled={loading} style={{ fontSize: '0.85rem' }}>
                  {loading ? '...' : '[ NEW ROUND ]'}
                </button>
              </div>
            )}
          </div>

          <p style={{ textAlign: 'center', color: 'var(--gold-dim)', fontSize: '0.65rem',
            letterSpacing: '0.15em', marginTop: '1rem' }}>
            UP TO 6 PLAYERS · SIMULTANEOUS PLAY · DEALER STANDS ON 17
          </p>

        </div>

        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: '4px',
          background: 'linear-gradient(90deg, transparent, var(--gold), transparent)' }} />
      </main>
    </GameGuard>
  )
}