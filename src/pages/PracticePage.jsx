import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EXERCISES, INSTRUMENT_OPTIONS, RHYTHM_PATTERNS } from '../data/exercises';
import { generateFeedback } from '../services/feedbackService';
import { recordPracticeAttempt } from '../services/recordingService';
import { saveAttempt } from '../services/storageService';

export default function PracticePage() {
  const navigate = useNavigate();
  const [instrument, setInstrument] = useState(INSTRUMENT_OPTIONS[0]);
  const [exerciseId, setExerciseId] = useState(EXERCISES[0].id);
  const [rhythmPattern, setRhythmPattern] = useState(RHYTHM_PATTERNS[0]);
  const [isRecording, setIsRecording] = useState(false);
  const [statusText, setStatusText] = useState('Ready to practice.');

  const selectedExercise = useMemo(
    () => EXERCISES.find((item) => item.id === exerciseId) || EXERCISES[0],
    [exerciseId]
  );

  async function handleRecord() {
    setIsRecording(true);
    setStatusText('Listening through your microphone...');

    const recording = await recordPracticeAttempt({ durationMs: 3000 });

    if (recording.mode === 'demo') {
      setStatusText('Microphone unavailable. Switched to realistic demo feedback mode.');
    } else {
      setStatusText('Analyzing your recorded attempt...');
    }

    // Feedback generation is prototype logic that mimics beginner-level scoring behavior.
    const feedback = generateFeedback({
      exercise: selectedExercise,
      rhythmPattern,
      recordingMode: recording.mode
    });

    const attempt = saveAttempt({
      id: crypto.randomUUID(),
      instrument,
      exerciseId: selectedExercise.id,
      exerciseName: selectedExercise.name,
      rhythmPattern,
      recordingMode: recording.mode,
      createdAt: new Date().toISOString(),
      ...feedback
    });

    setIsRecording(false);
    navigate('/feedback', { state: { attempt } });
  }

  return (
    <section className="panel-card fade-in">
      <div className="section-header">
        <h2>Practice Session</h2>
        <p>Select your exercise and record a short attempt.</p>
      </div>

      <div className="form-grid">
        <label>
          Instrument
          <select value={instrument} onChange={(event) => setInstrument(event.target.value)}>
            {INSTRUMENT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label>
          Exercise
          <select value={exerciseId} onChange={(event) => setExerciseId(event.target.value)}>
            {EXERCISES.map((exercise) => (
              <option key={exercise.id} value={exercise.id}>
                {exercise.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Rhythm Pattern
          <select value={rhythmPattern} onChange={(event) => setRhythmPattern(event.target.value)}>
            {RHYTHM_PATTERNS.map((pattern) => (
              <option key={pattern} value={pattern}>
                {pattern}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="expected-notes">
        <h3>Expected Notes</h3>
        <div className="chip-row">
          {selectedExercise.expectedNotes.map((note, index) => (
            <span key={`${note}-${index}`} className="note-chip">
              {note}
            </span>
          ))}
        </div>
        <ul>
          {selectedExercise.focusTips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </div>

      <div className="recording-bar">
        <button type="button" className="btn-primary" disabled={isRecording} onClick={handleRecord}>
          {isRecording ? 'Recording...' : 'Start Recording'}
        </button>
        <span>{statusText}</span>
      </div>
    </section>
  );
}
