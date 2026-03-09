'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import GameGuard from '@/components/GameGuard'

type Phase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'finished'
type SeatStatus = 'waiting' | 'active' | 'folded' | 'all_in' | 'done' | 'sitting_out' | 'showdown_win' | 'showdown_lose'

type TableData = {
  id: string; status: Phase
  community_cards: string[]; pot: number
  current_bet: number; last_raise: number   // ✅ FIX: added last_raise
  dealer_seat: number; action_seat: number
  big_blind: number; small_blind: number
}

type Seat = {
  id: string; table_id: string; user_id: string; username: string
  seat_number: number; status: SeatStatus; hole_cards: string[]
  current_bet: number; total_bet: number; stack: number; last_action: string | null
}

function Card({ card, hidden = false, small = false }: { card: string; hidden?: boolean; small?: boolean }) {
  const isRed = card.endsWith('♥') || card.endsWith('♦')
  const w = small ? '36px' : '52px'
  const h = small ? '52px' : '74px'
  const fs = small ? '0.65rem' : '0.9rem'
  return (
    <div style={{
      width: w, height: h, flexShrink: 0,
      background: hidden ? 'var(--gold-dim)' : 'var(--white)',
      border: '2px solid var(--gold-dim)', borderRadius: '4px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: fs, fontWeight: 'bold',
      color: hidden ? 'transparent' : isRed ? '#CC0000' : '#111',
      boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
    }}>
      {hidden ? '?' : card}
    </div>
  )
}

function ActionBadge({ action, status }: { action: string | null; status: SeatStatus }) {
  if (status === 'folded') return <span style={{ color: 'var(--red-bright)', fontSize: '0.6rem' }}>FOLD</span>
  if (status === 'all_in') return <span style={{ color: 'var(--gold-bright)', fontSize: '0.6rem' }}>ALL IN</span>
  if (status === 'showdown_win') return <span style={{ color: 'var(--gold-bright)', fontSize: '0.6rem' }}>★ WIN</span>
  if (status === 'showdown_lose') return <span style={{ color: 'var(--white-dim)', fontSize: '0.6rem' }}>LOSE</span>
  if (!action) return null
  if (action.startsWith('WIN:')) {
    const amt = action.split(':')[2] ?? action.split(':')[1]
    return <span style={{ color: 'var(--gold)', fontSize: '0.6rem' }}>+{Number(amt).toLocaleString()}</span>
  }
  if (action.startsWith('SHOWDOWN:')) return <span style={{ color: 'var(--gold-dim)', fontSize: '0.55rem' }}>{action.split(':')[1]}</span>
  const map: Record<string, string> = { check: 'CHECK', call: 'CALL', raise: 'RAISE', blind: 'BLIND', blind_option: 'BB', fold: 'FOLD' }
  return <span style={{ color: 'var(--white-dim)', fontSize: '0.6rem' }}>{map[action] ?? action.toUpperCase()}</span>
}

