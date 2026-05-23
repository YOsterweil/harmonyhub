function hashStringToSeed(value) {
  let hash = 1779033703 ^ value.length;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  return hash >>> 0;
}

function createRng(seed) {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), t | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function roundPercent(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function buildCoachMessage(incorrectNotes, rhythmPattern) {
  if (incorrectNotes.length === 0) {
    return 'Excellent control. Your intonation and pulse were both very steady.';
  }

  const uniqueMisses = [...new Set(incorrectNotes)];
  const watchList = uniqueMisses.slice(0, 2).join(' and ');

  if (uniqueMisses.includes('F#')) {
    return 'Great job on most notes. Watch your F# and keep your rhythm steady.';
  }

  if (rhythmPattern === 'Mixed Rhythm') {
    return `Great effort. Focus on ${watchList} and subdivide the beat to lock in mixed rhythms.`;
  }

  return `Great job on most notes. Watch your ${watchList} and keep your rhythm steady.`;
}

export function generateFeedback({ exercise, rhythmPattern, recordingMode }) {
  // Seeded randomness keeps demo feedback realistic while avoiding identical results every run.
  const seedText = `${exercise.id}:${rhythmPattern}:${Date.now().toString().slice(0, 7)}`;
  const rng = createRng(hashStringToSeed(seedText));

  const rhythmPenalty =
    rhythmPattern === 'Mixed Rhythm' ? 8 : rhythmPattern === 'Eighth Notes' ? 5 : 2;
  const modeBonus = recordingMode === 'microphone' ? 2 : 0;

  const noteResults = exercise.expectedNotes.map((note, index) => {
    const precision = 0.2 + rng() * 0.8;
    const strictness = 0.42 + index * 0.01;
    return {
      note,
      correct: precision > strictness,
      confidence: roundPercent(precision * 100)
    };
  });

  const correctCount = noteResults.filter((item) => item.correct).length;
  const incorrectNotes = noteResults.filter((item) => !item.correct).map((item) => item.note);

  const pitchAccuracy = roundPercent((correctCount / noteResults.length) * 100 + modeBonus);
  const rhythmAccuracy = roundPercent(88 - rhythmPenalty + rng() * 8 + modeBonus);

  return {
    pitchAccuracy,
    rhythmAccuracy,
    noteResults,
    coachMessage: buildCoachMessage(incorrectNotes, rhythmPattern)
  };
}
