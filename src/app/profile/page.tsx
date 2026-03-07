'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Profile = {
  username: string
  caps_balance: number
  is_admin: boolean
  created_at: string
}

type Transaction = {
  id: number
  game: string
  type: string
  amount: number
  balance_after: number
  created_at: string
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [stats, setStats] = useState({ wins: 0, losses: 0, totalWon: 0, totalLost: 0 })
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const [{ data: prof }, { data: txns }] = await Promise.all([
        supabase.from('profiles')
          .select('username, caps_balance, is_admin, created_at')
          .eq('id', user.id).single(),
        supabase.from('transactions')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50),
      ])

      if (prof) setProfile(prof)
      if (txns) {
        setTransactions(txns)
        const wins   = txns.filter(t => t.type === 'win').length
        const losses = txns.filter(t => t.type === 'loss').length
        const totalWon  = txns.filter(t => t.type === 'win').reduce((s, t) => s + t.amount, 0)
        const totalLost = txns.filter(t => t.type === 'loss').reduce((s, t) => s + t.amount, 0)
        setStats({ wins, losses, totalWon, totalLost })
      }
      setLoading(false)
    }
    load()
  }, [])

  const typeColor = (type: string) => {
    if (type === 'win' || type === 'bonus') return 'var(--gold)'
    if (type === 'loss') return 'var(--red-bright)'
    return 'var(--white-dim)'
  }

  const typePrefix = (type: string) => {
    if (type === 'win' || type === 'bonus' || type === 'admin_adjust') return '+'
    return '-'
  }

  if (loading) return (
    <main style={{ minHeight: '100vh', background: 'var(--black)',
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--gold)', letterSpacing: '0.3em' }}>LOADING...</p>
    </main>
  )

  return (
    <main style={{ minHeight: '100vh', background: 'var(--black)', padding: '2rem' }}>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '4px',
        background: 'linear-gradient(90deg, transparent, var(--gold), transparent)' }} />

      <div style={{ maxWidth: '700px', margin: '0 auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '2.5rem', color: 'var(--gold)' }}>PROFILE</h1>
            <p style={{ color: 'var(--gold-dim)', fontSize: '0.75rem', letterSpacing: '0.2em' }}>
              {profile?.username}
            </p>
          </div>
          <Link href="/lobby">
            <button className="btn" style={{ padding: '0.4rem 1rem', fontSize: '0.75rem' }}>
              ← LOBBY
            </button>
          </Link>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '1rem', marginBottom: '1.5rem' }}>
          {[
            { label: 'BALANCE',    value: `${profile?.caps_balance.toLocaleString()} ⚙` },
            { label: 'WINS',       value: stats.wins },
            { label: 'LOSSES',     value: stats.losses },
            { label: 'TOTAL WON',  value: `+${stats.totalWon.toLocaleString()}` },
            { label: 'TOTAL LOST', value: `-${stats.totalLost.toLocaleString()}` },
            { label: 'NET',        value: `${(stats.totalWon - stats.totalLost) >= 0 ? '+' : ''}${(stats.totalWon - stats.totalLost).toLocaleString()}` },
          ].map((stat, i) => (
            <div key={i} className="panel" style={{ textAlign: 'center', padding: '1rem' }}>
              <p style={{ color: 'var(--gold-dim)', fontSize: '0.65rem',
                letterSpacing: '0.2em', marginBottom: '0.4rem' }}>
                {stat.label}
              </p>
              <p style={{ color: 'var(--gold)', fontSize: '1.1rem', letterSpacing: '0.05em' }}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        {/* Member since */}
        <div className="panel" style={{ marginBottom: '1.5rem', padding: '1rem 1.5rem' }}>
          <p style={{ color: 'var(--gold-dim)', fontSize: '0.75rem', letterSpacing: '0.2em' }}>
            MEMBER SINCE:{' '}
            <span style={{ color: 'var(--white)' }}>
              {profile?.created_at
                ? new Date(profile.created_at).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'long', day: 'numeric'
                  })
                : '—'}
            </span>
          </p>
        </div>

        {/* Transaction history */}
        <div className="panel">
          <h3 style={{ fontSize: '1rem', letterSpacing: '0.2em', marginBottom: '1rem' }}>
            TRANSACTION HISTORY
          </h3>
          {transactions.length === 0 ? (
            <p style={{ color: 'var(--white-dim)', fontSize: '0.8rem', letterSpacing: '0.15em' }}>
              NO TRANSACTIONS YET
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem',
              maxHeight: '400px', overflowY: 'auto' }}>
              {transactions.map((tx) => (
                <div key={tx.id} style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto auto',
                  gap: '0.75rem', alignItems: 'center',
                  padding: '0.5rem 0',
                  borderBottom: '1px solid rgba(201,168,76,0.08)',
                }}>
                  <div>
                    <span style={{ color: 'var(--white)', fontSize: '0.8rem',
                      letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                      {tx.game}
                    </span>
                    <span style={{ color: 'var(--gold-dim)', fontSize: '0.65rem',
                      letterSpacing: '0.1em', display: 'block' }}>
                      {new Date(tx.created_at).toLocaleString('en-US', {
                        month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </span>
                  </div>
                  <span style={{ color: 'var(--gold-dim)', fontSize: '0.7rem',
                    letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    {tx.type}
                  </span>
                  <span style={{ color: typeColor(tx.type), fontSize: '0.85rem',
                    letterSpacing: '0.05em', textAlign: 'right' }}>
                    {typePrefix(tx.type)}{tx.amount.toLocaleString()}
                  </span>
                  <span style={{ color: 'var(--white-dim)', fontSize: '0.7rem',
                    letterSpacing: '0.05em', textAlign: 'right' }}>
                    {tx.balance_after.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: '4px',
        background: 'linear-gradient(90deg, transparent, var(--gold), transparent)' }} />
    </main>
  )
}