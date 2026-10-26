/* Signum Rechenkern v3: reine Funktionen, ohne DOM. Wird in signum-v2.js eingebettet und per Node getestet. */
var SG_GREST = { BW:5.0, BY:3.5, BE:6.0, BB:6.5, HB:5.5, HH:5.5, HE:6.0, MV:6.0, NI:5.0, NW:6.5, RP:5.0, SL:6.5, SN:5.5, ST:5.0, SH:6.5, TH:5.0 };
var SG_NOTAR = 2.0;          // Notar und Grundbuch, pauschal in % des Kaufpreises
var SG_7B_CAP_M2 = 4000;     // Bemessungsgrundlage § 7b, max. 4.000 €/m² Wohnfläche

function sgNum(x) { x = +x; return isFinite(x) && x > 0 ? x : 0; }

/* Annuitätendarlehen: Zins und Tilgung Monat für Monat. Zins und Tilgung dürfen 0 % sein. */
function sgAmort(loan, ratePct, tilgPct, months) {
  loan = sgNum(loan); ratePct = sgNum(ratePct); tilgPct = sgNum(tilgPct);
  var r = ratePct / 100 / 12;
  var pay = loan * (ratePct + tilgPct) / 100 / 12;   // konstante Monatsrate
  var rest = loan, zins = 0, tilg = 0;
  for (var m = 0; m < months && rest > 0.005; m++) {
    var zi = rest * r;
    var ti = Math.max(0, Math.min(rest, pay - zi));
    zins += zi; tilg += ti; rest -= ti;
  }
  return { rate: loan > 0 ? pay : 0, zins: zins, tilg: tilg, rest: Math.max(0, rest) };
}

/* Kurzrechner Startseite: Überschuss vor Steuern, ohne Nebenkosten und Bewirtschaftung */
function sgTeaser(i) {
  var price = sgNum(i.price), rent = sgNum(i.rent), equity = sgNum(i.equity);
  var loan = Math.max(0, price - equity);
  var ekEff = Math.min(equity, price);
  var y1 = sgAmort(loan, i.rate, i.tilg, 12);
  var mieteJ = rent * 12;
  return {
    loan: loan, rateM: y1.rate, zinsJ: y1.zins, tilgJ: y1.tilg,
    cashflowM: rent - y1.rate,
    brutto: price > 0 ? mieteJ / price * 100 : 0,
    ek: ekEff > 0 ? (mieteJ - y1.zins) / ekEff * 100 : null   // inkl. Tilgung
  };
}

