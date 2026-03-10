/* ==========================================
   WEATHER APP — map.js
   Países via country-codes-lat-long (eesur/GitHub, sem auth).
   ========================================== */

const WeatherMap = (() => {
  let map           = null;
  let userMarker    = null;
  let currentMarker = null;
  let cachedMarkers = {};
  let worldLayer    = null;
  let userCoords    = null;
  let onCityClick   = null;

  const TILE = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  const ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>';

  const COUNTRIES_URL = 'https://raw.githubusercontent.com/eesur/country-codes-lat-long/refs/heads/master/country-codes-lat-long-alpha3.json';
  const CACHE_KEY     = 'wapp_countries_latlong_v1';
  const CACHE_TTL     = 7 * 24 * 60 * 60 * 1000; // 7 dias

  /* ── Ícones ─────────────────────────────── */

  function _worldIcon() {
    return L.divIcon({
      className : '',
      html      : '<div class="wc-marker"><div class="wc-dot"></div></div>',
      iconSize  : [12, 12],
      iconAnchor: [6, 6],
    });
  }

  function _cachedIcon(label) {
    return L.divIcon({
      className : '',
      html      : `<div class="cm-marker cm-marker--cached">
                     <div class="cm-dot"></div>
                     <div class="cm-label">${_esc(label)}</div>
                   </div>`,
      iconSize  : [12, 12],
      iconAnchor: [6, 6],
    });
  }

  function _currentIcon(label) {
    return L.divIcon({
      className : '',
      html      : `<div class="cm-marker cm-marker--current">
                     <div class="cm-ring"></div>
                     <div class="cm-dot"></div>
                     <div class="cm-label">${_esc(label)}</div>
                   </div>`,
      iconSize  : [12, 12],
      iconAnchor: [6, 6],
    });
  }

  function _userIcon() {
    return L.divIcon({
      className : '',
      html      : `<div class="cm-marker cm-marker--user">
                     <div class="cm-ring"></div>
                     <div class="cm-pulse"></div>
                     <div class="cm-dot"></div>
                   </div>`,
      iconSize  : [12, 12],
      iconAnchor: [6, 6],
    });
  }

  /* ── HTML helpers ───────────────────────── */

  function _esc(s) {
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(String(s ?? '')));
    return d.innerHTML;
  }

  function _popupWeather(data, showBtn = false) {
    return `<div class="map-popup">
      <div class="map-popup-head">
        <span class="map-popup-city">${_esc(data.city)}</span>
        <span class="map-popup-country">${_esc(data.country)}</span>
      </div>
      <div class="map-popup-temp">${data.temp}°C</div>
      <div class="map-popup-desc">${_esc(data.description)}</div>
      ${showBtn ? '<button class="map-popup-view-btn">Ver detalhes completos</button>' : ''}
    </div>`;
  }

  function _popupLoading(name) {
    return `<div class="map-popup map-popup--loading">
      <div class="map-popup-spinner"></div>
      <span>${_esc(name)}</span>
    </div>`;
  }

  function _popupError(name) {
    return `<div class="map-popup">
      <div class="map-popup-city">${_esc(name)}</div>
      <div class="map-popup-desc" style="color:#e05252">Falha ao carregar clima</div>
    </div>`;
  }

  function _popupUser() {
    return `<div class="map-popup"><div class="map-popup-city">Sua localização</div></div>`;
  }

  /* ── Fetch + parse do gist ──────────────── */

  async function _fetchCountries() {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) {
        const { ts, entries } = JSON.parse(raw);
        if (Date.now() - ts < CACHE_TTL) return entries;
      }
    } catch (_) {}

    const res = await fetch(COUNTRIES_URL);
    if (!res.ok) throw new Error(`gist fetch ${res.status}`);
    const countries = await res.json();

    // Campos usados: country, alpha2, latitude, longitude
    const list = countries.ref_country_codes ?? countries;
    const entries = list
      .filter(c => c.country && c.latitude != null && c.longitude != null)
      .map(c => ({
        capital : c.country,   // sem campo capital — usa o nome do país
        country : c.alpha2 || c.alpha3 || '',
        lat     : c.latitude,
        lon     : c.longitude,
      }));

    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), entries }));
    } catch (_) {}

    return entries;
  }

  /* ── Adiciona dots no mapa ──────────────── */

  async function _loadCapitals() {
    let entries;
    try {
      entries = await _fetchCountries();
    } catch (err) {
      console.warn('[WeatherMap] countries.json falhou:', err.message);
      return;
    }

    worldLayer = L.layerGroup().addTo(map);

    entries.forEach(city => {
      const marker = L.marker([city.lat, city.lon], {
        icon        : _worldIcon(),
        zIndexOffset: 10,
      });

      let loaded     = false;
      let cachedData = null;

      marker.bindPopup('', {
        className: 'map-popup-wrapper',
        offset   : [0, -6],
        maxWidth : 220,
      });

      marker.on('click', () => marker.openPopup());

      marker.on('popupopen', async () => {
        const popup = marker.getPopup();

        if (loaded && cachedData) {
          popup.setContent(_popupWeather(cachedData, true));
          popup.update();
          _bindViewBtn(popup, marker, cachedData);
          return;
        }

        popup.setContent(_popupLoading(city.capital));
        popup.update();

        try {
          const r    = await fetch(`/api/weather?city=${encodeURIComponent(city.capital)}`);
          const data = await r.json();
          if (!r.ok) throw new Error(data.error || 'erro');

          loaded     = true;
          cachedData = data;

          popup.setContent(_popupWeather(data, true));
          popup.update();
          _bindViewBtn(popup, marker, data);
        } catch {
          popup.setContent(_popupError(city.capital));
          popup.update();
        }
      });

      marker.addTo(worldLayer);
    });
  }

  function _bindViewBtn(popup, marker, data) {
    requestAnimationFrame(() => {
      const btn = popup.getElement()?.querySelector('.map-popup-view-btn');
      if (!btn) return;
      const fresh = btn.cloneNode(true);
      btn.replaceWith(fresh);
      fresh.addEventListener('click', () => {
        marker.closePopup();
        if (onCityClick) onCityClick(data);
      });
    });
  }

  /* ── API pública ─────────────────────────── */

  function init(cityClickCallback) {
    onCityClick = cityClickCallback;

    map = L.map('map', {
      center             : [20, 10],
      zoom               : 2,
      minZoom            : 2,
      maxZoom            : 18,
      zoomControl        : false,
      attributionControl : true,
      worldCopyJump      : true,
      maxBounds          : [[-85, -Infinity], [85, Infinity]],
      maxBoundsViscosity : 0.7,
    });

    L.tileLayer(TILE, {
      attribution: ATTR,
      subdomains : 'abcd',
      maxZoom    : 19,
      noWrap     : false,
    }).addTo(map);

    map.attributionControl.setPosition('bottomleft');
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    map.whenReady(() => {
      setTimeout(() => map.invalidateSize(), 100);
      _loadCapitals();
    });
  }

  function setUserLocation(lat, lon) {
    userCoords = { lat, lon };
    if (userMarker) {
      userMarker.setLatLng([lat, lon]);
    } else {
      userMarker = L.marker([lat, lon], { icon: _userIcon(), zIndexOffset: 1000 })
        .addTo(map)
        .bindPopup(_popupUser(), { className: 'map-popup-wrapper', offset: [0, -6] });
    }
  }

  function panToUser() {
    if (userCoords) map.flyTo([userCoords.lat, userCoords.lon], 10, { duration: 1.2 });
  }

  function setCurrentCity(data) {
    if (currentMarker) { map.removeLayer(currentMarker); currentMarker = null; }
    if (cachedMarkers[data.id]) { map.removeLayer(cachedMarkers[data.id]); delete cachedMarkers[data.id]; }

    currentMarker = L.marker([data.lat, data.lon], {
      icon        : _currentIcon(data.city),
      zIndexOffset: 900,
    })
      .addTo(map)
      .bindPopup(_popupWeather(data, false), { className: 'map-popup-wrapper', offset: [0, -6] });

    map.flyTo([data.lat, data.lon], 9, { duration: 1.4 });

    const lbl = document.getElementById('mapLabelText');
    if (lbl) lbl.textContent = `${data.city}${data.country ? ', ' + data.country : ''}`;
  }

  function syncCachedMarkers(history, activeId) {
    Object.keys(cachedMarkers).forEach(id => {
      if (!history.find(h => String(h.id) === id)) {
        map.removeLayer(cachedMarkers[id]);
        delete cachedMarkers[id];
      }
    });
    history.forEach(item => {
      if (!item.lat || !item.lon || item.id === activeId) return;
      const key = String(item.id);
      if (!cachedMarkers[key]) {
        cachedMarkers[key] = L.marker([item.lat, item.lon], {
          icon        : _cachedIcon(item.city),
          zIndexOffset: 200,
        })
          .addTo(map)
          .bindPopup(_popupWeather(item, false), { className: 'map-popup-wrapper', offset: [0, -6] });
      }
    });
  }

  function removeCachedMarker(id) {
    const key = String(id);
    if (cachedMarkers[key]) { map.removeLayer(cachedMarkers[key]); delete cachedMarkers[key]; }
  }

  function clearAllMarkers() {
    if (currentMarker) { map.removeLayer(currentMarker); currentMarker = null; }
    Object.values(cachedMarkers).forEach(m => map.removeLayer(m));
    cachedMarkers = {};
    if (userMarker) { map.removeLayer(userMarker); userMarker = null; userCoords = null; }
  }

  function panToCity(lat, lon) { map.flyTo([lat, lon], 9, { duration: 1.2 }); }

  function invalidate() { if (map) setTimeout(() => map.invalidateSize(), 80); }

  return {
    init,
    setUserLocation,
    panToUser,
    setCurrentCity,
    syncCachedMarkers,
    removeCachedMarker,
    clearAllMarkers,
    panToCity,
    invalidate,
  };
})();