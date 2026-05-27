import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import NoteResultPills from '../components/NoteResultPills';
import {
  EXERCISES,
  INSTRUMENT_OPTIONS,
  RHYTHM_PATTERNS,
  STEP_PRACTICE_PRESETS
} from '../data/exercises';
import { generateFeedback } from '../services/feedbackService';
import { startAudioAnalysisSession } from '../services/audioAnalysisService';
import {
  buildStepSummary,
  classifyPitchAgainstTarget,
  createInitialStepResults,
  getStepFingeringHint,
  isStableSample,
  parsePracticeSequence,
  updateStreakFromSample
} from '../services/stepPracticeService';
import { saveAttempt, saveStepPracticeSummary } from '../services/storageService';

const DEFAULT_STEP_SEQUENCE_TEXT = STEP_PRACTICE_PRESETS[0].notes.join(' ');
const STEP_FEEDBACK_HOLD_MS = 900;

function formatElapsedTime(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function createIdleStepStreak(lastMs = 0) {
  return {
    signature: null,
    count: 0,
    firstMs: 0,
    lastMs,
    countedSignature: null,
    silenceSinceMs: null
  };
}

function createIdleStepState(sequenceTokens, feedback = 'Type a sequence and press Start Step-by-Step Practice.') {
  return {
    phase: 'idle',
    currentIndex: 0,
    results: createInitialStepResults(sequenceTokens),
    feedback,
    tuningState: 'listening',
    detectedNote: null,
    detectedLabel: null,
    centsOffset: null,
    summary: null,
    streak: createIdleStepStreak()
  };
}

function createStartingStepState(sequenceTokens) {
  return {
    ...createIdleStepState(sequenceTokens, 'Requesting microphone access...'),
    phase: 'starting'
  };
}

function advanceAcceptedStep(previousState, sequenceTokens) {
  if (previousState.phase !== 'active' || !sequenceTokens.length) {
    return { nextState: previousState, shouldStop: false };
  }

  const currentIndex = Math.min(previousState.currentIndex, sequenceTokens.length - 1);
  const currentResult = previousState.results[currentIndex];

  if (!currentResult || currentResult.status !== 'correct') {
    return { nextState: previousState, shouldStop: false };
  }

  const nextResults = [...previousState.results];
  const lastMs = currentResult.acceptedAtMs ?? previousState.streak.lastMs ?? 0;
  const nextIndex = currentIndex + 1;

  if (nextIndex >= sequenceTokens.length) {
    return {
      nextState: {
        ...previousState,
        phase: 'complete',
        currentIndex: sequenceTokens.length,
        results: nextResults,
        summary: buildStepSummary(nextResults),
        feedback: `${currentResult.feedback || `Correct — ${currentResult.display} in tune.`} Sequence complete.`,
        tuningState: 'complete',
        detectedNote: currentResult.detectedNote,
        detectedLabel: currentResult.detectedLabel,
        centsOffset: currentResult.centsOffset ?? 0,
        streak: createIdleStepStreak(lastMs)
      },
      shouldStop: true
    };
  }

  return {
    nextState: {
      ...previousState,
      currentIndex: nextIndex,
      results: nextResults,
      feedback: `Listening for ${sequenceTokens[nextIndex].display}...`,
      tuningState: 'listening',
      detectedNote: null,
      detectedLabel: null,
      centsOffset: null,
      streak: createIdleStepStreak(lastMs)
    },
    shouldStop: false
  };
}

function advanceStepPracticeState(previousState, analysis, sequenceTokens) {
  if (previousState.phase !== 'active') {
    return { nextState: previousState, shouldStop: false };
  }

  if (!sequenceTokens.length) {
    return {
      nextState: {
        ...previousState,
        phase: 'idle',
        feedback: 'Type a valid note sequence to begin.'
      },
      shouldStop: false
    };
  }

  const currentIndex = Math.min(previousState.currentIndex, sequenceTokens.length - 1);
  const targetNote = sequenceTokens[currentIndex];
  const currentResult = previousState.results[currentIndex];

  if (currentResult?.status === 'correct') {
    return { nextState: previousState, shouldStop: false };
  }

  const classification = classifyPitchAgainstTarget({
    targetNote,
    livePitchFrequency: analysis.livePitchFrequency,
    livePitchNoteName: analysis.livePitchNoteName,
    livePitchConfidence: analysis.livePitchConfidence
  });
  const elapsedMs = analysis.elapsedMs ?? 0;
  const nextStreak = updateStreakFromSample(previousState.streak, classification, elapsedMs);
  const baseState = {
    ...previousState,
    tuningState: classification.state,
    detectedNote: classification.detectedNote,
    detectedLabel: classification.detectedLabel,
    centsOffset: classification.centsOffset ?? null,
    feedback: classification.feedback,
    streak: nextStreak
  };

  if (!classification.hasPitch) {
    return { nextState: baseState, shouldStop: false };
  }

  if (!isStableSample(nextStreak, elapsedMs)) {
    return { nextState: baseState, shouldStop: false };
  }

  const nextResults = [...previousState.results];
  const nextCurrentResult = nextResults[currentIndex];

  if (classification.state === 'inTune') {
    nextResults[currentIndex] = {
      ...nextCurrentResult,
      status: 'correct',
      retries: nextCurrentResult?.retries ?? 0,
      detectedNote: classification.detectedNote,
      detectedLabel: classification.detectedLabel,
      centsOffset: classification.centsOffset ?? 0,
      feedback: classification.feedback,
      acceptedAtMs: elapsedMs
    };

    return {
      nextState: {
        ...baseState,
        results: nextResults,
        feedback: classification.feedback,
        tuningState: 'inTune'
      },
      shouldStop: false,
      advanceDelayMs: STEP_FEEDBACK_HOLD_MS
    };
  }

  const shouldCountRetry = nextStreak.countedSignature !== nextStreak.signature;

  if (shouldCountRetry && currentResult) {
    nextResults[currentIndex] = {
      ...currentResult,
      retries: (currentResult.retries ?? 0) + 1,
      detectedNote: classification.detectedNote,
      detectedLabel: classification.detectedLabel,
      centsOffset: classification.centsOffset ?? null,
      feedback: classification.feedback
    };
    nextStreak.countedSignature = nextStreak.signature;
  } else if (currentResult) {
    nextResults[currentIndex] = {
      ...currentResult,
      detectedNote: classification.detectedNote,
      detectedLabel: classification.detectedLabel,
      centsOffset: classification.centsOffset ?? null,
      feedback: classification.feedback
    };
  }

  return {
    nextState: {
      ...baseState,
      results: nextResults
    },
    shouldStop: false,
    advanceDelayMs: null
  };
}

export default function PracticePage() {
  const navigate = useNavigate();
  const recordingSessionRef = useRef(null);
  const activeModeRef = useRef(null);
  const stepPracticeRef = useRef(null);
  const stepSequenceRef = useRef(null);
  const stepAdvanceTimerRef = useRef(null);

  const [activeMode, setActiveMode] = useState(null);
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
  const [fullAttemptStepMessage, setFullAttemptStepMessage] = useState('Ready to practice.');
  const [showExperimentalMode, setShowExperimentalMode] = useState(false);
  const [stepSequenceText, setStepSequenceText] = useState(DEFAULT_STEP_SEQUENCE_TEXT);
  const [selectedPresetId, setSelectedPresetId] = useState(STEP_PRACTICE_PRESETS[0].id);
  const [stepPracticeState, setStepPracticeState] = useState(() => createIdleStepState(parsePracticeSequence(DEFAULT_STEP_SEQUENCE_TEXT).tokens));

  const selectedExercise = useMemo(
    () => EXERCISES.find((item) => item.id === exerciseId) || EXERCISES[0],
    [exerciseId]
  );

  const parsedStepSequence = useMemo(() => parsePracticeSequence(stepSequenceText), [stepSequenceText]);
  const stepTotalCount = parsedStepSequence.tokens.length;
  const currentStepTarget =
    parsedStepSequence.tokens[Math.min(stepPracticeState.currentIndex, Math.max(0, parsedStepSequence.tokens.length - 1))] ?? null;
  const completedStepCount = stepPracticeState.results.filter((item) => item.status !== 'pending').length;
  const stepProgressPercent = stepTotalCount > 0 ? Math.round((completedStepCount / stepTotalCount) * 100) : 0;
  const stepStatusLabel =
    stepPracticeState.phase === 'complete'
      ? 'Complete'
      : stepPracticeState.phase === 'starting'
        ? 'Starting'
        : stepPracticeState.tuningState === 'inTune'
          ? 'In tune'
          : stepPracticeState.tuningState === 'flat'
            ? 'Slightly flat'
            : stepPracticeState.tuningState === 'sharp'
              ? 'Slightly sharp'
              : stepPracticeState.tuningState === 'wrong'
                ? 'Wrong note'
                : 'Listening';

  useEffect(() => {
    activeModeRef.current = activeMode;
  }, [activeMode]);

  useEffect(() => {
    stepPracticeRef.current = stepPracticeState;
  }, [stepPracticeState]);

  useEffect(() => {
    stepSequenceRef.current = parsedStepSequence;
  }, [parsedStepSequence]);

  useEffect(() => {
    return () => {
      if (stepAdvanceTimerRef.current) {
        clearTimeout(stepAdvanceTimerRef.current);
      }
      const session = recordingSessionRef.current;
      if (session) {
        session.stop('component-unmount').catch(() => {});
      }
    };
  }, []);

  function clearStepAdvanceTimer() {
    if (stepAdvanceTimerRef.current) {
      clearTimeout(stepAdvanceTimerRef.current);
      stepAdvanceTimerRef.current = null;
    }
  }

  function scheduleStepAdvance(delayMs) {
    clearStepAdvanceTimer();
    stepAdvanceTimerRef.current = setTimeout(() => {
      stepAdvanceTimerRef.current = null;
      const sequence = stepSequenceRef.current?.tokens ?? [];
      const outcome = advanceAcceptedStep(stepPracticeRef.current, sequence);
      stepPracticeRef.current = outcome.nextState;
      setStepPracticeState(outcome.nextState);

      if (outcome.shouldStop) {
        void stopCurrentSession('step-complete');
      }
    }, delayMs);
  }

  function resetLiveState() {
    setLiveVolume(0);
    setAverageVolume(0);
    setAudioDetected(false);
    setElapsedMs(0);
    setDetectedNotes([]);
    setDetectedNoteEvents([]);
    setLiveNote(null);
    setLivePitchFrequency(null);
    setPitchConfidenceLabel('Low confidence');
    setPitchSource('fallback');
  }

  async function stopCurrentSession(reason) {
    const session = recordingSessionRef.current;

    if (!session) {
      return null;
    }

    clearStepAdvanceTimer();
    recordingSessionRef.current = null;
    const analysis = await session.stop(reason);
    setIsRecording(false);
    setIsStartingRecording(false);
    setActiveMode(null);

    // Persist step-by-step summary when a step sequence completes or stops.
    try {
      if (reason && reason.startsWith('step')) {
        const current = stepPracticeRef.current;
        const summary = current?.summary || (current?.results ? buildStepSummary(current.results) : null);
        if (summary) {
          const sequenceTokens = stepSequenceRef.current?.tokens ?? [];
          const sessionRecord = {
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            sequence: sequenceTokens.map((t) => t.display),
            summary
          };
          try {
            saveStepPracticeSummary(sessionRecord);
          } catch (e) {
            // ignore storage errors
          }
        }
      }
    } catch (e) {
      // ignore
    }

    return analysis;
  }

  function handleSharedAnalysisUpdate(analysis) {
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
    setFullAttemptStepMessage(
      analysis.audioDetected
        ? `Listening with ${analysis.pitchSource === 'ml5' ? 'ml5 CREPE' : 'browser fallback'} pitch detection...`
        : 'Listening for clear audio...'
    );

    if (activeModeRef.current !== 'step') {
      return;
    }

    const sequence = stepSequenceRef.current ?? { tokens: [] };
    const outcome = advanceStepPracticeState(stepPracticeRef.current, analysis, sequence.tokens);
    stepPracticeRef.current = outcome.nextState;
    setStepPracticeState(outcome.nextState);

    if (outcome.advanceDelayMs) {
      scheduleStepAdvance(outcome.advanceDelayMs);
    }

    if (outcome.shouldStop) {
      void stopCurrentSession('step-complete');
    }
  }

  async function handleStartStepPractice() {
    if (isStartingRecording || isRecording) {
      return;
    }

    if (parsedStepSequence.invalidTokens.length > 0 || parsedStepSequence.tokens.length === 0) {
      setStepPracticeState((prev) => ({
        ...prev,
        phase: 'idle',
        feedback:
          parsedStepSequence.tokens.length === 0
            ? 'Type at least one valid note to begin.'
            : `Remove or fix invalid notes: ${parsedStepSequence.invalidTokens.join(', ')}.`,
        tuningState: 'listening'
      }));
      return;
    }

    clearStepAdvanceTimer();
    const startingState = createStartingStepState(parsedStepSequence.tokens);
    stepPracticeRef.current = startingState;
    setStepPracticeState(startingState);
    setIsStartingRecording(true);
    setActiveMode('step');
    activeModeRef.current = 'step';
    resetLiveState();

    try {
      const session = await startAudioAnalysisSession({
        onUpdate: (analysis) => handleSharedAnalysisUpdate(analysis)
      });

      recordingSessionRef.current = session;
      setIsRecording(true);
      setStepPracticeState((prev) => ({
        ...prev,
        phase: 'active',
        feedback: `Listening for ${parsedStepSequence.tokens[0].display}...`,
        tuningState: 'listening'
      }));
      stepPracticeRef.current = {
        ...stepPracticeRef.current,
        phase: 'active',
        feedback: `Listening for ${parsedStepSequence.tokens[0].display}...`
      };
    } catch (error) {
      setStepPracticeState((prev) => ({
        ...prev,
        phase: 'idle',
        feedback: error?.message || 'Unable to access the microphone.',
        tuningState: 'listening'
      }));
      setActiveMode(null);
      activeModeRef.current = null;
      setIsRecording(false);
      recordingSessionRef.current = null;
    } finally {
      setIsStartingRecording(false);
    }
  }

  async function handleSkipStepNote() {
    if (activeModeRef.current !== 'step' || stepPracticeRef.current.phase !== 'active') {
      return;
    }

    clearStepAdvanceTimer();
    const sequence = stepSequenceRef.current?.tokens ?? [];
    const currentState = stepPracticeRef.current;
    const currentIndex = currentState.currentIndex;
    const currentResult = currentState.results[currentIndex];

    if (!currentResult) {
      return;
    }

    const nextResults = [...currentState.results];
    nextResults[currentIndex] = {
      ...currentResult,
      status: 'skipped',
      feedback: `Skipped ${currentResult.display}.`,
      acceptedAtMs: currentState.results[currentIndex].acceptedAtMs ?? null
    };

    const nextIndex = currentIndex + 1;
    const nextFeedback = nextIndex < sequence.length ? `Skipped ${currentResult.display}. Next: ${sequence[nextIndex].display}.` : 'Sequence complete.';
    const nextState = {
      ...currentState,
      phase: nextIndex >= sequence.length ? 'complete' : 'active',
      currentIndex: Math.min(nextIndex, sequence.length),
      results: nextResults,
      feedback: nextFeedback,
      tuningState: 'listening',
      detectedNote: null,
      detectedLabel: null,
      centsOffset: null,
      summary: nextIndex >= sequence.length ? buildStepSummary(nextResults) : currentState.summary,
      streak: {
        signature: null,
        count: 0,
        firstMs: 0,
        lastMs: 0,
        countedSignature: null,
        silenceSinceMs: null
      }
    };

    stepPracticeRef.current = nextState;
    setStepPracticeState(nextState);

    if (nextIndex >= sequence.length) {
      void stopCurrentSession('step-complete');
    }
  }

  async function handleRestartStepPractice() {
    clearStepAdvanceTimer();
    await stopCurrentSession('step-restart');
    const resetState = createIdleStepState(parsedStepSequence.tokens, parsedStepSequence.invalidTokens.length ? 'Fix the note sequence before starting.' : 'Type a sequence and press Start Step-by-Step Practice.');
    stepPracticeRef.current = resetState;
    setStepPracticeState(resetState);
    resetLiveState();
  }

  async function handleStopStepPractice() {
    if (activeModeRef.current !== 'step' && stepPracticeState.phase !== 'complete') {
      return;
    }

    clearStepAdvanceTimer();
    const summary = stepPracticeState.summary || buildStepSummary(stepPracticeState.results);
    const nextState = {
      ...stepPracticeState,
      phase: 'stopped',
      summary,
      feedback: summary.encouragement,
      tuningState: 'listening',
      detectedNote: null,
      detectedLabel: null,
      centsOffset: null,
      streak: {
        signature: null,
        count: 0,
        firstMs: 0,
        lastMs: 0,
        countedSignature: null,
        silenceSinceMs: null
      }
    };

    stepPracticeRef.current = nextState;
    setStepPracticeState(nextState);
    await stopCurrentSession('step-stopped');
  }

  async function handleStartFullAttempt() {
    if (isStartingRecording || isRecording) {
      return;
    }

    setIsStartingRecording(true);
    setActiveMode('full');
    activeModeRef.current = 'full';
    resetLiveState();
    setFullAttemptStepMessage('Requesting microphone access...');

    try {
      const session = await startAudioAnalysisSession({
        onUpdate: (analysis) => {
          handleSharedAnalysisUpdate(analysis);
        }
      });

      recordingSessionRef.current = session;
      setIsRecording(true);
      setFullAttemptStepMessage('Recording in progress. Play your exercise and press Stop when finished.');
    } catch (error) {
      setFullAttemptStepMessage(error?.message || 'Unable to access the microphone.');
      setIsRecording(false);
      recordingSessionRef.current = null;
      setActiveMode(null);
      activeModeRef.current = null;
    } finally {
      setIsStartingRecording(false);
    }
  }

  async function handleStopFullAttempt() {
    const analysis = await stopCurrentSession('user-stopped');

    if (!analysis) {
      return;
    }

    setFullAttemptStepMessage('Finalizing pitch feedback...');

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
      practiceMode: 'full-attempt',
      recordingMode: analysis.pitchSource || analysis.captureMode,
      createdAt: new Date().toISOString(),
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
      ...feedback,
      estimatedPitchFeedbackLabel: 'Full Attempt Mode (Experimental)'
    });

    navigate('/feedback', { state: { attempt } });
  }

  function handlePresetSelect(preset) {
    setSelectedPresetId(preset.id);
    const nextText = preset.notes.join(' ');
    setStepSequenceText(nextText);
    const nextSequence = parsePracticeSequence(nextText);
    setStepPracticeState(createIdleStepState(nextSequence.tokens, 'Type a sequence and press Start Step-by-Step Practice.'));
  }

  function handleSequenceChange(event) {
    setSelectedPresetId(null);
    const nextText = event.target.value;
    setStepSequenceText(nextText);
    const nextSequence = parsePracticeSequence(nextText);
    setStepPracticeState(
      createIdleStepState(
        nextSequence.tokens,
        nextSequence.invalidTokens.length ? 'Fix the note sequence before starting.' : 'Type a sequence and press Start Step-by-Step Practice.'
      )
    );
  }

  function getSequenceChipClass(result, index) {
    if (result?.status === 'correct') {
      return 'sequence-chip sequence-chip-correct';
    }

    if (result?.status === 'skipped') {
      return 'sequence-chip sequence-chip-skipped';
    }

    if (result?.retries > 0) {
      return 'sequence-chip sequence-chip-retry';
    }

    if (stepPracticeState.phase === 'active' && index === stepPracticeState.currentIndex) {
      return 'sequence-chip sequence-chip-current';
    }

    return 'sequence-chip';
  }

  const stepSummary = stepPracticeState.summary;

  return (
    <section className="page-wrap practice-page fade-in">
      <section className="panel-card practice-hero-card">
          <div className="section-header">
          <span className="hero-badge">Primary feature</span>
          <h2>Step-by-Step Practice</h2>
          <p>
            The app listens one note at a time, waits for a steady in-tune pitch, and advances only
            when the student produces a stable, in-tolerance pitch; Full Attempt grading remains
            available below as an experimental mode.
          </p>
        </div>

        <div className="sequence-editor">
          <label>
            Type the notes you want to practice
            <input
              type="text"
              value={stepSequenceText}
              onChange={handleSequenceChange}
              placeholder="G A B C D E F# G"
              disabled={activeMode === 'step'}
            />
          </label>
          <p className="helper-copy">Use spaces between notes. Sharps and flats are supported, and note names are preserved in the display.</p>

          {parsedStepSequence.invalidTokens.length > 0 ? (
            <div className="feedback-alert feedback-alert-soft">
              <h3>Invalid notes in sequence</h3>
              <p>{parsedStepSequence.invalidTokens.join(', ')}</p>
            </div>
          ) : null}

          <div className="secondary-presets">
            <div className="section-header compact-header">
              <h3>Beginner presets</h3>
              <p>Optional starting points if you want a ready-made note path.</p>
            </div>
            <div className="preset-grid">
              {STEP_PRACTICE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`preset-button ${selectedPresetId === preset.id ? 'preset-button-selected' : ''}`}
                  onClick={() => handlePresetSelect(preset)}
                  disabled={activeMode === 'step'}
                >
                  <strong>{preset.name}</strong>
                  <span>{preset.notes.join(' ')}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="step-control-bar">
          <button
            type="button"
            className="btn-primary"
            disabled={isStartingRecording || isRecording || parsedStepSequence.invalidTokens.length > 0 || parsedStepSequence.tokens.length === 0}
            onClick={handleStartStepPractice}
          >
            {isStartingRecording && activeMode === 'step' ? 'Starting...' : 'Start Step-by-Step Practice'}
          </button>
          <button type="button" className="btn-secondary" onClick={handleRestartStepPractice}>
            Restart
          </button>
          <button type="button" className="btn-secondary" disabled={stepPracticeState.phase !== 'active'} onClick={handleSkipStepNote}>
            Skip Note
          </button>
          <button type="button" className="btn-secondary" disabled={activeMode !== 'step' && stepPracticeState.phase !== 'complete'} onClick={handleStopStepPractice}>
            Stop Practice
          </button>
        </div>

        <p className="practice-disclaimer">Pitch detection is estimated and may be affected by tuning, instrument tone, room noise, and microphone quality.</p>

        <div className="step-target-card">
          <div className="step-target-copy">
            <span className="step-card-eyebrow">Current target</span>
            <h3>
              {stepPracticeState.phase === 'complete'
                ? 'Practice complete'
                : stepPracticeState.phase === 'idle' && !currentStepTarget
                  ? 'Type a note sequence to begin'
                  : currentStepTarget?.display || '...'}
            </h3>
            <div className="step-target-meta-grid">
              <div>
                <span>Current note</span>
                <strong>{currentStepTarget?.display || '—'}</strong>
              </div>
              <div>
                <span>Suggested fingering</span>
                <strong>{getStepFingeringHint(currentStepTarget?.normalized)}</strong>
              </div>
            </div>
            <p className="step-listening-copy">
              {stepPracticeState.phase === 'active' && currentStepTarget
                ? `Listening for ${currentStepTarget.display}...`
                : stepTotalCount > 0
                  ? `Note ${Math.min(stepPracticeState.currentIndex + 1, stepTotalCount)} of ${stepTotalCount}`
                  : 'Add a note sequence above.'}
            </p>
            <div className="step-feedback-panel">
              <span className="step-feedback-label">Teacher feedback</span>
              <p className="step-feedback-text">{stepPracticeState.feedback}</p>
            </div>
          </div>
          <div className={`tuning-state-badge tuning-state-${stepPracticeState.tuningState}`}>
            {stepStatusLabel}
          </div>
        </div>

        <div className="step-progress-card">
          <div className="step-progress-header">
            <span>Note path</span>
            <strong>
              {stepSummary ? `${stepSummary.completedCount}/${stepSummary.totalCount}` : `${completedStepCount}/${stepTotalCount}`}
            </strong>
          </div>
          <div className="step-progress-track">
            <div className="step-progress-fill" style={{ width: `${stepProgressPercent}%` }} />
          </div>
          <div className="sequence-chip-row">
            {parsedStepSequence.tokens.length > 0 ? (
              parsedStepSequence.tokens.map((token, index) => {
                const result = stepPracticeState.results[index];
                const chipState = getSequenceChipClass(result, index);
                return (
                  <span key={`${token.display}-${index}`} className={chipState}>
                    {result?.stepLabel || `Step ${index + 1}`}: {token.display}
                  </span>
                );
              })
            ) : (
              <span className="muted-text">Type a sequence to see the progress chips.</span>
            )}
          </div>
        </div>

        {stepSummary ? (
          <div className="step-summary-card">
            <div className="section-header compact-header">
              <h3>Step-by-Step Summary</h3>
              <p>{stepSummary.encouragement}</p>
            </div>
            <div className="summary-metrics-grid">
              <div>
                <span>Notes completed</span>
                <strong>{stepSummary.completedCount}</strong>
              </div>
              <div>
                <span>Correct without retry</span>
                <strong>{stepSummary.correctWithoutRetry}</strong>
              </div>
              <div>
                <span>Notes needing retries</span>
                <strong>{stepSummary.notesNeedingRetries}</strong>
              </div>
              <div>
                <span>Completion</span>
                <strong>{stepSummary.completion}%</strong>
              </div>
              <div>
                <span>First-Try Accuracy</span>
                <strong>{stepSummary.firstTryAccuracy}%</strong>
              </div>
            </div>
            {stepSummary.retryNotes.length > 0 ? (
              <div className="summary-retry-list">
                <span className="muted-text">Notes that needed retries</span>
                <div className="chip-row">
                  {stepSummary.retryNotes.map((item, index) => (
                    <span key={`${item.note}-${index}`} className="note-chip note-chip-muted">
                      {item.note} · {item.retries} retry{item.retries === 1 ? '' : 'ies'}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            <NoteResultPills noteResults={stepPracticeState.results} />
          </div>
        ) : null}

        <div className="live-analysis-grid step-live-grid">
          <div className="analysis-status-card">
            <span className={`status-chip ${audioDetected ? 'status-chip-on' : 'status-chip-off'}`}>
              {audioDetected ? 'Audio Detected' : 'No Audio Detected'}
            </span>
            <p>{activeMode === 'step' ? `Elapsed time ${formatElapsedTime(elapsedMs)}` : 'Live meter appears while recording.'}</p>
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
      </section>

      <section className="panel-card experimental-card">
        <div className="section-header">
          <span className="hero-badge hero-badge-soft">Secondary mode</span>
          <h2>Full Attempt Mode</h2>
          <p>
            Keep this mode for longer recordings and demo comparisons. It still uses the live microphone system,
            but the step-by-step mode above is the main practice experience.
          </p>
        </div>

        <button type="button" className="btn-secondary experimental-toggle" onClick={() => setShowExperimentalMode((current) => !current)}>
          {showExperimentalMode ? 'Hide Experimental Full Attempt Mode' : 'Show Experimental Full Attempt Mode'}
        </button>

        {showExperimentalMode ? (
        <div className="experimental-content">
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
            <button type="button" className="btn-primary" disabled={isStartingRecording || isRecording} onClick={handleStartFullAttempt}>
              {isStartingRecording && activeMode === 'full' ? 'Starting...' : 'Start Recording'}
            </button>
            <button type="button" className="btn-secondary" disabled={!isRecording || activeMode !== 'full'} onClick={handleStopFullAttempt}>
              Stop Recording
            </button>
            <span>{fullAttemptStepMessage}</span>
          </div>

          <div className="live-analysis-grid">
            <div className="analysis-status-card">
              <span className={`status-chip ${audioDetected ? 'status-chip-on' : 'status-chip-off'}`}>
                {audioDetected ? 'Audio Detected' : 'No Audio Detected'}
              </span>
              <p>{isRecording && activeMode === 'full' ? `Elapsed time ${formatElapsedTime(elapsedMs)}` : 'Live meter appears while recording.'}</p>
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
        </div>
        ) : (
          <p className="muted-text experimental-summary-copy">This mode stays available for comparison, but it is hidden by default so Step-by-Step Practice can stay front and center.</p>
        )}
      </section>
    </section>
  );
}
