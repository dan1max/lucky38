'use client'

import { useState, useEffect, useRef } from 'react'
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

// ── Radio effect ─────────────────────────────────────────────────
function applyRadioEffect(micStream: MediaStream): MediaStream {
  const ctx = new AudioContext()
  const src = ctx.createMediaStreamSource(micStream)

  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'; hp.frequency.value = 200

  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'; lp.frequency.value = 3800

  const peak1 = ctx.createBiquadFilter()
  peak1.type = 'peaking'; peak1.frequency.value = 1000
  peak1.gain.value = 6; peak1.Q.value = 1

  const peak2 = ctx.createBiquadFilter()
  peak2.type = 'peaking'; peak2.frequency.value = 3000
  peak2.gain.value = -4; peak2.Q.value = 1.5

  const waveShaper = ctx.createWaveShaper()
  const curve = new Float32Array(256)
  for (let i = 0; i < 256; i++) {
    const x = (i * 2) / 256 - 1
    curve[i] = (Math.PI + 200) * x / (Math.PI + 200 * Math.abs(x))
  }
  waveShaper.curve = curve

  const delay = ctx.createDelay()
  delay.delayTime.value = 0.0025

  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -20
  comp.knee.value = 10
  comp.ratio.value = 4
  comp.attack.value = 0.003
  comp.release.value = 0.1

  const dest = ctx.createMediaStreamDestination()

  src.connect(hp).connect(lp).connect(peak1).connect(peak2)
    .connect(waveShaper).connect(delay).connect(comp).connect(dest)

  return dest.stream
}

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
  const [tab, setTab] = useState<'switches' | 'players' | 'broadcast'>('switches')

  // Broadcast state
  const [broadcasting, setBroadcasting] = useState(false)
  const [listenerCount, setListenerCount] = useState(0)
  const broadcastStream = useRef<MediaStream | null>(null)
  const peers = useRef<Map<string, RTCPeerConnection>>(new Map())
  const signalChannel = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)

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
        setBroadcasting(map['broadcast_active'] === 'true')
      }
      setLoading(false)
    }
    load()

    return () => { stopBroadcast() }
  }, [])

  function showAlert(msg: string, type: 'success' | 'error' = 'success') {
    setAlert(msg); setAlertType(type)
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
    const newValue = config[key] !== 'false' ? 'false' : 'true'
    const data = await callAdmin({ action: 'set_config', key, value: newValue })
    if (data.ok) {
      setConfig(prev => ({ ...prev, [key]: newValue }))
      showAlert(`> ${key.toUpperCase()} SET TO ${newValue.toUpperCase()}`)
    } else showAlert('> ERROR: ' + data.error, 'error')
  }

  async function saveMaintenanceMsg() {
    const data = await callAdmin({ action: 'set_config', key: 'maintenance_msg', value: maintenanceMsg })
    if (data.ok) showAlert('> MAINTENANCE MESSAGE SAVED')
    else showAlert('> ERROR: ' + data.error, 'error')
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return
    const data = await callAdmin({ action: 'search_users', query: searchQuery })
    setSearchResults(data.users || [])
    setSelectedUser(null); setUserTxns([])
  }

  async function selectUser(user: UserResult) {
    setSelectedUser(user)
    setAdjustAmount(''); setSetBalanceAmount('')
    const data = await callAdmin({ action: 'get_transactions', userId: user.id })
    setUserTxns(data.transactions || [])
  }

  async function handleAdjust(type: 'adjust' | 'set') {
    if (!selectedUser) return
    const amount = parseInt(type === 'adjust' ? adjustAmount : setBalanceAmount)
    if (isNaN(amount)) { showAlert('> ERROR: INVALID AMOUNT', 'error'); return }
    const data = await callAdmin({
      action: type === 'adjust' ? 'adjust_balance' : 'set_balance',
      userId: selectedUser.id, amount
    })
    if (data.ok) {
      showAlert(`> ${data.username} BALANCE → ${data.newBalance.toLocaleString()} CAPS`)
      setSelectedUser(prev => prev ? { ...prev, caps_balance: data.newBalance } : prev)
      setSearchResults(prev =>
        prev.map(u => u.id === selectedUser.id ? { ...u, caps_balance: data.newBalance } : u)
      )
    } else showAlert('> ERROR: ' + data.error, 'error')
  }

  // ── BROADCAST ───────────────────────────────────────────────────
  async function startBroadcast() {
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      const processed = applyRadioEffect(mic)
      broadcastStream.current = processed

      const channel = supabase.channel('webrtc-signal')
      signalChannel.current = channel

      channel.on('broadcast', { event: 'visitor-join' }, ({ payload }: { payload: { visitorId: string } }) => {
        createPeerForVisitor(payload.visitorId)
      })

      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await callAdmin({ action: 'set_config', key: 'broadcast_active', value: 'true' })
          setConfig(prev => ({ ...prev, broadcast_active: 'true' }))
          setBroadcasting(true)
          channel.send({ type: 'broadcast', event: 'broadcast-start', payload: {} })
          showAlert('> BROADCAST LIVE')
        }
      })
    } catch {
      showAlert('> MICROPHONE ACCESS DENIED', 'error')
    }
  }

  function createPeerForVisitor(visitorId: string) {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    })
    peers.current.set(visitorId, pc)
    setListenerCount(peers.current.size)

    broadcastStream.current?.getTracks().forEach(track => {
      pc.addTrack(track, broadcastStream.current!)
    })

    pc.onicecandidate = (e) => {
      if (e.candidate && signalChannel.current) {
        signalChannel.current.send({
          type: 'broadcast', event: 'ice-admin',
          payload: { visitorId, candidate: e.candidate }
        })
      }
    }

    pc.onconnectionstatechange = () => {
      if (['disconnected','failed','closed'].includes(pc.connectionState)) {
        peers.current.delete(visitorId)
        setListenerCount(peers.current.size)
      }
    }

    signalChannel.current?.on('broadcast', { event: 'answer' },
      async ({ payload }: { payload: { visitorId: string; sdp: RTCSessionDescriptionInit } }) => {
        if (payload.visitorId !== visitorId) return
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
      }
    )

    signalChannel.current?.on('broadcast', { event: 'ice-visitor' },
      async ({ payload }: { payload: { visitorId: string; candidate: RTCIceCandidateInit } }) => {
        if (payload.visitorId !== visitorId) return
        try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)) } catch {}
      }
    )

    pc.createOffer().then(offer => {
      pc.setLocalDescription(offer)
      signalChannel.current?.send({
        type: 'broadcast', event: 'offer',
        payload: { visitorId, sdp: offer }
      })
    })
  }

  async function stopBroadcast() {
    signalChannel.current?.send({ type: 'broadcast', event: 'broadcast-end', payload: {} })
    peers.current.forEach(pc => pc.close())
    peers.current.clear()
    setListenerCount(0)
    broadcastStream.current?.getTracks().forEach(t => t.stop())
    broadcastStream.current = null
    if (signalChannel.current) {
      supabase.removeChannel(signalChannel.current)
      signalChannel.current = null
    }
    await callAdmin({ action: 'set_config', key: 'broadcast_active', value: 'false' })
    setConfig(prev => ({ ...prev, broadcast_active: 'false' }))
    setBroadcasting(false)
    showAlert('> BROADCAST ENDED')
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
            fontSize: '0.85rem', letterSpacing: '0.1em', background: 'rgba(0,0,0,0.4)',
          }}>
            {alert}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem',
          borderBottom: '1px solid var(--gold-dim)', paddingBottom: '0.5rem' }}>
          {(['switches', 'players', 'broadcast'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className="btn"
              style={{
                background: tab === t ? 'var(--gold)' : 'transparent',
                color: tab === t ? 'var(--black)' : 'var(--gold)',
                fontSize: '0.8rem', padding: '0.4rem 1.2rem',
              }}>
              {t === 'switches' ? '[ KILL SWITCHES ]'
                : t === 'players' ? '[ PLAYERS ]'
                : '[ BROADCAST ]'}
            </button>
          ))}
        </div>

        {/* ── KILL SWITCHES ── */}
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
                          letterSpacing: '0.1em' }}>{label}</span>
                        <span style={{ marginLeft: '1rem', fontSize: '0.7rem',
                          letterSpacing: '0.15em',
                          color: isOn ? 'var(--gold)' : 'var(--red-bright)' }}>
                          {isOn ? '● OPEN' : '● CLOSED'}
                        </span>
                      </div>
                      <button onClick={() => toggleConfig(key)}
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
              <textarea value={maintenanceMsg} onChange={e => setMaintenanceMsg(e.target.value)}
                style={{
                  width: '100%', minHeight: '80px', padding: '0.75rem',
                  background: 'var(--black)', border: '1px solid var(--gold-dim)',
                  color: 'var(--white)', fontFamily: 'inherit', fontSize: '0.85rem',
                  resize: 'vertical', outline: 'none', marginBottom: '0.75rem',
                }}
                placeholder="The Lucky 38 is temporarily closed. — Mr. House" />
              <button className="btn btn-primary" onClick={saveMaintenanceMsg}
                style={{ fontSize: '0.8rem' }}>
                [ SAVE MESSAGE ]
              </button>
            </div>
          </div>
        )}

        {/* ── PLAYERS ── */}
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
                      background: selectedUser?.id === u.id ? 'rgba(201,168,76,0.1)' : 'transparent',
                      border: `1px solid ${selectedUser?.id === u.id ? 'var(--gold)' : 'var(--gold-dim)'}`,
                    }}>
                      <span style={{ color: 'var(--white)', fontSize: '0.85rem' }}>
                        {u.username}
                        {u.is_admin && (
                          <span style={{ color: 'var(--red-bright)', fontSize: '0.65rem',
                            marginLeft: '0.5rem' }}>[ADMIN]</span>
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
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                    <div>
                      <label style={{ color: 'var(--gold-dim)', fontSize: '0.75rem',
                        letterSpacing: '0.2em', display: 'block', marginBottom: '0.4rem' }}>
                        ADJUST BY (+ or -)
                      </label>
                      <input className="input" type="number" placeholder="e.g. 500 or -200"
                        value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)}
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
                      <input className="input" type="number" placeholder="e.g. 1000"
                        value={setBalanceAmount} onChange={e => setSetBalanceAmount(e.target.value)}
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
                          display: 'grid', gridTemplateColumns: '1fr auto auto auto',
                          gap: '0.75rem', alignItems: 'center', padding: '0.4rem 0',
                          borderBottom: '1px solid rgba(201,168,76,0.08)', fontSize: '0.8rem',
                        }}>
                          <div>
                            <span style={{ color: 'var(--white)', textTransform: 'uppercase' }}>
                              {tx.game}
                            </span>
                            <span style={{ color: 'var(--gold-dim)', fontSize: '0.65rem', display: 'block' }}>
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

        {/* ── BROADCAST ── */}
        {tab === 'broadcast' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="panel" style={{ borderColor: broadcasting ? 'var(--red-bright)' : 'var(--gold-dim)' }}>
              <h3 style={{ fontSize: '1rem', letterSpacing: '0.2em', marginBottom: '1.5rem',
                color: broadcasting ? 'var(--red-bright)' : 'var(--gold)' }}>
                ▶ LIVE AUDIO BROADCAST
              </h3>

              <div style={{ display: 'flex', alignItems: 'center', gap: '2rem',
                marginBottom: '2rem', flexWrap: 'wrap' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{
                    width: '80px', height: '80px', borderRadius: '50%',
                    border: `3px solid ${broadcasting ? 'var(--red-bright)' : 'var(--gold-dim)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '2rem', margin: '0 auto 0.5rem',
                    boxShadow: broadcasting ? '0 0 20px rgba(204,0,0,0.4)' : 'none',
                    transition: 'all 0.3s',
                  }}>
                    🎙
                  </div>
                  <p style={{ color: broadcasting ? 'var(--red-bright)' : 'var(--gold-dim)',
                    fontSize: '0.7rem', letterSpacing: '0.2em' }}>
                    {broadcasting ? '● ON AIR' : '○ OFF AIR'}
                  </p>
                </div>

                <div style={{ flex: 1 }}>
                  <p style={{ color: 'var(--white-dim)', fontSize: '0.8rem',
                    lineHeight: 1.8, letterSpacing: '0.05em' }}>
                    Your microphone is broadcast live to all connected players with a
                    radio/CRT audio effect applied. Uses WebRTC peer-to-peer — audio
                    never touches the server.
                  </p>
                  {broadcasting && (
                    <p style={{ color: 'var(--gold)', fontSize: '0.85rem',
                      letterSpacing: '0.1em', marginTop: '0.75rem' }}>
                      LISTENERS: {listenerCount}
                    </p>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                {!broadcasting ? (
                  <button className="btn btn-primary" onClick={startBroadcast}
                    style={{ flex: 1, fontSize: '0.85rem', padding: '0.75rem' }}>
                    [ START BROADCAST ]
                  </button>
                ) : (
                  <button className="btn btn-danger" onClick={stopBroadcast}
                    style={{ flex: 1, fontSize: '0.85rem', padding: '0.75rem' }}>
                    [ END BROADCAST ]
                  </button>
                )}
              </div>
            </div>

            <div className="panel">
              <h3 style={{ fontSize: '0.85rem', letterSpacing: '0.15em',
                color: 'var(--gold-dim)', marginBottom: '0.75rem' }}>
                ▶ NOTES
              </h3>
              <p style={{ color: 'var(--white-dim)', fontSize: '0.75rem',
                lineHeight: 1.8, letterSpacing: '0.05em' }}>
                — Works in Chrome and Edge. Firefox may require additional permissions.<br />
                — Add <code style={{ color: 'var(--gold)' }}>mr-house.png</code> to your{' '}
                <code style={{ color: 'var(--gold)' }}>/public</code> folder to show the overlay image.<br />
                — Scales to ~10–20 simultaneous listeners before becoming CPU-heavy.<br />
                — If players miss the broadcast start, they will auto-join when they next load any page.
              </p>
            </div>
          </div>
        )}

      </div>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: '4px',
        background: 'linear-gradient(90deg, transparent, var(--red-bright), transparent)' }} />
    </main>
  )
}