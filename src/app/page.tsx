import Link from "next/link";

export default function Home() {
  return (
    <main style={{
      minHeight: '100vh',
      background: 'var(--black)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      textAlign: 'center',
      gap: '2rem',
    }}>

      {/* Art Deco top border */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0,
        height: '4px',
        background: 'linear-gradient(90deg, transparent, var(--gold), transparent)',
      }} />

      {/* Lucky 38 Tower icon */}
      <div style={{ fontSize: '4rem', lineHeight: 1 }}>🎰</div>

      {/* Title */}
      <div>
        <h1 className="glow" style={{ fontSize: '5rem', lineHeight: 1, marginBottom: '0.5rem' }}>
          LUCKY 38
        </h1>
        <p style={{ color: 'var(--gold-dim)', letterSpacing: '0.4em', fontSize: '0.8rem' }}>
          NEW VEGAS · ESTABLISHED 2087
        </p>
      </div>

      {/* Divider */}
      <div className="divider" style={{ width: '100%', maxWidth: '400px' }}>
        ✦ MR. HOUSE WELCOMES YOU ✦
      </div>

      {/* Quote */}
      <p style={{
        maxWidth: '500px',
        color: 'var(--white-dim)',
        lineHeight: 1.8,
        fontSize: '0.9rem',
        fontStyle: 'italic',
      }}>
        "I didn't just build a casino. I built the future.
        Step inside, and leave the wasteland at the door."
      </p>

      {/* CTA Bu