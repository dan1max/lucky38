import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { applyBustProtection } from '@/lib/bust-protection'

const SUITS = ['♠', '♥', '♦', '♣']
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A']

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

function rankIndex(card: string): number {
  return RANKS.indexOf(card.slice(0, -1))
}

function getRank(card: string): string { return card.slice(0, -1) }
function getSuit(card: string): string { return card.slice(-1) }

function evaluateHand(hand: string[]): { name: string; multiplier: number } {
  const ranks = hand.map(getRank)
  const suits = hand.map(getSuit)
  const indices = hand.map(rankIndex).sort((a, b) => a - b)

  const rankCounts: Record<string, number> = {}
  ranks.forEach(r => { rankCounts[r] = (rankCounts[r] || 0) + 1 })
  const counts = Object.values(rankCounts).sort((a, b) => b - a)

  const isFlush = suits.every(s => s === suits[0])
  const isStr8 = indices[4] - indices[0] === 4 && new Set(indices).size === 5
  const isWheelStr8 = JSON.stringify(indices) === JSON.stringify([0,1,2,3,12])
  const isStraight = isStr8 || isWheelStr8
  const isRoyalFlush = isFlush && JSON.stringify(indices) === JSON.stringify([8,9,10,11,12])

  if (isRoyalFlush)                       return { name: 'ROYAL FLUSH',     multiplier: 800 }
  if (isStraight && isFlush)              return { name: 'STRAIGHT FLUSH',  multiplier: 50  }
  if (counts[0] === 4)                    return { name: 'FOUR OF A KIND',  multiplier: 25  }
  if (counts[0] === 3 && counts[1] === 2) return { name: 'FULL HOUSE',      multiplier: 9   }
  if (isFlush)                            return { name: 'FLUSH',           multiplier: 6   }
  if (isStraight)                         return { name: 'STRAIGHT',        multiplier: 4   }
  if (counts[0] === 3)                    return { name: 'THREE OF A KIND', multiplier: 3   }
  if (counts[0] === 2 && counts[1] === 2) return { name: 'TWO PAIR',        multiplier: 2   }

  if (counts[0] === 2) {
    const pair = Object.entries(rankCounts).find(([, c]) => c === 2)![0]
    if (['J','Q','K','A'].includes(pair)) return { name: 'JACKS OR BETTER', multiplier: 1   }
  }

  return { name: 'NO HAND', multiplier: 0 }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { action, bet, hand, deck, held } = body

  const { data: cfg } = await supabase.from('config').select('key, value')
  const config: Record<string, string> = {}
  cfg?.forEach((r: { key: string; value: string }) => { config[r.key] = r.value })
  if (config['casino_open'] === 'false' || config['poker_open'] === 'false')
    return NextResponse.json({ error: 'POKER IS CURRENTLY CLOSED' }, { status: 403 })

  const { data: profile } = await supabase
    .from('profiles').select('caps_balance, is_admin').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  if (action === 'deal') {
    if (!bet || bet < 10)
      return NextResponse.json({ error: 'MINIMUM BET IS 10 CAPS' }, { status: 400 })
    if (bet > profile.caps_balance)
      return NextResponse.json({ error: 'INSUFFICIENT CAPS' }, { status: 400 })

    const deck = freshDeck()

    // 🎰 ADMIN CHEAT: dealt a royal flush — hold all 5 and draw to collect 800x
    const dealtHand = profile.is_admin
      ? ['A♠', 'K♠', 'Q♠', 'J♠', '10♠']
      : [deck.pop()!, deck.pop()!, deck.pop()!, deck.pop()!, deck.pop()!]

    await supabase.from('profiles')
      .update({ caps_balance: profile.caps_balance - bet })
      .eq('id', user.id)

    return NextResponse.json({
      status: 'dealt',
      hand: dealtHand,
      deck: deck.slice(0, 10),
      newBalance: profile.caps_balance - bet
    })
  }

  if (action === 'draw') {
    if (!hand || !deck || !held)
      return NextResponse.json({ error: 'Invalid state' }, { status: 400 })

    const remainingDeck = [...deck]
    const finalHand = hand.map((card: string, i: number) =>
      held[i] ? card : remainingDeck.pop()!
    )

    const { name, multiplier } = evaluateHand(finalHand)
    const payout = bet * multiplier
    let newBalance = profile.caps_balance + payout
    const outcome = multiplier > 0 ? 'win' : 'loss'

    await supabase.from('profiles').update({ caps_balance: newBalance }).eq('id', user.id)
    await supabase.from('transactions').insert({
      user_id: user.id, game: 'poker', type: outcome,
      // ✅ FIX: record net profit/loss, not gross payout
      amount: outcome === 'win' ? payout - bet : bet,
      balance_after: newBalance
    })
    await supabase.from('game_sessions').insert({
      user_id: user.id, game: 'poker', bet, outcome, payout,
      state_snapshot: { finalHand, handName: name, multiplier }
    })

    if (!profile.is_admin) newBalance = await applyBustProtection(supabase, user.id, newBalance)

    return NextResponse.json({
      status: outcome, hand: finalHand, handName: name,
      multiplier, payout, newBalance,
      message: multiplier > 0
        ? `${name} · ${payout.toLocaleString()} CAPS`
        : 'NO HAND — HOUSE WINS'
    })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}