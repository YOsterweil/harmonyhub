import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EXERCISES, INSTRUMENT_OPTIONS, RHYTHM_PATTERNS } from '../data/exercises';
import { generateFeedback } from '../services/feedbackService';
import { startAudioAnalysisSession } from '../services/audioAnalysisService';
import { saveAttempt } from '../services/storageService';

export default function PracticePage() {
  const navigate = useNavigate();
  const recordingSessionRef = useRef(null);
  const [instrument, setInstrument] = useState(INSTRUMENT_OPTIONS[0]);
  const [exerciseId, setExerciseId] = useState(EXERCISES[0].id);
  const [rhythmPattern, setRhythmPattern] = useState(RHYTHM_PATTERNS[0]);
  const [isStartingRecording, setIsStartingRecording] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [statusText, setStatusText] = useState('Ready to practice.');
  const [liveVolume, setLiveVolume] = useState(0);
  const [averageVolume, setAverageVolume] = useState(0);
  const [audioDetected, setAudioDetected] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [detectedNotes, setDetectedNotes] = useState([]);
  const [detectedNoteEvents, setDetectedNoteEvents] = useState([]);
  const [liveNote, setLiveNote] = useState(null);
  const [livePitchFrequency, setLivePitchFrequency] = useState(null);
  const [pitchConfidenceLabel, setPitchConfidenceLabel] = useState('Low confidence');
  const [pitchSource, setPitchSource] = useState('fallback');

  const selectedExercise = useMemo(
    () => EXERCISES.find((item) => item.id === exerciseId) || EXERCISES[0],
    [exerciseId]
  );

  async function handleStartRecording() {
    if (isStartingRecording || isRecording) {
      return;
    }

    setIsStartingRecording(true);
    setStatusText('Requesting microphone access...');
    setLiveVolume(0);
    setAverageVolume(0);
    setAudioDetected(false);
    setElapsedMs(0);
    setDetectedNotes([]);
    setLiveNote(null);
    setDetectedNoteEvents([]);
    setLivePitchFrequency(null);
    setPitchConfidenceLabel('Low confidence');

    try {
      const session = await startAudioAnalysisSession({
        onUpdate: (analysis) => {
          setElapsedMs(analysis.elapsedMs ?? 0);
          setLiveVolume(analysis.liveVolume ?? analysis.averageVolume ?? 0);
          setAverageVolume(analysis.averageVolume ?? 0);
          setAudioDetected(Boolean(analysis.audioDetected));
          setDetectedNotes(analysis.detectedNotes ?? []);
          setDetectedNoteEvents(analysis.noteEvents ?? []);
          setLiveNote(analysis.livePitchNoteName ?? analysis.liveNote ?? null);
          setLivePitchFrequency(analysis.livePitchFrequency ?? null);
          setPitchConfidenceLabel(analysis.pitchConfidenceLabel ?? 'Low confidence');
          setPitchSource(analysis.pitchSource ?? 'fallback');
          setStatusText(
            analysis.audioDetected
              ? `Listening with ${analysis.pitchSource === 'ml5' ? 'ml5 CREPE' : 'browser fallback'} pitch detection...`
              : 'Listening for clear audio...'
          );
        }
      });

      recordingSessionRef.current = session;
      setIsRecording(true);
      setStatusText('Recording in progress. Play your exercise and press Stop when finished.');
    } catch (error) {
      setStatusText(error?.message || 'Unable to access the microphone.');
      setIsRecording(false);
      recordingSessionRef.current = null;
    } finally {
      setIsStartingRecording(false);
    }
  }

  async function handleStopRecording() {
    const session = recordingSessionRef.current;

    if (!session) {
      return;
    }

    setStatusText('Finalizing pitch feedback...');
    setIsRecording(false);
    recordingSessionRef.current = null;

    const analysis = await session.stop('user-stopped');

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
      recordingMode: analysis.pitchSource || analysis.captureMode,
      createdAt: new Date().toISOString(),
      estimatedPitchFeedbackLabel: feedback.estimatedPitchFeedbackLabel,
      pitchSource: analysis.pitchSource || analysis.captureMode,
      liveVolume,
      averageVolume: analysis.averageVolume,
      audioDetected: feedback.audioDetected,
      noAudioDetected: feedback.noAudioDetected,
      detectedNotes: feedback.detectedNotes,
      noteEvents: feedback.noteEvents,
      noteSegments: feedback.noteSegments,
      pitchConfidenceLabel: feedback.pitchConfidenceLabel,
      pitchAssessment: feedback.pitchAssessment,
      rhythmAssessment: feedback.rhythmAssessment,
      livePitchFrequency: feedback.livePitchFrequency,
      livePitchNoteName: feedback.livePitchNoteName,
      ...feedback
    });

    navigate('/feedback', { state: { attempt } });
  }

  function formatElapsedTime(milliseconds) {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
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
          <button type="button" className="btn-primary" disabled={isStartingRecording || isRecording} onClick={handleStartRecording}>
            {isStartingRecording ? 'Starting...' : 'Start Recording'}
          </button>
          <button type="button" className="btn-secondary" disabled={!isRecording} onClick={handleStopRecording}>
            Stop Recording
          </button>
          <span>{statusText}</span>
        </div>

        <div className="live-analysis-grid">
          <div className="analysis-status-card">
            <span className={`status-chip ${audioDetected ? 'status-chip-on' : 'status-chip-off'}`}>
              {audioDetected ? 'Audio Detected' : 'No Audio Detected'}
            </span>
            <p>{isRecording ? `Elapsed time ${formatElapsedTime(elapsedMs)}` : 'Live meter appears while recording.'}</p>
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

          <div className="pitch-card">
            <div className="section-header compact-header">
              <h3>Live Pitch</h3>
              <p>{pitchConfidenceLabel}</p>
            </div>
            <div className="pitch-readout">
              <strong>{liveNote || 'Waiting...'}</strong>
              <span>{livePitchFrequency ? `${Math.round(livePitchFrequency)} Hz` : 'No pitch yet'}</span>
            </div>
            <p>{pitchSource === 'ml5' ? 'ml5 CREPE pitch detection' : 'Browser fallback pitch detector'}</p>
          </div>

          <div className="detected-notes-card">
            <div className="section-header compact-header">
              <h3>Detected Note Events</h3>
              <p>{liveNote ? `Listening for ${liveNote}` : 'Waiting for a clear pitch'}</p>
            </div>
            <div className="detected-event-list">
              {detectedNoteEvents.length > 0 ? (
                detectedNoteEvents.map((event, index) => (
                  <article key={`${event.pitchClass || event.noteName}-${index}`} className="detected-event-item">
                    <span className="note-chip note-chip-live">{event.pitchClass || event.noteName}</span>
                    <span>{formatElapsedTime(event.startMs)}</span>
                  </article>
                ))
              ) : (
                <span className="muted-text">No note events detected yet.</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
