import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── DECK ─────────────────────────────────────────────────────────────
const SUITS = ['♠','♥','♦','♣']
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A']

function freshDeck(): string[] {
  const deck: string[] = []
  for (const suit of SUITS) for (const rank of RANKS) deck.push(`${rank}${suit}`)
  return shuffle(deck)
}

function shuffle(d: string[]): string[] {
  const a = [...d]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── HAND EVALUATION ──────────────────────────────────────────────────
const RANK_VAL: Record<string, number> = {}
RANKS.forEach((r, i) => { RANK_VAL[r] = i + 2 })

function rankOf(card: string): number {
  const r = card.length === 3 ? card.slice(0, 2) : card[0]
  return RANK_VAL[r] ?? 0
}
function suitOf(card: string): string { return card.slice(-1) }

function evaluateFive(cards: string[]): number[] {
  const ranks = cards.map(rankOf).sort((a, b) => b - a)
  const suits = cards.map(suitOf)
  const isFlush = suits.every(s => s === suits[0])
  const uniq = [...new Set(ranks)].sort((a, b) => b - a)
  const isStraight5 = uniq.length === 5 && ranks[0] - ranks[4] === 4
  const isWheel = JSON.stringify(uniq) === JSON.stringify([14, 5, 4, 3, 2])
  const isStraight = isStraight5 || isWheel
  const straightHigh = isWheel ? 5 : ranks[0]
  const cnt: Record<number, number> = {}
  ranks.forEach(r => { cnt[r] = (cnt[r] || 0) + 1 })
  const groups = Object.entries(cnt)
    .map(([r, c]) => [Number(r), c] as [number, number])
    .sort((a, b) => b[1] - a[1] || b[0] - a[0])
  if (isFlush && isStraight) return [8, straightHigh]
  if (groups[0][1] === 4) return [7, groups[0][0], groups[1][0]]
  if (groups[0][1] === 3 && groups[1][1] === 2) return [6, groups[0][0], groups[1][0]]
  if (isFlush) return [5, ...ranks]
  if (isStraight) return [4, straightHigh]
  if (groups[0][1] === 3) return [3, groups[0][0], groups[1][0], groups[2][0]]
  if (groups[0][1] === 2 && groups[1][1] === 2) return [2, groups[0][0], groups[1][0], groups[2][0]]
  if (groups[0][1] === 2) return [1, groups[0][0], ...groups.slice(1).map(g => g[0])]
  return [0, ...ranks]
}

function compareScores(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i] ?? -1; const bv = b[i] ?? -1
    if (av !== bv) return av - bv
  }
  return 0
}

const HAND_NAMES = ['HIGH CARD','PAIR','TWO PAIR','THREE OF A KIND','STRAIGHT','FLUSH','FULL HOUSE','FOUR OF A KIND','STRAIGHT FLUSH']

function bestHandFrom(holeCards: string[], community: string[]): { score: number[], name: string } {
  const all = [...holeCards, ...community]
  if (all.length < 5) return { score: [0], name: 'INCOMPLETE' }
  let best: number[] = [-1]
  const n = all.length
  for (let a = 0; a < n - 4; a++)
  for (let b = a + 1; b < n - 3; b++)
  for (let c = b + 1; c < n - 2; c++)
  for (let d = c + 1; d < n - 1; d++)
  for (let e = d + 1; e < n; e++) {
    const score = evaluateFive([all[a], all[b], all[c], all[d], all[e]])
    if (compareScores(score, best) > 0) best = score
  }
  return { score: best, name: HAND_NAMES[best[0]] ?? 'UNKNOWN' }
}

// ── TYPES ─────────────────────────────────────────────────────────────
type Seat = {
  id: string; table_id: string; user_id: string; username: string
  seat_number: number; status: string; hole_cards: string[]
  current_bet: number; total_bet: number; stack: number; last_action: string | null
}
type Table = {
  id: string; status: string; community_cards: string[]; deck: string[]
  pot: number; current_bet: number; last_raise: number
  dealer_seat: number; action_seat: number; big_blind: number; small_blind: number
}

// ── GAME LOGIC ────────────────────────────────────────────────────────
function isBettingRoundOver(seats: Seat[], currentBet: number): boolean {
  const active = seats.filter(s => s.status === 'active')
  if (active.length === 0) return true
  for (const s of active) {
    if (s.last_action === null || s.last_action === 'blind_option') return false
    if (s.last_action !== 'fold' && s.current_bet < currentBet && s.stack > 0) return false
  }
  return true
}