/* Vollrechner */
function sgFull(i) {
  var price = sgNum(i.price), rent = sgNum(i.rent), equity = sgNum(i.equity), area = sgNum(i.area);
  var grest = SG_GREST[i.bl] != null ? SG_GREST[i.bl] : 5.0;
  var nebenPct = grest + SG_NOTAR;
  var neben = price * nebenPct / 100;
  var gesamt = price + neben;
  var loan = Math.max(0, gesamt - equity);               // Eigenkapital deckt zuerst die Nebenkosten
  var ekEff = Math.min(equity, gesamt);                    // tatsächlich eingesetztes Eigenkapital
  var y1 = sgAmort(loan, i.rate, i.tilg, 12);

  var mieteJ = rent * 12;
  var instandM = sgNum(i.instand) * area;
  var kostenM = sgNum(i.mgmt) + instandM;                  // nicht umlagefähige Kosten pro Monat

  var afaBasis = gesamt * sgNum(i.gebaeude) / 100;         // nur Gebäudeanteil inkl. anteiliger Nebenkosten
  var afaRegel = afaBasis * sgNum(i.afa) / 100;
  var afaSonder = i.sonder ? Math.min(afaBasis, SG_7B_CAP_M2 * area) * 0.05 : 0;
  var afaJ = afaRegel + afaSonder;

  var ergebnis = mieteJ - y1.zins - afaJ - kostenM * 12;   // steuerliches Ergebnis Jahr 1
  var steuerJ = -ergebnis * sgNum(i.tax) / 100;            // positiv = Erstattung, negativ = Steuerlast

  var cfVorM = rent - y1.rate - kostenM;
  var cfNachM = cfVorM + steuerJ / 12;

  // Vermögensentwicklung über 30 Jahre
  var serie = [];
  for (var t = 0; t <= 30; t++) {
    var wert = price * Math.pow(1 + (+i.wert || 0) / 100, t);
    var rest = t === 0 ? loan : sgAmort(loan, i.rate, i.tilg, t * 12).rest;
    serie.push({ t: t, wert: wert, rest: rest, netto: wert - rest });
  }
  var y10 = serie[10];

  return {
    grest: grest, nebenPct: nebenPct, neben: neben, gesamt: gesamt, loan: loan, ekEff: ekEff,
    rateM: y1.rate, zinsJ: y1.zins, tilgJ: y1.tilg, zinsM: y1.zins / 12, tilgM: y1.tilg / 12,
    kostenM: kostenM, instandM: instandM,
    brutto: price > 0 ? mieteJ / price * 100 : 0,
    netto: gesamt > 0 ? (mieteJ - kostenM * 12) / gesamt * 100 : 0,
    afaBasis: afaBasis, afaJ: afaJ, afaSonder: afaSonder, ergebnis: ergebnis,
    steuerJ: steuerJ, cfVorM: cfVorM, cfNachM: cfNachM,
    ek: ekEff > 0 ? (cfNachM * 12 + y1.tilg) / ekEff * 100 : null,
    wert10: y10.wert, rest10: y10.rest, vermoegen10: y10.netto, serie: serie
  };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { sgAmort: sgAmort, sgTeaser: sgTeaser, sgFull: sgFull, SG_GREST: SG_GREST };


/* ===== Signum v2: Oberfläche und Interaktionen ===== */
(function () {
  'use strict';
  if (window.__sgV2) return; window.__sgV2 = true;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var de = new Intl.NumberFormat('de-DE');
  var MINUS = '−';
  function eur(n) { return de.format(Math.round(n)) + ' €'; }
  function sEur(n) { var r = Math.round(n); return (r < 0 ? MINUS + ' ' : '+ ') + de.format(Math.abs(r)) + ' €'; }
  function pct(n, d) { return n.toLocaleString('de-DE', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }) + ' %'; }
  function parseNum(v) { var n = parseFloat(String(v).replace(/\./g, '').replace(',', '.').replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; }

  function ready(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }

  ready(function () {
    /* Navigation: Zustand für transparente Variante */
    var nav = $('#nav');
    if (nav) {
      var onScroll = function () { nav.classList.toggle('scrolled', window.scrollY > 40); };
      window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
      var hb = $('#hamburger'), mm = $('#mobile-menu');
      if (hb && mm) hb.addEventListener('click', function () { setTimeout(function () { nav.classList.toggle('is-open', mm.classList.contains('open')); }, 0); });
      $$('#mobile-menu a').forEach(function (a) { a.addEventListener('click', function () { mm && mm.classList.remove('open'); nav.classList.remove('is-open'); }); });
    }

    /* Hero: sanfte Parallaxe */
    var par = $('[data-parallax]');
    if (par && !reduce) {
      var tick = false;
      window.addEventListener('scroll', function () {
        if (tick) return; tick = true;
        requestAnimationFrame(function () { var y = Math.min(window.scrollY, window.innerHeight); par.style.transform = 'translate3d(0,' + (y * 0.25) + 'px,0)'; tick = false; });
      }, { passive: true });
    }

    /* Kennzahlen hochzählen */
    $$('[data-count]').forEach(function (el) {
      var target = parseFloat(el.getAttribute('data-count')); if (reduce || !target) return;
      var t0 = null, dur = 1600; el.textContent = '0';
      setTimeout(function () {
        requestAnimationFrame(function step(t) { if (!t0) t0 = t; var p = Math.min(1, (t - t0) / dur); el.textContent = de.format(Math.round(target * (1 - Math.pow(1 - p, 4)))); if (p < 1) requestAnimationFrame(step); });
      }, 900);
    });

    /* Manifest: Wort für Wort beim Scrollen */
    $$('[data-words]').forEach(function (el) {
      var words = el.textContent.trim().split(/\s+/);
      el.innerHTML = words.map(function (w) { return '<span class="w">' + w + '</span>'; }).join(' ');
      var spans = $$('.w', el);
      if (reduce) { spans.forEach(function (s) { s.classList.add('on'); }); return; }
      function upd() {
        var r = el.getBoundingClientRect(), vh = window.innerHeight;
        var p = (vh * 0.85 - r.top) / (r.height + vh * 0.35);
        var n = Math.round(Math.max(0, Math.min(1, p)) * spans.length);
        spans.forEach(function (s, i) { s.classList.toggle('on', i < n); });
      }
      window.addEventListener('scroll', upd, { passive: true }); upd();
    });

    /* Leistungen: Aufklappen und schwebende Bildvorschau */
    $$('[data-svc]').forEach(function (list) {
      var rows = $$('.xsvc__row', list), flo = $('.xsvc__float', list), fimg = flo && $('img', flo);
      rows.forEach(function (row) {
        var bar = $('.xsvc__bar', row);
        bar.addEventListener('click', function () {
          var open = !row.classList.contains('open');
          rows.forEach(function (r) { r.classList.remove('open'); $('.xsvc__bar', r).setAttribute('aria-expanded', 'false'); });
          if (open) { row.classList.add('open'); bar.setAttribute('aria-expanded', 'true'); }
          list.classList.toggle('has-open', open); list.classList.remove('is-hover');
        });
        if (flo && window.matchMedia('(hover: hover)').matches) {
          bar.addEventListener('mouseenter', function () { if (list.classList.contains('has-open')) return; fimg.src = row.getAttribute('data-img'); list.classList.add('is-hover'); });
          bar.addEventListener('mouseleave', function () { list.classList.remove('is-hover'); });
        }
      });
      if (flo) list.addEventListener('mousemove', function (e) {
        var r = list.getBoundingClientRect();
        flo.style.transform = 'translate3d(' + (e.clientX - r.left + 36) + 'px,' + (e.clientY - r.top - flo.offsetHeight * 0.5) + 'px,0)';
      });
    });

    /* Wertschöpfung: horizontale Sequenz, an den Scroll gekoppelt */
    $$('[data-hscroll]').forEach(function (sec) {
      var track = $('.xc__track', sec), bar = $('.xc__progress span', sec), mq = window.matchMedia('(min-width:1024px)');
      function setup() {
        if (!mq.matches || reduce) { sec.classList.remove('is-pinned'); track.style.transform = ''; sec.style.removeProperty('--xc-h'); return; }
        sec.classList.add('is-pinned');
        var dist = Math.max(0, track.scrollWidth - window.innerWidth + 40);
        sec.style.setProperty('--xc-h', (window.innerHeight + dist) + 'px');
        sec._dist = dist; upd();
      }
      function upd() {
        if (!sec.classList.contains('is-pinned')) return;
        var r = sec.getBoundingClientRect(), max = sec.offsetHeight - window.innerHeight;
        var p = Math.max(0, Math.min(1, -r.top / (max || 1)));
        track.style.transform = 'translate3d(' + (-p * sec._dist) + 'px,0,0)';
        if (bar) bar.style.width = (p * 100) + '%';
      }
      window.addEventListener('scroll', upd, { passive: true });
      window.addEventListener('resize', setup);
      window.addEventListener('load', setup);
      setup();
    });

    /* Referenzen: Galerie mit Pfeilen und Ziehen */
    $$('[data-gallery]').forEach(function (g) {
      var track = $('[data-gallery-track]', g), cards = $$('.xr__card', track), cnt = $('[data-gallery-count]', g);
      var prev = $('[data-gallery-prev]', g), next = $('[data-gallery-next]', g);
      function step() { return cards[0].getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap || 24); }
      function upd() {
        var i = Math.round(track.scrollLeft / step());
        if (cnt) cnt.textContent = String(Math.min(cards.length, i + 1)).padStart(2, '0') + ' / ' + String(cards.length).padStart(2, '0');
        if (prev) prev.disabled = track.scrollLeft < 8;
        if (next) next.disabled = track.scrollLeft > track.scrollWidth - track.clientWidth - 8;
      }
      if (prev) prev.addEventListener('click', function () { track.scrollBy({ left: -step(), behavior: 'smooth' }); });
      if (next) next.addEventListener('click', function () { track.scrollBy({ left: step(), behavior: 'smooth' }); });
      track.addEventListener('scroll', upd, { passive: true }); upd();
      var down = false, sx = 0, sl = 0, moved = false;
      track.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse') return; down = true; moved = false; sx = e.clientX; sl = track.scrollLeft; });
      window.addEventListener('pointermove', function (e) { if (!down) return; var dx = e.clientX - sx; if (Math.abs(dx) > 5) { moved = true; track.classList.add('is-drag'); } track.scrollLeft = sl - dx; });
      window.addEventListener('pointerup', function () { if (!down) return; down = false; track.classList.remove('is-drag'); if (moved) { var i = Math.round(track.scrollLeft / step()); track.scrollTo({ left: i * step(), behavior: 'smooth' }); } });
      track.addEventListener('click', function (e) { if (moved) { e.preventDefault(); moved = false; } }, true);
    });

    /* Haltung: Zeile im Blick wird aktiv */
    var rows = $$('.xv__row');
    if (rows.length) {
      if (reduce || !('IntersectionObserver' in window)) rows.forEach(function (r) { r.classList.add('on'); });
      else { var io = new IntersectionObserver(function (es) { es.forEach(function (e) { e.target.classList.toggle('on', e.isIntersecting); }); }, { rootMargin: '-35% 0px -35% 0px' }); rows.forEach(function (r) { io.observe(r); }); }
    }

    /* Kundenstimmen */
    $$('[data-slider]').forEach(function (s) {
      var slides = $$('.xq__slide', s), i = 0, cnt = $('[data-slider-count]', s), timer;
      function go(n) { i = (n + slides.length) % slides.length; slides.forEach(function (x, k) { x.classList.toggle('on', k === i); }); if (cnt) cnt.textContent = String(i + 1).padStart(2, '0'); }
      function auto() { clearInterval(timer); if (!reduce) timer = setInterval(function () { go(i + 1); }, 9000); }
      var p = $('[data-slider-prev]', s), n = $('[data-slider-next]', s);
      if (p) p.addEventListener('click', function () { go(i - 1); auto(); });
      if (n) n.addEventListener('click', function () { go(i + 1); auto(); });
      go(0); auto();
    });

    /* Allgemeines Einblenden */
    var rv = $$('[data-rv]');
    if (rv.length && 'IntersectionObserver' in window && !reduce) {
      var io2 = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io2.unobserve(e.target); } }); }, { threshold: .12 });
      rv.forEach(function (el) { io2.observe(el); });
    } else rv.forEach(function (el) { el.classList.add('in'); });


    /* Referenzen filtern */
    $$('[data-filter-root]').forEach(function (root) {
      var btns = $$('[data-filter]', root), cards = $$('[data-st]', root);
      btns.forEach(function (b) { b.addEventListener('click', function () {
        var f = b.getAttribute('data-filter');
        btns.forEach(function (x) { x.classList.toggle('on', x === b); });
        cards.forEach(function (c) { c.hidden = !(f === 'alle' || c.getAttribute('data-st') === f); });
      }); });
    });

    /* ===== Rechner ===== */
    $$('[data-sgcalc]').forEach(function (root) {
      var mode = root.getAttribute('data-sgcalc');
      var ins = $$('[data-in]', root);
      function val(k) { var el = $('[data-in="' + k + '"]', root); if (!el) return 0; if (el.type === 'checkbox') return el.checked; if (el.tagName === 'SELECT') return el.value; return parseNum(el.value.indexOf(',') > -1 || el.type === 'text' ? el.value : el.value.replace('.', ',')); }
      function num(k) { var el = $('[data-in="' + k + '"]', root); if (!el) return 0; return el.type === 'range' ? parseFloat(el.value) : parseNum(el.value); }
      function out(k, txt) { $$('[data-out="' + k + '"]', root).forEach(function (el) { el.textContent = txt; }); }
      function bar(k, f) { var el = $('[data-bar="' + k + '"]', root); if (el) el.style.transform = 'scaleX(' + Math.max(0, Math.min(1, f)) + ')'; }

      function calc() {
        if (mode === 'teaser') {
          var i = { price: num('price'), rent: num('rent'), equity: num('equity'), rate: num('rate'), tilg: num('tilg') };
          var r = sgTeaser(i);
          out('rateLbl', pct(i.rate, 1)); out('tilgLbl', pct(i.tilg, 1));
          out('cashflow', sEur(r.cashflowM));
          var big = $('[data-out="cashflow"]', root); if (big) big.classList.toggle('is-neg', Math.round(r.cashflowM) < 0);
          var zM = r.zinsJ / 12, tM = r.tilgJ / 12, mx = Math.max(i.rent, zM + tM, 1);
          out('rentM', eur(i.rent)); out('zinsM', eur(zM)); out('tilgM', eur(tM));
          bar('rent', i.rent / mx); bar('zins', zM / mx); bar('tilg', tM / mx);
          out('brutto', pct(r.brutto)); out('tilgJ', eur(r.tilgJ));
          out('ek', r.ek == null ? 'kein EK' : pct(r.ek));
        } else {
          var j = { price: num('price'), rent: num('rent'), equity: num('equity'), area: num('area'), rate: num('rate'), tilg: num('tilg'), mgmt: num('mgmt'), instand: num('instand'),
            bl: val('bl'), gebaeude: num('gebaeude'), afa: num('afa'), sonder: !!val('sonder'), tax: num('tax'), wert: num('wert') };
          var f = sgFull(j);
          out('rateLbl', pct(j.rate, 1)); out('tilgLbl', pct(j.tilg, 1)); out('mgmtLbl', eur(j.mgmt)); out('instandLbl', j.instand.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €/m²');
          out('gebLbl', pct(j.gebaeude, 0)); out('afaLbl', pct(j.afa, 1)); out('taxLbl', pct(j.tax, 0)); out('wertLbl', pct(j.wert, 1));
          out('cashflow', sEur(f.cfNachM));
          var b2 = $('[data-out="cashflow"]', root); if (b2) b2.classList.toggle('is-neg', Math.round(f.cfNachM) < 0);
          out('cfVor', sEur(f.cfVorM)); out('steuerM', sEur(f.steuerJ / 12));
          out('brutto', pct(f.brutto)); out('netto', pct(f.netto));
          out('neben', eur(f.neben)); out('nebenPct', pct(f.nebenPct, 1)); out('grest', pct(f.grest, 1));
          out('loan', eur(f.loan)); out('rateM', eur(f.rateM)); out('zinsJ', eur(f.zinsJ)); out('tilgJ', eur(f.tilgJ));
          out('afaBasis', eur(f.afaBasis)); out('afaJ', eur(f.afaJ)); out('steuerJ', sEur(f.steuerJ));
          out('ek', f.ek == null ? 'kein EK' : pct(f.ek));
          out('wert10', eur(f.wert10)); out('rest10', eur(f.rest10)); out('verm10', eur(f.vermoegen10));
          var kM = j.mgmt + j.instand * j.area;
          out('rentOut', eur(j.rent)); out('rateMneg', sEur(-f.rateM)); out('kostenMneg', sEur(-kM));
          out('nebenTxt', '(' + eur(f.neben) + ', ' + pct(f.nebenPct, 1) + ')');
          out('loanTxt', '(' + eur(f.loan) + ', Rate ' + eur(f.rateM) + ' pro Monat)');
          out('afaTxt', '(Basis ' + eur(f.afaBasis) + ', AfA Jahr 1 ' + eur(f.afaJ) + ')');
          var sb = $('[data-sonder-hint]', root); if (sb) sb.hidden = !j.sonder;
        }
      }
      ins.forEach(function (el) {
        el.addEventListener('input', calc); el.addEventListener('change', calc);
        if (el.type === 'text') el.addEventListener('blur', function () { el.value = de.format(parseNum(el.value)); calc(); });
      });
      /* AfA Art setzt einen sinnvollen Startwert */
      var art = $('[data-afa-art]', root), afa = $('[data-in="afa"]', root);
      if (art && afa) art.addEventListener('change', function () { var d = { bestand: 2, gutachten: 4, neubau: 3, degressiv: 5 }[art.value]; if (d != null) { afa.value = d; calc(); } });
      calc();
    });
  });
})();


