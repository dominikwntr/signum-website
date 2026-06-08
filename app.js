// ===============================================
// SIGNUM REAL ESTATE - Shared JavaScript
// ===============================================

// --- NAV SCROLL ------------------------------
const nav = document.getElementById('nav');
if (nav) {
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 40);
  });
}

// --- MOBILE MENU ----------------------------
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobile-menu');
if (hamburger && mobileMenu) {
  hamburger.addEventListener('click', () => mobileMenu.classList.toggle('open'));
  document.addEventListener('click', e => { if (!nav.contains(e.target)) mobileMenu.classList.remove('open'); });
}

// --- TABS ------------------------------------
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tabId = btn.dataset.tab;
    const container = btn.closest('.container') || btn.closest('section');
    container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    container.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const panel = document.getElementById('tab-' + tabId);
    if (panel) panel.classList.add('active');
  });
});

// --- FAQ ACCORDION ---------------------------
document.querySelectorAll('.faq-item__q').forEach(q => {
  q.addEventListener('click', () => {
    const item = q.parentElement;
    const wasOpen = item.classList.contains('open');
    item.closest('.faq-list').querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
    if (!wasOpen) item.classList.add('open');
  });
});

// --- SCROLL ANIMATIONS -----------------------
const observer = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); } });
}, { threshold: 0.08 });
document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));

// --- FORM SUBMIT -----------------------------
function handleSubmit(e) {
  e.preventDefault();
  const btn = e.target.querySelector('[type=submit]');
  const orig = btn.textContent;
  btn.textContent = '\u2713 Anfrage gesendet';
  btn.style.background = 'var(--messing)';
  btn.disabled = true;
  setTimeout(() => { btn.textContent = orig; btn.style.background = ''; btn.disabled = false; }, 4000);
  return false;
}

// --- HELPERS ---------------------------------
const deDE = new Intl.NumberFormat('de-DE');
const fmtEur  = n => deDE.format(Math.round(n)) + ' \u20ac';
const fmtPct  = n => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';

// Sanftes Count-up / Tweening pro Element
const tweenState = new WeakMap();
function setAnimated(el, value, formatter) {
  if (!el) return;
  const start = tweenState.has(el) ? tweenState.get(el) : value;
  const t0 = performance.now();
  const dur = 450;
  function frame(t) {
    const p = Math.min(1, (t - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
    const cur = start + (value - start) * eased;
    el.textContent = formatter(cur);
    if (p < 1) requestAnimationFrame(frame);
    else tweenState.set(el, value);
  }
  requestAnimationFrame(frame);
}

// Slider <-> Anzeige synchronisieren
function bindRange(id, onInput) {
  const range = document.getElementById(id);
  if (!range) return;
  range.addEventListener('input', onInput);
}

// --- CINEMATIC TEASER CALC (index.html) ------
function teaserCalc() {
  const g = id => parseFloat(document.getElementById(id)?.value) || 0;
  const price = g('ct-price'), rent = g('ct-rent'), equity = g('ct-equity'), rate = g('ct-rate');
  const tilt = 2.0;
  const loan = Math.max(0, price - equity);
  const monthRate = loan * (rate + tilt) / 100 / 12;
  const brutto = price > 0 ? (rent * 12 / price) * 100 : 0;
  const cashflow = rent - monthRate;
  const ek = equity > 0 ? (cashflow * 12 / equity) * 100 : 0;

  // Slider-Anzeigen
  const sv = (id, txt) => { const e = document.getElementById(id); if (e) e.innerHTML = txt; };
  sv('ct-price-val', deDE.format(price) + ' <small>\u20ac</small>');
  sv('ct-rent-val', deDE.format(rent) + ' <small>\u20ac/Monat</small>');
  sv('ct-equity-val', deDE.format(equity) + ' <small>\u20ac</small>');
  sv('ct-rate-val', rate.toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1}) + ' <small>% p.a.</small>');

  const cfEl = document.getElementById('ct-cashflow');
  if (cfEl) {
    cfEl.classList.toggle('is-negative', cashflow < 0);
    setAnimated(cfEl, cashflow, v => (v >= 0 ? '+ ' : '\u2013 ') + fmtEur(Math.abs(v)));
  }
  setAnimated(document.getElementById('ct-brutto'), brutto, fmtPct);
  setAnimated(document.getElementById('ct-ek'), ek, fmtPct);
}

