require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.OPENWEATHER_API_KEY;
const BASE_URL = 'https://api.openweathermap.org/data/2.5';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function buildWeatherResult(data) {
  return {
    id: data.id,
    city: data.name,
    country: data.sys.country,
    lat: data.coord.lat,
    lon: data.coord.lon,
    temp: Math.round(data.main.temp),
    feels_like: Math.round(data.main.feels_like),
    temp_min: Math.round(data.main.temp_min),
    temp_max: Math.round(data.main.temp_max),
    humidity: data.main.humidity,
    pressure: data.main.pressure,
    wind_speed: data.wind.speed,
    wind_deg: data.wind.deg,
    description: data.weather[0].description,
    icon: data.weather[0].icon,
    weather_main: data.weather[0].main,
    visibility: data.visibility ? Math.round(data.visibility / 1000) : null,
    clouds: data.clouds?.all,
    sunrise: data.sys.sunrise,
    sunset: data.sys.sunset,
    timezone: data.timezone,
    queried_at: Date.now(),
  };
}

// Clima atual por cidade
app.get('/api/weather', async (req, res) => {
  const { city } = req.query;
  if (!city || city.trim() === '') return res.status(400).json({ error: 'Nome da cidade é obrigatório.' });
  if (!API_KEY || API_KEY === 'your_api_key_here') {
    return res.status(500).json({ error: 'Chave da API não configurada. Adicione sua chave OpenWeather no arquivo .env.' });
  }
  try {
    const r = await axios.get(`${BASE_URL}/weather`, {
      params: { q: city.trim(), appid: API_KEY, units: 'metric', lang: 'pt_br' },
    });
    res.json(buildWeatherResult(r.data));
  } catch (err) {
    if (err.response?.status === 404) return res.status(404).json({ error: `Cidade "${city}" não encontrada.` });
    if (err.response?.status === 401) return res.status(401).json({ error: 'Chave da API inválida.' });
    return res.status(500).json({ error: 'Falha ao buscar dados climáticos. Tente novamente.' });
  }
});

// Clima atual por coordenadas
app.get('/api/weather/coords', async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: 'Coordenadas necessárias.' });
  if (!API_KEY || API_KEY === 'your_api_key_here') {
    return res.status(500).json({ error: 'Chave da API não configurada.' });
  }
  try {
    const r = await axios.get(`${BASE_URL}/weather`, {
      params: { lat, lon, appid: API_KEY, units: 'metric', lang: 'pt_br' },
    });
    res.json(buildWeatherResult(r.data));
  } catch (err) {
    if (err.response?.status === 401) return res.status(401).json({ error: 'Chave da API inválida.' });
    return res.status(500).json({ error: 'Falha ao buscar dados climáticos.' });
  }
});

// Previsão 5 dias / 3 horas por cidade
app.get('/api/forecast', async (req, res) => {
  const { city, lat, lon } = req.query;
  if (!API_KEY || API_KEY === 'your_api_key_here') {
    return res.status(500).json({ error: 'Chave da API não configurada.' });
  }
  try {
    const params = { appid: API_KEY, units: 'metric', lang: 'pt_br', cnt: 40 };
    if (city) params.q = city.trim();
    else if (lat && lon) { params.lat = lat; params.lon = lon; }
    else return res.status(400).json({ error: 'Cidade ou coordenadas necessárias.' });

    const r = await axios.get(`${BASE_URL}/forecast`, { params });
    const list = r.data.list;

    // Agrupar por dia (usando data local via timezone offset)
    const tzOffset = r.data.city.timezone;
    const days = {};

    list.forEach(item => {
      const localDate = new Date((item.dt + tzOffset) * 1000);
      const dayKey = `${localDate.getUTCFullYear()}-${String(localDate.getUTCMonth()+1).padStart(2,'0')}-${String(localDate.getUTCDate()).padStart(2,'0')}`;
      if (!days[dayKey]) {
        days[dayKey] = {
          date: dayKey,
          temps: [],
          icons: [],
          descriptions: [],
          humidity: [],
          wind: [],
          pop: [],
        };
      }
      days[dayKey].temps.push(item.main.temp);
      days[dayKey].icons.push(item.weather[0].icon);
      days[dayKey].descriptions.push(item.weather[0].description);
      days[dayKey].humidity.push(item.main.humidity);
      days[dayKey].wind.push(item.wind.speed);
      days[dayKey].pop.push(item.pop || 0);
    });

    const today = new Date((Math.floor(Date.now()/1000) + tzOffset) * 1000);
    const todayKey = `${today.getUTCFullYear()}-${String(today.getUTCMonth()+1).padStart(2,'0')}-${String(today.getUTCDate()).padStart(2,'0')}`;

    const forecast = Object.entries(days)
      .filter(([key]) => key >= todayKey)
      .slice(0, 7)
      .map(([key, d]) => ({
        date: key,
        temp_max: Math.round(Math.max(...d.temps)),
        temp_min: Math.round(Math.min(...d.temps)),
        temp_avg: Math.round(d.temps.reduce((a,b) => a+b, 0) / d.temps.length),
        icon: d.icons[Math.floor(d.icons.length / 2)],
        description: d.descriptions[Math.floor(d.descriptions.length / 2)],
        humidity: Math.round(d.humidity.reduce((a,b) => a+b, 0) / d.humidity.length),
        wind_speed: parseFloat((d.wind.reduce((a,b) => a+b, 0) / d.wind.length).toFixed(1)),
        pop: Math.round(Math.max(...d.pop) * 100),
      }));

    res.json({ forecast, timezone: tzOffset, city: r.data.city.name, country: r.data.city.country });
  } catch (err) {
    if (err.response?.status === 404) return res.status(404).json({ error: 'Cidade não encontrada.' });
    if (err.response?.status === 401) return res.status(401).json({ error: 'Chave da API inválida.' });
    return res.status(500).json({ error: 'Falha ao buscar previsão.' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Exporta para Vercel (serverless); escuta localmente em dev
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}

module.exports = app;