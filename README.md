# Weather App

Minimal weather app — Express.js 5 + OpenWeather API + Leaflet map.

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure API key**
   - Copy `.env.example` to `.env`
   - Add your key from https://openweathermap.org/api
   ```
   OPENWEATHER_API_KEY=your_key_here
   PORT=3000
   ```

3. **Run**
   ```bash
   npm start
   # or with auto-reload:
   npm run dev
   ```

4. Open http://localhost:3000

## Features

- Search weather by city name
- Geolocation button — detects your location and fetches local weather
- Interactive dark map (Leaflet + CartoDB Dark tiles)
  - Orange pulsing marker for currently viewed city
  - Dimmed orange markers for all cached cities
  - Green pulsing dot for your GPS location
  - Click markers to see weather popup
  - Click crosshair icon in history to pan to any cached city
- LocalStorage cache: same city won't hit the API twice
- History deduplication with pagination (8 per page)
- Toggle map visibility from header

## Tech Stack

- **Backend**: Express.js 5.2.1, Axios 1.7.9, dotenv 16.4.7
- **Frontend**: Vanilla JS (ES modules pattern)
- **Map**: Leaflet.js 1.9.4, CartoDB Dark basemap
- **Icons**: Lucide Static 0.469.0
- **Fonts**: DM Sans + DM Mono
