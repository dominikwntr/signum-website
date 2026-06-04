// ═══════════════════════════════════════════════
// SIGNUM REAL ESTATE — Shared JavaScript
// ═══════════════════════════════════════════════

// ─── NAV SCROLL ──────────────────────────────
const nav = document.getElementById('nav');
if (nav) {
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 40);
  });
}

// ─── MOBILE MENU ────────────────────────────
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobile-menu');
if (hamburger && mobileMenu) {
  hamburger.addEventListener('click', () => mobileMenu.classList.toggle('open'));
  document.addEventListener('click', e => { if (!nav.contains(e.target)) mobileMenu.classList.remove('open'); });
}

// ─── TABS ────────────────────────────────────
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

// ─── FAQ ACCORDION ───────────────────────────
document.querySelectorAll('.faq-item__q').forEach(q => {
  q.addEventListener('click', () => {
    const item = q.parentElement;
    const wasOpen = item.classList.contains('open');
    item.closest('.faq-list').querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
    if (!wasOpen) item.classList.add('open');
  });
});

// ─── SCROLL ANIMATIONS ───────────────────────
const observer = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); } });
}, { threshold: 0.08 });
document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));

// ─── FORM SUBMIT ─────────────────────────────
function handleSubmit(e) {
  e.preventDefault();
  const btn = e.target.querySelector('[type=submit]');
  const orig = btn.textContent;
  btn.textContent = '✓ Anfrage gesendet';
  btn.style.background = 'var(--messing)';
  btn.disabled = true;
  setTimeout(() => { btn.textContent = orig; btn.style.background = ''; btn.disabled = false; }, 4000);
  return false;
}

// ─── HELPERS ─────────────────────────────────
const deDE = new Intl.NumberFormat('de-DE');
const fmtEur  = n => deDE.format(Math.round(n)) + ' €';
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

// ─── CINEMATIC TEASER CALC (index.html) ──────
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
  sv('ct-price-val', deDE.format(price) + ' <small>€</small>');
  sv('ct-rent-val', deDE.format(rent) + ' <small>€/Monat</small>');
  sv('ct-equity-val', deDE.format(equity) + ' <small>€ · ' + (price>0?(equity/price*100).toFixed(0):0) + ' %</small>');
  sv('ct-rate-val', rate.toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1}) + ' <small>% p.a.</small>');

  const cfEl = document.getElementById('ct-cashflow');
  if (cfEl) {
    cfEl.classList.toggle('is-negative', cashflow < 0);
    setAnimated(cfEl, cashflow, v => (v >= 0 ? '+ ' : '– ') + fmtEur(Math.abs(v)));
  }
  setAnimated(document.getElementById('ct-brutto'), brutto, fmtPct);
  setAnimated(document.getElementById('ct-ek'), ek, fmtPct);
}

// ─── CINEMATIC FULL CALC (investieren.html) ──
function cineCalc() {
  const g = id => parseFloat(document.getElementById(id)?.value) || 0;
  const price = g('ci-price'), rent = g('ci-rent'), equity = g('ci-equity');
  const rate = g('ci-rate'), tilt = g('ci-tilt'), mgmt = g('ci-mgmt');
  const baujahr = document.getElementById('ci-baujahr')?.value || '1925-2022';

  const loan = Math.max(0, price - equity);
  const monthRate = loan * (rate + tilt) / 100 / 12;
  const reserve = price * 0.0001; // ~1€/Monat je 10.000€ Vereinfachung -> ersetzt durch feste Instandhaltung unten
  const instand = Math.max(40, price * 0.00025); // grobe Instandhaltungsrücklage/Monat
  const brutto = price > 0 ? (rent * 12 / price) * 100 : 0;
  const netto = price > 0 ? ((rent * 12 - mgmt * 12 - instand * 12) / price) * 100 : 0;
  const cashflow = rent - monthRate - mgmt - instand;
  const ek = equity > 0 ? (cashflow * 12 / equity) * 100 : 0;
  const afaSatz = baujahr === 'vor1925' ? 0.025 : baujahr === 'ab2023' ? 0.03 : 0.02;
  const afa = price * afaSatz;
  const steuer = afa * 0.42;

  // Slider-Anzeigen
  const sv = (id, txt) => { const e = document.getElementById(id); if (e) e.innerHTML = txt; };
  sv('ci-price-val', deDE.format(price) + ' <small>€</small>');
  sv('ci-rent-val', deDE.format(rent) + ' <small>€/Monat</small>');
  sv('ci-equity-val', deDE.format(equity) + ' <small>€ · ' + (price>0?(equity/price*100).toFixed(0):0) + ' %</small>');
  sv('ci-rate-val', rate.toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1}) + ' <small>% p.a.</small>');
  sv('ci-tilt-val', tilt.toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1}) + ' <small>% p.a.</small>');
  sv('ci-mgmt-val', deDE.format(mgmt) + ' <small>€/Monat</small>');

  const cfEl = document.getElementById('ci-cashflow');
  if (cfEl) {
    cfEl.classList.toggle('is-negative', cashflow < 0);
    setAnimated(cfEl, cashflow, v => (v >= 0 ? '+ ' : '– ') + fmtEur(Math.abs(v)));
  }
  setAnimated(document.getElementById('ci-brutto'), brutto, fmtPct);
  setAnimated(document.getElementById('ci-netto'), netto, fmtPct);
  setAnimated(document.getElementById('ci-rate-month'), monthRate, fmtEur);
  setAnimated(document.getElementById('ci-ek'), ek, fmtPct);
  setAnimated(document.getElementById('ci-afa'), afa, fmtEur);
  setAnimated(document.getElementById('ci-steuer'), steuer, fmtEur);
}

// ─── INIT ────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('ct-price')) {
    ['ct-price','ct-rent','ct-equity','ct-rate'].forEach(id => bindRange(id, teaserCalc));
    teaserCalc();
  }
  if (document.getElementById('ci-price')) {
    ['ci-price','ci-rent','ci-equity','ci-rate','ci-tilt','ci-mgmt'].forEach(id => bindRange(id, cineCalc));
    const sel = document.getElementById('ci-baujahr'); if (sel) sel.addEventListener('change', cineCalc);
    cineCalc();
  }
});
