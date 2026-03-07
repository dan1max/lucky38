'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function handleSubmit() {
    setError('')
    setMessage('')
    setLoading(true)

    if (mode === 'signup') {
      if (!username.trim()) {
        setError('> ERROR: USERNAME REQUIRED')
        setLoading(false)
        return
      }
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username: username.trim().toUpperCase() } }
      })
      if (error) {
        setError('> ERROR: ' + error.message.toUpperCase())
      } else {
        setMessage('> ACCOUNT CREATED. ENTERING THE CASINO...')
        setTimeout(() => router.push('/lobby'), 1500)
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError('> ERROR: ' + error.message.toUpperCase())
      } else {
        router.push('/lobby')
      }
    }
    setLoading(false)
  }

  async function handleGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` }
    })
  }

  return (
    <main style={{
      minHeight: '100vh',
      background: 'var(--black)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
    }}>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '4px',
        background: 'linear-gradient(90deg, transparent, var(--gold), transparent)' }} />

      <div className="panel" style={{ width: '100%', maxWidth: '420px' }}>

        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 className="glow" style={{ fontSize: '3rem' }}>LUCKY 38</h1>
          <p style={{ color: 'var(--gold-dim)', letterSpacing: '0.3em', fontSize: '0.75rem' }}>
            {mode === 'login' ? 'WELCOME BACK, CITIZEN' : 'NEW REGISTRATION'}
          </p>
        </div>

        <div style={{ display: 'flex', marginBottom: '1.5rem', border: '1px solid var(--gold-dim)' }}>
          {(['login', 'signup'] as const).map(m => (
            <button key={m} onClick={() => { setMode(m); setError(''); setMessage('') }}
              style={{
                flex: 1, padding: '0.6rem', background: mode === m ? 'var(--gold)' : 'transparent',
                color: mode === m ? 'var(--black)' : 'var(--gold-dim)',
                border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                letterSpacing: '0.15em', fontSize: '0.8rem',
              }}>
              {m === 'login' ? '[ SIGN IN ]' : '[ REGISTER ]'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {mode === 'signup' && (
            <div>
              <label style={{ color: 'var(--gold-dim)', fontSize: '0.75rem', letterSpacing: '0.2em' }}>
                USERNAME
              </label>
              <input className="input" placeholder="YOUR_ALIAS" value={username}
                onChange={e => setUsername(e.target.value)} maxLength={20}
                style={{ marginTop: '0.4rem' }} />
            </div>
          )}

          <div>
            <label style={{ color: 'var(--gold-dim)', fontSize: '0.75rem', letterSpacing: '0.2em' }}>
              EMAIL
            </label>
            <input className="input" type="email" placeholder="citizen@newvegas.com"
              value={email} onChange={e => setEmail(e.target.value)}
              style={{ marginTop: '0.4rem' }} />
          </div>

          <div>
            <label style={{ color: 'var(--gold-dim)', fontSize: '0.75rem', letterSpacing: '0.2em' }}>
              PASSWORD
            </label>
            <input className="input" type="password" placeholder="••••••••"
              value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              style={{ marginTop: '0.4rem' }} />
          </div>

          {error && (
            <p style={{ color: 'var(--red-bright)', fontSize: '0.8rem', letterSpacing: '0.1em' }}>
              {error}
            </p>
          )}
          {message && (
            <p style={{ color: 'var(--gold)', fontSize: '0.8rem', letterSpacing: '0.1em' }}>
              {message}
            </p>
          )}

          <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}
            style={{ width: '100%', marginTop: '0.5rem', opacity: loading ? 0.6 : 1 }}>
            {loading ? '[ AUTHENTICATING... ]' : mode === 'login' ? '[ ENTER ]' : '[ CREATE ACCOUNT ]'}
          </button>

          <div className="divider">OR</div>

          <button className="btn" onClick={handleGoogle} style={{ width: '100%' }}>
            [ CONTINUE WITH GOOGLE ]
          </button>
        </div>

        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <Link href="/" style={{ color: 'var(--gold-dim)', fontSize: '0.75rem', letterSpacing: '0.1em' }}>
            ← BACK TO ENTRANCE
          </Link>
        </div>
      </div>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: '4px',
        background: 'linear-gradient(90deg, transparent, var(--gold), transparent)' }} />
    </main>
  )
}