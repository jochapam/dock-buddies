// The web app's side of things: what the Mac app does natively (pats, pointer, the ☕ menu, weather),
// done in the page. Runs after scene.js, which defines window.pat, setMouse, setWeather, doActivity and nudge.
(() => {
  const $ = (s) => document.querySelector(s);
  const store = {
    get(k, d) { try { const v = localStorage.getItem('buddies.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('buddies.' + k, JSON.stringify(v)); } catch (e) {} },
  };

  // fade in once the first frames are drawn
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $('#loading').style.opacity = 0; setTimeout(() => $('#loading').remove(), 700);
    $('#menuBtn').style.opacity = 1; $('#talk').style.opacity = 1;
  }));

  // someone's arrived: they wake up and wave hello (the scene waves when the pointer comes close)
  const hello = () => { window.nudge(); window.setMouse(innerWidth / 2, innerHeight / 2); };
  hello();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { hello(); refreshWeather(); } });

  // taps are pats (the scene takes coordinates from the bottom-left, as on the Mac);
  // a real mouse or trackpad pointer is followed with their eyes
  const canvas = $('#c');
  canvas.addEventListener('pointerdown', (e) => {
    if (sheet.classList.contains('open')) { closeSheet(); return; }
    if (document.activeElement === talkIn) { talkIn.blur(); return; }   // first tap just puts the keyboard away
    window.nudge();
    window.pat(e.clientX, innerHeight - e.clientY);
  });
  canvas.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') window.setMouse(e.clientX, innerHeight - e.clientY); });
  document.addEventListener('gesturestart', (e) => e.preventDefault());   // no pinch zoom on iOS

  // the ☕ menu
  const sheet = $('#sheet');
  const openSheet = () => sheet.classList.add('open'), closeSheet = () => { saveChat(); document.activeElement && document.activeElement.blur(); sheet.classList.remove('open'); };
  $('#menuBtn').addEventListener('click', () => sheet.classList.contains('open') ? closeSheet() : openSheet());
  sheet.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => { window.nudge(); window.doActivity(b.dataset.act); closeSheet(); }));

  // speech bubbles as crisp page text above whoever is talking (the scene says where their head is, as it does for the Mac app)
  const say = document.createElement('div'); say.className = 'say'; document.body.appendChild(say);
  window.__sayHandler = { postMessage(m) {
    if (!m.show) { say.classList.remove('on'); return; }
    say.textContent = m.text; say.className = 'say ' + m.who;
    const w = Math.min(240, innerWidth * 0.7), x = Math.max(w / 2 + 10, Math.min(innerWidth - w / 2 - 10, m.x));
    say.style.left = x + 'px'; say.style.top = (innerHeight - m.y - 14) + 'px';
    say.style.setProperty('--tail', `calc(50% + ${m.x - x}px)`);
    requestAnimationFrame(() => say.classList.add('on'));
  } };

  // chatting with them (chat.js): the key and the name stay in this browser's storage
  const talkIn = $('#talkIn'), talkGo = $('#talkGo'), keyIn = $('#apiKey'), nameIn = $('#userName');
  keyIn.value = store.get('apiKey', ''); nameIn.value = store.get('userName', '');
  // saved as you type or paste (iOS only sends 'change' when the field loses focus, which closing the menu doesn't always do)
  const saveChat = () => {
    store.set('apiKey', keyIn.value.trim()); store.set('userName', nameIn.value.trim());
    $('#keyNote').textContent = store.get('apiKey', '') ? 'Key saved on this device ✓' : '';
  };
  for (const el of [keyIn, nameIn]) for (const ev of ['input', 'change', 'blur']) el.addEventListener(ev, saveChat);
  saveChat();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});   // ask the browser to keep it
  $('#talk').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = talkIn.value.trim();
    if (!msg || window.buddyChat.isBusy()) return;
    talkIn.value = ''; talkGo.disabled = true; window.nudge();
    try { await window.buddyChat.talk(msg, { apiKey: store.get('apiKey', ''), userName: store.get('userName', '') }); }
    finally { talkGo.disabled = false; }
  });

  // weather from Open-Meteo, like the Mac app: on by default for Sydney until a place is chosen
  const wx = Object.assign({ on: true, lat: -33.8688, lon: 151.2093, place: 'Sydney' }, store.get('weather', {}));
  const NAMES = { 0: 'clear', 1: 'mostly clear', 2: 'partly cloudy', 3: 'cloudy', 45: 'foggy', 48: 'foggy', 51: 'drizzle', 53: 'drizzle', 55: 'drizzle',
    61: 'rain', 63: 'rain', 65: 'heavy rain', 71: 'snow', 73: 'snow', 75: 'heavy snow', 80: 'showers', 81: 'showers', 82: 'heavy showers', 95: 'thunderstorms' };
  const note = (t) => { $('#wxNote').textContent = t; };
  let lastFetch = 0;
  async function refreshWeather(force) {
    if (!wx.on) { window.setWeather(null); note(''); return; }
    if (!force && Date.now() - lastFetch < 15 * 60000) return;
    lastFetch = Date.now();
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${wx.lat}&longitude=${wx.lon}&current=temperature_2m,weather_code,is_day`);
      const c = (await r.json()).current;
      window.setWeather(c.weather_code, c.temperature_2m, c.is_day);
      note(`${wx.place}: ${Math.round(c.temperature_2m)}°C, ${NAMES[c.weather_code] || 'mixed'}`);
    } catch (e) { lastFetch = 0; note("Couldn't get the weather right now."); }
  }
  const save = () => { store.set('weather', wx); refreshWeather(true); };
  const wxOn = $('#wxOn'), wxMore = $('#wxMore');
  wxOn.checked = wx.on; wxMore.style.display = wx.on ? '' : 'none';
  wxOn.addEventListener('change', () => { wx.on = wxOn.checked; wxMore.style.display = wx.on ? '' : 'none'; save(); });

  let searchTimer = null;
  $('#place').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const q = e.target.value.trim(), list = $('#places');
    if (q.length < 2) { list.textContent = ''; return; }
    searchTimer = setTimeout(async () => {
      try {
        const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=5&name=${encodeURIComponent(q)}`);
        const results = (await r.json()).results || [];
        list.textContent = '';
        for (const p of results) {
          const b = document.createElement('button');
          b.textContent = [p.name, p.admin1, p.country].filter(Boolean).join(', ');
          b.addEventListener('click', () => { Object.assign(wx, { lat: p.latitude, lon: p.longitude, place: p.name }); list.textContent = ''; $('#place').value = ''; save(); });
          list.appendChild(b);
        }
        if (!results.length) list.textContent = 'No places found.';
      } catch (err) { list.textContent = "Couldn't search right now."; }
    }, 350);
  });
  $('#useLoc').addEventListener('click', () => {
    if (!navigator.geolocation) { note("This browser can't share its location."); return; }
    note('Finding you…');
    navigator.geolocation.getCurrentPosition(
      (pos) => { Object.assign(wx, { lat: +pos.coords.latitude.toFixed(3), lon: +pos.coords.longitude.toFixed(3), place: 'Your location' }); save(); },
      () => note("Couldn't get your location. You can search for a place instead."),
      { maximumAge: 3600000, timeout: 15000 });
  });
  refreshWeather(true);
  setInterval(() => { if (!document.hidden) refreshWeather(); }, 5 * 60000);

  // in Safari on iPhone/iPad (not yet on the Home Screen), a one-time tip for adding it there
  const iOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (iOS && !standalone && !store.get('hintSeen', false)) {
    setTimeout(() => { $('#hint').style.display = 'block'; }, 2500);
    $('#hintClose').addEventListener('click', (e) => { e.preventDefault(); $('#hint').style.display = 'none'; store.set('hintSeen', true); });
  }
})();