export default function PokerMultiPage() {
  const [phase, setPhase] = useState<'buyin' | 'joining' | 'table'>('buyin')
  const [buyInInput, setBuyInInput] = useState('500')
  const [tableId, setTableId] = useState<string | null>(null)
  const [tableData, setTableData] = useState<TableData | null>(null)
  const [seats, setSeats] = useState<Seat[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [balance, setBalance] = useState(0)
  const [raiseInput, setRaiseInput] = useState('')
  const [showRaise, setShowRaise] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const api = useCallback(async (body: object) => {
    const res = await fetch('/api/games/poker-multi', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    return res.json()
  }, [])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserId(user.id)
      const { data: prof } = await supabase.from('profiles').select('caps_balance').eq('id', user.id).single()
      if (prof) setBalance(prof.caps_balance)
    }
    init()
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (tableId) {
        navigator.sendBeacon('/api/games/poker-multi',
          new Blob([JSON.stringify({ action: 'leave', tableId })], { type: 'application/json' }))
      }
    }
  }, [tableId])

  const fetchTable = useCallback(async (tid: string) => {
    const [{ data: t }, { data: s }] = await Promise.all([
      supabase.from('poker_tables').select('*').eq('id', tid).single(),
      supabase.from('poker_seats').select('*').eq('table_id', tid).order('seat_number'),
    ])
    if (t) setTableData(t as TableData)
    if (s) setSeats(s as Seat[])
  }, [supabase])

  useEffect(() => {
    if (!tableId) return
    fetchTable(tableId)
    const ch = supabase.channel(`poker-${tableId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poker_tables', filter: `id=eq.${tableId}` }, () => fetchTable(tableId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poker_seats', filter: `table_id=eq.${tableId}` }, () => fetchTable(tableId))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [tableId, fetchTable])

  useEffect(() => {
    if (!userId) return
    const ch = supabase.channel(`poker-bal-${userId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        (payload: { new: { caps_balance: number } }) => setBalance(payload.new.caps_balance))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [userId])

  async function handleJoin() {
    const buyIn = parseInt(buyInInput)
    if (isNaN(buyIn) || buyIn < 100) { setError('MINIMUM BUY-IN IS 100 CAPS'); return }
    if (buyIn > balance) { setError('INSUFFICIENT CAPS'); return }
    setError(''); setPhase('joining')
    const data = await api({ action: 'join', buyIn })
    if (data.error) { setError(data.error); setPhase('buyin'); return }
    setTableId(data.tableId)
    setBalance(prev => prev - buyIn)
    setPhase('table')
  }

  async function handleLeave() {
    if (tableId) await api({ action: 'leave', tableId })
    router.push('/lobby')
  }

  async function handleStart() {
    setError(''); setLoading(true)
    const data = await api({ action: 'start' })
    setLoading(false)
    if (data.error) setError(data.error)
  }

  async function handleAction(act: 'fold' | 'check' | 'call' | 'raise', amount?: number) {
    setError(''); setLoading(true); setShowRaise(false)
    const data = await api({ action: act, ...(amount !== undefined ? { amount } : {}) })
    setLoading(false)
    if (data.error) setError(data.error)
  }

  async function handleNewHand() {
    setError(''); setLoading(true)
    const data = await api({ action: 'new_hand' })
    setLoading(false)
    if (data.error) setError(data.error)
  }

  const mySeat = seats.find(s => s.user_id === userId)
  const tableStatus = tableData?.status ?? 'waiting'
  const isMyTurn = mySeat && tableData && tableData.action_seat === mySeat.seat_number && mySeat.status === 'active'
  const canCheck = isMyTurn && (mySeat?.current_bet ?? 0) >= (tableData?.current_bet ?? 0)
  const canCall = isMyTurn && (mySeat?.current_bet ?? 0) < (tableData?.current_bet ?? 0)
  const callAmount = tableData ? Math.min(tableData.current_bet - (mySeat?.current_bet ?? 0), mySeat?.stack ?? 0) : 0
  const minRaise = tableData
    ? tableData.current_bet + Math.max(tableData.last_raise ?? tableData.big_blind, tableData.big_blind)
    : 0

  const phaseLabel: Record<string, string> = {
    waiting: 'WAITING FOR PLAYERS', preflop: 'PRE-FLOP',
    flop: 'THE FLOP', turn: 'THE TURN', river: 'THE RIVER', finished: 'HAND COMPLETE'
  }

  const seatBorderColor = (seat: Seat) => {
    if (seat.user_id === userId) return 'var(--gold)'
    if (tableData && tableData.action_seat === seat.seat_number) return '#44aaff'
    if (seat.status === 'showdown_win') return 'var(--gold-bright)'
    return 'var(--gold-dim)'
  }

  // ── BUY-IN SCREEN ─────────────────────────────────────────────────
  if (phase === 'buyin') return (
    <main style={{ minHeight: '100vh', background: 'var(--black)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div className="panel" style={{ maxWidth: '400px', width: '100%', textAlign: 'center' }}>
        <h1 style={{ fontSize: '2.5rem', color: 'var(--gold)', marginBottom: '0.25rem' }}>TEXAS HOLD&apos;EM</h1>
        <p style={{ color: 'var(--gold-dim)', fontSize: '0.7rem', letterSpacing: '0.2em', marginBottom: '2rem' }}>
          MULTIPLAYER · LUCKY 38
        </p>
        <div className="divider" style={{ marginBottom: '1.5rem' }}>BUY IN</div>
        <p style={{ color: 'var(--white-dim)', fontSize: '0.8rem', marginBottom: '1rem' }}>
          YOUR BALANCE: <span style={{ color: 'var(--gold)' }}>{balance.toLocaleString()} CAPS</span>
        </p>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ color: 'var(--gold-dim)', fontSize: '0.7rem',
            letterSpacing: '0.2em', display: 'block', marginBottom: '0.4rem' }}>
            BUY-IN AMOUNT (100 – 2000)
          </label>
          <input className="input" type="number" min="100" max={Math.min(balance, 2000)}
            value={buyInInput} onChange={e => setBuyInInput(e.target.value)}
            style={{ textAlign: 'center', fontSize: '1.2rem' }} />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          {[100, 250, 500, 1000].map(v => (
            <button key={v} className="btn" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
              onClick={() => setBuyInInput(String(Math.min(v, balance)))}>
              {v}
            </button>
          ))}
        </div>
        {error && <p style={{ color: 'var(--red-bright)', fontSize: '0.8rem', marginBottom: '1rem' }}>{error}</p>}
        <button className="btn btn-primary" onClick={handleJoin} style={{ width: '100%', fontSize: '1rem' }}>
          [ TAKE A SEAT ]
        </button>
        <Link href="/lobby">
          <button className="btn" style={{ width: '100%', marginTop: '0.75rem', fontSize: '0.8rem' }}>
            ← BACK TO LOBBY
          </button>
        </Link>
        <p style={{ color: 'var(--gold-dim)', fontSize: '0.65rem', letterSpacing: '0.1em', marginTop: '1rem' }}>
          BLINDS: 10 / 20 · UP TO 6 PLAYERS
        </p>
      </div>
    </main>
  )

  if (phase === 'joining') return (
    <main style={{ minHeight: '100vh', background: 'var(--black)',
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--gold)', letterSpacing: '0.3em' }}>FINDING TABLE...</p>
    </main>
  )

  // ── TABLE SCREEN ──────────────────────────────────────────────────
  return (
    <GameGuard gameKey="poker_open">
      <main style={{ minHeight: '100vh', background: 'var(--black)', padding: '1rem' }}>
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '4px',
          background: 'linear-gradient(90deg, transparent, var(--gold), transparent)' }} />

        <div style={{ maxWidth: '960px', margin: '0 auto' }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h1 style={{ fontSize: '1.8rem', color: 'var(--gold)', lineHeight: 1 }}>TEXAS HOLD&apos;EM</h1>
              <p style={{ color: 'var(--gold-dim)', fontSize: '0.65rem', letterSpacing: '0.2em' }}>
                TABLE {tableId?.slice(0, 8).toUpperCase()} · {phaseLabel[tableStatus] ?? tableStatus.toUpperCase()}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <span className="caps-badge">💰 {balance.toLocaleString()} CAPS</span>
              {mySeat && <span className="caps-badge" style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }}>
                STACK: {mySeat.stack.toLocaleString()}
              </span>}
              <button className="btn btn-danger" onClick={handleLeave}
                style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem' }}>
                [ LEAVE ]
              </button>
            </div>
          </div>

          {/* Opponents */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.max(seats.filter(s => s.user_id !== userId).length, 1)}, 1fr)`,
            gap: '0.5rem', marginBottom: '0.75rem'
          }}>
            {seats.filter(s => s.user_id !== userId).map(seat => (
              <div key={seat.id} className="panel" style={{
                padding: '0.6rem', textAlign: 'center',
                borderColor: seatBorderColor(seat),
                opacity: seat.status === 'folded' ? 0.4 : 1,
                background: tableData?.action_seat === seat.seat_number ? 'rgba(68,170,255,0.05)' : 'var(--black-soft)',
                transition: 'all 0.3s',
              }}>
                <p style={{ color: 'var(--white)', fontSize: '0.75rem', marginBottom: '0.3rem' }}>
                  {seat.username}
                  {tableData?.dealer_seat === seat.seat_number && (
                    <span style={{ color: 'var(--gold)', marginLeft: '0.3rem', fontSize: '0.6rem' }}>D</span>
                  )}
                </p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '3px', marginBottom: '0.3rem' }}>
                  {seat.status !== 'waiting' && seat.status !== 'sitting_out' ? (
                    seat.status === 'folded' || seat.hole_cards.length === 0 ? (
                      <span style={{ color: 'rgba(201,168,76,0.2)', fontSize: '0.7rem' }}>—</span>
                    ) : seat.status.startsWith('showdown') ? (
                      seat.hole_cards.map((c, i) => <Card key={i} card={c} small />)
                    ) : (
                      [0, 1].map(i => <Card key={i} card="??" hidden small />)
                    )
                  ) : <span style={{ color: 'rgba(201,168,76,0.2)', fontSize: '0.7rem' }}>WAITING</span>}
                </div>
                <p style={{ color: 'var(--gold-dim)', fontSize: '0.65rem' }}>
                  {seat.stack.toLocaleString()} CAPS
                </p>
                {seat.current_bet > 0 && (
                  <p style={{ color: 'var(--gold)', fontSize: '0.6rem' }}>
                    BET: {seat.current_bet.toLocaleString()}
                  </p>
                )}
                <ActionBadge action={seat.last_action} status={seat.status} />
              </div>
            ))}
          </div>

          {/* Community + Pot */}
          <div className="panel" style={{
            background: 'var(--green-felt)', marginBottom: '0.75rem',
            padding: '1rem', textAlign: 'center'
          }}>
            <p style={{ color: 'var(--gold-dim)', fontSize: '0.65rem', letterSpacing: '0.2em', marginBottom: '0.6rem' }}>
              POT: <span style={{ color: 'var(--gold)', fontWeight: 'bold' }}>
                {(tableData?.pot ?? 0).toLocaleString()} CAPS
              </span>
              {tableData && tableData.current_bet > 0 && (
                <span style={{ marginLeft: '1rem', color: 'var(--white-dim)' }}>
                  · CALL: {tableData.current_bet.toLocaleString()}
                </span>
              )}
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', flexWrap: 'wrap', minHeight: '74px', alignItems: 'center' }}>
              {(tableData?.community_cards ?? []).length > 0
                ? tableData!.community_cards.map((c, i) => <Card key={i} card={c} />)
                : <p style={{ color: 'rgba(201,168,76,0.3)', fontSize: '0.8rem', letterSpacing: '0.2em' }}>
                    {tableStatus === 'waiting' ? 'WAITING FOR PLAYERS TO START' : 'CARDS WILL APPEAR HERE'}
                  </p>
              }
            </div>
          </div>

          {/* My seat */}
          {mySeat && (
            <div className="panel" style={{
              borderColor: 'var(--gold)', background: 'rgba(201,168,76,0.05)',
              marginBottom: '0.75rem', padding: '1rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                <div>
                  <p style={{ color: 'var(--gold)', fontSize: '0.7rem', letterSpacing: '0.2em', marginBottom: '0.4rem' }}>
                    YOUR HAND
                    {tableData?.dealer_seat === mySeat.seat_number && (
                      <span style={{ marginLeft: '0.5rem', color: 'var(--gold-bright)', fontSize: '0.65rem' }}>(DEALER)</span>
                    )}
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {mySeat.hole_cards.length > 0
                      ? mySeat.hole_cards.map((c, i) => <Card key={i} card={c} />)
                      : <span style={{ color: 'rgba(201,168,76,0.3)', fontSize: '0.8rem', lineHeight: '74px' }}>—</span>
                    }
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  {mySeat.current_bet > 0 && (
                    <p style={{ color: 'var(--gold-dim)', fontSize: '0.7rem' }}>
                      YOUR BET: {mySeat.current_bet.toLocaleString()}
                    </p>
                  )}
                  <ActionBadge action={mySeat.last_action} status={mySeat.status} />
                  {isMyTurn && (
                    <p style={{ color: '#44aaff', fontSize: '0.8rem', letterSpacing: '0.15em', marginTop: '0.3rem' }}>
                      ▶ YOUR TURN
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <p style={{ color: 'var(--red-bright)', fontSize: '0.8rem',
              letterSpacing: '0.1em', marginBottom: '0.75rem', textAlign: 'center' }}>
              &gt; {error}
            </p>
          )}

          {/* Controls */}
          <div className="panel">

            {/* Waiting */}
            {tableStatus === 'waiting' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <p style={{ color: 'var(--gold-dim)', fontSize: '0.8rem', letterSpacing: '0.15em', flex: 1 }}>
                  {seats.length} / 6 PLAYERS · WAITING TO START
                </p>
                {seats.length >= 2 ? (
                  <button className="btn btn-primary" onClick={handleStart} disabled={loading}
                    style={{ fontSize: '0.85rem' }}>
                    {loading ? '...' : '[ START GAME ]'}
                  </button>
                ) : (
                  <p style={{ color: 'var(--gold-dim)', fontSize: '0.75rem', letterSpacing: '0.1em' }}>
                    NEED AT LEAST 2 PLAYERS
                  </p>
                )}
              </div>
            )}

            {/* Active hand — not my turn */}
            {['preflop','flop','turn','river'].includes(tableStatus) && !isMyTurn && (
              <p style={{ color: 'var(--gold-dim)', fontSize: '0.85rem', letterSpacing: '0.2em', textAlign: 'center' }}>
                {mySeat?.status === 'folded' ? '✗ YOU FOLDED — WATCHING'
                  : mySeat?.status === 'all_in' ? '★ ALL IN — WAITING'
                  : `WAITING FOR ${seats.find(s => s.seat_number === tableData?.action_seat)?.username ?? '...'}`}
              </p>
            )}

            {/* Active hand — my turn */}
            {isMyTurn && (
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <button className="btn btn-danger" onClick={() => handleAction('fold')}
                  disabled={loading} style={{ flex: 1, fontSize: '0.85rem' }}>
                  [ FOLD ]
                </button>
                {canCheck && (
                  <button className="btn" onClick={() => handleAction('check')}
                    disabled={loading} style={{ flex: 1, fontSize: '0.85rem' }}>
                    [ CHECK ]
                  </button>
                )}
                {canCall && (
                  <button className="btn btn-primary" onClick={() => handleAction('call')}
                    disabled={loading} style={{ flex: 1, fontSize: '0.85rem' }}>
                    {loading ? '...' : `[ CALL ${callAmount.toLocaleString()} ]`}
                  </button>
                )}
                <button className="btn"
                  onClick={() => { setShowRaise(!showRaise); setRaiseInput(String(minRaise)) }}
                  disabled={loading || (mySeat?.stack ?? 0) === 0}
                  style={{ flex: 1, fontSize: '0.85rem', borderColor: showRaise ? 'var(--gold-bright)' : undefined }}>
                  [ RAISE ]
                </button>
              </div>
            )}

            {/* Raise input */}
            {isMyTurn && showRaise && (
              <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ color: 'var(--gold-dim)', fontSize: '0.65rem',
                    letterSpacing: '0.2em', display: 'block', marginBottom: '0.3rem' }}>
                    RAISE TO (MIN {minRaise.toLocaleString()})
                  </label>
                  <input className="input" type="number" min={minRaise}
                    max={(mySeat?.stack ?? 0) + (mySeat?.current_bet ?? 0)}
                    value={raiseInput} onChange={e => setRaiseInput(e.target.value)} />
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {[minRaise, minRaise * 2, (mySeat?.stack ?? 0) + (mySeat?.current_bet ?? 0)].map((v, i) => (
                    <button key={i} className="btn" style={{ padding: '0.3rem 0.5rem', fontSize: '0.65rem' }}
                      onClick={() => setRaiseInput(String(v))}>
                      {i === 2 ? 'ALL IN' : `${v}`}
                    </button>
                  ))}
                </div>
                <button className="btn btn-primary"
                  onClick={() => handleAction('raise', parseInt(raiseInput))}
                  disabled={loading} style={{ fontSize: '0.8rem', padding: '0.6rem 1.2rem' }}>
                  {loading ? '...' : '[ CONFIRM ]'}
                </button>
              </div>
            )}

            {/* Finished */}
            {tableStatus === 'finished' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <p style={{ color: 'var(--gold)', fontSize: '0.85rem', letterSpacing: '0.15em', flex: 1 }}>
                  HAND COMPLETE
                </p>
                <button className="btn btn-primary" onClick={handleNewHand}
                  disabled={loading} style={{ fontSize: '0.85rem' }}>
                  {loading ? '...' : '[ NEXT HAND ]'}
                </button>
              </div>
            )}
          </div>

          <p style={{ textAlign: 'center', color: 'var(--gold-dim)', fontSize: '0.65rem',
            letterSpacing: '0.15em', marginTop: '1rem' }}>
            TEXAS HOLD&apos;EM · BLINDS {tableData?.small_blind ?? 10}/{tableData?.big_blind ?? 20} · UP TO 6 PLAYERS
          </p>
        </div>

        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: '4px',
          background: 'linear-gradient(90deg, transparent, var(--gold), transparent)' }} />
      </main>
    </GameGuard>
  )
}