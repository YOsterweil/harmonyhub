import { Link } from 'react-router-dom';

export default function LandingPage() {
  return (
    <section className="hero-section fade-in">
      <div className="hero-badge">Step-by-Step Music Practice</div>
      <h1>HarmonyHub</h1>
      <p className="tagline">Helping beginner musicians practice with confidence</p>
      <p className="hero-copy">
        Many beginner students get feedback only during lessons; HarmonyHub provides clear,
        teacher-like step-by-step practice so students can make steady, confident progress between
        sessions.
      </p>
      <div className="hero-actions">
        <Link to="/practice" className="btn-primary">
          Start Practice
        </Link>
        <Link to="/about" className="btn-secondary">
          Learn About Impact
        </Link>
      </div>
    </section>
  );
}
