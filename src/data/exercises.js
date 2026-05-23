export const INSTRUMENT_OPTIONS = ['Violin'];

export const RHYTHM_PATTERNS = ['Quarter Notes', 'Eighth Notes', 'Mixed Rhythm'];

export const EXERCISES = [
  {
    id: 'g-major-scale-qn',
    name: 'G Major Scale - Quarter Notes',
    expectedNotes: ['G', 'A', 'B', 'C', 'D', 'E', 'F#', 'G'],
    focusTips: ['Keep your third finger ready for F#.', 'Use consistent bow speed.']
  },
  {
    id: 'd-major-scale-qn',
    name: 'D Major Scale - Quarter Notes',
    expectedNotes: ['D', 'E', 'F#', 'G', 'A', 'B', 'C#', 'D'],
    focusTips: ['Listen carefully for C# intonation.', 'Stay relaxed in your left hand.']
  },
  {
    id: 'open-string-rhythm-drill',
    name: 'Open String Rhythm Drill',
    expectedNotes: ['G', 'D', 'A', 'E', 'E', 'A', 'D', 'G'],
    focusTips: ['Match bow direction to the beat.', 'Keep each note length even.']
  },
  {
    id: 'twinkle-excerpt',
    name: 'Twinkle Twinkle Excerpt',
    expectedNotes: ['A', 'A', 'E', 'E', 'F#', 'F#', 'E'],
    focusTips: ['Prepare string crossings early.', 'Keep your bow lane straight.']
  }
];

export const EXERCISE_BY_ID = EXERCISES.reduce((acc, item) => {
  acc[item.id] = item;
  return acc;
}, {});
