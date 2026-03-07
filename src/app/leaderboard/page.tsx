'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

type LeaderboardEntry = {
  id: string
  username: string
  caps_balance: number
  rank: number
  created_at: string
}

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setCurrentUserId(user.id)

      const { data } = await supabase
        .from('leaderboard')
        .select('*')
        .order('rank', { ascending: true })

      if (data) setEntries(data)
      setLoading(false)
    }
    load()

    // Realtime updates
    const channel = supabase
      .channel('leaderboard-realtime')
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'profiles'
      }, async () => {
        const { data } = await supabase
          .from('leaderboard')
          .select('*')
          .order('rank', { ascending: true })
        if (data) setEntries(data)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const medalColor = (rank: number) => {
    if (rank === 1) return '#FFD700'
    if (rank === 2) return '#C0C0C0'
    if (rank === 3) return '#CD7F32'
    return 'var(--gold-dim)'
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--black)', padding: '2rem' }}>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '4px',
        background: 'linear-gradient(90deg, transparent, var(--gold), transparent)' }} />

      <div style={{ maxWidth: '700px', margin: '0 auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 className="glow" style={{ fontSize: '3rem' }}>LEADERBOARD</h1>
            <p style={{ color: 'var(--gold-dim)', letterSpacing: '0.3em', fontSize: '0.7rem' }}>
              TOP CAPS HOLDERS · LUCKY 38
            </p>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            {currentUserId ? (
              <Link href="/lobby">
                <button className="btn" style={{ padding: '0.4rem 1rem', fontSize: '0.75rem' }}>
                  ← LOBBY
                </button>
              </Link>
            ) : (
              <Link href="/">
                <button className="btn" style={{ padding: '0.4rem 1rem', fontSize: '0.75rem' }}>
                  ← HOME
                </button>
              </Link>
            )}
          </div>
        </div>

        <div className="divider" style={{ marginBottom: '2rem' }}>
          ✦ LIVE RANKINGS ✦
        </div>

        {loading ? (
          <p style={{ color: 'var(--gold)', letterSpacing: '0.3em', textAlign: 'center' }}>
            LOADING...
          </p>
        ) : entries.length === 0 ? (
          <p style={{ color: 'var(--white-dim)', textAlign: 'center', letterSpacing: '0.2em' }}>
            NO PLAYERS YET
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {entries.map((entry) => {
              const isMe = entry.id === currentUserId
              return (
                <div key={entry.id} className="panel" style={{
                  display: 'flex', alignItems: 'center', gap: '1rem',
                  padding: '1rem 1.5rem',
                  borderColor: isMe ? 'var(--gold)' : 'var(--gold-dim)',
                  background: isMe ? 'rgba(201,168,76,0.05)' : 'var(--black-soft)',
                }}>
                  <span style={{
                    fontSize: entry.rank <= 3 ? '1.5rem' : '1rem',
                    color: medalColor(entry.rank),
                    minWidth: '2.5rem',
                    textAlign: 'center',
                    fontFamily: 'VT323, monospace',
                  }}>
                    {entry.rank <= 3 ? ['🥇','🥈','🥉'][entry.rank - 1] : `#${entry.rank}`}
                  </span>

                  <div style={{ flex: 1 }}>
                    <span style={{
                      color: isMe ? 'var(--gold-bright)' : 'var(--white)',
                      fontSize: '1rem', letterSpacing: '0.1em',
                    }}>
                      {entry.username}
                      {isMe && (
                        <span style={{ color: 'var(--gold-dim)', fontSize: '0.7rem',
                          marginLeft: '0.5rem' }}>
                          (YOU)
                        </span>
                      )}
                    </span>
                  </div>

                  <span className="caps-badge" style={{
                    fontSize: '0.85rem',
                    borderColor: medalColor(entry.rank),
                    color: medalColor(entry.rank),
                  }}>
                    💰 {entry.caps_balance.toLocaleString()} CAPS
                  </span>
                </div>
              )
            })}
          </div>
        )}

        <p style={{ textAlign: 'center', color: 'var(--gold-dim)',
          fontSize: '0.7rem', letterSpacing: '0.15em', marginTop: '2rem' }}>
          UPDATES IN REAL TIME · MR. HOUSE IS WATCHING
        </p>

      </div>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: '4px',
        background: 'linear-gradient(90deg, transparent, var(--gold), transparent)' }} />
    </main>
  )
}