async function advanceAction(tableId: string, afterSeat: number) {
  const { data: seats } = await supabaseAdmin.from('poker_seats').select('*').eq('table_id', tableId)
  const { data: table } = await supabaseAdmin.from('poker_tables').select('*').eq('id', tableId).single()
  if (!seats || !table) return
  if (isBettingRoundOver(seats as Seat[], table.current_bet)) {
    await endBettingRound(tableId, table as Table, seats as Seat[])
    return
  }
  const needToAct = (seats as Seat[])
    .filter(s => s.status === 'active' && (s.last_action === null || s.last_action === 'blind_option'))
    .sort((a, b) => {
      const an = a.seat_number > afterSeat ? a.seat_number : a.seat_number + 100
      const bn = b.seat_number > afterSeat ? b.seat_number : b.seat_number + 100
      return an - bn
    })
  if (needToAct.length === 0) {
    await endBettingRound(tableId, table as Table, seats as Seat[])
    return
  }
  await supabaseAdmin.from('poker_tables').update({
    action_seat: needToAct[0].seat_number, updated_at: new Date().toISOString()
  }).eq('id', tableId)
}

async function endBettingRound(tableId: string, table: Table, seats: Seat[]) {
  const activePlayers = seats.filter(s => s.status === 'active')
  if (activePlayers.length === 1) {
    await awardPot(tableId, [activePlayers[0]], seats)
    return
  }
  const deck = [...table.deck]
  if (table.status === 'preflop') {
    const flop = [deck.pop()!, deck.pop()!, deck.pop()!]
    await resetForPhase(tableId, deck, [...table.community_cards, ...flop], 'flop', seats, table.dealer_seat)
  } else if (table.status === 'flop') {
    await resetForPhase(tableId, deck, [...table.community_cards, deck.pop()!], 'turn', seats, table.dealer_seat)
  } else if (table.status === 'turn') {
    await resetForPhase(tableId, deck, [...table.community_cards, deck.pop()!], 'river', seats, table.dealer_seat)
  } else if (table.status === 'river') {
    await showdown(tableId, table, seats)
  }
}

async function resetForPhase(tableId: string, deck: string[], communityCards: string[], phase: string, seats: Seat[], dealerSeat: number) {
  await supabaseAdmin.from('poker_seats')
    .update({ current_bet: 0, last_action: null })
    .eq('table_id', tableId).eq('status', 'active')
  const firstActor = seats
    .filter(s => s.status === 'active')
    .sort((a, b) => a.seat_number - b.seat_number)
    .find(s => s.seat_number > dealerSeat)
    ?? seats.filter(s => s.status === 'active').sort((a, b) => a.seat_number - b.seat_number)[0]
  await supabaseAdmin.from('poker_tables').update({
    status: phase, community_cards: communityCards, deck,
    current_bet: 0, last_raise: 20,
    action_seat: firstActor?.seat_number ?? 0,
    updated_at: new Date().toISOString()
  }).eq('id', tableId)
}

async function showdown(tableId: string, table: Table, seats: Seat[]) {
  const active = seats.filter(s => s.status === 'active')
  const evaluated = active.map(s => ({ seat: s, ...bestHandFrom(s.hole_cards, table.community_cards) }))
  evaluated.sort((a, b) => compareScores(b.score, a.score))
  const winners = [evaluated[0]]
  for (let i = 1; i < evaluated.length; i++) {
    if (compareScores(evaluated[i].score, evaluated[0].score) === 0) winners.push(evaluated[i])
  }
  for (const ev of evaluated) {
    const isWinner = winners.find(w => w.seat.id === ev.seat.id)
    await supabaseAdmin.from('poker_seats').update({
      last_action: `SHOWDOWN:${ev.name}`,
      status: isWinner ? 'showdown_win' : 'showdown_lose'
    }).eq('id', ev.seat.id)
  }
  await awardPot(tableId, winners.map(w => w.seat), seats)
}