// --- CINEMATIC FULL CALC (investieren.html) --
// Grunderwerbsteuer je Bundesland (Stand 2024, %)
const GREST = { BW:5.0, BY:3.5, BE:6.0, BB:6.5, HB:5.0, HH:5.5, HE:6.0, MV:6.0, NI:5.0, NW:6.5, RP:5.0, SL:6.5, SN:5.5, ST:5.0, SH:6.5, TH:5.0 };
const NOTAR_GB = 2.0; // Notar + Grundbuch, vereinfacht %

function cineCalc() {
  const g = id => parseFloat(document.getElementById(id)?.value) || 0;
  const price = g('ci-price'), rent = g('ci-rent'), equity = g('ci-equity');
  const rate = g('ci-rate'), tilt = g('ci-tilt'), mgmt = g('ci-mgmt');
  const afaSatz = g('ci-afasatz'), tax = g('ci-tax'), wert = g('ci-wert');
  const bl = document.getElementById('ci-bundesland')?.value || 'NI';

  // Kaufnebenkosten (Notar + Grunderwerbsteuer, 0 % Makler bei Signum)
  const nebenProz = (GREST[bl] || 5.0) + NOTAR_GB;
  const neben = price * nebenProz / 100;
  const gesamt = price + neben;

  // Finanzierung: Eigenkapital deckt zuerst die Nebenkosten
  const loan = Math.max(0, gesamt - equity);
  const monthRate = loan * (rate + tilt) / 100 / 12;
  const instand = Math.max(40, price * 0.00025); // Instandhaltungsr\u00fccklage/Monat (vereinfacht)

  // Renditen
  const brutto = price > 0 ? (rent * 12 / price) * 100 : 0;
  const netto  = price > 0 ? ((rent * 12 - mgmt * 12 - instand * 12) / price) * 100 : 0;

  // AfA (Basis = Kaufpreis, vereinfacht ohne Grundst\u00fccksanteil), Satz frei w\u00e4hlbar
  // + optionale Sonder-AfA (\u00a77b) ZUS\u00c4TZLICH zur linearen/degressiven AfA
  const sonderOn = document.getElementById('ci-sonder')?.value === 'ja';
  const sonderSatz = g('ci-sondersatz');
  const afaSonder = sonderOn ? price * sonderSatz / 100 : 0;
  const afa = price * afaSatz / 100 + afaSonder;

  // Steuerliche Betrachtung: Werbungskosten = Zinsen + AfA + Verwaltung + Instandhaltung
  const zinsenJ = loan * rate / 100;                 // Zinsanteil Jahr 1 (vereinfacht)
  const werbung = zinsenJ + afa + mgmt * 12 + instand * 12;
  const steuErgebnis = rent * 12 - werbung;          // < 0 = Verlust => Steuerersparnis
  const steuEffektJ = -steuErgebnis * tax / 100;     // positiv = Ersparnis, negativ = Steuerlast

  // Cashflow nach Steuern
  const cfVor = rent - monthRate - mgmt - instand;
  const cf = cfVor + steuEffektJ / 12;
  const ek = equity > 0 ? (cf * 12 / equity) * 100 : 0;

  // Wertentwicklung \u00fcber 10 Jahre
  const wert10 = price * Math.pow(1 + wert / 100, 10);
  const zuwachs = wert10 - price;

  const afaArt = document.getElementById('ci-afaart')?.value || 'linear';
  const afaLabel = { linear: 'linear', degressiv: 'degressiv' }[afaArt] || '';

  // Slider-Anzeigen
  const sv = (id, txt) => { const e = document.getElementById(id); if (e) e.innerHTML = txt; };
  const f1 = n => n.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  sv('ci-price-val', deDE.format(price) + ' <small>\u20ac</small>');
  sv('ci-equity-val', deDE.format(equity) + ' <small>\u20ac</small>');
  sv('ci-rent-val', deDE.format(rent) + ' <small>\u20ac/Monat</small>');
  sv('ci-rate-val', f1(rate) + ' <small>% p.a.</small>');
  sv('ci-tilt-val', f1(tilt) + ' <small>% p.a.</small>');
  sv('ci-mgmt-val', deDE.format(mgmt) + ' <small>\u20ac/Monat</small>');
  sv('ci-afasatz-val', f1(afaSatz) + ' <small>% ' + afaLabel + '</small>');
  sv('ci-sondersatz-val', f1(sonderSatz) + ' <small>% \u00a77b</small>');
  sv('ci-tax-val', deDE.format(tax) + ' <small>%</small>');
  sv('ci-wert-val', f1(wert) + ' <small>% p.a.</small>');

  const cfEl = document.getElementById('ci-cashflow');
  if (cfEl) {
    cfEl.classList.toggle('is-negative', cf < 0);
    setAnimated(cfEl, cf, v => (v >= 0 ? '+ ' : '\u2013 ') + fmtEur(Math.abs(v)));
  }
  setAnimated(document.getElementById('ci-brutto'), brutto, fmtPct);
  setAnimated(document.getElementById('ci-netto'), netto, fmtPct);
  setAnimated(document.getElementById('ci-neben'), neben, fmtEur);
  setAnimated(document.getElementById('ci-rate-month'), monthRate, fmtEur);
  const stEl = document.getElementById('ci-steuer');
  if (stEl) setAnimated(stEl, steuEffektJ, v => (v >= 0 ? '+ ' : '\u2013 ') + fmtEur(Math.abs(v)));
  setAnimated(document.getElementById('ci-ek'), ek, fmtPct);
  setAnimated(document.getElementById('ci-afa'), afa, fmtEur);
  setAnimated(document.getElementById('ci-wert10'), wert10, fmtEur);
  setAnimated(document.getElementById('ci-zuwachs'), zuwachs, v => '+ ' + fmtEur(v));
}

