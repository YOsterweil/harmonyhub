# HarmonyHub

HarmonyHub is a focused React + Vite prototype that provides teacher-like, step-by-step pitch
practice for beginner musicians.

It helps students practice one note at a time, receive immediate, actionable feedback, and track
progress between lessons using live microphone pitch analysis.

## Features

- Landing page with problem framing and a clear Start Practice flow
- Practice workflow for violin with four built-in exercises
- Rhythm pattern selection: Quarter Notes, Eighth Notes, Mixed Rhythm
- Expected-note preview for each exercise
- Microphone attempt using the browser Web Audio API
- Optional ml5.js CREPE pitch detection with browser-safe fallback
- Live volume meter, detected pitch readout, and timestamped note events during recording
- Manual Start / Stop recording controls for full scale or excerpt performance
- Automatic no-audio handling when the microphone is silent or unsupported
- Feedback screen with:
  - Pitch accuracy percentage
  - Rhythm accuracy percentage
  - Green/red note correctness display
  - Beginner-friendly coaching message
- Progress tracker with localStorage persistence:
  - Recent attempts list
  - Mini trend chart
- About/Impact section with Version 2.0 roadmap

## Run locally

1. Install dependencies:

   npm install

2. Start development server:

   npm run dev

3. Build production bundle:

   npm run build

## Notes

- No backend is required.
- Attempt history is stored in browser localStorage under a versioned key.
- If microphone permissions are denied or the input is silent, HarmonyHub shows a clear no-audio state instead of fake feedback.
- If ml5.js fails to load, the app falls back to a browser-only pitch detector so the presentation remains reliable.
