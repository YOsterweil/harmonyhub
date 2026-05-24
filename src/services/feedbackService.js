function roundPercent(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function pitchClass(value) {
  return value ? value.replace(/-?\d+/g, '') : null;
}

function median(values) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function buildCoachMessage({ incorrectNotes, rhythmPattern, rhythmAssessment, noteResults }) {
  if (!noteResults.length) {
    return 'No clear audio detected. Please try again closer to the microphone.';
  }

  if (incorrectNotes.length === 0 && rhythmAssessment.confidence >= 0.65) {
    return 'Excellent control. Your intonation and pulse were both very steady.';
  }

  const uniqueMisses = [...new Set(incorrectNotes)];
  const watchList = uniqueMisses.slice(0, 2).join(' and ');

  if (uniqueMisses.includes('F#')) {
    return 'Great job on most notes. Watch your F# and keep your rhythm steady.';
  }

  if (rhythmAssessment.state === 'uncertain') {
    return `Good effort. I could hear some notes clearly, but the rhythm timing was not consistent enough to judge confidently.`;
  }

  if (rhythmPattern === 'Mixed Rhythm') {
    return `Great effort. Focus on ${watchList} and subdivide the beat to lock in mixed rhythms.`;
  }

  return `Great job on most notes. Watch your ${watchList} and keep your rhythm steady.`;
}

function createNoteResults(exerciseNotes, detectedSegments) {
  // Prototype scoring still aligns note names directly rather than attempting full score transcription.
  const noteResults = [];
  const usedDetectedIndexes = new Set();
  const detectedPitchClasses = detectedSegments.map((segment) => segment.pitchClass);

  for (let expectedIndex = 0; expectedIndex < exerciseNotes.length; expectedIndex += 1) {
    const expectedNote = exerciseNotes[expectedIndex];
    let matchedIndex = -1;

    for (let detectedIndex = 0; detectedIndex < detectedSegments.length; detectedIndex += 1) {
      if (usedDetectedIndexes.has(detectedIndex)) {
        continue;
      }

      if (detectedSegments[detectedIndex].pitchClass === expectedNote) {
        matchedIndex = detectedIndex;
        break;
      }
    }

    if (matchedIndex >= 0) {
      usedDetectedIndexes.add(matchedIndex);
      const matched = detectedSegments[matchedIndex];
      const uncertainty = matched.confidence < 0.45 || matched.averageRms < 0.012;

      noteResults.push({
        expectedNote,
        detectedNote: matched.pitchClass,
        correct: !uncertainty,
        state: uncertainty ? 'uncertain' : 'correct',
        confidence: roundPercent(matched.confidence * 100),
        timingMs: roundPercent(matched.durationMs)
      });
      continue;
    }

    const nearestDetected = detectedPitchClasses[expectedIndex] || null;
    noteResults.push({
      expectedNote,
      detectedNote: nearestDetected,
      correct: false,
      state: nearestDetected ? 'incorrect' : 'missing',
      confidence: 0,
      timingMs: 0
    });
  }

  return noteResults;
}

function scoreRhythm(rhythmPattern, detectedSegments) {
  if (detectedSegments.length < 2) {
    return {
      score: null,
      confidence: 0,
      state: 'uncertain',
      message: 'Not enough note changes were detected to judge rhythm clearly.'
    };
  }

  const intervals = detectedSegments
    .slice(1)
    .map((segment, index) => Math.max(0, segment.startMs - detectedSegments[index].startMs));

  const medianInterval = median(intervals);
  const deviationScores = intervals.map((interval) => Math.abs(interval - medianInterval) / (medianInterval || 1));
  const consistencyScore = roundPercent(100 - (deviationScores.reduce((sum, value) => sum + value, 0) / deviationScores.length) * 170);

  const seconds = Math.max((detectedSegments[detectedSegments.length - 1].endMs - detectedSegments[0].startMs) / 1000, 0.5);
  const notesPerSecond = detectedSegments.length / seconds;

  const targetDensity =
    rhythmPattern === 'Eighth Notes' ? 2.1 : rhythmPattern === 'Mixed Rhythm' ? 1.7 : 1.3;
  const densityScore = roundPercent(100 - Math.abs(notesPerSecond - targetDensity) * 45);

  let patternScore = consistencyScore;

  if (rhythmPattern === 'Mixed Rhythm') {
    const normalizedIntervals = intervals.map((interval) => interval / (medianInterval || 1));
    const mixedTargets = normalizedIntervals.map((_, index) => (index % 4 === 1 || index % 4 === 2 ? 0.6 : 1.4));
    const averageError = normalizedIntervals.reduce((sum, interval, index) => {
      return sum + Math.abs(interval - mixedTargets[index]);
    }, 0) / normalizedIntervals.length;

    patternScore = roundPercent(100 - averageError * 55);
  }

  const score = roundPercent((consistencyScore * 0.55 + densityScore * 0.25 + patternScore * 0.2));
  const confidence = roundPercent(Math.min(100, 35 + detectedSegments.length * 12 + consistencyScore * 0.25));

  return {
    score,
    confidence,
    state: confidence < 50 ? 'uncertain' : 'confident',
    intervals,
    medianInterval,
    notesPerSecond,
    message:
      confidence < 50
        ? 'The rhythm was present, but the timing data was not stable enough for a confident score.'
        : rhythmPattern === 'Mixed Rhythm'
          ? 'The rhythm timing is usable, but the long-and-short shape still needs more consistency.'
          : 'The timing data shows a mostly steady pulse.'
  };
}

export function generateFeedback({ exercise, rhythmPattern, analysis }) {
  const noAudioDetected = analysis.noAudioDetected || analysis.averageVolume < 0.012 || analysis.noteSegments.length === 0;

  if (noAudioDetected) {
    return {
      noAudioDetected: true,
      audioDetected: false,
      averageVolume: analysis.averageVolume ?? 0,
      maxVolume: analysis.maxVolume ?? 0,
      pitchAccuracy: null,
      rhythmAccuracy: null,
      pitchAssessment: 'none',
      rhythmAssessment: { state: 'none', confidence: 0, score: null, message: 'No clear audio detected.' },
      noteResults: [],
      detectedNotes: analysis.detectedNotes ?? [],
      noteSegments: analysis.noteSegments ?? [],
      coachMessage: 'No clear audio detected. Please try again closer to the microphone.'
    };
  }

  const noteResults = createNoteResults(exercise.expectedNotes, analysis.noteSegments);
  const correctCount = noteResults.filter((item) => item.correct).length;
  const pitchAccuracy = roundPercent((correctCount / exercise.expectedNotes.length) * 100);
  const uncertainNotes = noteResults.filter((item) => item.state === 'uncertain').length;
  const pitchAssessment = uncertainNotes > 0 ? 'uncertain' : 'confident';

  const rhythmAssessment = scoreRhythm(rhythmPattern, analysis.noteSegments);

  return {
    noAudioDetected: false,
    audioDetected: true,
    averageVolume: analysis.averageVolume ?? 0,
    maxVolume: analysis.maxVolume ?? 0,
    pitchAccuracy,
    rhythmAccuracy: rhythmAssessment.score,
    pitchAssessment,
    rhythmAssessment,
    noteResults,
    detectedNotes: analysis.detectedNotes ?? analysis.noteSegments.map((segment) => segment.pitchClass),
    noteSegments: analysis.noteSegments ?? [],
    coachMessage: buildCoachMessage({
      incorrectNotes: noteResults.filter((item) => !item.correct).map((item) => item.expectedNote),
      rhythmPattern,
      rhythmAssessment,
      noteResults
    })
  };
}
