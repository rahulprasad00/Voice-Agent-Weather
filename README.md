# Weather Voice Agent

This project is a voice-first weather assistant built with Next.js. The client captures speech, extracts intent (city, time, and metric), and calls a server route that queries OpenWeather for the right slice of data. Responses are spoken back to the user with tailored phrasing for temperature, rain, humidity, and wind.

## How the voice agent understands speech

The voice flow lives in `components/VoiceAgent.tsx`:
- The browser `SpeechRecognition` API captures the user's utterance.
- Three extractors parse the transcript:
  - `extractCity` cleans filler words, time words, and weather terms to leave the location.
  - `extractTimeIntent` maps keywords like "now", "today", "tonight", "tomorrow", or "yesterday" into a time intent.
  - `extractMetric` classifies what to emphasize: `temperature`, `rain`, `humidity`, `wind`, or `general`.
- If a city is found, the client sends `{ city, timeIntent, metric }` to `POST /api/weather`, then speaks back the returned message (or a metric-specific fallback if no message is provided).

## How the server answers

The core logic is in `app/api/weather/route.ts`:
- Inputs: `city` (required), `timeIntent` (defaults to `now`), and `metric` (defaults to `general`).
- API choice:
  - For `tomorrow` or `tonight`, it calls the 5-day/3-hour **forecast** endpoint.
  - Otherwise, it calls the **current weather** endpoint.
- Forecast filtering:
  - The helper builds a target time (noon for tomorrow, 9pm for tonight, otherwise the current hour).
  - It filters forecast list entries to the target day (or evening for "tonight"), and picks the entry closest to that target time.
- Normalizing data:
  - Shared fields: `description`, `temperature`, `feelsLike`, `humidity`, `windSpeed`.
  - Rain probability:
    - Forecast: uses `pop` (probability of precipitation) and multiplies by 100 for a percentage.
    - Current: if rain data exists, sets `rainChance` to 100%; otherwise null.
  - Rain volume: reads `rain['1h']` or `rain['3h']` where present.
- Response building:
  - `buildMessage` crafts speech for the requested metric (temperature, rain chance/volume, humidity, wind speed) or a general summary.
  - The JSON response includes all normalized fields plus the chosen metric/timeIntent and the ready-to-speak `message`.

## End-to-end flow

1) User speaks: "Will it be windy in Berlin tonight?"  
2) Client extracts:
   - city: "Berlin"
   - timeIntent: "tonight"
   - metric: "wind"
3) Client calls `/api/weather` with those values.
4) Server requests forecast data, filters to tonight, normalizes wind speed and other fields, and returns a wind-focused message.
5) Client speaks the message back. If a message is missing, it synthesizes a metric-aware fallback.

## Setup

1) Add an OpenWeather API key: set `OPENWEATHER_API_KEY` in your environment.
2) Install dependencies: `npm install`
3) Run the dev server: `npm run dev`
4) Open `http://localhost:3000` and allow microphone access.

## Notes and assumptions

- Speech recognition uses the browser's `SpeechRecognition`/`webkitSpeechRecognition`; unsupported browsers get a toast error.
- Only future or present queries are supported; asking for "yesterday" returns an error.
- Wind speed is reported in meters per second; temperatures are Celsius; rain chance is a percentage.
