import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { applyBustProtection } from '@/lib/bust-protection'

const SUITS = ['♠', '♥', '♦', '♣']
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K']

// ✅ FIX: 6-deck shoe for true casino feel and more randomness
function freshDeck(): string[] {
  const single: string[] = []
  for (const suit of SUITS)
    for (const rank of RANKS)
      single.push(`${rank}${suit}`)

  const shoe: string[] = []
  for (let i = 0; i < 6; i++) shoe.push(...single)
  return shuffle(shoe)
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
  let aces  = hand.filter(c => c.startsWith('A')).length
  while (total > 21 && aces > 0) { total -= 10; aces-- }
  return total
}

function isBust(hand: string[]):       boolean { return handTotal(hand) > 21 }
function isBlackjack(hand: string[]):  boolean { return hand.length === 2 && handTotal(hand) === 21 }

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
    .from('profiles').select('caps_balance, is_admin').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  // ── DEAL ───────────────────────────────────────────────────────
  if (action === 'deal') {
    if (!bet || bet < 10)
      return NextResponse.json({ error: 'MINIMUM BET IS 10 CAPS' }, { status: 400 })
    if (bet > profile.caps_balance)
      return NextResponse.json({ error: 'INSUFFICIENT CAPS' }, { status: 400 })

    const deck = freshDeck()

    // 🎰 ADMIN CHEAT: instant blackjack for player, dealer gets a weak hand
    const playerHand = profile.is_admin ? ['A♠', 'K♦'] : [deck.pop()!, deck.pop()!]
    const dealerHand = profile.is_admin ? ['5♣', '2♥'] : [deck.pop()!, deck.pop()!]

    await supabase.from('profiles')
      .update({ caps_balance: profile.caps_balance - bet })
      .eq('id', user.id)

    const playerBJ = isBlackjack(playerHand)
    const dealerBJ = isBlackjack(dealerHand)

    // ✅ FIX: check dealer blackjack too — push when both have it
    if (playerBJ && dealerBJ) {
      let newBalance = profile.caps_balance  // bet returned
      await supabase.from('profiles').update({ caps_balance: newBalance }).eq('id', user.id)
      await supabase.from('transactions').insert({
        user_id: user.id, game: 'blackjack', type: 'win',
        amount: 0, balance_after: newBalance
      })
      await supabase.from('game_sessions').insert({
        user_id: user.id, game: 'blackjack', bet, outcome: 'push',
        payout: bet, state_snapshot: { playerHand, dealerHand }
      })
      return NextResponse.json({
        status: 'push', playerHand, dealerHand,
        playerTotal: 21, dealerTotal: 21,
        payout: bet, newBalance,
        message: 'PUSH — DEALER ALSO HAS BLACKJACK.'
      })
    }

    if (playerBJ) {
      const payout     = Math.floor(bet * 2.5)
      let newBalance   = profile.caps_balance - bet + payout
      await supabase.from('profiles').update({ caps_balance: newBalance }).eq('id', user.id)
      await supabase.from('transactions').insert({
        user_id: user.id, game: 'blackjack', type: 'win',
        amount: payout - bet, balance_after: newBalance
      })
      await supabase.from('game_sessions').insert({
        user_id: user.id, game: 'blackjack', bet, outcome: 'blackjack',
        payout, state_snapshot: { playerHand, dealerHand }
      })
      if (!profile.is_admin) newBalance = await applyBustProtection(supabase, user.id, newBalance)
      return NextResponse.json({
        status: 'blackjack', playerHand, dealerHand,
        playerTotal: 21, dealerTotal: handTotal(dealerHand),
        payout, newBalance, message: 'BLACKJACK! YOU WIN!'
      })
    }

    // ✅ FIX: send the TOP of the remaining deck (slice from the end)
    // so that pop() deals cards in the correct order
    return NextResponse.json({
      status: 'playing', playerHand, dealerHand,
      deck: deck.slice(-40),
      playerTotal: handTotal(playerHand),
      dealerTotal: cardValue(dealerHand[0]),
      newBalance: profile.caps_balance - bet
    })
  }

  // ── HIT ────────────────────────────────────────────────────────
  if (action === 'hit') {
    const { playerHand, dealerHand, deck: deckRemaining, bet: savedBet } = state
    const newDeck       = [...deckRemaining]
    const newPlayerHand = [...playerHand, newDeck.pop()!]

    if (isBust(newPlayerHand)) {
      let newBalance = profile.caps_balance
      await supabase.from('transactions').insert({
        user_id: user.id, game: 'blackjack', type: 'loss',
        amount: savedBet, balance_after: newBalance
      })
      await supabase.from('game_sessions').insert({
        user_id: user.id, game: 'blackjack', bet: savedBet,
        outcome: 'bust', payout: 0,
        state_snapshot: { playerHand: newPlayerHand, dealerHand }
      })
      if (!profile.is_admin) newBalance = await applyBustProtection(supabase, user.id, newBalance)
      return NextResponse.json({
        status: 'bust', playerHand: newPlayerHand, dealerHand,
        playerTotal: handTotal(newPlayerHand),
        dealerTotal: handTotal(dealerHand),
        newBalance, message: 'BUST! HOUSE WINS.'
      })
    }

    return NextResponse.json({
      status: 'playing', playerHand: newPlayerHand, dealerHand,
      deck: newDeck, playerTotal: handTotal(newPlayerHand),
      dealerTotal: cardValue(dealerHand[0])
    })
  }

  // ── STAND / DOUBLE ─────────────────────────────────────────────
  if (action === 'stand' || action === 'double') {
    let { playerHand, dealerHand, deck: deckRemaining, bet: savedBet } = state
    let newDeck  = [...deckRemaining]
    let finalBet = savedBet

    if (action === 'double') {
      if (profile.caps_balance < savedBet)
        return NextResponse.json({ error: 'INSUFFICIENT CAPS TO DOUBLE' }, { status: 400 })
      finalBet   = savedBet * 2
      await supabase.from('profiles')
        .update({ caps_balance: profile.caps_balance - savedBet })
        .eq('id', user.id)
      playerHand = [...playerHand, newDeck.pop()!]
      if (isBust(playerHand)) {
        let newBalance = profile.caps_balance - savedBet
        await supabase.from('transactions').insert({
          user_id: user.id, game: 'blackjack', type: 'loss',
          amount: finalBet, balance_after: newBalance
        })
        await supabase.from('game_sessions').insert({
          user_id: user.id, game: 'blackjack', bet: finalBet,
          outcome: 'bust', payout: 0,
          state_snapshot: { playerHand, dealerHand }
        })
        if (!profile.is_admin) newBalance = await applyBustProtection(supabase, user.id, newBalance)
        return NextResponse.json({
          status: 'bust', playerHand, dealerHand,
          playerTotal: handTotal(playerHand),
          dealerTotal: handTotal(dealerHand),
          newBalance, message: 'BUST! HOUSE WINS.'
        })
      }
    }

    // 🎰 ADMIN CHEAT: dealer always busts on stand (draw until over 21)
    if (profile.is_admin) {
      while (handTotal(dealerHand) <= 21) {
        dealerHand = [...dealerHand, newDeck.pop() ?? '10♠']
      }
    } else {
      while (handTotal(dealerHand) < 17) {
        dealerHand = [...dealerHand, newDeck.pop()!]
      }
    }

    const playerTotal = handTotal(playerHand)
    const dealerTotal = handTotal(dealerHand)
    const dealerBust  = dealerTotal > 21

    let outcome: string
    let payout:  number
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
    let newBalance = balanceBase + payout

    await supabase.from('profiles').update({ caps_balance: newBalance }).eq('id', user.id)
    await supabase.from('transactions').insert({
      user_id: user.id, game: 'blackjack',
      type:   outcome === 'loss' ? 'loss' : 'win',
      amount: outcome === 'loss' ? finalBet : payout - finalBet,
      balance_after: newBalance
    })
    await supabase.from('game_sessions').insert({
      user_id: user.id, game: 'blackjack', bet: finalBet,
      outcome, payout, state_snapshot: { playerHand, dealerHand }
    })
    if (!profile.is_admin) newBalance = await applyBustProtection(supabase, user.id, newBalance)

    return NextResponse.json({
      status: outcome, playerHand, dealerHand,
      playerTotal, dealerTotal, payout, newBalance, message
    })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}