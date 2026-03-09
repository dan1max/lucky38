'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useConfig } from '@/lib/config-context'

type Profile = {
  username: string
  caps_balance: number
  is_admin: boolean
}

const GAMES = [
  { id: 'blackjack',       label: 'BLACKJACK',         desc: 'Beat the dealer. Blackjack pays 2.5x.',   icon: '🃏', configKey: 'blackjack_open' },
  { id: 'blackjack-multi', label: 'BLACKJACK MULTI',   desc: 'Same dealer, up to 6 players at once.',   icon: '🎴', configKey: 'blackjack_open' },
  { id: 'roulette',        label: 'ROULETTE',           desc: 'European single zero. Place your bets.',  icon: '🎡', configKey: 'roulette_open' },
  { id: 'slots',           label: 'SLOTS',              desc: 'Three reels. Weighted symbols.',           icon: '🎰', configKey: 'slots_open'    },
  { id: 'poker',           label: 'VIDEO POKER',        desc: '5-card draw. Jacks or better.',            icon: '♠️', configKey: 'poker_open'    },
  { id: 'poker-multi',     label: "TEXAS HOLD'EM",      desc: 'Multiplayer poker. Up to 6 players.',     icon: '🂡', configKey: 'poker_open'    },
]

export default function LobbyPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [bonusStatus, setBonusStatus] = useState<'available' | 'claimed' | 'loading'>('loading')
  const [bonusMsg, setBonusMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const config = useConfig()
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    let balanceChannel: ReturnType<typeof supabase.channel> | null = null

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const [{ data: prof }, { data: bonus }] = await Promise.all([
        supabase.from('profiles')
          .select('username, caps_balance, is_admin')
          .eq('id', user.id).single(),
        supabase.from('daily_bonus')
          .select('id').eq('user_id', user.id)
          .eq('claim_date', new Date().toISOString().split('T')[0])
          .maybeSingle(),
      ])

      if (prof) setProfile(prof)
      setBonusStatus(bonus ? 'claimed' : 'available')
      setLoading(false)

      balanceChannel = supabase
        .channel('lobby-balance')
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'profiles',
          filter: `id=eq.${user.id}`
        }, (payload: { new: { caps_balance: number; username: string; is_admin: boolean } }) => {
          setProfile(prev => prev ? { ...prev, caps_balance: payload.new.caps_balance } : prev)
        })
        .subscribe()
    }

    load()

    return () => {
      if (balanceChannel) supabase.removeChannel(balanceChannel)
    }
  }, [])

  async function claimBonus() {
    setBonusStatus('loading')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const today = new Date().toISOString().split('T')[0]
    const { error } = await supabase.from('daily_bonus')
      .insert({ user_id: user.id, claim_date: today })
    if (error) { setBonusStatus('available'); return }

    await supabase.from('profiles')
      .update({ caps_balance: (profile?.caps_balance ?? 0) + 100 })
      .eq('id', user.id)
    setProfile(p => p ? { ...p, caps_balance: p.caps_balance + 100 } : p)
    setBonusStatus('claimed')
    setBonusMsg('+ 100 CAPS CREDITED')
    setTimeout(() => setBonusMsg(''), 3000)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) return (
    <main style={{ minHeight: '100vh', background: 'var(--black)',
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--gold)', letterSpacing: '0.3em' }}>LOADING...</p>
    </main>
  )

  const casinoOpen = config['casino_open'] !== 'false'

  return (
    <main style={{ minHeight: '100vh', background: 'var(--black)', padding: '2rem' }}>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '4px',
        background: 'linear-gradient(90deg, transparent, var(--gold), transparent)' }} />

      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>

        <header style={{ display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: '2.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 className="glow" style={{ fontSize: '3rem', lineHeight: 1 }}>LUCKY 38</h1>
            <p style={{ color: 'var(--gold-dim)', letterSpacing: '0.3em', fontSize: '0.7rem' }}>
              CASINO FLOOR · NEW VEGAS
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <span className="caps-badge">⚙ {profile?.username}</span>
            <span className="caps-badge">💰 {profile?.caps_balance.toLocaleString()} CAPS</span>
            {profile?.is_admin && (
              <Link href="/admin">
                <button className="btn btn-danger"
                  style={{ padding: '0.4rem 1rem', fontSize: '0.75rem' }}>
                  [ ADMIN ]
                </button>
              </Link>
            )}
            <Link href="/profile">
              <button className="btn" style={{ padding: '0.4rem 1rem', fontSize: '0.75rem' }}>
                [ PROFILE ]
              </button>
            </Link>
            <button className="btn" onClick={handleSignOut}
              style={{ padding: '0.4rem 1rem', fontSize: '0.75rem' }}>
              [ SIGN OUT ]
            </button>
          </div>
        </header>

        {!casinoOpen && (
          <div className="panel" style={{ textAlign: 'center', marginBottom: '2rem',
            borderColor: 'var(--red-bright)', padding: '1.5rem' }}>
            <p style={{ color: 'var(--red-bright)', letterSpacing: '0.2em', fontSize: '1.1rem' }}>
              ⚠ {config['maintenance_msg'] || 'THE LUCKY 38 IS TEMPORARILY CLOSED.'}
            </p>
          </div>
        )}

        <div style={{ display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1.5rem', marginBottom: '2rem' }}>
          {GAMES.map(game => {
            const isOpen = casinoOpen && config[game.configKey] !== 'false'
            return (
              <div key={game.id} className="panel" style={{
                opacity: isOpen ? 1 : 0.4,
                transition: 'all 0.3s',
                cursor: isOpen ? 'pointer' : 'not-allowed',
              }}
                onClick={() => isOpen && router.push(`/games/${game.id}`)}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>{game.icon}</div>
                <h2 style={{ fontSize: '1.4rem', marginBottom: '0.4rem' }}>{game.label}</h2>
                <p style={{ color: 'var(--white-dim)', fontSize: '0.8rem', lineHeight: 1.6 }}>
                  {game.desc}
                </p>
                <div style={{ marginTop: '1rem' }}>
                  <span style={{
                    fontSize: '0.7rem', letterSpacing: '0.2em', padding: '0.2rem 0.6rem',
                    border: `1px solid ${isOpen ? 'var(--gold-dim)' : 'var(--red-bright)'}`,
                    color: isOpen ? 'var(--gold-dim)' : 'var(--red-bright)',
                    transition: 'all 0.3s',
                  }}>
                    {isOpen ? '● OPEN' : '● CLOSED'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: '1rem', marginBottom: '2rem' }}>
          <div className="panel" style={{ textAlign: 'center' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>DAILY BONUS</h3>
            {bonusStatus === 'available' ? (
              <button className="btn btn-primary" onClick={claimBonus} style={{ width: '100%' }}>
                [ CLAIM 100 CAPS ]
              </button>
            ) : bonusStatus === 'claimed' ? (
              <p style={{ color: 'var(--gold-dim)', fontSize: '0.8rem', letterSpacing: '0.15em' }}>
                ✓ CLAIMED TODAY
              </p>
            ) : (
              <p style={{ color: 'var(--gold-dim)', fontSize: '0.8rem' }}>PROCESSING...</p>
            )}
            {bonusMsg && (
              <p style={{ color: 'var(--gold)', fontSize: '0.85rem',
                marginTop: '0.5rem', letterSpacing: '0.1em' }}>
                {bonusMsg}
              </p>
            )}
          </div>

          <div className="panel" style={{ textAlign: 'center' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>LEADERBOARD</h3>
            <Link href="/leaderboard">
              <button className="btn" style={{ width: '100%' }}>[ VIEW TOP PLAYERS ]</button>
            </Link>
          </div>
        </div>

      </div>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: '4px',
        background: 'linear-gradient(90deg, transparent, var(--gold), transparent)' }} />
    </main>
  )
}