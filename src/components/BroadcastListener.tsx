'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function BroadcastListener() {
  const [active, setActive] = useState(false)
  const [muted, setMuted] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)
  const visitorId = useRef('v-' + Math.random().toString(36).slice(2, 10))
  const supabase = createClient()

  useEffect(() => {
    let signalChannel: typeof channelRef.current = null

    async function checkAndJoin() {
      const { data } = await supabase
        .from('config').select('value').eq('key', 'broadcast_active').single()
      if (data?.value === 'true') joinBroadcast()
    }

    // Watch for broadcast_active changes
    const configChannel = supabase
      .channel('broadcast-config-watch')
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'config'
      }, (payload: { new: { key: string; value: string } }) => {
        if (payload.new.key === 'broadcast_active') {
          if (payload.new.value === 'true') joinBroadcast()
          else leaveBroadcast()
        }
      })
      .subscribe()

    checkAndJoin()

    return () => {
      supabase.removeChannel(configChannel)
      leaveBroadcast()
    }
  }, [])

  function joinBroadcast() {
    setActive(true)
    const supabase = createClient()

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    })
    pcRef.current = pc

    pc.ontrack = (event) => {
      if (!audioRef.current) {
        const audio = new Audio()
        audio.autoplay = true
        audioRef.current = audio
      }
      audioRef.current.srcObject = event.streams[0]
      audioRef.current.play().catch(() => setMuted(true))
    }

    const channel = supabase.channel('webrtc-signal')
    channelRef.current = channel

    channel.on('broadcast', { event: 'offer' }, async ({ payload }: { payload: { visitorId: string; sdp: RTCSessionDescriptionInit } }) => {
      if (payload.visitorId !== visitorId.current) return
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      channel.send({ type: 'broadcast', event: 'answer',
        payload: { visitorId: visitorId.current, sdp: answer } })
    })

    channel.on('broadcast', { event: 'ice-admin' }, async ({ payload }: { payload: { visitorId: string; candidate: RTCIceCandidateInit } }) => {
      if (payload.visitorId !== visitorId.current) return
      try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)) } catch {}
    })

    channel.on('broadcast', { event: 'broadcast-end' }, () => leaveBroadcast())

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        channel.send({ type: 'broadcast', event: 'ice-visitor',
          payload: { visitorId: visitorId.current, candidate: e.candidate } })
      }
    }

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channel.send({ type: 'broadcast', event: 'visitor-join',
          payload: { visitorId: visitorId.current } })
      }
    })
  }

  function leaveBroadcast() {
    setActive(false)
    setMuted(false)
    pcRef.current?.close()
    pcRef.current = null
    if (channelRef.current) {
      createClient().removeChannel(channelRef.current)
      channelRef.current = null
    }
    if (audioRef.current) {
      audioRef.current.srcObject = null
      audioRef.current = null
    }
  }

  function handleUnmute() {
    audioRef.current?.play().catch(() => {})
    setMuted(false)
  }

  if (!active) return null

  return (
    <div style={{
      position: 'fixed', bottom: '1.5rem', right: '1.5rem',
      zIndex: 9999,
      display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.75rem',
    }}>
      {/* Mr. House overlay */}
      <div style={{
        width: '180px',
        background: 'var(--black-soft)',
        border: '1px solid var(--gold)',
        padding: '0.75rem',
        textAlign: 'center',
      }}>
        <img src="/mr-house.png" alt="Mr. House"
          style={{ width: '100%', imageRendering: 'pixelated',
            filter: 'sepia(0.4) hue-rotate(10deg)' }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
        <p style={{ color: 'var(--gold)', fontSize: '0.7rem',
          letterSpacing: '0.2em', marginTop: '0.5rem' }}>
          MR. HOUSE
        </p>
      </div>

      {/* Broadcast badge */}
      <div style={{
        background: 'var(--black-soft)',
        border: '1px solid var(--red-bright)',
        padding: '0.4rem 0.75rem',
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        fontSize: '0.7rem', letterSpacing: '0.2em', color: 'var(--red-bright)',
      }}>
        <span style={{
          width: '8px', height: '8px', borderRadius: '50%',
          background: 'var(--red-bright)',
          animation: 'pulse 1.2s ease-in-out infinite',
          display: 'inline-block',
        }} />
        LIVE BROADCAST
        {muted && (
          <button onClick={handleUnmute} style={{
            marginLeft: '0.5rem', background: 'var(--red-bright)',
            color: 'var(--black)', border: 'none', cursor: 'pointer',
            fontSize: '0.65rem', padding: '0.1rem 0.4rem', letterSpacing: '0.1em',
          }}>
            UNMUTE
          </button>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.2; }
        }
      `}</style>
    </div>
  )
}