async function awardPot(tableId: string, winners: Seat[], allSeats: Seat[]) {
  const { data: table } = await supabaseAdmin.from('poker_tables').select('pot').eq('id', tableId).single()
  const pot = table?.pot ?? 0
  const share = Math.floor(pot / winners.length)
  const remainder = pot - share * winners.length

  for (let i = 0; i < winners.length; i++) {
    const winAmount = share + (i === 0 ? remainder : 0)
    const newStack = winners[i].stack + winAmount
    await supabaseAdmin.from('poker_seats').update({
      stack: newStack, status: 'done',
      last_action: winners.length > 1 ? `WIN:SPLIT:${winAmount}` : `WIN:${winAmount}`
    }).eq('id', winners[i].id)
    // Record win transaction
    const { data: prof } = await supabaseAdmin.from('profiles').select('caps_balance').eq('id', winners[i].user_id).single()
    if (prof) {
      const profit = winAmount - winners[i].total_bet
      if (profit !== 0) {
        await supabaseAdmin.from('transactions').insert({
          user_id: winners[i].user_id, game: 'poker_multi',
          type: profit > 0 ? 'win' : 'loss',
          amount: Math.abs(profit), balance_after: prof.caps_balance
        })
      }
    }
  }

  // Mark non-winners done
  for (const s of allSeats) {
    if (!winners.find(w => w.id === s.id)) {
      await supabaseAdmin.from('poker_seats').update({ status: 'done' })
        .eq('id', s.id).neq('status', 'done').neq('status', 'showdown_win')
    }
  }

  await supabaseAdmin.from('poker_tables').update({
    status: 'finished', action_seat: 0, updated_at: new Date().toISOString()
  }).eq('id', tableId)
}

async function dealHand(tableId: string) {
  const { data: seats } = await supabaseAdmin.from('poker_seats').select('*').eq('table_id', tableId).order('seat_number')
  const { data: table } = await supabaseAdmin.from('poker_tables').select('*').eq('id', tableId).single()
  if (!seats || seats.length < 2 || !table) return

  // Reset all
  await supabaseAdmin.from('poker_seats').update({
    hole_cards: [], current_bet: 0, total_bet: 0, last_action: null, status: 'active'
  }).eq('table_id', tableId).gt('stack', 0)
  await supabaseAdmin.from('poker_seats').update({ status: 'sitting_out' })
    .eq('table_id', tableId).eq('stack', 0)

  const active = (seats as Seat[]).filter(s => s.stack > 0).sort((a, b) => a.seat_number - b.seat_number)
  if (active.length < 2) {
    await supabaseAdmin.from('poker_tables').update({ status: 'waiting', updated_at: new Date().toISOString() }).eq('id', tableId)
    return
  }

  // Rotate dealer
  const dealerSeat = (active.find(s => s.seat_number > table.dealer_seat) ?? active[0]).seat_number
  const isHeadsUp = active.length === 2
  const dealerIdx = active.findIndex(s => s.seat_number === dealerSeat)
  const sbPlayer = active[(dealerIdx + 1) % active.length]
  const bbPlayer = active[(dealerIdx + 2) % active.length]
  const utgPlayer = isHeadsUp ? active[dealerIdx] : active[(dealerIdx + 3) % active.length]

  const { big_blind: bb, small_blind: sb } = table
  const sbBet = Math.min(sbPlayer.stack, sb)
  const bbBet = Math.min(bbPlayer.stack, bb)

  await supabaseAdmin.from('poker_seats').update({
    stack: sbPlayer.stack - sbBet, current_bet: sbBet, total_bet: sbBet, last_action: 'blind'
  }).eq('id', sbPlayer.id)
  await supabaseAdmin.from('poker_seats').update({
    stack: bbPlayer.stack - bbBet, current_bet: bbBet, total_bet: bbBet, last_action: 'blind_option'
  }).eq('id', bbPlayer.id)

  let deck = freshDeck()
  for (const seat of active) {
    await supabaseAdmin.from('poker_seats').update({ hole_cards: [deck.pop()!, deck.pop()!] }).eq('id', seat.id)
  }

  await supabaseAdmin.from('poker_tables').update({
    status: 'preflop', community_cards: [], deck,
    pot: sbBet + bbBet, current_bet: bbBet,
    last_raise: bb, dealer_seat: dealerSeat,
    action_seat: utgPlayer.seat_number,
    updated_at: new Date().toISOString()
  }).eq('id', tableId)
}

