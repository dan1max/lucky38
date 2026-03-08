import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SUITS = ['♠','♥','♦','♣']
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K']

function freshDeck(): string[] {
  const single: string[] = []
  for (const suit of SUITS)
    for (const rank of RANKS)
      single.push(`${rank}${suit}`)
  const shoe: string[] = []
  for (let i = 0; i < 6; i++) shoe.push(...single)
  return shuffle(shoe)
}

function shuffle(d: string[]): string[] {
  const a = [...d]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
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

function isBust(hand: string[]): boolean { return handTotal(hand) > 21 }
function isBlackjack(hand: string[]): boolean { return hand.length === 2 && handTotal(hand) === 21 }

async function bustProtect(userId: string, balance: number): Promise<number> {
  if (balance >= 50) return balance
  await supabaseAdmin.from('profiles').update({ caps_balance: 50 }).eq('id', userId)
  await supabaseAdmin.from('transactions').insert({
    user_id: userId, game: 'bonus', type: 'bonus',
    amount: 50 - balance, balance_after: 50
  })
  return 50
}

async function checkAllDone(tableId: string) {
  const { data: playing } = await supabaseAdmin
    .from('blackjack_seats').select('id').eq('table_id', tableId).eq('status', 'playing')
  if (!playing || playing.length === 0) await dealerPlay(tableId)
}

async function dealerPlay(tableId: string) {
  const { data: table } = await supabaseAdmin
    .from('blackjack_tables').select('*').eq('id', tableId).single()
  if (!table) return

  let dealerHand = table.dealer_hand_real as string[]
  let deck = table.deck as string[]
  while (handTotal(dealerHand) < 17) dealerHand = [...dealerHand, deck.pop()!]

  await supabaseAdmin.from('blackjack_tables').update({
    status: 'dealer_turn', dealer_hand: dealerHand, dealer_hand_real: dealerHand,
    deck, updated_at: new Date().toISOString()
  }).eq('id', tableId)

  const { data: seats } = await supabaseAdmin
    .from('blackjack_seats').select('*').eq('table_id', tableId)
    .in('status', ['standing','bust','blackjack'])

  if (!seats) return
  const dealerTotal = handTotal(dealerHand)
  const dealerBust = dealerTotal > 21

  for (const seat of seats) {
    const hand = seat.hand as string[]
    const playerTotal = handTotal(hand)
    let payout = 0

    if (seat.status === 'bust') {
      payout = 0
    } else if (seat.status === 'blackjack') {
      if (dealerTotal === 21 && dealerHand.length === 2) payout = seat.bet // push
      else payout = Math.floor(seat.bet * 2.5)
    } else if (dealerBust || playerTotal > dealerTotal) {
      payout = seat.bet * 2
    } else if (playerTotal === dealerTotal) {
      payout = seat.bet
    }

    const { data: prof } = await supabaseAdmin
      .from('profiles').select('caps_balance, is_admin').eq('id', seat.user_id).single()
    if (!prof) continue

    let newBalance = prof.caps_balance + payout
    await supabaseAdmin.from('profiles').update({ caps_balance: newBalance }).eq('id', seat.user_id)
    await supabaseAdmin.from('transactions').insert({
      user_id: seat.user_id, game: 'blackjack_multi',
      type: payout === 0 ? 'loss' : 'win',
      amount: payout === 0 ? seat.bet : payout - seat.bet,
      balance_after: newBalance
    })
    if (!prof.is_admin) newBalance = await bustProtect(seat.user_id, newBalance)
    await supabaseAdmin.from('blackjack_seats').update({ status: 'done', payout }).eq('id', seat.id)
  }

  await supabaseAdmin.from('blackjack_tables').update({
    status: 'finished', updated_at: new Date().toISOString()
  }).eq('id', tableId)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: cfg } = await supabase.from('config').select('key, value')
  const config: Record<string, string> = {}
  cfg?.forEach((r: { key: string; value: string }) => { config[r.key] = r.value })
  if (config['casino_open'] === 'false' || config['blackjack_open'] === 'false')
    return NextResponse.json({ error: 'BLACKJACK IS CURRENTLY CLOSED' }, { status: 403 })

  const { data: profile } = await supabase
    .from('profiles').select('caps_balance, username, is_admin').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const body = await request.json()
  const { action } = body

  // ── JOIN ────────────────────────────────────────────────────────
  if (action === 'join') {
    const { data: existing } = await supabaseAdmin
      .from('blackjack_seats').select('table_id, id').eq('user_id', user.id)
      .not('status', 'eq', 'left').maybeSingle()
    if (existing) return NextResponse.json({ tableId: existing.table_id, seatId: existing.id })

    // Find open table
    let tableId: string | null = null
    const { data: tables } = await supabaseAdmin
      .from('blackjack_tables').select('id, status, blackjack_seats(count)')
      .in('status', ['waiting','finished']).order('created_at')

    for (const t of (tables || [])) {
      const count = (t.blackjack_seats as { count: number }[])?.[0]?.count ?? 0
      if (count < 6) { tableId = t.id; break }
    }

    if (!tableId) {
      const { data: nt } = await supabaseAdmin
        .from('blackjack_tables').insert({ status: 'waiting' }).select().single()
      tableId = nt!.id
    } else {
      // Reset finished table if joining
      const t = tables?.find(t => t.id === tableId)
      if (t?.status === 'finished') {
        await supabaseAdmin.from('blackjack_tables').update({
          status: 'waiting', dealer_hand: [], dealer_hand_real: [], deck: [],
          updated_at: new Date().toISOString()
        }).eq('id', tableId)
        await supabaseAdmin.from('blackjack_seats').update({
          status: 'idle', hand: [], bet: 0, payout: 0
        }).eq('table_id', tableId)
      }
    }

    const { data: taken } = await supabaseAdmin
      .from('blackjack_seats').select('seat_number').eq('table_id', tableId)
    const takenNums = new Set((taken || []).map((s: { seat_number: number }) => s.seat_number))
    let seatNum = 1
    while (takenNums.has(seatNum)) seatNum++

    const { data: seat } = await supabaseAdmin.from('blackjack_seats').insert({
      table_id: tableId, user_id: user.id, username: profile.username,
      seat_number: seatNum, status: 'idle', hand: [], bet: 0, payout: 0
    }).select().single()

    return NextResponse.json({ tableId, seatId: seat!.id })
  }

  // ── LEAVE ───────────────────────────────────────────────────────
  if (action === 'leave') {
    const { tableId } = body
    const { data: seat } = await supabaseAdmin
      .from('blackjack_seats').select('status').eq('table_id', tableId).eq('user_id', user.id).single()
    if (seat?.status === 'playing')
      return NextResponse.json({ error: 'Cannot leave mid-round' }, { status: 400 })

    await supabaseAdmin.from('blackjack_seats').delete()
      .eq('table_id', tableId).eq('user_id', user.id)

    const { data: rem } = await supabaseAdmin
      .from('blackjack_seats').select('id').eq('table_id', tableId)
    if (!rem || rem.length === 0)
      await supabaseAdmin.from('blackjack_tables').delete().eq('id', tableId)

    return NextResponse.json({ ok: true })
  }

  // ── BET ─────────────────────────────────────────────────────────
  if (action === 'bet') {
    const { tableId, bet } = body
    if (!bet || bet < 10) return NextResponse.json({ error: 'MINIMUM BET IS 10 CAPS' }, { status: 400 })
    if (bet > profile.caps_balance) return NextResponse.json({ error: 'INSUFFICIENT CAPS' }, { status: 400 })

    const { data: table } = await supabaseAdmin
      .from('blackjack_tables').select('status').eq('id', tableId).single()
    if (!table || !['waiting','betting'].includes(table.status))
      return NextResponse.json({ error: 'Cannot bet now' }, { status: 400 })

    await supabaseAdmin.from('profiles')
      .update({ caps_balance: profile.caps_balance - bet }).eq('id', user.id)
    await supabaseAdmin.from('blackjack_seats')
      .update({ bet, status: 'ready' }).eq('table_id', tableId).eq('user_id', user.id)
    if (table.status === 'waiting')
      await supabaseAdmin.from('blackjack_tables').update({
        status: 'betting', updated_at: new Date().toISOString()
      }).eq('id', tableId)

    return NextResponse.json({ ok: true, newBalance: profile.caps_balance - bet })
  }

  // ── DEAL ────────────────────────────────────────────────────────
  if (action === 'deal') {
    const { tableId } = body
    const { data: table } = await supabaseAdmin
      .from('blackjack_tables').select('status').eq('id', tableId).single()
    if (!table || !['waiting','betting'].includes(table.status))
      return NextResponse.json({ error: 'Cannot deal now' }, { status: 400 })

    const { data: readySeats } = await supabaseAdmin
      .from('blackjack_seats').select('*').eq('table_id', tableId).eq('status', 'ready')
    if (!readySeats || readySeats.length === 0)
      return NextResponse.json({ error: 'No players have bet' }, { status: 400 })

    let deck = freshDeck()
    const dealerHand = [deck.pop()!, deck.pop()!]

    await supabaseAdmin.from('blackjack_tables').update({
      status: 'playing',
      dealer_hand: [dealerHand[0], '??'],
      dealer_hand_real: dealerHand,
      deck,
      updated_at: new Date().toISOString()
    }).eq('id', tableId)

    let allBJ = true
    for (const seat of readySeats) {
      const hand = [deck.pop()!, deck.pop()!]
      const bj = isBlackjack(hand)
      if (!bj) allBJ = false
      await supabaseAdmin.from('blackjack_seats').update({
        hand, status: bj ? 'blackjack' : 'playing'
      }).eq('id', seat.id)
    }

    // Update deck after dealing all cards
    await supabaseAdmin.from('blackjack_tables').update({ deck }).eq('id', tableId)

    if (allBJ) await dealerPlay(tableId)

    return NextResponse.json({ ok: true })
  }

  // ── HIT ─────────────────────────────────────────────────────────
  if (action === 'hit') {
    const { tableId } = body
    const { data: table } = await supabaseAdmin
      .from('blackjack_tables').select('deck').eq('id', tableId).single()
    const { data: seat } = await supabaseAdmin
      .from('blackjack_seats').select('*').eq('table_id', tableId).eq('user_id', user.id).single()

    if (!seat || seat.status !== 'playing')
      return NextResponse.json({ error: 'Not your turn' }, { status: 400 })

    const deck = [...(table!.deck as string[])]
    const newHand = [...(seat.hand as string[]), deck.pop()!]
    await supabaseAdmin.from('blackjack_tables').update({ deck }).eq('id', tableId)

    if (isBust(newHand)) {
      await supabaseAdmin.from('blackjack_seats').update({ hand: newHand, status: 'bust' }).eq('id', seat.id)
      await checkAllDone(tableId)
      return NextResponse.json({ hand: newHand, status: 'bust', total: handTotal(newHand) })
    }

    await supabaseAdmin.from('blackjack_seats').update({ hand: newHand }).eq('id', seat.id)
    return NextResponse.json({ hand: newHand, status: 'playing', total: handTotal(newHand) })
  }

  // ── STAND ───────────────────────────────────────────────────────
  if (action === 'stand') {
    const { tableId } = body
    const { data: seat } = await supabaseAdmin
      .from('blackjack_seats').select('*').eq('table_id', tableId).eq('user_id', user.id).single()
    if (!seat || seat.status !== 'playing')
      return NextResponse.json({ error: 'Not your turn' }, { status: 400 })
    await supabaseAdmin.from('blackjack_seats').update({ status: 'standing' }).eq('id', seat.id)
    await checkAllDone(tableId)
    return NextResponse.json({ ok: true })
  }

  // ── DOUBLE ──────────────────────────────────────────────────────
  if (action === 'double') {
    const { tableId } = body
    const { data: table } = await supabaseAdmin
      .from('blackjack_tables').select('deck').eq('id', tableId).single()
    const { data: seat } = await supabaseAdmin
      .from('blackjack_seats').select('*').eq('table_id', tableId).eq('user_id', user.id).single()

    if (!seat || seat.status !== 'playing' || (seat.hand as string[]).length !== 2)
      return NextResponse.json({ error: 'Cannot double now' }, { status: 400 })
    if (profile.caps_balance < seat.bet)
      return NextResponse.json({ error: 'INSUFFICIENT CAPS' }, { status: 400 })

    await supabaseAdmin.from('profiles')
      .update({ caps_balance: profile.caps_balance - seat.bet }).eq('id', user.id)

    const deck = [...(table!.deck as string[])]
    const newHand = [...(seat.hand as string[]), deck.pop()!]
    const newBet = seat.bet * 2
    await supabaseAdmin.from('blackjack_tables').update({ deck }).eq('id', tableId)

    const finalStatus = isBust(newHand) ? 'bust' : 'standing'
    await supabaseAdmin.from('blackjack_seats').update({
      hand: newHand, status: finalStatus, bet: newBet
    }).eq('id', seat.id)

    await checkAllDone(tableId)
    return NextResponse.json({ hand: newHand, status: finalStatus, total: handTotal(newHand) })
  }

  // ── NEW ROUND ───────────────────────────────────────────────────
  if (action === 'new_round') {
    const { tableId } = body
    const { data: table } = await supabaseAdmin
      .from('blackjack_tables').select('status').eq('id', tableId).single()
    if (!table || table.status !== 'finished')
      return NextResponse.json({ error: 'Round not finished' }, { status: 400 })

    await supabaseAdmin.from('blackjack_seats').update({
      status: 'idle', hand: [], bet: 0, payout: 0
    }).eq('table_id', tableId)
    await supabaseAdmin.from('blackjack_tables').update({
      status: 'waiting', dealer_hand: [], dealer_hand_real: [], deck: [],
      updated_at: new Date().toISOString()
    }).eq('id', tableId)

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}