/* ===== Signum Rechner v3: Oberfläche ===== */
(function () {
  'use strict';
  if (window.__sgRc) return; window.__sgRc = true;
  var de = new Intl.NumberFormat('de-DE');
  var MINUS = '−';
  function eur(n) { return de.format(Math.round(n)) + ' €'; }
  function sEur(n) { var r = Math.round(n); return (r < 0 ? MINUS + ' ' : r > 0 ? '+ ' : '') + de.format(Math.abs(r)) + ' €'; }
  function neg(n) { var r = Math.round(n); return (r > 0 ? MINUS + ' ' : '') + de.format(Math.abs(r)) + ' €'; }
  function pct(n, d) { d = d == null ? 2 : d; return n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' %'; }
  function parse(v) {
    var s = String(v).trim().replace(/\s/g, '');
    if (/,/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    var n = parseFloat(s.replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? 0 : Math.max(0, n);
  }
  function fmtIn(n, dec) { return n.toLocaleString('de-DE', { minimumFractionDigits: dec, maximumFractionDigits: dec }); }

  function chart(el, serie, years) {
    if (!el) return;
    var W = Math.max(300, Math.round(el.clientWidth || 640)), H = W < 500 ? 220 : 230, L = 56, R = 30, T = 12, B = 28;
    var pts = serie.slice(0, years + 1);
    var max = Math.max.apply(null, pts.map(function (p) { return p.wert; })) || 1;
    var mag = Math.pow(10, Math.floor(Math.log10(max / 4))), step = [1, 2, 2.5, 5, 10].map(function (m) { return m * mag; }).find(function (s) { return max / s <= 5; });
    max = Math.ceil(max / step) * step; var nT = Math.round(max / step);
    function x(t) { return L + (W - L - R) * t / years; }
    function y(v) { return T + (H - T - B) * (1 - v / max); }
    function line(k) { return pts.map(function (p, i) { return (i ? 'L' : 'M') + x(p.t).toFixed(1) + ',' + y(p[k]).toFixed(1); }).join(''); }
    var area = line('wert') + pts.slice().reverse().map(function (p) { return 'L' + x(p.t).toFixed(1) + ',' + y(p.rest).toFixed(1); }).join('') + 'Z';
    var g = '';
    for (var k = 0; k <= nT; k++) { var v = step * k, yy = y(v); g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" class="g"/><text x="' + (L - 8) + '" y="' + (yy + 4) + '" text-anchor="end">' + (v >= 1e6 ? (v / 1e6).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' Mio.' : de.format(Math.round(v / 1000)) + ' Tsd.') + '</text>'; }
    var tickStep = W < 500 ? (years <= 10 ? 5 : 10) : (years <= 10 ? 2 : 5);
    for (var t = 0; t <= years; t += tickStep) g += '<text x="' + x(t) + '" y="' + (H - 8) + '" text-anchor="middle">' + (t === 0 ? 'Heute' : (W < 500 ? t + ' J.' : 'Jahr ' + t)) + '</text>';
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Vermögensentwicklung über ' + years + ' Jahre">' + g +
      '<path d="' + area + '" class="a"/><path d="' + line('wert') + '" class="w"/><path d="' + line('rest') + '" class="r"/></svg>';
  }

  function init(root) {
    var mode = root.getAttribute('data-rc'), years = 10;
    function inp(k) { return root.querySelector('[data-in="' + k + '"]'); }
    function num(k) { var e = inp(k); return e ? parse(e.value) : 0; }
    function out(k, t) { root.querySelectorAll('[data-out="' + k + '"]').forEach(function (e) { e.textContent = t; }); }

    /* Schieberegler und Eingabefeld koppeln */
    root.querySelectorAll('[data-range]').forEach(function (r) {
      var k = r.getAttribute('data-range'), e = inp(k), dec = (r.step.split('.')[1] || '').length;
      r.addEventListener('input', function () { e.value = fmtIn(parseFloat(r.value), dec); calc(); });
      e.addEventListener('input', function () { var v = parse(e.value); r.value = Math.min(+r.max, v); calc(); });
      e.addEventListener('blur', function () { e.value = fmtIn(parse(e.value), dec); });
      e.value = fmtIn(parse(e.value), dec);
    });
    root.querySelectorAll('input[type="text"][data-in]').forEach(function (e) {
      if (root.querySelector('[data-range="' + e.getAttribute('data-in') + '"]')) return;
      e.addEventListener('input', calc);
      e.addEventListener('blur', function () { e.value = fmtIn(parse(e.value), 0); calc(); });
    });
    root.querySelectorAll('select[data-in], input[type="checkbox"][data-in]').forEach(function (e) { e.addEventListener('change', calc); });
    root.querySelectorAll('input[type="text"][data-in]').forEach(function (e) { e.addEventListener('focus', function () { e.select(); }); });

    /* Reiter */
    function tab(name) {
      root.querySelectorAll('[data-tab]').forEach(function (b) { var on = b.getAttribute('data-tab') === name; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
      root.querySelectorAll('[data-pane]').forEach(function (p) { p.classList.toggle('on', p.getAttribute('data-pane') === name); });
    }
    root.querySelectorAll('[data-tab]').forEach(function (b) { b.addEventListener('click', function () { tab(b.getAttribute('data-tab')); }); });
    root.querySelectorAll('[data-goto]').forEach(function (b) { b.addEventListener('click', function () { tab(b.getAttribute('data-goto')); }); });

    /* Abschreibungsart setzt Startwert */
    var art = inp('afaArt');
    if (art) art.addEventListener('change', function () {
      var d = { bestand: 2, alt: 2.5, gutachten: 4, neubau: 3, degressiv: 5 }[art.value];
      var e = inp('afa'), r = root.querySelector('[data-range="afa"]');
      if (d != null) { e.value = fmtIn(d, 1); if (r) r.value = d; calc(); }
    });
    root.querySelectorAll('[data-years]').forEach(function (b) {
      b.addEventListener('click', function () {
        years = +b.getAttribute('data-years');
        root.querySelectorAll('[data-years]').forEach(function (x) { x.classList.toggle('on', x === b); });
        calc();
      });
    });

    function calc() {
      if (mode === 'teaser') {
        var i = { price: num('price'), rent: num('rent'), equity: num('equity'), rate: num('rate'), tilg: num('tilg') };
        var r = sgTeaser(i);
        out('cashflow', sEur(r.cashflowM));
        root.querySelector('[data-out="cashflow"]').classList.toggle('is-neg', Math.round(r.cashflowM) < 0);
        out('brutto', pct(r.brutto)); out('ek', r.ek == null ? 'kein EK' : pct(r.ek));
        var z = r.zinsJ / 12, t = r.tilgJ / 12, rest = Math.max(0, i.rent - z - t), tot = Math.max(i.rent, z + t, 1);
        out('t_zins', eur(z)); out('t_tilg', eur(t)); out('t_rest', sEur(i.rent - z - t));
        var bz = root.querySelector('[data-bar="zins"]'), bt = root.querySelector('[data-bar="tilg"]'), br = root.querySelector('[data-bar="rest"]');
        if (bz) { bz.style.flexGrow = z / tot; bt.style.flexGrow = t / tot; br.style.flexGrow = rest / tot; }
        return;
      }
      var j = { price: num('price'), rent: num('rent'), equity: num('equity'), area: num('area'), rate: num('rate'), tilg: num('tilg'),
        mgmt: num('mgmt'), instand: num('instand'), bl: inp('bl').value, gebaeude: num('gebaeude'), afa: num('afa'),
        sonder: inp('sonder').checked, tax: num('tax'), wert: num('wert') };
      var f = sgFull(j);
      out('cashflow', sEur(f.cfNachM)); root.querySelector('[data-out="cashflow"]').classList.toggle('is-neg', Math.round(f.cfNachM) < 0);
      out('brutto', pct(f.brutto)); out('ek', f.ek == null ? 'kein EK' : pct(f.ek));
      out('neben', eur(f.neben)); out('loan', eur(f.loan)); out('rateM', eur(f.rateM));
      out('t_rent', eur(j.rent)); out('t_zins', neg(f.zinsM)); out('t_tilg', neg(f.tilgM)); out('t_kosten', neg(f.kostenM));
      out('t_vor', sEur(f.cfVorM)); out('t_steuer', sEur(f.steuerJ / 12)); out('t_nach', sEur(f.cfNachM));
      out('i_price', eur(j.price)); out('i_nebenPct', '(' + pct(f.nebenPct, 1) + ')'); out('i_neben', eur(f.neben)); out('i_gesamt', eur(f.gesamt));
      out('i_ek', eur(f.ekEff)); out('i_loan', eur(f.loan));
      var p = f.serie[years]; out('c_wert', eur(p.wert)); out('c_rest', eur(p.rest)); out('c_netto', eur(p.netto));
      chart(root.querySelector('[data-chart]'), f.serie, years);
      var sh = root.querySelector('[data-sonder-hint]'); if (sh) sh.hidden = !j.sonder;
    }
    calc();
    var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(calc, 150); });
  }
  function ready(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  ready(function () { document.querySelectorAll('[data-rc]').forEach(init); });
})();
