/* ==========================================
   TEMPO APP — Lógica principal (PT-BR)
   ========================================== */

const STORAGE_KEY  = 'weather_history';
const PER_PAGE     = 8;

// ── Estado ──────────────────────────────────
let state = {
  currentWeather : null,
  history        : loadHistory(),
  currentPage    : 1,
  totalPages     : 1,
  lastQuery      : '',
  lastCoords     : null,
  mapVisible     : true,
  geoLoading     : false,
  forecastDays   : 1,
  forecastData   : null,
};

// ── DOM ──────────────────────────────────────
const $ = id => document.getElementById(id);
const els = {
  searchInput     : $('searchInput'),
  searchBtn       : $('searchBtn'),
  clearBtn        : $('clearBtn'),
  searchHint      : $('searchHint'),
  weatherSection  : $('weatherSection'),
  weatherData     : $('weatherData'),
  loadingState    : $('loadingState'),
  errorState      : $('errorState'),
  errorMessage    : $('errorMessage'),
  retryBtn        : $('retryBtn'),
  emptyState      : $('emptyState'),
  cityName        : $('cityName'),
  countryBadge    : $('countryBadge'),
  weatherDesc     : $('weatherDesc'),
  tempValue       : $('tempValue'),
  tempMax         : $('tempMax'),
  tempMin         : $('tempMin'),
  feelsLike       : $('feelsLike'),
  humidity        : $('humidity'),
  wind            : $('wind'),
  pressure        : $('pressure'),
  visibility      : $('visibility'),
  sunrise         : $('sunrise'),
  sunset          : $('sunset'),
  updatedAt       : $('updatedAt'),
  cacheIndicator  : $('cacheIndicator'),
  centerMapBtn    : $('centerMapBtn'),
  historyDrawer   : $('historyDrawer'),
  historyList     : $('historyList'),
  historyEmpty    : $('historyEmpty'),
  toggleHistory   : $('toggleHistory'),
  closeDrawer     : $('closeDrawer'),
  clearHistoryBtn : $('clearHistoryBtn'),
  overlay         : $('overlay'),
  historyBadge    : $('historyBadge'),
  pagination      : $('pagination'),
  prevPage        : $('prevPage'),
  nextPage        : $('nextPage'),
  pageInfo        : $('pageInfo'),
  geoBtn          : $('geoBtn'),
  toggleMapBtn    : $('toggleMapBtn'),
  mapSection      : $('mapSection'),
  mapLocateBtn    : $('mapLocateBtn'),
  forecastSection : $('forecastSection'),
  forecastLoading : $('forecastLoading'),
  forecastError   : $('forecastError'),
  forecastErrorMsg: $('forecastErrorMsg'),
  forecastList    : $('forecastList'),
};

// ── LocalStorage ─────────────────────────────
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function saveHistory() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.history)); }
  catch(e) { console.warn('localStorage:', e); }
}
function upsertHistory(d) {
  state.history = state.history.filter(i => i.id !== d.id);
  state.history.unshift(d);
  saveHistory();
}
function removeFromHistory(id) {
  state.history = state.history.filter(i => i.id !== id);
  saveHistory();
  renderHistory();
  updateBadge();
  WeatherMap.removeCachedMarker(id);
  WeatherMap.syncCachedMarkers(state.history, state.currentWeather?.id);
}
function clearHistory() {
  state.history = [];
  saveHistory();
  renderHistory();
  updateBadge();
  WeatherMap.clearAllMarkers();
  state.currentWeather = null;
}
function findInHistory(name) {
  const n = name.trim().toLowerCase();
  return state.history.find(i => i.city.toLowerCase() === n);
}

// ── API ──────────────────────────────────────
async function apiWeather(city) {
  const r = await fetch(`/api/weather?city=${encodeURIComponent(city)}`);
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Erro desconhecido');
  return d;
}
async function apiWeatherCoords(lat, lon) {
  const r = await fetch(`/api/weather/coords?lat=${lat}&lon=${lon}`);
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Erro desconhecido');
  return d;
}
async function apiForecast({ city, lat, lon }) {
  const qs = city
    ? `city=${encodeURIComponent(city)}`
    : `lat=${lat}&lon=${lon}`;
  const r = await fetch(`/api/forecast?${qs}`);
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Erro ao buscar previsão');
  return d;
}

