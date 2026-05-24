import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EXERCISES, INSTRUMENT_OPTIONS, RHYTHM_PATTERNS } from '../data/exercises';
import { generateFeedback } from '../services/feedbackService';
import { analyzeMicrophoneSession } from '../services/audioAnalysisService';
import { saveAttempt } from '../services/storageService';

export default function PracticePage() {
  const navigate = useNavigate();
  const [instrument, setInstrument] = useState(INSTRUMENT_OPTIONS[0]);
  const [exerciseId, setExerciseId] = useState(EXERCISES[0].id);
  const [rhythmPattern, setRhythmPattern] = useState(RHYTHM_PATTERNS[0]);
  const [isRecording, setIsRecording] = useState(false);
  const [statusText, setStatusText] = useState('Ready to practice.');
  const [liveVolume, setLiveVolume] = useState(0);
  const [averageVolume, setAverageVolume] = useState(0);
  const [audioDetected, setAudioDetected] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [detectedNotes, setDetectedNotes] = useState([]);
  const [liveNote, setLiveNote] = useState(null);

  const selectedExercise = useMemo(
    () => EXERCISES.find((item) => item.id === exerciseId) || EXERCISES[0],
    [exerciseId]
  );

  async function handleRecord() {
    setIsRecording(true);
    setStatusText('Listening through your microphone...');
    setLiveVolume(0);
    setAverageVolume(0);
    setAudioDetected(false);
    setRemainingSeconds(5);
    setDetectedNotes([]);
    setLiveNote(null);

    const analysis = await analyzeMicrophoneSession({
      durationMs: 5000,
      onUpdate: ({ rms, averageVolume: nextAverageVolume, audioDetected: nextAudioDetected, remainingMs, detectedNotes: nextDetectedNotes, liveNote: nextLiveNote }) => {
        setLiveVolume(rms);
        setAverageVolume(nextAverageVolume);
        setAudioDetected(nextAudioDetected);
        setRemainingSeconds(Math.max(0, Math.ceil(remainingMs / 1000)));
        setDetectedNotes(nextDetectedNotes);
        setLiveNote(nextLiveNote);
      }
    });

    setStatusText(
      analysis.noAudioDetected
        ? 'No clear audio detected. Please try again closer to the microphone.'
        : 'Analyzing your recorded attempt...'
    );

    // This part is still prototype-level scoring, but it now uses real detected notes and timing data.
    const feedback = generateFeedback({
      exercise: selectedExercise,
      rhythmPattern,
      analysis
    });

    const attempt = saveAttempt({
      id: crypto.randomUUID(),
      instrument,
      exerciseId: selectedExercise.id,
      exerciseName: selectedExercise.name,
      rhythmPattern,
      recordingMode: analysis.captureMode,
      createdAt: new Date().toISOString(),
      countdownSeconds: 5,
      liveVolume,
      averageVolume: analysis.averageVolume,
      audioDetected: feedback.audioDetected,
      noAudioDetected: feedback.noAudioDetected,
      detectedNotes: feedback.detectedNotes,
      noteSegments: feedback.noteSegments,
      pitchAssessment: feedback.pitchAssessment,
      rhythmAssessment: feedback.rhythmAssessment,
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

      <div className="recording-panel">
        <div className="recording-bar">
          <button type="button" className="btn-primary" disabled={isRecording} onClick={handleRecord}>
            {isRecording ? 'Recording...' : 'Start Recording'}
          </button>
          <span>{statusText}</span>
        </div>

        <div className="live-analysis-grid">
          <div className="analysis-status-card">
            <span className={`status-chip ${audioDetected ? 'status-chip-on' : 'status-chip-off'}`}>
              {audioDetected ? 'Audio Detected' : 'No Audio Detected'}
            </span>
            <p>{isRecording ? `Recording ends in ${remainingSeconds}s` : 'Live meter will appear while recording.'}</p>
          </div>

          <div className="volume-card">
            <div className="meter-label-row">
              <span>Volume</span>
              <span>{Math.round(liveVolume * 100)}%</span>
            </div>
            <div className="meter-track">
              <div className="meter-fill" style={{ width: `${Math.max(6, Math.round(liveVolume * 600))}%` }} />
            </div>
            <p>Average volume: {Math.round(averageVolume * 100)}%</p>
          </div>

          <div className="detected-notes-card">
            <div className="section-header compact-header">
              <h3>Detected Notes</h3>
              <p>{liveNote ? `Listening for ${liveNote}` : 'Waiting for a clear pitch'}</p>
            </div>
            <div className="chip-row">
              {detectedNotes.length > 0 ? (
                detectedNotes.map((note, index) => (
                  <span key={`${note}-${index}`} className="note-chip note-chip-live">
                    {note}
                  </span>
                ))
              ) : (
                <span className="muted-text">No note detected yet.</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
