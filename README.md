# HarmonyHub

HarmonyHub is a polished React + Vite capstone prototype for community-focused music education.

It helps beginner violin students practice independently between lessons by selecting an exercise,
recording an attempt, and receiving simple pitch/rhythm feedback based on live microphone analysis.

## Features

- Landing page with problem framing and a clear Start Practice flow
- Practice workflow for violin with four built-in exercises
- Rhythm pattern selection: Quarter Notes, Eighth Notes, Mixed Rhythm
- Expected-note preview for each exercise
- Microphone attempt using the browser Web Audio API
- Live volume meter and pitch detection during recording
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