// ── Geolocalização ───────────────────────────
function requestGeo() {
  if (!navigator.geolocation) {
    setHint('Geolocalização não é suportada pelo seu navegador.', true);
    return;
  }
  if (state.geoLoading) return;
  state.geoLoading = true;
  els.geoBtn.classList.add('loading');
  setHint('Detectando sua localização...');

  navigator.geolocation.getCurrentPosition(
    async pos => {
      const { latitude: lat, longitude: lon } = pos.coords;
      state.geoLoading = false;
      els.geoBtn.classList.remove('loading');
      state.lastCoords = { lat, lon };
      WeatherMap.setUserLocation(lat, lon);
      try {
        showLoading();
        const data = await apiWeatherCoords(lat, lon);
        afterSearch(data, false);
        setHint('');
        els.searchInput.value = data.city;
        els.clearBtn.classList.remove('hidden');
        loadForecast({ lat, lon });
      } catch(err) {
        showError(err.message);
        setHint(err.message, true);
      }
    },
    err => {
      state.geoLoading = false;
      els.geoBtn.classList.remove('loading');
      const msgs = {
        1: 'Acesso à localização negado. Permita o acesso no navegador.',
        2: 'Localização indisponível. Tente buscar pelo nome da cidade.',
        3: 'Tempo esgotado ao obter localização. Tente novamente.',
      };
      setHint(msgs[err.code] || 'Não foi possível obter a localização.', true);
    },
    { timeout: 10000, maximumAge: 60000 }
  );
}

// ── UI helpers ───────────────────────────────
function showLoading() {
  els.weatherSection.classList.remove('hidden');
  els.emptyState.classList.add('hidden');
  els.weatherData.classList.add('hidden');
  els.errorState.classList.add('hidden');
  els.loadingState.classList.remove('hidden');
}

function showWeather(data, fromCache) {
  els.weatherSection.classList.remove('hidden');
  els.emptyState.classList.add('hidden');
  els.loadingState.classList.add('hidden');
  els.errorState.classList.add('hidden');
  els.weatherData.classList.remove('hidden');

  fromCache
    ? els.cacheIndicator.classList.remove('hidden')
    : els.cacheIndicator.classList.add('hidden');

  els.cityName.textContent     = data.city;
  els.countryBadge.textContent = data.country;
  els.weatherDesc.textContent  = data.description;
  els.tempValue.textContent    = data.temp;
  els.tempMax.textContent      = data.temp_max;
  els.tempMin.textContent      = data.temp_min;
  els.feelsLike.textContent    = data.feels_like;
  els.humidity.textContent     = `${data.humidity}%`;
  els.wind.textContent         = `${data.wind_speed} m/s`;
  els.pressure.textContent     = `${data.pressure} hPa`;
  els.visibility.textContent   = data.visibility != null ? `${data.visibility} km` : 'N/D';

  const tz = data.timezone;
  els.sunrise.textContent   = fmtTime(data.sunrise, tz);
  els.sunset.textContent    = fmtTime(data.sunset, tz);
  els.updatedAt.textContent = `Atualizado ${fmtRelative(new Date(data.queried_at))}`;
}

function showError(msg) {
  els.weatherSection.classList.remove('hidden');
  els.emptyState.classList.add('hidden');
  els.loadingState.classList.add('hidden');
  els.weatherData.classList.add('hidden');
  els.errorState.classList.remove('hidden');
  els.errorMessage.textContent = msg;
}

function setHint(msg, isErr = false) {
  els.searchHint.textContent = msg;
  els.searchHint.className   = 'search-hint' + (isErr ? ' error' : '');
}

// ── Busca ────────────────────────────────────
async function search(cityName) {
  const q = cityName.trim();
  if (!q) { setHint('Informe o nome da cidade.', true); els.searchInput.focus(); return; }

  state.lastQuery  = q;
  state.lastCoords = null;
  setHint('');

  const cached = findInHistory(q);
  if (cached) {
    showWeather(cached, true);
    setHint(`Exibindo resultado salvo para ${cached.city}`);
    afterSearch(cached, true, /* skipFetch */ true);
    loadForecast({ city: cached.city });
    return;
  }

  showLoading();
  try {
    const data = await apiWeather(q);
    afterSearch(data, false);
    setHint('');
    loadForecast({ city: data.city });
  } catch(err) {
    showError(err.message);
    setHint(err.message, true);
  }
}

function afterSearch(data, fromCache, skipFetch = false) {
  if (!fromCache || skipFetch) showWeather(data, fromCache);
  state.currentWeather = data;
  upsertHistory(data);
  renderHistory();
  updateBadge();
  if (data.lat && data.lon) {
    WeatherMap.setCurrentCity(data);
    WeatherMap.syncCachedMarkers(state.history, data.id);
  }
}

