'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Config = Record<string, string>
type UserResult = {
  id: string
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

const TOGGLE_KEYS = [
  { key: 'casino_open',    label: 'CASINO (MASTER)' },
  { key: 'blackjack_open', label: 'BLACKJACK' },
  { key: 'roulette_open',  label: 'ROULETTE' },
  { key: 'slots_open',     label: 'SLOTS' },
  { key: 'poker_open',     label: 'VIDEO POKER' },
]

export default function AdminPage() {
  const [config, setConfig] = useState<Config>({})
  const [maintenanceMsg, setMaintenanceMsg] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<UserResult[]>([])
  const [selectedUser, setSelectedUser] = useState<UserResult | null>(null)
  const [userTxns, setUserTxns] = useState<Transaction[]>([])
  const [adjustAmount, setAdjustAmount] = useState('')
  const [setBalanceAmount, setSetBalanceAmount] = useState('')
  const [alert, setAlert] = useState('')
  const [alertType, setAlertType] = useState<'success' | 'error'>('success')
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'switches' | 'players'>('switches')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: prof } = await supabase
        .from('profiles').select('is_admin').eq('id', user.id).single()
      if (!prof?.is_admin) { router.push('/lobby'); return }

      const { data: cfg } = await supabase.from('config').select('key, value')
      if (cfg) {
        const map: Config = {}
        cfg.forEach((r: { key: string; value: string }) => { map[r.key] = r.value })
        setConfig(map)
        setMaintenanceMsg(map['maintenance_msg'] || '')
      }
      setLoading(false)
    }
    load()
  }, [])

  function showAlert(msg: string, type: 'success' | 'error' = 'success') {
    setAlert(msg)
    setAlertType(type)
    setTimeout(() => setAlert(''), 3000)
  }

  async function callAdmin(body: object) {
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    return res.json()
  }

  async function toggleConfig(key: string) {
    const current = config[key] !== 'false'
    const newValue = current ? 'false' : 'true'
    const data = await callAdmin({ action: 'set_config', key, value: newValue })
    if (data.ok) {
      setConfig(prev => ({ ...prev, [key]: newValue }))
      showAlert(`> ${key.toUpperCase()} SET TO ${newValue.toUpperCase()}`)
    } else {
      showAlert('> ERROR: ' + data.error, 'error')
    }
  }

  async function saveMaintenanceMsg() {
    const data = await callAdmin({
      action: 'set_config', key: 'maintenance_msg', value: maintenanceMsg
    })
    if (data.ok) showAlert('> MAINTENANCE MESSAGE SAVED')
    else showAlert('> ERROR: ' + data.error, 'error')
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return
    const data = await callAdmin({ action: 'search_users', query: searchQuery })
    setSearchResults(data.users || [])
    setSelectedUser(null)
    setUserTxns([])
  }

  async function selectUser(user: UserResult) {
    setSelectedUser(user)
    setAdjustAmount('')
    setSetBalanceAmount('')
    const data = await callAdmin({ action: 'get_transactions', userId: user.id })
    setUserTxns(data.transactions || [])
  }

  async function handleAdjust(type: 'adjust' | 'set') {
    if (!selectedUser) return
    const amount = parseInt(type === 'adjust' ? adjustAmount : setBalanceAmount)
    if (isNaN(amount)) { showAlert('> ERROR: INVALID AMOUNT', 'error'); return }

    const data = await callAdmin({
      action: type === 'adjust' ? 'adjust_balance' : 'set_balance',
      userId: selectedUser.id,
      amount
    })

    if (data.ok) {
      showAlert(`> ${data.username} BALANCE → ${data.newBalance.toLocaleString()} CAPS`)
      setSelectedUser(prev => prev ? { ...prev, caps_balance: data.newBalance } : prev)
      setSearchResults(prev =>
        prev.map(u => u.id === selectedUser.id ? { ...u, caps_balance: data.newBalance } : u)
      )
    } else {
      showAlert('> ERROR: ' + data.error, 'error')
    }
  }

  const typeColor = (type: string) => {
    if (type === 'win' || type === 'bonus' || type === 'admin_adjust') return 'var(--gold)'
    if (type === 'loss') return 'var(--red-bright)'
    return 'var(--white-dim)'
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
        background: 'linear-gradient(90deg, transparent, var(--red-bright), transparent)' }} />

      <div style={{ maxWidth: '900px', margin: '0 auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '2.5rem', color: 'var(--red-bright)' }}>ADMIN PANEL</h1>
            <p style={{ color: 'var(--gold-dim)', fontSize: '0.75rem', letterSpacing: '0.2em' }}>
              MR. HOUSE · LUCKY 38 CONTROL ROOM
            </p>
          </div>
          <Link href="/lobby">
            <button className="btn" style={{ padding: '0.4rem 1rem', fontSize: '0.75rem' }}>
              ← LOBBY
            </button>
          </Link>
        </div>

        {alert && (
          <div style={{
            padding: '0.75rem 1rem', marginBottom: '1.5rem',
            border: `1px solid ${alertType === 'success' ? 'var(--gold)' : 'var(--red-bright)'}`,
            color: alertType === 'success' ? 'var(--gold)' : 'var(--red-bright)',
            fontSize: '0.85rem', letterSpacing: '0.1em',
            background: 'rgba(0,0,0,0.4)',
          }}>
            {alert}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem',
          borderBottom: '1px solid var(--gold-dim)', paddingBottom: '0.5rem' }}>
          {(['switches', 'players'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className="btn"
              style={{
                background: tab === t ? 'var(--gold)' : 'transparent',
                color: tab === t ? 'var(--black)' : 'var(--gold)',
                fontSize: '0.8rem', padding: '0.4rem 1.2rem',
              }}>
              {t === 'switches' ? '[ KILL SWITCHES ]' : '[ PLAYERS ]'}
            </button>
          ))}
        </div>

        {/* ── KILL SWITCHES TAB ── */}
        {tab === 'switches' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            <div className="panel" style={{ borderColor: 'var(--red-bright)' }}>
              <h3 style={{ color: 'var(--red-bright)', fontSize: '1rem',
                letterSpacing: '0.2em', marginBottom: '1.5rem' }}>
                ▶ GAME CONTROLS
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {TOGGLE_KEYS.map(({ key, label }) => {
                  const isOn = config[key] !== 'false'
                  return (
                    <div key={key} style={{ display: 'flex', alignItems: 'center',
                      justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                      <div>
                        <span style={{ color: 'var(--white)', fontSize: '0.9rem',
                          letterSpacing: '0.1em' }}>
                          {label}
                        </span>
                        <span style={{
                          marginLeft: '1rem', fontSize: '0.7rem', letterSpacing: '0.15em',
                          color: isOn ? 'var(--gold)' : 'var(--red-bright)',
                        }}>
                          {isOn ? '● OPEN' : '● CLOSED'}
                        </span>
                      </div>
                      <button
                        onClick={() => toggleConfig(key)}
                        className={isOn ? 'btn btn-danger' : 'btn btn-primary'}
                        style={{ fontSize: '0.75rem', padding: '0.4rem 1.2rem' }}>
                        {isOn ? '[ CLOSE ]' : '[ OPEN ]'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="panel">
              <h3 style={{ fontSize: '1rem', letterSpacing: '0.2em', marginBottom: '1rem' }}>
                ▶ MAINTENANCE MESSAGE
              </h3>
              <textarea
                value={maintenanceMsg}
                onChange={e => setMaintenanceMsg(e.target.value)}
                style={{
                  width: '100%', minHeight: '80px', padding: '0.75rem',
                  background: 'var(--black)', border: '1px solid var(--gold-dim)',
                  color: 'var(--white)', fontFamily: 'inherit', fontSize: '0.85rem',
                  resize: 'vertical', outline: 'none', marginBottom: '0.75rem',
                }}
                placeholder="The Lucky 38 is temporarily closed. — Mr. House"
              />
              <button className="btn btn-primary" onClick={saveMaintenanceMsg}
                style={{ fontSize: '0.8rem' }}>
                [ SAVE MESSAGE ]
              </button>
            </div>

          </div>
        )}

        {/* ── PLAYERS TAB ── */}
        {tab === 'players' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            <div className="panel">
              <h3 style={{ fontSize: '1rem', letterSpacing: '0.2em', marginBottom: '1rem' }}>
                ▶ SEARCH PLAYER
              </h3>
              <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
                <input className="input" placeholder="USERNAME..."
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  style={{ flex: 1 }} />
                <button className="btn btn-primary" onClick={handleSearch}
                  style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                  [ SEARCH ]
                </button>
              </div>

              {searchResults.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {searchResults.map(u => (
                    <div key={u.id} onClick={() => selectUser(u)} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '0.6rem 1rem', cursor: 'pointer',
                      background: selectedUser?.id === u.id
                        ? 'rgba(201,168,76,0.1)' : 'transparent',
                      border: `1px solid ${selectedUser?.id === u.id
                        ? 'var(--gold)' : 'var(--gold-dim)'}`,
                    }}>
                      <span style={{ color: 'var(--white)', fontSize: '0.85rem' }}>
                        {u.username}
                        {u.is_admin && (
                          <span style={{ color: 'var(--red-bright)', fontSize: '0.65rem',
                            marginLeft: '0.5rem' }}>
                            [ADMIN]
                          </span>
                        )}
                      </span>
                      <span className="caps-badge" style={{ fontSize: '0.75rem' }}>
                        💰 {u.caps_balance.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selectedUser && (
              <>
                <div className="panel">
                  <h3 style={{ fontSize: '1rem', letterSpacing: '0.2em', marginBottom: '1.5rem' }}>
                    ▶ MANAGE: {selectedUser.username}
                  </h3>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr',
                    gap: '1.5rem', flexWrap: 'wrap' }}>

                    <div>
                      <label style={{ color: 'var(--gold-dim)', fontSize: '0.75rem',
                        letterSpacing: '0.2em', display: 'block', marginBottom: '0.4rem' }}>
                        ADJUST BY (+ or -)
                      </label>
                      <input className="input" type="number"
                        placeholder="e.g. 500 or -200"
                        value={adjustAmount}
                        onChange={e => setAdjustAmount(e.target.value)}
                        style={{ marginBottom: '0.5rem' }} />
                      <button className="btn btn-primary" style={{ width: '100%', fontSize: '0.8rem' }}
                        onClick={() => handleAdjust('adjust')}>
                        [ ADJUST BALANCE ]
                      </button>
                    </div>

                    <div>
                      <label style={{ color: 'var(--gold-dim)', fontSize: '0.75rem',
                        letterSpacing: '0.2em', display: 'block', marginBottom: '0.4rem' }}>
                        SET TO EXACT AMOUNT
                      </label>
                      <input className="input" type="number"
                        placeholder="e.g. 1000"
                        value={setBalanceAmount}
                        onChange={e => setSetBalanceAmount(e.target.value)}
                        style={{ marginBottom: '0.5rem' }} />
                      <button className="btn" style={{ width: '100%', fontSize: '0.8rem' }}
                        onClick={() => handleAdjust('set')}>
                        [ SET BALANCE ]
                      </button>
                    </div>

                  </div>
                </div>

                <div className="panel">
                  <h3 style={{ fontSize: '1rem', letterSpacing: '0.2em', marginBottom: '1rem' }}>
                    ▶ TRANSACTION HISTORY — {selectedUser.username}
                  </h3>
                  {userTxns.length === 0 ? (
                    <p style={{ color: 'var(--white-dim)', fontSize: '0.8rem' }}>NO TRANSACTIONS</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem',
                      maxHeight: '300px', overflowY: 'auto' }}>
                      {userTxns.map(tx => (
                        <div key={tx.id} style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr auto auto auto',
                          gap: '0.75rem', alignItems: 'center',
                          padding: '0.4rem 0',
                          borderBottom: '1px solid rgba(201,168,76,0.08)',
                          fontSize: '0.8rem',
                        }}>
                          <div>
                            <span style={{ color: 'var(--white)',
                              textTransform: 'uppercase' }}>{tx.game}</span>
                            <span style={{ color: 'var(--gold-dim)', fontSize: '0.65rem',
                              display: 'block' }}>
                              {new Date(tx.created_at).toLocaleString('en-US', {
                                month: 'short', day: 'numeric',
                                hour: '2-digit', minute: '2-digit'
                              })}
                            </span>
                          </div>
                          <span style={{ color: 'var(--gold-dim)', textTransform: 'uppercase',
                            fontSize: '0.7rem' }}>{tx.type}</span>
                          <span style={{ color: typeColor(tx.type), textAlign: 'right' }}>
                            {tx.type === 'loss' ? '-' : '+'}{tx.amount.toLocaleString()}
                          </span>
                          <span style={{ color: 'var(--white-dim)', fontSize: '0.7rem',
                            textAlign: 'right' }}>
                            {tx.balance_after.toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

          </div>
        )}

      </div>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: '4px',
        background: 'linear-gradient(90deg, transparent, var(--red-bright), transparent)' }} />
    </main>
  )
}