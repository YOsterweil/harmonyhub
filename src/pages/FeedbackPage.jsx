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
          <h2>{attempt.estimatedPitchFeedbackLabel || 'Estimated Pitch Feedback'}</h2>
          <p>
            {attempt.exerciseName} • {attempt.rhythmPattern} • {attempt.noAudioDetected ? 'No Clear Audio' : 'Mic Mode'}
          </p>
        </div>

        {attempt.noAudioDetected ? (
          <div className="feedback-alert">
            <h3>No clear audio detected</h3>
            <p>Please try again closer to the microphone.</p>
            <div className="analysis-summary-grid">
              <div>
                <span>Average Volume</span>
                <strong>{Math.round((attempt.averageVolume || 0) * 100)}%</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>{attempt.audioDetected ? 'Audio Seen' : 'No Audio'}</strong>
              </div>
            </div>
            <div className="chip-row">
              {attempt.detectedNotes?.length ? (
                attempt.detectedNotes.map((note, index) => (
                  <span key={`${note}-${index}`} className="note-chip note-chip-muted">
                    {note}
                  </span>
                ))
              ) : (
                <span className="muted-text">No usable notes were detected.</span>
              )}
            </div>
          </div>
        ) : null}

        {!attempt.noAudioDetected && attempt.audioDetected && (!attempt.noteResults || attempt.noteResults.length === 0) ? (
          <div className="feedback-alert feedback-alert-soft">
            <h3>Audio was detected, but pitch was unclear</h3>
            <p>Try playing one note at a time closer to the microphone.</p>
          </div>
        ) : null}

        {!attempt.noAudioDetected ? (
          <div className="metric-grid">
            <article className="metric-card">
              <h3>Pitch Accuracy</h3>
              <strong>{attempt.pitchAccuracy ?? '—'}{attempt.pitchAccuracy !== null ? '%' : ''}</strong>
              <p>
                {attempt.pitchConfidenceLabel || 'Low confidence'}
                {attempt.pitchAssessment === 'low'
                  ? ' - The pitch estimate was uncertain and should be treated carefully.'
                  : ' - Based on detected note matches.'}
              </p>
            </article>
            <article className="metric-card">
              <h3>Rhythm Accuracy</h3>
              <strong>{attempt.rhythmAccuracy ?? '—'}{attempt.rhythmAccuracy !== null ? '%' : ''}</strong>
              <p>{attempt.rhythmAssessment?.message || 'Rhythm was not confident enough to score.'}</p>
            </article>
          </div>
        ) : null}

        {!attempt.noAudioDetected ? (
          <div className="feedback-copy">
            <h3>Note-by-Note Results</h3>
            <NoteResultPills noteResults={attempt.noteResults} />
            <p>{attempt.coachMessage}</p>
            <div className="analysis-summary-grid">
              <div>
                <span>Average Volume</span>
                <strong>{Math.round((attempt.averageVolume || 0) * 100)}%</strong>
              </div>
              <div>
                <span>Pitch Confidence</span>
                <strong>{attempt.pitchConfidenceLabel || 'Low confidence'}</strong>
              </div>
            </div>
            <div className="note-event-table">
              {attempt.noteEvents?.length ? (
                attempt.noteEvents.map((event, index) => (
                  <article key={`${event.pitchClass || event.noteName}-${index}`} className="note-event-row">
                    <div>
                      <strong>{event.pitchClass || event.noteName}</strong>
                      <span>{event.timestampLabel || '—'}</span>
                    </div>
                    <div>
                      <span>{Math.round(event.frequency || 0)} Hz</span>
                      <span>{Math.round(event.durationMs || 0)} ms</span>
                    </div>
                  </article>
                ))
              ) : (
                <span className="muted-text">No final pitch segments were stored.</span>
              )}
            </div>
          </div>
        ) : null}

        <Link to="/practice" className="btn-secondary">
          Try Another Attempt
        </Link>
      </div>

      <ProgressTracker attempts={attempts} />
    </section>
  );
}