// ── Previsão ─────────────────────────────────
async function loadForecast(source) {
  els.forecastSection.classList.remove('hidden');
  els.forecastLoading.classList.remove('hidden');
  els.forecastError.classList.add('hidden');
  els.forecastList.innerHTML = '';

  try {
    const result = await apiForecast(source);
    state.forecastData = result.forecast;
    renderForecast();
  } catch(err) {
    els.forecastLoading.classList.add('hidden');
    els.forecastError.classList.remove('hidden');
    els.forecastErrorMsg.textContent = err.message;
  }
}

function renderForecast() {
  els.forecastLoading.classList.add('hidden');
  els.forecastError.classList.add('hidden');

  if (!state.forecastData) return;

  const days = state.forecastDays === 1 ? 1 : state.forecastDays;
  const items = state.forecastData.slice(0, days);

  els.forecastList.innerHTML = items.map((d, i) => {
    const label = i === 0 ? 'Hoje' : fmtDayLabel(d.date);
    const popText = d.pop > 0 ? `${d.pop}%` : '';
    return `
    <div class="forecast-item ${days === 1 ? 'forecast-item--single' : ''}">
      <div class="forecast-day">${label}</div>
      <div class="forecast-icon-wrap">
        <img
          src="https://openweathermap.org/img/wn/${d.icon}@2x.png"
          alt="${escHtml(d.description)}"
          class="forecast-icon"
          loading="lazy"
          onerror="this.style.display='none'"
        />
      </div>
      <div class="forecast-desc">${escHtml(d.description)}</div>
      <div class="forecast-temps">
        <span class="forecast-max">${d.temp_max}°</span>
        <span class="forecast-sep">/</span>
        <span class="forecast-min">${d.temp_min}°</span>
      </div>
      ${popText ? `<div class="forecast-pop"><i class="icon-droplets"></i>${popText}</div>` : '<div class="forecast-pop"></div>'}
    </div>`;
  }).join('');
}

// ── Histórico ────────────────────────────────
function renderHistory() {
  const total = state.history.length;
  state.totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  if (state.currentPage > state.totalPages) state.currentPage = state.totalPages;

  if (total === 0) {
    els.historyList.innerHTML = '';
    els.historyEmpty.classList.remove('hidden');
    els.pagination.classList.add('hidden');
    return;
  }
  els.historyEmpty.classList.add('hidden');

  const start = (state.currentPage - 1) * PER_PAGE;
  const page  = state.history.slice(start, start + PER_PAGE);
  els.historyList.innerHTML = page.map(renderHistoryItem).join('');

  els.historyList.querySelectorAll('.history-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.history-item-action, .history-item-mappin')) return;
      const city = el.dataset.city;
      els.searchInput.value = city;
      els.clearBtn.classList.remove('hidden');
      search(city);
      closeDrawer();
    });
  });

  els.historyList.querySelectorAll('.history-item-action').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); removeFromHistory(parseInt(btn.dataset.id)); });
  });

  els.historyList.querySelectorAll('.history-item-mappin').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const lat = parseFloat(btn.dataset.lat), lon = parseFloat(btn.dataset.lon);
      if (!isNaN(lat)) {
        closeDrawer();
        if (!state.mapVisible) toggleMap();
        WeatherMap.panToCity(lat, lon);
      }
    });
  });

  if (state.totalPages > 1) {
    els.pagination.classList.remove('hidden');
    els.pageInfo.textContent   = `${state.currentPage} / ${state.totalPages}`;
    els.prevPage.disabled      = state.currentPage === 1;
    els.nextPage.disabled      = state.currentPage === state.totalPages;
  } else {
    els.pagination.classList.add('hidden');
  }
}

function renderHistoryItem(item) {
  const time = fmtRelative(new Date(item.queried_at));
  const hasCoords = item.lat && item.lon;
  return `
  <div class="history-item" data-id="${item.id}" data-city="${escHtml(item.city)}" role="button" tabindex="0">
    <div class="history-item-icon"><i class="icon-map-pin"></i></div>
    <div class="history-item-body">
      <div class="history-item-city">${escHtml(item.city)}<span class="country-tag">${escHtml(item.country)}</span></div>
      <div class="history-item-meta"><span>${escHtml(item.description)}</span><span>·</span><span>${time}</span></div>
    </div>
    <span class="history-item-temp">${item.temp}°</span>
    ${hasCoords ? `<button class="history-item-mappin" data-lat="${item.lat}" data-lon="${item.lon}" title="Ver no mapa" aria-label="Ver ${escHtml(item.city)} no mapa"><i class="icon-crosshair"></i></button>` : ''}
    <button class="history-item-action" data-id="${item.id}" title="Remover" aria-label="Remover ${escHtml(item.city)}"><i class="icon-x"></i></button>
  </div>`;
}

