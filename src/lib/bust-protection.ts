import type { SupabaseClient } from '@supabase/supabase-js'

const FLOOR = 50

export async function applyBustProtection(
  supabase: SupabaseClient,
  userId: string,
  currentBalance: number
): Promise<number> {
  if (currentBalance >= FLOOR) return currentBalance

  const topUp = FLOOR - currentBalance
  const newBalance = FLOOR

  await supabase.from('profiles')
    .update({ caps_balance: newBalance })
    .eq('id', userId)

  await supabase.from('transactions').insert({
    user_id: userId,
    game: 'bonus',
    type: 'bonus',
    amount: topUp,
    balance_after: newBalance
  })

  return newBalance
}