// ── MAIN HANDLER ─────────────────────────────────────────────────────
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: cfg } = await supabase.from('config').select('key, value')
  const config: Record<string, string> = {}
  cfg?.forEach((r: { key: string; value: string }) => { config[r.key] = r.value })
  if (config['casino_open'] === 'false' || config['poker_open'] === 'false')
    return NextResponse.json({ error: 'POKER IS CURRENTLY CLOSED' }, { status: 403 })

  const { data: profile } = await supabase
    .from('profiles').select('caps_balance, username, is_admin').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const body = await request.json()
  const { action } = body

  // ── JOIN ──────────────────────────────────────────────────────────
  if (action === 'join') {
    const buyIn = Math.min(Math.max(Number(body.buyIn) || 500, 100), 2000)
    if (profile.caps_balance < buyIn)
      return NextResponse.json({ error: 'INSUFFICIENT CAPS' }, { status: 400 })

    const { data: existing } = await supabaseAdmin
      .from('poker_seats').select('table_id, id').eq('user_id', user.id).maybeSingle()
    if (existing) return NextResponse.json({ tableId: existing.table_id, seatId: existing.id })

    let tableId: string | null = null
    const { data: tables } = await supabaseAdmin
      .from('poker_tables').select('id, status, poker_seats(count)').eq('status', 'waiting').order('created_at')
    for (const t of (tables || [])) {
      const count = (t.poker_seats as { count: number }[])?.[0]?.count ?? 0
      if (count < 6) { tableId = t.id; break }
    }
    if (!tableId) {
      const { data: nt } = await supabaseAdmin.from('poker_tables').insert({ status: 'waiting' }).select().single()
      tableId = nt!.id
    }

    const { data: taken } = await supabaseAdmin.from('poker_seats').select('seat_number').eq('table_id', tableId)
    const takenNums = new Set((taken || []).map((s: { seat_number: number }) => s.seat_number))
    let seatNum = 1
    while (takenNums.has(seatNum)) seatNum++

    await supabaseAdmin.from('profiles').update({ caps_balance: profile.caps_balance - buyIn }).eq('id', user.id)
    const { data: seat } = await supabaseAdmin.from('poker_seats').insert({
      table_id: tableId, user_id: user.id, username: profile.username,
      seat_number: seatNum, status: 'waiting', stack: buyIn,
      hole_cards: [], current_bet: 0, total_bet: 0, last_action: null
    }).select().single()

    return NextResponse.json({ tableId, seatId: seat!.id, stack: buyIn })
  }

  // ── LEAVE ─────────────────────────────────────────────────────────
  if (action === 'leave') {
    const { tableId } = body
    if (!tableId) return NextResponse.json({ ok: true })

    const { data: seat } = await supabaseAdmin
      .from('poker_seats').select('*').eq('table_id', tableId).eq('user_id', user.id).maybeSingle()
    if (!seat) return NextResponse.json({ ok: true })

    if (['active', 'all_in'].includes(seat.status)) {
      const { data: sData } = await supabaseAdmin
        .from('poker_seats').select('seat_number').eq('id', seat.id).single()
      await supabaseAdmin.from('poker_seats').update({ status: 'folded', last_action: 'fold' }).eq('id', seat.id)
      const { data: tbl } = await supabaseAdmin.from('poker_tables').select('action_seat').eq('id', tableId).single()
      if (tbl && sData && tbl.action_seat === sData.seat_number) await advanceAction(tableId, sData.seat_number)
    }

    if ((seat as Seat).stack > 0) {
      const newBal = profile.caps_balance + (seat as Seat).stack
      await supabaseAdmin.from('profiles').update({ caps_balance: newBal }).eq('id', user.id)
      await supabaseAdmin.from('transactions').insert({
        user_id: user.id, game: 'poker_multi', type: 'win',
        amount: (seat as Seat).stack, balance_after: newBal
      })
    }

    await supabaseAdmin.from('poker_seats').delete().eq('table_id', tableId).eq('user_id', user.id)
    const { data: rem } = await supabaseAdmin.from('poker_seats').select('id').eq('table_id', tableId)
    if (!rem || rem.length === 0) await supabaseAdmin.from('poker_tables').delete().eq('id', tableId)

    return NextResponse.json({ ok: true })
  }

  // ── FIND MY SEAT ──────────────────────────────────────────────────
  const { data: mySeat } = await supabaseAdmin
    .from('poker_seats').select('*').eq('user_id', user.id).maybeSingle()
  if (!mySeat) return NextResponse.json({ error: 'Not at a table' }, { status: 400 })
  const tableId = mySeat.table_id

  // ── START ─────────────────────────────────────────────────────────
  if (action === 'start') {
    const { data: table } = await supabaseAdmin.from('poker_tables').select('status').eq('id', tableId).single()
    if (!table || table.status !== 'waiting')
      return NextResponse.json({ error: 'Game already in progress' }, { status: 400 })
    const { data: readySeats } = await supabaseAdmin
      .from('poker_seats').select('id').eq('table_id', tableId).gt('stack', 0)
    if (!readySeats || readySeats.length < 2)
      return NextResponse.json({ error: 'NEED AT LEAST 2 PLAYERS' }, { status: 400 })
    await dealHand(tableId)
    return NextResponse.json({ ok: true })
  }

  // ── NEW HAND ──────────────────────────────────────────────────────
  if (action === 'new_hand') {
    const { data: table } = await supabaseAdmin.from('poker_tables').select('status').eq('id', tableId).single()
    if (!table || table.status !== 'finished')
      return NextResponse.json({ error: 'Hand not finished' }, { status: 400 })
    await supabaseAdmin.from('poker_tables').update({
      status: 'waiting', pot: 0, current_bet: 0,
      community_cards: [], deck: [], updated_at: new Date().toISOString()
    }).eq('id', tableId)
    await supabaseAdmin.from('poker_seats').update({
      hole_cards: [], current_bet: 0, total_bet: 0, last_action: null, status: 'waiting'
    }).eq('table_id', tableId)
    return NextResponse.json({ ok: true })
  }

  // ── VERIFY GAME STATE ─────────────────────────────────────────────
  const { data: table } = await supabaseAdmin.from('poker_tables').select('*').eq('id', tableId).single()
  if (!table) return NextResponse.json({ error: 'Table not found' }, { status: 404 })
  if (!['preflop','flop','turn','river'].includes(table.status))
    return NextResponse.json({ error: 'Not in a hand' }, { status: 400 })

  const seat = mySeat as Seat
  if (table.action_seat !== seat.seat_number)
    return NextResponse.json({ error: 'NOT YOUR TURN' }, { status: 400 })
  if (seat.status !== 'active')
    return NextResponse.json({ error: 'Cannot act' }, { status: 400 })

  // ── FOLD ──────────────────────────────────────────────────────────
  if (action === 'fold') {
    await supabaseAdmin.from('poker_seats').update({ status: 'folded', last_action: 'fold' }).eq('id', seat.id)
    await advanceAction(tableId, seat.seat_number)
    return NextResponse.json({ ok: true })
  }

  // ── CHECK ─────────────────────────────────────────────────────────
  if (action === 'check') {
    if (seat.current_bet < table.current_bet)
      return NextResponse.json({ error: 'CANNOT CHECK — CALL OR RAISE' }, { status: 400 })
    await supabaseAdmin.from('poker_seats').update({ last_action: 'check' }).eq('id', seat.id)
    await advanceAction(tableId, seat.seat_number)
    return NextResponse.json({ ok: true })
  }

  // ── CALL ──────────────────────────────────────────────────────────
  if (action === 'call') {
    const toCall = Math.min(table.current_bet - seat.current_bet, seat.stack)
    if (toCall <= 0) return NextResponse.json({ error: 'NOTHING TO CALL' }, { status: 400 })
    await supabaseAdmin.from('poker_seats').update({
      stack: seat.stack - toCall, current_bet: seat.current_bet + toCall,
      total_bet: seat.total_bet + toCall, last_action: 'call'
    }).eq('id', seat.id)
    await supabaseAdmin.from('poker_tables').update({
      pot: table.pot + toCall, updated_at: new Date().toISOString()
    }).eq('id', tableId)
    await advanceAction(tableId, seat.seat_number)
    return NextResponse.json({ ok: true })
  }

  // ── RAISE ─────────────────────────────────────────────────────────
  if (action === 'raise') {
    const raiseTotal = Number(body.amount)
    const minRaise = table.current_bet + Math.max(table.last_raise, table.big_blind)
    const isAllIn = raiseTotal >= seat.current_bet + seat.stack
    if (!isAllIn && raiseTotal < minRaise)
      return NextResponse.json({ error: `MIN RAISE IS ${minRaise}` }, { status: 400 })
    const toAdd = Math.min(raiseTotal - seat.current_bet, seat.stack)
    if (toAdd <= 0) return NextResponse.json({ error: 'INVALID RAISE' }, { status: 400 })
    const newCurrentBet = seat.current_bet + toAdd
    const raiseSize = newCurrentBet - table.current_bet
    // Reset others to act
    const { data: others } = await supabaseAdmin
      .from('poker_seats').select('id, status').eq('table_id', tableId).neq('id', seat.id)
    for (const o of (others || [])) {
      if (o.status === 'active') await supabaseAdmin.from('poker_seats').update({ last_action: null }).eq('id', o.id)
    }
    await supabaseAdmin.from('poker_seats').update({
      stack: seat.stack - toAdd, current_bet: newCurrentBet,
      total_bet: seat.total_bet + toAdd,
      last_action: isAllIn && newCurrentBet > table.current_bet ? 'raise' : 'raise',
      status: seat.stack - toAdd === 0 ? 'all_in' : 'active'
    }).eq('id', seat.id)
    await supabaseAdmin.from('poker_tables').update({
      pot: table.pot + toAdd, current_bet: newCurrentBet,
      last_raise: raiseSize, updated_at: new Date().toISOString()
    }).eq('id', tableId)
    await advanceAction(tableId, seat.seat_number)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}