function updateBadge() {
  const c = state.history.length;
  els.historyBadge.textContent = c > 99 ? '99+' : c;
  els.historyBadge.classList.toggle('hidden', c === 0);
}

// ── Mapa toggle ──────────────────────────────
function toggleMap() {
  state.mapVisible = !state.mapVisible;
  els.mapSection.classList.toggle('map-hidden', !state.mapVisible);
  els.toggleMapBtn.classList.toggle('active', state.mapVisible);
  if (state.mapVisible) WeatherMap.invalidate();
}

// ── Drawer ───────────────────────────────────
function openDrawer() {
  state.currentPage = 1;
  renderHistory();
  els.historyDrawer.classList.add('open');
  els.overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function closeDrawer() {
  els.historyDrawer.classList.remove('open');
  els.overlay.classList.add('hidden');
  document.body.style.overflow = '';
}

// ── Utilitários ──────────────────────────────
function fmtTime(unix, tzOff) {
  const d = new Date((unix + tzOff) * 1000);
  return `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
}
function fmtRelative(date) {
  const s = Math.floor((Date.now() - date) / 1000);
  if (s < 60)      return 'agora mesmo';
  if (s < 3600)    return `${Math.floor(s/60)}min atrás`;
  if (s < 86400)   return `${Math.floor(s/3600)}h atrás`;
  if (s < 2592000) return `${Math.floor(s/86400)}d atrás`;
  return date.toLocaleDateString('pt-BR', { day:'2-digit', month:'short' });
}
function fmtDayLabel(dateStr) {
  // dateStr = 'YYYY-MM-DD'
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
}
function escHtml(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str));
  return d.innerHTML;
}

// ── Eventos ──────────────────────────────────
els.searchInput.addEventListener('input', () => {
  els.clearBtn.classList.toggle('hidden', !els.searchInput.value);
  setHint('');
});
els.clearBtn.addEventListener('click', () => {
  els.searchInput.value = '';
  els.clearBtn.classList.add('hidden');
  els.searchInput.focus();
  setHint('');
});
els.searchBtn.addEventListener('click', () => search(els.searchInput.value));
els.searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') search(els.searchInput.value); });
els.retryBtn.addEventListener('click', () => { if (state.lastQuery) search(state.lastQuery); });

els.geoBtn.addEventListener('click', requestGeo);
els.toggleMapBtn.addEventListener('click', toggleMap);
els.mapLocateBtn.addEventListener('click', () => WeatherMap.panToUser());
els.centerMapBtn.addEventListener('click', () => {
  if (state.currentWeather?.lat) {
    WeatherMap.panToCity(state.currentWeather.lat, state.currentWeather.lon);
    if (!state.mapVisible) toggleMap();
  }
});

els.toggleHistory.addEventListener('click', () => {
  els.historyDrawer.classList.contains('open') ? closeDrawer() : openDrawer();
});
els.closeDrawer.addEventListener('click', closeDrawer);
els.overlay.addEventListener('click', closeDrawer);
els.clearHistoryBtn.addEventListener('click', () => { if (state.history.length) clearHistory(); });

els.prevPage.addEventListener('click', () => { if (state.currentPage > 1) { state.currentPage--; renderHistory(); } });
els.nextPage.addEventListener('click', () => { if (state.currentPage < state.totalPages) { state.currentPage++; renderHistory(); } });

document.querySelectorAll('.forecast-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.forecast-tab').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    state.forecastDays = parseInt(btn.dataset.days);
    renderForecast();
  });
});

els.historyList.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') {
    const item = e.target.closest('.history-item');
    if (item && !e.target.closest('.history-item-action')) { e.preventDefault(); item.click(); }
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

// ── Init ──────────────────────────────────────
function init() {
  // Callback: clique numa cidade mundial no mapa → carrega clima + previsão
  WeatherMap.init((data) => {
    showWeather(data, false);
    state.currentWeather = data;
    upsertHistory(data);
    renderHistory();
    updateBadge();
    els.searchInput.value = data.city;
    els.clearBtn.classList.remove('hidden');
    setHint('');
    WeatherMap.setCurrentCity(data);
    WeatherMap.syncCachedMarkers(state.history, data.id);
    loadForecast({ city: data.city });
  });

  updateBadge();
  WeatherMap.syncCachedMarkers(state.history, null);
  els.searchInput.focus();
  els.emptyState.classList.remove('hidden');
  els.weatherSection.classList.add('hidden');
}
init();
