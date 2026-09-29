# AI Proctored Interview — Full Stack

This version adds a Node.js backend and Gemini API integration.

## Features
- Separate candidate/admin flows
- Candidate camera + microphone permission in the browser
- Browser camera preview
- MediaPipe face landmark tracking
- Basic gaze/head-attention indicator
- Multiple-face detection
- Monitoring alerts with a two-alert review flag
- Gemini-generated interview questions
- Candidate voice recording
- Gemini audio transcription
- Gemini answer evaluation
- AI final report
- Questions are spoken aloud by the browser
- Admin dashboard and report viewer

## Setup

1. Create a NEW Gemini API key if the key was ever exposed.
2. Copy `.env.example` to `.env`.
3. Put the new key in `.env`:

   GEMINI_API_KEY=YOUR_NEW_KEY

4. Install packages:

   npm install

5. Start:

   npm start

6. Open:

   http://localhost:3000

Camera/microphone access works on localhost. For public deployment use HTTPS.

## Demo admin login

Username: admin
Password: admin123

## Important
- The Gemini key stays on the Node.js server and is never sent to browser JavaScript.
- MediaPipe runs in the browser and does not require an API key.
- The current gaze logic is an attention indicator, not proof of cheating.
- Two alerts flag the interview for human/admin review rather than making an automatic hiring decision.
- For production, replace demo admin authentication with real password hashing/session authentication and use a real database.
- The browser speaks questions with SpeechSynthesis. If you want Gemini Live's native audio voice later, it can be added as a separate WebSocket/Live API layer.
