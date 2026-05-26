export default function NoteResultPills({ noteResults }) {
  return (
    <div className="note-pill-grid">
      {noteResults.map((result, index) => {
        const status = result.status || result.state || 'pending';
        const retries = result.retries ?? 0;
        let pillClass = 'note-pill-uncertain';
        let statusText = 'Listening';

        if (status === 'correct') {
          if (retries === 0) {
            pillClass = 'note-pill-correct';
            statusText = 'Correct on first try';
          } else {
            pillClass = 'note-pill-retry';
            statusText = `Correct after ${retries} retr${retries === 1 ? 'y' : 'ies'}`;
          }
        } else if (status === 'skipped' || status === 'missing') {
          pillClass = 'note-pill-wrong';
          statusText = 'Skipped';
        } else if (status === 'pending') {
          pillClass = 'note-pill-uncertain';
          statusText = 'Listening';
        }

        return (
          <div
            key={`${result.expectedNote || result.note || result.display}-${index}`}
            className={`note-pill ${pillClass}`}
          >
            <div className="note-pill-label">
              {result.stepLabel || result.slotLabel || `Step ${index + 1}`}: {result.display || result.expectedNote || result.note}
            </div>
            <div className="note-pill-timestamp">
              {result.timestampLabel || '—'}{retries ? ` · ${retries} retr${retries === 1 ? 'y' : 'ies'}` : ''}
            </div>
            <div className="note-pill-status">
              {statusText}{result.detectedNote ? ` · ${result.detectedNote}` : ''}
            </div>
          </div>
        );
      })}
    </div>
  );
}
