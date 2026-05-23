export default function NoteResultPills({ noteResults }) {
  return (
    <div className="note-pill-grid">
      {noteResults.map((result, index) => (
        <div
          key={`${result.note}-${index}`}
          className={`note-pill ${result.correct ? 'note-pill-correct' : 'note-pill-wrong'}`}
        >
          <div className="note-pill-label">{result.note}</div>
          <div className="note-pill-status">{result.correct ? 'Correct' : 'Needs Work'}</div>
        </div>
      ))}
    </div>
  );
}
