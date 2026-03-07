import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const REEL: string[] = [
  '🍒','🍒','🍒','🍒','🍒','🍒',
  '🔔','🔔','🔔','🔔',
  '⭐','⭐','⭐',
  '💎','💎',
  '7️⃣',
  '🎰',
]

const PAYOUTS: Record<string, number> = {
  '🍒🍒🍒': 6,
  '🔔🔔🔔': 9,
  '⭐⭐⭐':  16,
  '💎💎💎':  32,
  '7️⃣7️⃣7️⃣': 75,
  '🎰🎰🎰': 160,
}

function spinReel(): string {
  return REEL[Math.floor(Math.random() * REEL.length)]
}

function spin(): string[] {
  return [spinReel(), spinReel(), spinReel()]
}

function calculatePayout(reels: string[], bet: number): { multiplier: number; label: string } {
  const key = reels.join('')
  if (PAYOUTS[key]) return { multiplier: PAYOUTS[key], label: key }

  // Two cherries (first two reels, third is NOT cherry)
  if (reels[0] === '🍒' && reels[1] === '🍒' && reels[2] !== '🍒') {
    return { multiplier: 3, label: 'TWO CHERRIES' }
  }

  return { multiplier: 0, label: 'NO MATCH' }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { bet } = body

  const { data: cfg } = await supabase.from('config').select('key, value')
  const config: Record<string, string> = {}
  cfg?.forEach((r: { key: string; value: string }) => { config[r.key] = r.value })
  if (config['casino_open'] === 'false' || config['slots_open'] === 'false')
    return NextResponse.json({ error: 'SLOTS ARE CURRENTLY CLOSED' }, { status: 403 })

  if (!bet || bet < 10)
    return NextResponse.json({ error: 'MINIMUM BET IS 10 CAPS' }, { status: 400 })

  const { data: profile } = await supabase
    .from('profiles').select('caps_balance').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  if (bet > profile.caps_balance)
    return NextResponse.json({ error: 'INSUFFICIENT CAPS' }, { status: 400 })

  const reels = spin()
  const { multiplier, label } = calculatePayout(reels, bet)
  const payout = bet * multiplier
  const newBalance = profile.caps_balance - bet + payout
  const outcome = multiplier > 0 ? 'win' : 'loss'

  await supabase.from('profiles').update({ caps_balance: newBalance }).eq('id', user.id)
  await supabase.from('transactions').insert({
    user_id: user.id, game: 'slots',
    type: outcome,
    amount: outcome === 'win' ? payout - bet : bet,
    balance_after: newBalance
  })
  await supabase.from('game_sessions').insert({
    user_id: user.id, game: 'slots', bet,
    outcome, payout,
    state_snapshot: { reels, multiplier, label }
  })

  return NextResponse.json({ reels, multiplier, payout, newBalance, outcome, label })
}