// AfA-Art wechselt sinnvollen Standard-Satz (frei nachjustierbar)
function setAfaDefault() {
  const art = document.getElementById('ci-afaart')?.value;
  const slider = document.getElementById('ci-afasatz');
  if (!slider) return;
  const def = { linear: 2.0, degressiv: 5.0 }[art];
  if (def != null) slider.value = def;
}

// --- INIT ------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('ct-price')) {
    ['ct-price','ct-rent','ct-equity','ct-rate'].forEach(id => bindRange(id, teaserCalc));
    teaserCalc();
  }
  if (document.getElementById('ci-price')) {
    ['ci-price','ci-rent','ci-equity','ci-rate','ci-tilt','ci-mgmt','ci-afasatz','ci-sondersatz','ci-tax','ci-wert'].forEach(id => bindRange(id, cineCalc));
    const bl = document.getElementById('ci-bundesland'); if (bl) bl.addEventListener('change', cineCalc);
    const art = document.getElementById('ci-afaart'); if (art) art.addEventListener('change', () => { setAfaDefault(); cineCalc(); });
    const snd = document.getElementById('ci-sonder'); if (snd) snd.addEventListener('change', cineCalc);
    cineCalc();
  }
});

// --- OBJEKT-FILTER (referenzobjekte.html) ----
document.querySelectorAll('.filter-btn').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.filter-btn').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  const f=b.dataset.filter;
  document.querySelectorAll('.ref-card').forEach(c=>{c.style.display=(f==='all'||c.dataset.city===f||c.dataset.type===f)?'':'none';});
}));
