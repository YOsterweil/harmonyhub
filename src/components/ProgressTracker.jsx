function buildTrendPoints(attempts) {
  const width = 260;
  const height = 80;
  const padding = 8;
  if (attempts.length === 0) {
    return '';
  }

  const reversed = [...attempts].reverse();
  const values = reversed.map((item) => Math.round((item.pitchAccuracy + item.rhythmAccuracy) / 2));

  return values
    .map((value, index) => {
      const x =
        values.length === 1
          ? width / 2
          : padding + (index / (values.length - 1)) * (width - padding * 2);
      const y = height - padding - (value / 100) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(' ');
}

export default function ProgressTracker({ attempts }) {
  const recent = attempts.slice(0, 5);
  const trendPoints = buildTrendPoints(recent);

  return (
    <section className="panel-card tracker-card">
      <div className="section-header">
        <h3>Progress Tracker</h3>
        <p>Recent attempts saved locally on this device.</p>
      </div>

      {recent.length === 0 ? (
        <p className="muted-text">No attempts yet. Start a practice session to build your trend.</p>
      ) : (
        <>
          <div className="trend-wrap">
            <svg viewBox="0 0 260 80" role="img" aria-label="Average score trend">
              <polyline fill="none" stroke="url(#trendGradient)" strokeWidth="3" points={trendPoints} />
              <defs>
                <linearGradient id="trendGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#42d392" />
                  <stop offset="100%" stopColor="#3ba0ff" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          <div className="attempt-list">
            {recent.map((item) => (
              <article key={item.id} className="attempt-item">
                <div>
                  <h4>{item.exerciseName}</h4>
                  <p>{item.rhythmPattern}</p>
                </div>
                <div className="attempt-scores">
                  <span>P: {item.pitchAccuracy}%</span>
                  <span>R: {item.rhythmAccuracy}%</span>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
