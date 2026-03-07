import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify admin
  const { data: profile } = await supabase
    .from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { action } = body

  // ── SET CONFIG ─────────────────────────────────────────
  if (action === 'set_config') {
    const { key, value } = body
    const { error } = await supabase
      .from('config')
      .update({ value, updated_at: new Date().toISOString() })
      .eq('key', key)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── ADJUST BALANCE ─────────────────────────────────────
  if (action === 'adjust_balance') {
    const { userId, amount } = body
    const { data: target } = await supabase
      .from('profiles').select('caps_balance, username').eq('id', userId).single()
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const newBalance = Math.max(0, target.caps_balance + amount)
    await supabase.from('profiles').update({ caps_balance: newBalance }).eq('id', userId)
    await supabase.from('transactions').insert({
      user_id: userId, game: 'admin', type: 'admin_adjust',
      amount: Math.abs(amount), balance_after: newBalance
    })
    return NextResponse.json({ ok: true, newBalance, username: target.username })
  }

  // ── SET BALANCE DIRECTLY ───────────────────────────────
  if (action === 'set_balance') {
    const { userId, amount } = body
    const { data: target } = await supabase
      .from('profiles').select('username').eq('id', userId).single()
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    await supabase.from('profiles').update({ caps_balance: amount }).eq('id', userId)
    await supabase.from('transactions').insert({
      user_id: userId, game: 'admin', type: 'admin_adjust',
      amount, balance_after: amount
    })
    return NextResponse.json({ ok: true, newBalance: amount, username: target.username })
  }

  // ── SEARCH USERS ───────────────────────────────────────
  if (action === 'search_users') {
    const { query } = body
    const { data } = await supabase
      .from('profiles')
      .select('id, username, caps_balance, is_admin, created_at')
      .ilike('username', `%${query}%`)
      .limit(10)
    return NextResponse.json({ users: data || [] })
  }

  // ── GET USER TRANSACTIONS ──────────────────────────────
  if (action === 'get_transactions') {
    const { userId } = body
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30)
    return NextResponse.json({ transactions: data || [] })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}