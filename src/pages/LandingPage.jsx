import { Link } from 'react-router-dom';

export default function LandingPage() {
  return (
    <section className="hero-section fade-in">
      <div className="hero-badge">Community-Focused Music Learning</div>
      <h1>HarmonyHub</h1>
      <p className="tagline">Helping beginner musicians practice with confidence</p>
      <p className="hero-copy">
        Many beginner students only receive feedback during lessons, which makes independent practice
        frustrating and uncertain. HarmonyHub bridges that gap with guided exercises, quick recording,
        and simple coaching students can understand immediately.
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
