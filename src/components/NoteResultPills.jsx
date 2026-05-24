export default function NoteResultPills({ noteResults }) {
  return (
    <div className="note-pill-grid">
      {noteResults.map((result, index) => (
        <div
          key={`${result.expectedNote || result.note}-${index}`}
          className={`note-pill ${result.state === 'correct' ? 'note-pill-correct' : result.state === 'uncertain' ? 'note-pill-uncertain' : 'note-pill-wrong'}`}
        >
          <div className="note-pill-label">{result.expectedNote || result.note}</div>
          <div className="note-pill-timestamp">{result.timestampLabel || '—'}</div>
          <div className="note-pill-status">
            {result.state === 'correct'
              ? `Correct${result.detectedNote ? ` - ${result.detectedNote}` : ''}`
              : result.state === 'uncertain'
                ? 'Unclear'
                : result.state === 'missing'
                  ? 'Missing'
                  : 'Incorrect'}
          </div>
        </div>
      ))}
    </div>
  );
}
