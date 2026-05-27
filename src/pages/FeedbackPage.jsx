import { Link } from 'react-router-dom';
import { listStepPracticeSummaries } from '../services/storageService';

function renderDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function mostRetriedNotes(summaries) {
  const counts = {};
  summaries.forEach((s) => {
    (s.summary?.retryNotes || []).forEach((r) => {
      counts[r.note] = (counts[r.note] || 0) + (r.retries || 0);
    });
  });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.map((e) => e[0]).slice(0, 3);
}

function SessionCard({ s }) {
  const completion = s.summary?.completion ?? 0;
  return (
    <article className="session-card">
      <div className="session-header">
        <div className="session-title">{s.sequence.join(' ')}</div>
        <div className="session-time muted-text">{renderDate(s.createdAt)}</div>
      </div>

      <div className="session-body stats-grid">
        <div className="stat-box">
          <span className="stat-label">Notes completed</span>
          <strong className="stat-value">{s.summary?.completedCount ?? 0}</strong>
        </div>
        <div className="stat-box">
          <span className="stat-label">Completion</span>
          <strong className="stat-value">{completion}%</strong>
        </div>
        <div className="stat-box">
          <span className="stat-label">First-Try Accuracy</span>
          <strong className="stat-value">{s.summary?.firstTryAccuracy ?? 0}%</strong>
        </div>
        <div className="stat-box">
          <span className="stat-label">Notes needing retries</span>
          <strong className="stat-value">{s.summary?.notesNeedingRetries ?? 0}</strong>
        </div>
      </div>

      {s.summary?.retryNotes?.length ? (
        <div className="retry-notes">
          {s.summary.retryNotes.map((r, i) => (
            <span key={`${r.note}-${i}`} className="note-chip note-chip-muted">
              {r.note}: {r.retries} {r.retries === 1 ? 'retry' : 'retries'}
            </span>
          ))}
        </div>
      ) : null}

      <div className="session-chart">
        <div className="chart-bar" style={{ width: `${completion}%` }} />
      </div>
    </article>
  );
}

export default function FeedbackPage() {
  const allSessions = listStepPracticeSummaries() || [];

  const sorted = allSessions.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const completed = sorted.filter((s) => (s.summary?.completedCount ?? 0) > 0 && (s.summary?.completion ?? 0) >= 100);
  const incomplete = sorted.filter((s) => (s.summary?.completedCount ?? 0) > 0 && (s.summary?.completion ?? 0) < 100);

  if (!sorted.length) {
    return (
      <section className="panel-card fade-in">
        <h2>Practice Progress</h2>
        <p>Review your recent step-by-step practice sessions.</p>
        <div className="empty-state">
          <p>No step-by-step sessions yet. Complete a practice sequence to see your progress here.</p>
          <Link to="/practice" className="btn-primary">Start Practice</Link>
        </div>
      </section>
    );
  }

  const focus = mostRetriedNotes(sorted);

  return (
    <section className="panel-card fade-in progress-page">
      <div className="section-header">
        <h2>Practice Progress</h2>
        <p>Review your recent step-by-step practice sessions.</p>
      </div>

      <div className="progress-overview">
        <div className="focus-card">
          <h3>Focus Notes</h3>
          {focus.length > 0 ? (
            <p>Your most retried notes were {focus.join(', ')}. Try practicing those slowly before repeating the full sequence.</p>
          ) : (
            <p>Nice work — no frequently retried notes yet.</p>
          )}
        </div>

        <h3 className="recent-header">Recent Step-by-Step Sessions</h3>

        <div className="sessions-list">
          {completed.length > 0 ? (
            completed.map((s) => <SessionCard key={s.id} s={s} />)
          ) : (
            <p className="muted-text">No fully completed sessions yet.</p>
          )}
        </div>

        {incomplete.length > 0 && (
          <div className="incomplete-section">
            <h4>Partially Completed Sessions</h4>
            <div className="sessions-list">
              {incomplete.map((s) => (
                <SessionCard key={s.id} s={s} />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="section-footer">
        <Link to="/practice" className="btn-primary">Start New Practice Session</Link>
      </div>
    </section>
  );
}
