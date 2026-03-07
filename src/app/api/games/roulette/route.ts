import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const NUMBERS = Array.from({ length: 37 }, (_, i) => i) // 0-36

const RED = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]
const BLACK = [2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35]

function spin(): number {
  return NUMBERS[Math.floor(Math.random() * NUMBERS.length)]
}

type Bet = {
  type: string
  value: string | number
  amount: number
}

function resolveBet(bet: Bet, result: number): number {
  const isRed = RED.includes(result)
  const isBlack = BLACK.includes(result)
  const isGreen = result === 0

  switch (bet.type) {
    case 'straight':
      return Number(bet.value) === result ? bet.amount * 35 : 0

    case 'red':
      return isRed ? bet.amount * 2 : 0

    case 'black':
      return isBlack ? bet.amount * 2 : 0

    case 'even':
      return !isGreen && result % 2 === 0 ? bet.amount * 2 : 0

    case 'odd':
      return !isGreen && result % 2 !== 0 ? bet.amount * 2 : 0

    case 'low': // 1-18
      return result >= 1 && result <= 18 ? bet.amount * 2 : 0

    case 'high': // 19-36
      return result >= 19 && result <= 36 ? bet.amount * 2 : 0

    case 'dozen':
      if (bet.value === '1' && result >= 1 && result <= 12) return bet.amount * 3
      if (bet.value === '2' && result >= 13 && result <= 24) return bet.amount * 3
      if (bet.value === '3' && result >= 25 && result <= 36) return bet.amount * 3
      return 0

    case 'column':
      if (bet.value === '1' && result % 3 === 1) return bet.amount * 3
      if (bet.value === '2' && result % 3 === 2) return bet.amount * 3
      if (bet.value === '3' && result % 3 === 0 && result !== 0) return bet.amount * 3
      return 0

    default:
      return 0
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { bets }: { bets: Bet[] } = body

  const { data: cfg } = await supabase.from('config').select('key, value')
  const config: Record<string, string> = {}
  cfg?.forEach((r: { key: string; value: string }) => { config[r.key] = r.value })
  if (config['casino_open'] === 'false' || config['roulette_open'] === 'false')
    return NextResponse.json({ error: 'ROULETTE IS CURRENTLY CLOSED' }, { status: 403 })

  if (!bets || bets.length === 0)
    return NextResponse.json({ error: 'PLACE AT LEAST ONE BET' }, { status: 400 })

  const totalBet = bets.reduce((sum, b) => sum + b.amount, 0)
  if (totalBet < 10)
    return NextResponse.json({ error: 'MINIMUM BET IS 10 CAPS' }, { status: 400 })

  const { data: profile } = await supabase
    .from('profiles').select('caps_balance').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  if (totalBet > profile.caps_balance)
    return NextResponse.json({ error: 'INSUFFICIENT CAPS' }, { status: 400 })

  const result = spin()
  const totalPayout = bets.reduce((sum, b) => sum + resolveBet(b, result), 0)
  const newBalance = profile.caps_balance - totalBet + totalPayout
  const outcome = totalPayout > totalBet ? 'win' : totalPayout === totalBet ? 'push' : 'loss'

  await supabase.from('profiles').update({ caps_balance: newBalance }).eq('id', user.id)
  await supabase.from('transactions').insert({
    user_id: user.id, game: 'roulette',
    type: outcome === 'loss' ? 'loss' : 'win',
    amount: outcome === 'loss' ? totalBet : totalPayout - totalBet,
    balance_after: newBalance
  })
  await supabase.from('game_sessions').insert({
    user_id: user.id, game: 'roulette', bet: totalBet,
    outcome, payout: totalPayout,
    state_snapshot: { bets, result, totalPayout }
  })

  const isRed = RED.includes(result)
  const color = result === 0 ? 'green' : isRed ? 'red' : 'black'

  return NextResponse.json({ result, color, totalBet, totalPayout, newBalance, outcome })
}