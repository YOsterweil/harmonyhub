import { Link, useLocation } from 'react-router-dom';
import NoteResultPills from '../components/NoteResultPills';
import ProgressTracker from '../components/ProgressTracker';
import { getAttempts, getLatestAttempt } from '../services/storageService';

export default function FeedbackPage() {
  const location = useLocation();
  const attempt = location.state?.attempt || getLatestAttempt();
  const attempts = getAttempts();

  if (!attempt) {
    return (
      <section className="panel-card fade-in">
        <h2>No feedback available yet</h2>
        <p>Complete a practice attempt first to see your results.</p>
        <Link to="/practice" className="btn-primary">
          Start Practice
        </Link>
      </section>
    );
  }

  return (
    <section className="feedback-layout fade-in">
      <div className="panel-card">
        <div className="section-header">
          <h2>Practice Feedback</h2>
          <p>
            {attempt.exerciseName} • {attempt.rhythmPattern} • {attempt.recordingMode === 'demo' ? 'Demo Mode' : 'Mic Mode'}
          </p>
        </div>

        <div className="metric-grid">
          <article className="metric-card">
            <h3>Pitch Accuracy</h3>
            <strong>{attempt.pitchAccuracy}%</strong>
          </article>
          <article className="metric-card">
            <h3>Rhythm Accuracy</h3>
            <strong>{attempt.rhythmAccuracy}%</strong>
          </article>
        </div>

        <div className="feedback-copy">
          <h3>Note-by-Note Results</h3>
          <NoteResultPills noteResults={attempt.noteResults} />
          <p>{attempt.coachMessage}</p>
        </div>

        <Link to="/practice" className="btn-secondary">
          Try Another Attempt
        </Link>
      </div>

      <ProgressTracker attempts={attempts} />
    </section>
  );
}
