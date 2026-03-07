import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const SUITS = ['♠', '♥', '♦', '♣']
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K']

function freshDeck(): string[] {
  const deck: string[] = []
  for (const suit of SUITS)
    for (const rank of RANKS)
      deck.push(`${rank}${suit}`)
  return shuffle(deck)
}

function shuffle(deck: string[]): string[] {
  const d = [...deck]
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]]
  }
  return d
}

function cardValue(card: string): number {
  const rank = card.slice(0, -1)
  if (['J','Q','K'].includes(rank)) return 10
  if (rank === 'A') return 11
  return parseInt(rank)
}

function handTotal(hand: string[]): number {
  let total = hand.reduce((sum, c) => sum + cardValue(c), 0)
  let aces = hand.filter(c => c.startsWith('A')).length
  while (total > 21 && aces > 0) { total -= 10; aces-- }
  return total
}

function isBust(hand: string[]): boolean { return handTotal(hand) > 21 }

function isBlackjack(hand: string[]): boolean {
  return hand.length === 2 && handTotal(hand) === 21
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { action, bet, state } = body

  const { data: cfg } = await supabase.from('config').select('key, value')
  const config: Record<string, string> = {}
  cfg?.forEach((r: { key: string; value: string }) => { config[r.key] = r.value })
  if (config['casino_open'] === 'false' || config['blackjack_open'] === 'false')
    return NextResponse.json({ error: 'BLACKJACK IS CURRENTLY CLOSED' }, { status: 403 })

  const { data: profile } = await supabase
    .from('profiles').select('caps_balance').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  // ── DEAL ──────────────────────────────────────────────
  if (action === 'deal') {
    if (!bet || bet < 10)
      return NextResponse.json({ error: 'MINIMUM BET IS 10 CAPS' }, { status: 400 })
    if (bet > profile.caps_balance)
      return NextResponse.json({ error: 'INSUFFICIENT CAPS' }, { status: 400 })

    const deck = freshDeck()
    const playerHand = [deck.pop()!, deck.pop()!]
    const dealerHand = [deck.pop()!, deck.pop()!]

    await supabase.from('profiles')
      .update({ caps_balance: profile.caps_balance - bet })
      .eq('id', user.id)

    if (isBlackjack(playerHand)) {
      const payout = Math.floor(bet * 2.5)
      await supabase.from('profiles')
        .update({ caps_balance: profile.caps_balance - bet + payout })
        .eq('id', user.id)
      await supabase.from('transactions').insert({
        user_id: user.id, game: 'blackjack', type: 'win',
        amount: payout - bet, balance_after: profile.caps_balance - bet + payout
      })
      await supabase.from('game_sessions').insert({
        user_id: user.id, game: 'blackjack', bet, outcome: 'blackjack',
        payout, state_snapshot: { playerHand, dealerHand }
      })
      return NextResponse.json({
        status: 'blackjack',
        playerHand,
        dealerHand,           // always return real hand
        playerTotal: 21,
        dealerTotal: handTotal(dealerHand),
        payout,
        newBalance: profile.caps_balance - bet + payout,
        message: 'BLACKJACK! YOU WIN!'
      })
    }

    return NextResponse.json({
      status: 'playing',
      playerHand,
      dealerHand,             // always return real hand — client masks it
      deck: deck.slice(0, 20),
      playerTotal: handTotal(playerHand),
      dealerTotal: cardValue(dealerHand[0]),
      newBalance: profile.caps_balance - bet
    })
  }

  // ── HIT ───────────────────────────────────────────────
  if (action === 'hit') {
    const { playerHand, dealerHand, deck: deckRemaining, bet: savedBet } = state
    const newDeck = [...deckRemaining]
    const newPlayerHand = [...playerHand, newDeck.pop()!]

    if (isBust(newPlayerHand)) {
      const newBalance = profile.caps_balance
      await supabase.from('transactions').insert({
        user_id: user.id, game: 'blackjack', type: 'loss',
        amount: savedBet, balance_after: newBalance
      })
      await supabase.from('game_sessions').insert({
        user_id: user.id, game: 'blackjack', bet: savedBet,
        outcome: 'bust', payout: 0,
        state_snapshot: { playerHand: newPlayerHand, dealerHand }
      })
      return NextResponse.json({
        status: 'bust',
        playerHand: newPlayerHand,
        dealerHand,             // real hand
        playerTotal: handTotal(newPlayerHand),
        dealerTotal: handTotal(dealerHand),
        newBalance,
        message: 'BUST! HOUSE WINS.'
      })
    }

    return NextResponse.json({
      status: 'playing',
      playerHand: newPlayerHand,
      dealerHand,               // real hand — client masks it
      deck: newDeck,
      playerTotal: handTotal(newPlayerHand),
      dealerTotal: cardValue(dealerHand[0])
    })
  }

  // ── STAND / DOUBLE ────────────────────────────────────
  if (action === 'stand' || action === 'double') {
    let { playerHand, dealerHand, deck: deckRemaining, bet: savedBet } = state
    let newDeck = [...deckRemaining]
    let finalBet = savedBet

    if (action === 'double') {
      if (profile.caps_balance < savedBet)
        return NextResponse.json({ error: 'INSUFFICIENT CAPS TO DOUBLE' }, { status: 400 })
      finalBet = savedBet * 2
      await supabase.from('profiles')
        .update({ caps_balance: profile.caps_balance - savedBet })
        .eq('id', user.id)
      playerHand = [...playerHand, newDeck.pop()!]
      if (isBust(playerHand)) {
        const newBalance = profile.caps_balance - savedBet
        await supabase.from('transactions').insert({
          user_id: user.id, game: 'blackjack', type: 'loss',
          amount: finalBet, balance_after: newBalance
        })
        await supabase.from('game_sessions').insert({
          user_id: user.id, game: 'blackjack', bet: finalBet,
          outcome: 'bust', payout: 0,
          state_snapshot: { playerHand, dealerHand }
        })
        return NextResponse.json({
          status: 'bust',
          playerHand,
          dealerHand,           // real hand
          playerTotal: handTotal(playerHand),
          dealerTotal: handTotal(dealerHand),
          newBalance,
          message: 'BUST! HOUSE WINS.'
        })
      }
    }

    // Dealer draws to 17
    while (handTotal(dealerHand) < 17) {
      dealerHand = [...dealerHand, newDeck.pop()!]
    }

    const playerTotal = handTotal(playerHand)
    const dealerTotal = handTotal(dealerHand)
    const dealerBust = dealerTotal > 21

    let outcome: string
    let payout: number
    let message: string

    if (dealerBust || playerTotal > dealerTotal) {
      outcome = 'win'; payout = finalBet * 2
      message = dealerBust ? 'DEALER BUSTS! YOU WIN!' : 'YOU WIN!'
    } else if (playerTotal === dealerTotal) {
      outcome = 'push'; payout = finalBet
      message = 'PUSH — BET RETURNED.'
    } else {
      outcome = 'loss'; payout = 0
      message = 'HOUSE WINS.'
    }

    const balanceBase = action === 'double'
      ? profile.caps_balance - savedBet
      : profile.caps_balance
    const newBalance = balanceBase + payout

    await supabase.from('profiles').update({ caps_balance: newBalance }).eq('id', user.id)
    await supabase.from('transactions').insert({
      user_id: user.id, game: 'blackjack',
      type: outcome === 'loss' ? 'loss' : 'win',
      amount: outcome === 'loss' ? finalBet : payout - finalBet,
      balance_after: newBalance
    })
    await supabase.from('game_sessions').insert({
      user_id: user.id, game: 'blackjack', bet: finalBet,
      outcome, payout, state_snapshot: { playerHand, dealerHand }
    })

    return NextResponse.json({
      status: outcome,
      playerHand,
      dealerHand,               // real full hand always
      playerTotal,
      dealerTotal,
      payout,
      newBalance,
      message
    })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}