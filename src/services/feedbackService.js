function roundPercent(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatTimestamp(milliseconds) {
  if (!Number.isFinite(milliseconds)) {
    return '—';
  }

  const totalSeconds = Math.max(0, milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const tenths = Math.floor((totalSeconds - Math.floor(totalSeconds)) * 10);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`;
}

function median(values) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function noteConfidenceLabel(label) {
  return label || 'Low confidence';
}

function matchExpectedNotes(expectedNotes, noteEvents) {
  const noteResults = [];
  let searchIndex = 0;

  for (const expectedNote of expectedNotes) {
    let matchedIndex = -1;

    for (let index = searchIndex; index < noteEvents.length; index += 1) {
      if (noteEvents[index].pitchClass === expectedNote) {
        matchedIndex = index;
        break;
      }
    }

    if (matchedIndex >= 0) {
      searchIndex = matchedIndex + 1;
      const matched = noteEvents[matchedIndex];
      const confidence = roundPercent((matched.confidence ?? 0) * 100);

      noteResults.push({
        expectedNote,
        detectedNote: matched.pitchClass,
        correct: confidence >= 45,
        state: confidence >= 65 ? 'correct' : 'uncertain',
        confidence,
        timingMs: roundPercent(matched.durationMs),
        detectedAtMs: roundPercent(matched.startMs),
        timestampLabel: formatTimestamp(matched.startMs)
      });
      continue;
    }

    noteResults.push({
      expectedNote,
      detectedNote: null,
      correct: false,
      state: 'missing',
      confidence: 0,
      timingMs: 0,
      detectedAtMs: null,
      timestampLabel: '—'
    });
  }

  return noteResults;
}

function scoreRhythmFromEvents(rhythmPattern, noteEvents) {
  if (noteEvents.length < 2) {
    return {
      score: null,
      confidence: 0,
      state: 'uncertain',
      message: 'Not enough stable note changes were detected to judge rhythm clearly.'
    };
  }

  const intervals = noteEvents
    .slice(1)
    .map((event, index) => Math.max(0, event.startMs - noteEvents[index].startMs))
    .filter((interval) => interval > 0);

  if (intervals.length === 0) {
    return {
      score: null,
      confidence: 0,
      state: 'uncertain',
      message: 'Not enough stable note changes were detected to judge rhythm clearly.'
    };
  }

  const medianInterval = median(intervals);
  const averageDeviation = intervals.reduce((sum, interval) => sum + Math.abs(interval - medianInterval), 0) / intervals.length;
  const consistencyScore = roundPercent(100 - (averageDeviation / (medianInterval || 1)) * 150);

  const elapsedSeconds = Math.max((noteEvents[noteEvents.length - 1].endMs - noteEvents[0].startMs) / 1000, 0.5);
  const noteDensity = noteEvents.length / elapsedSeconds;
  const targetDensity =
    rhythmPattern === 'Eighth Notes' ? 2.2 : rhythmPattern === 'Mixed Rhythm' ? 1.6 : 1.15;
  const densityScore = roundPercent(100 - Math.abs(noteDensity - targetDensity) * 40);

  const score = roundPercent(consistencyScore * 0.62 + densityScore * 0.38);
  const confidence = roundPercent(Math.min(100, 24 + noteEvents.length * 12 + consistencyScore * 0.2));

  if (confidence < 45) {
    return {
      score: null,
      confidence,
      state: 'uncertain',
      intervals,
      medianInterval,
      notesPerSecond: noteDensity,
      message: 'The rhythm timing was present, but not stable enough for a confident score.'
    };
  }

  return {
    score,
    confidence,
    state: 'confident',
    intervals,
    medianInterval,
    notesPerSecond: noteDensity,
    message:
      rhythmPattern === 'Mixed Rhythm'
        ? 'The timing was usable, but the mixed rhythm pattern still needs more consistency.'
        : 'The timing data shows a mostly steady pulse.'
  };
}

function buildCoachMessage({ pitchAccuracy, analysis, rhythmAssessment, noteResults, pitchConfidenceLabel }) {
  if (analysis.noAudioDetected || (!analysis.audioDetected && analysis.averageVolume < 0.012)) {
    return 'No clear audio detected. Please try again closer to the microphone.';
  }

  if (analysis.audioDetected && (!analysis.noteEvents || analysis.noteEvents.length === 0)) {
    return 'Audio was detected, but pitch was unclear. Try playing one note at a time closer to the microphone.';
  }

  if (pitchAccuracy < 35) {
    return 'I heard audio, but many pitches did not match the exercise. Slow down and play one note at a time closer to the microphone.';
  }

  if (pitchAccuracy < 70) {
    return 'Some notes matched, but several pitches were off or unstable. Focus on the expected note sequence and center each note before moving on.';
  }

  if (rhythmAssessment.state === 'uncertain') {
    return `Your pitch estimates are ${pitchConfidenceLabel.toLowerCase()}, but the rhythm timing was not stable enough to judge confidently.`;
  }

  if (noteResults.every((item) => item.state === 'correct')) {
    return 'Excellent control. The detected pitches matched the exercise and the timing stayed steady.';
  }

  return 'Good work. The pitch estimates were mostly consistent, and the remaining misses were small enough to keep practicing.';
}

export function generateFeedback({ exercise, rhythmPattern, analysis }) {
  const noteEvents = analysis.noteEvents ?? analysis.noteSegments ?? [];
  const averageVolume = analysis.averageVolume ?? 0;
  const audioDetected = Boolean(analysis.audioDetected || averageVolume >= 0.012 || noteEvents.length > 0);
  const noAudioDetected = Boolean(analysis.noAudioDetected || (!audioDetected && averageVolume < 0.012));
  const pitchConfidenceLabel = noteConfidenceLabel(analysis.pitchConfidenceLabel);

  if (noAudioDetected) {
    return {
      estimatedPitchFeedbackLabel: 'Estimated Pitch Feedback',
      noAudioDetected: true,
      audioDetected: false,
      averageVolume,
      maxVolume: analysis.maxVolume ?? 0,
      pitchAccuracy: null,
      rhythmAccuracy: null,
      pitchAssessment: 'low',
      pitchConfidenceLabel: 'Low confidence',
      rhythmAssessment: { state: 'none', confidence: 0, score: null, message: 'No clear audio detected.' },
      noteResults: [],
      detectedNotes: [],
      noteEvents: [],
      noteSegments: [],
      coachMessage: 'No clear audio detected. Please try again closer to the microphone.'
    };
  }

  if (audioDetected && noteEvents.length === 0) {
    return {
      estimatedPitchFeedbackLabel: 'Estimated Pitch Feedback',
      noAudioDetected: false,
      audioDetected: true,
      averageVolume,
      maxVolume: analysis.maxVolume ?? 0,
      pitchAccuracy: null,
      rhythmAccuracy: null,
      pitchAssessment: 'low',
      pitchConfidenceLabel,
      rhythmAssessment: { state: 'uncertain', confidence: 0, score: null, message: 'Audio was detected, but pitch was unclear.' },
      noteResults: [],
      detectedNotes: analysis.detectedNotes ?? [],
      noteEvents: [],
      noteSegments: [],
      coachMessage:
        'Audio was detected, but pitch was unclear. Try playing one note at a time closer to the microphone.'
    };
  }

  const noteResults = matchExpectedNotes(exercise.expectedNotes, noteEvents);
  const correctCount = noteResults.filter((item) => item.correct).length;
  const pitchAccuracy = roundPercent((correctCount / exercise.expectedNotes.length) * 100);
  const pitchAssessment = pitchConfidenceLabel === 'High confidence' ? 'high' : pitchConfidenceLabel === 'Medium confidence' ? 'medium' : 'low';
  const rhythmAssessment = scoreRhythmFromEvents(rhythmPattern, noteEvents);

  return {
    estimatedPitchFeedbackLabel: 'Estimated Pitch Feedback',
    noAudioDetected: false,
    audioDetected: true,
    averageVolume,
    maxVolume: analysis.maxVolume ?? 0,
    pitchAccuracy,
    rhythmAccuracy: rhythmAssessment.score,
    pitchAssessment,
    pitchConfidenceLabel,
    rhythmAssessment,
    noteResults,
    detectedNotes: noteEvents.map((event) => event.pitchClass).filter(Boolean),
    noteEvents,
    noteSegments: noteEvents,
    livePitchFrequency: analysis.livePitchFrequency ?? null,
    livePitchNoteName: analysis.livePitchNoteName ?? null,
    livePitchConfidence: analysis.livePitchConfidence ?? 0,
    pitchSource: analysis.pitchSource ?? 'fallback',
    coachMessage: buildCoachMessage({
      pitchAccuracy,
      analysis,
      rhythmAssessment,
      noteResults,
      pitchConfidenceLabel
    })
  };
}
