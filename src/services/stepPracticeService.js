const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const ENHARMONIC_MAP = {
  Bb: 'A#',
  Eb: 'D#',
  Ab: 'G#',
  Db: 'C#',
  Gb: 'F#',
  Cb: 'B',
  Fb: 'E',
  'B#': 'C',
  'E#': 'F'
};

const FINGERING_HINTS = {
  G: 'Open G string',
  A: '1st finger on G string',
  B: '2nd finger on G string',
  C: '3rd finger on G string',
  'C#': 'High 3rd finger on G string',
  D: 'Open D string',
  E: '1st finger on D string',
  'F#': '2nd finger on D string',
  'G#': 'High 3rd finger on D string'
};

function roundPercent(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function pitchClassFromNoteName(noteName) {
  if (!noteName) {
    return null;
  }

  return noteName.replace(/-?\d+/g, '');
}

export function normalizePracticeNoteToken(token) {
  if (!token) {
    return null;
  }

  const cleanedToken = token.trim().replace(/[♭]/g, 'b').replace(/[♯]/g, '#');
  const match = /^([A-Ga-g])([#b]?)(\d*)$/.exec(cleanedToken);

  if (!match) {
    return null;
  }

  const letter = match[1].toUpperCase();
  const accidental = match[2] || '';
  const display = `${letter}${accidental}${match[3] ?? ''}`;
  const enharmonicKey = `${letter}${accidental}`;
  const normalized = ENHARMONIC_MAP[enharmonicKey] || enharmonicKey;

  if (!NOTE_NAMES.includes(normalized)) {
    return null;
  }

  return {
    display: token.trim(),
    normalized,
    raw: token.trim()
  };
}

export function parsePracticeSequence(sequenceText) {
  const rawTokens = sequenceText
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const tokens = rawTokens.map((token) => normalizePracticeNoteToken(token)).filter(Boolean);
  const invalidTokens = rawTokens.filter((token) => !normalizePracticeNoteToken(token));

  return {
    tokens,
    normalizedNotes: tokens.map((item) => item.normalized),
    displayNotes: tokens.map((item) => item.display),
    invalidTokens,
    hasNotes: tokens.length > 0
  };
}

export function noteNameToMidi(noteName) {
  if (!noteName) {
    return null;
  }

  const match = /^([A-G])([#b]?)(-?\d+)?$/.exec(noteName);

  if (!match) {
    return null;
  }

  const noteKey = `${match[1].toUpperCase()}${match[2] || ''}`;
  const normalizedNote = ENHARMONIC_MAP[noteKey] || noteKey;
  const octave = Number.parseInt(match[3] ?? '4', 10);
  const noteIndex = NOTE_NAMES.indexOf(normalizedNote);

  if (noteIndex < 0 || Number.isNaN(octave)) {
    return null;
  }

  return (octave + 1) * 12 + noteIndex;
}

export function noteNameToFrequency(noteName) {
  const midi = noteNameToMidi(noteName);

  if (midi === null) {
    return null;
  }

  return 440 * 2 ** ((midi - 69) / 12);
}

function centsDifference(leftFrequency, rightFrequency) {
  if (!leftFrequency || !rightFrequency) {
    return null;
  }

  return 1200 * Math.log2(leftFrequency / rightFrequency);
}

export function classifyPitchAgainstTarget({
  targetNote,
  livePitchFrequency,
  livePitchNoteName,
  livePitchConfidence,
  toleranceCents = 24,
  minimumConfidence = 0.18
}) {
  if (!targetNote) {
    return {
      state: 'listening',
      feedback: 'Type a note sequence to begin.',
      detectedNote: null,
      centsOffset: null,
      stableNote: null,
      detectedLabel: null,
      hasPitch: false
    };
  }

  if (!livePitchFrequency || !livePitchNoteName || (livePitchConfidence ?? 0) < minimumConfidence) {
    return {
      state: 'listening',
      feedback: `Listening for ${targetNote.display}...`,
      detectedNote: null,
      centsOffset: null,
      stableNote: null,
      detectedLabel: null,
      hasPitch: false
    };
  }

  const detectedLabel = livePitchNoteName;
  const detectedNote = pitchClassFromNoteName(livePitchNoteName);

  if (!detectedNote) {
    return {
      state: 'listening',
      feedback: `Listening for ${targetNote.display}...`,
      detectedNote: null,
      centsOffset: null,
      stableNote: null,
      detectedLabel,
      hasPitch: false
    };
  }

  const referenceFrequency = noteNameToFrequency(livePitchNoteName);
  const centsOffset = referenceFrequency ? centsDifference(livePitchFrequency, referenceFrequency) : null;

  if (detectedNote !== targetNote.normalized) {
    return {
      state: 'wrong',
      feedback: `Detected ${detectedNote}. Try again: play ${targetNote.display}.`,
      detectedNote,
      centsOffset,
      stableNote: detectedNote,
      detectedLabel,
      hasPitch: true
    };
  }

  if (centsOffset === null || Math.abs(centsOffset) <= toleranceCents) {
    return {
      state: 'inTune',
      feedback: `Correct — ${targetNote.display} in tune.`,
      detectedNote,
      centsOffset: centsOffset ?? 0,
      stableNote: detectedNote,
      detectedLabel,
      hasPitch: true
    };
  }

  if (centsOffset < 0) {
    return {
      state: 'flat',
      feedback: `${targetNote.display} detected, but slightly flat. Raise your pitch.`,
      detectedNote,
      centsOffset,
      stableNote: detectedNote,
      detectedLabel,
      hasPitch: true
    };
  }

  return {
    state: 'sharp',
    feedback: `${targetNote.display} detected, but slightly sharp. Lower your pitch.`,
    detectedNote,
    centsOffset,
    stableNote: detectedNote,
    detectedLabel,
    hasPitch: true
  };
}

export function getStepFingeringHint(noteClass) {
  return FINGERING_HINTS[noteClass] || 'Keep the note in first position and listen for a centered pitch.';
}

export function buildStepSummary(results) {
  const completedResults = results.filter((item) => item.status !== 'pending');
  const completedCount = completedResults.length;
  const correctWithoutRetry = results.filter((item) => item.status === 'correct' && (item.retries ?? 0) === 0).length;
  const notesNeedingRetries = results.filter((item) => (item.retries ?? 0) > 0).length;
  const correctCount = results.filter((item) => item.status === 'correct').length;
  const skippedCount = results.filter((item) => item.status === 'skipped').length;
  const accuracy = results.length > 0 ? roundPercent((correctCount / results.length) * 100) : 0;
  const completion = results.length > 0 ? roundPercent((completedCount / results.length) * 100) : 0;
  const firstTryAccuracy = results.length > 0 ? roundPercent((correctWithoutRetry / results.length) * 100) : 0;
  const retryNotes = results
    .filter((item) => (item.retries ?? 0) > 0)
    .map((item) => ({
      note: item.display,
      retries: item.retries
    }));

  let encouragement = 'Keep going. Slow, steady violin practice builds reliable pitch memory.';

  if (accuracy >= 90 && notesNeedingRetries === 0) {
    encouragement = 'Excellent control. You kept the notes steady and in tune.';
  } else if (accuracy >= 75) {
    encouragement = 'Good work. A little more repetition will make the sequence smoother.';
  } else if (accuracy >= 50) {
    encouragement = 'Solid progress. Focus on a clean target pitch before moving on.';
  }

  if (skippedCount > 0) {
    encouragement += ' Skipped notes are still okay for review, but they count as incomplete steps.';
  }

  return {
    completedCount,
    totalCount: results.length,
    correctWithoutRetry,
    notesNeedingRetries,
    accuracy,
    completion,
    firstTryAccuracy,
    retryNotes,
    skippedCount,
    encouragement
  };
}

export function createInitialStepResults(sequenceTokens) {
  return sequenceTokens.map((token, index) => ({
    id: `${token.normalized}-${index}`,
    display: token.display,
    normalized: token.normalized,
    stepLabel: `Step ${index + 1}`,
    status: 'pending',
    retries: 0,
    detectedNote: null,
    detectedLabel: null,
    centsOffset: null,
    feedback: 'Waiting to start',
    acceptedAtMs: null
  }));
}

export function isStableSample(streak, elapsedMs, minimumCount = 3, minimumDurationMs = 320) {
  if (!streak || !streak.signature) {
    return false;
  }

  return streak.count >= minimumCount || (elapsedMs - streak.firstMs >= minimumDurationMs);
}

export function buildStreakSignature(classification) {
  if (!classification || classification.state === 'listening') {
    return null;
  }

  return `${classification.state}:${classification.detectedNote || 'none'}`;
}

export function updateStreakFromSample(previousStreak, classification, elapsedMs) {
  const nextSignature = buildStreakSignature(classification);

  if (!nextSignature) {
    const silenceSinceMs = previousStreak?.signature ? elapsedMs : previousStreak?.silenceSinceMs ?? elapsedMs;

    return {
      signature: null,
      count: 0,
      firstMs: 0,
      lastMs: elapsedMs,
      countedSignature: previousStreak?.countedSignature ?? null,
      silenceSinceMs
    };
  }

  if (previousStreak?.signature === nextSignature) {
    return {
      ...previousStreak,
      lastMs: elapsedMs,
      count: (previousStreak.count ?? 0) + 1,
      silenceSinceMs: null
    };
  }

  const shouldClearCountedSignature = previousStreak?.silenceSinceMs !== null && elapsedMs - (previousStreak?.silenceSinceMs ?? elapsedMs) >= 250;

  return {
    signature: nextSignature,
    count: 1,
    firstMs: elapsedMs,
    lastMs: elapsedMs,
    countedSignature: shouldClearCountedSignature ? null : previousStreak?.countedSignature ?? null,
    silenceSinceMs: null
  };
}

export function createStepResultsFromSequence(sequenceTokens) {
  return createInitialStepResults(sequenceTokens);
}

export function getCurrentStepResult(results, currentIndex) {
  return results[currentIndex] ?? null;
}

export function clampCentsOffset(centsOffset) {
  if (!Number.isFinite(centsOffset)) {
    return null;
  }

  return clamp(centsOffset, -999, 999);
}
