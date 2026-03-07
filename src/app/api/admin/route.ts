import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// ✅ FIX: service-role client bypasses RLS so the admin can write
// to OTHER users' profiles. The cookie-based client only has access
// to the current user's own rows.
const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify admin (read from the current user's own row — fine with RLS)
  const { data: profile } = await supabase
    .from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { action } = body

  // ── SET CONFIG ─────────────────────────────────────────────────
  if (action === 'set_config') {
    const { key, value } = body
    // ✅ FIX: removed `updated_at` — that column does not exist in the config table
    const { error } = await supabaseAdmin
      .from('config')
      .update({ value })
      .eq('key', key)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── ADJUST BALANCE (± delta) ────────────────────────────────────
  if (action === 'adjust_balance') {
    const { userId, amount } = body

    const { data: target, error: fetchErr } = await supabaseAdmin
      .from('profiles').select('caps_balance, username').eq('id', userId).single()
    if (fetchErr || !target)
      return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const newBalance = Math.max(0, target.caps_balance + amount)

    const { error: updateErr } = await supabaseAdmin
      .from('profiles').update({ caps_balance: newBalance }).eq('id', userId)
    if (updateErr)
      return NextResponse.json({ error: updateErr.message }, { status: 500 })

    await supabaseAdmin.from('transactions').insert({
      user_id: userId, game: 'admin', type: 'admin_adjust',
      amount: Math.abs(amount), balance_after: newBalance
    })

    return NextResponse.json({ ok: true, newBalance, username: target.username })
  }

  // ── SET BALANCE (exact) ────────────────────────────────────────
  if (action === 'set_balance') {
    const { userId, amount } = body

    const { data: target, error: fetchErr } = await supabaseAdmin
      .from('profiles').select('caps_balance, username').eq('id', userId).single()
    if (fetchErr || !target)
      return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const { error: updateErr } = await supabaseAdmin
      .from('profiles').update({ caps_balance: amount }).eq('id', userId)
    if (updateErr)
      return NextResponse.json({ error: updateErr.message }, { status: 500 })

    // ✅ FIX: record the *difference* as the transaction amount, not the new balance
    const diff = Math.abs(amount - target.caps_balance)
    await supabaseAdmin.from('transactions').insert({
      user_id: userId, game: 'admin', type: 'admin_adjust',
      amount: diff > 0 ? diff : 1,
      balance_after: amount
    })

    return NextResponse.json({ ok: true, newBalance: amount, username: target.username })
  }

  // ── SEARCH USERS ───────────────────────────────────────────────
  if (action === 'search_users') {
    const { query } = body
    const { data } = await supabaseAdmin
      .from('profiles')
      .select('id, username, caps_balance, is_admin, created_at')
      .ilike('username', `%${query}%`)
      .limit(10)
    return NextResponse.json({ users: data || [] })
  }

  // ── GET USER TRANSACTIONS ──────────────────────────────────────
  if (action === 'get_transactions') {
    const { userId } = body
    const { data } = await supabaseAdmin
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30)
    return NextResponse.json({ transactions: data || [] })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}