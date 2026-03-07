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

      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0,
        height: '4px',
        background: 'linear-gradient(90deg, transparent, var(--gold), transparent)',
      }} />

      <div style={{ fontSize: '4rem', lineHeight: 1 }}>🎰</div>

      <div>
        <h1 className="glow" style={{ fontSize: '5rem', lineHeight: 1, marginBottom: '0.5rem' }}>
          LUCKY 38
        </h1>
        <p style={{ color: 'var(--gold-dim)', letterSpacing: '0.4em', fontSize: '0.8rem' }}>
          NEW VEGAS · ESTABLISHED 2087
        </p>
      </div>

      <div className="divider" style={{ width: '100%', maxWidth: '400px' }}>
        ✦ MR. HOUSE WELCOMES YOU ✦
      </div>

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

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link href="/login">
          <button className="btn btn-primary" style={{ fontSize: '1rem', padding: '0.8rem 2.5rem' }}>
            [ ENTER THE CASINO ]
          </button>
        </Link>
        <Link href="/leaderboard">
          <button className="btn" style={{ fontSize: '1rem', padding: '0.8rem 2.5rem' }}>
            [ LEADERBOARD ]
          </button>
        </Link>
      </div>

      <p style={{ color: 'var(--gold-dim)', fontSize: '0.75rem', letterSpacing: '0.15em' }}>
        NEW ACCOUNTS START WITH 1,000 CAPS · DAILY BONUS: 100 CAPS
      </p>

      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        height: '4px',
        background: 'linear-gradient(90deg, transparent, var(--gold), transparent)',
      }} />

    </main>
  );
}