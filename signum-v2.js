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
      var bars = $$('.kq__bars i', s);
      function go(n) { i = (n + slides.length) % slides.length; slides.forEach(function (x, k) { x.classList.toggle('on', k === i); }); if (cnt) cnt.textContent = String(i + 1).padStart(2, '0');
        bars.forEach(function (b, k) { b.classList.remove('on'); b.classList.toggle('done', k < i); void b.offsetWidth; if (k === i) b.classList.add('on'); }); }
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



    /* Mobile Handlungsleiste */
    if (!document.querySelector('.sg-bar')) {
      var bar = document.createElement('div'); bar.className = 'sg-bar';
      bar.innerHTML = '<a href="tel:+4953131057760"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>Anrufen</a><a href="' + (document.getElementById('kontakt') ? '#kontakt' : '/#kontakt') + '">Erstgespräch vereinbaren</a>';
      document.body.appendChild(bar);
      var hide = $$('#kontakt, .footer, .xcta');
      var ub = function () {
        var past = window.scrollY > window.innerHeight * 0.6, near = hide.some(function (e) { var r = e.getBoundingClientRect(); return r.top < window.innerHeight && r.bottom > 0; });
        bar.classList.toggle('on', past && !near);
      };
      window.addEventListener('scroll', ub, { passive: true }); ub();
    }

    /* Rechnerwerte ins Kontaktformular übernehmen */
    try {
      var q = new URLSearchParams(location.search).get('berechnung');
      var ta = document.querySelector('#kontaktForm:not([data-funnel]) textarea[name="nachricht"]');
      if (q && ta) {
        ta.value = 'Meine Berechnung: ' + q + '\n\nBitte prüfen Sie diese Rechnung mit mir.';
        var sel = document.querySelector('#kontaktForm select[name="interesse"]'); if (sel) sel.value = 'Kapitalanlage Immobilie';
      }
    } catch (e) {}


    /* Track Record Punkte und Bauzeitenplan */
    $$('[data-dots]').forEach(function (sec) {
      var dots = $$('.tr__dots i', sec), done = false;
      function fill() { if (done) return; done = true; dots.forEach(function (d, k) { setTimeout(function () { d.classList.add('on'); }, reduce ? 0 : k * 9); }); }
      if (!('IntersectionObserver' in window)) return fill();
      new IntersectionObserver(function (es, o) { es.forEach(function (e) { if (e.isIntersecting) { fill(); o.disconnect(); } }); }, { threshold: .35 }).observe(sec);
    });
    $$('.gw').forEach(function (sec) {
      if (!('IntersectionObserver' in window)) return sec.classList.add('in');
      new IntersectionObserver(function (es, o) { es.forEach(function (e) { if (e.isIntersecting) { sec.classList.add('in'); o.disconnect(); } }); }, { threshold: .2 }).observe(sec.querySelector('.gw__plan'));
    });

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

/* Anfrage-Fragebogen: eine Frage pro Schritt */
(function () {
  [].slice.call(document.querySelectorAll('form[data-funnel]')).forEach(function (f) {
  var steps = [].slice.call(f.querySelectorAll('.fx__step'));
  var byId = {}; steps.forEach(function (s) { byId[s.getAttribute('data-step')] = s; });
  var bar = f.querySelector('.fx__prog i'), hist = [], cur = steps[0];
  var LABELS = { anbieter_rolle: 'Anbieter', baujahr: 'Baujahr', preisvorstellung: 'Preisvorstellung', expose_link: 'Exposé', firma: 'Firma', interesse: 'Anliegen', ziel: 'Ziel', objekt: 'Objektart', wohnsitz: 'Aufenthaltsstatus', beruf: 'Beruf', probezeit: 'Probezeit bestanden', selbstaendig_2_jahre: 'Mindestens 2 Jahre selbständig', einkommen: 'Nettoeinkommen', eigenkapital: 'Eigenkapital', gemeinsam: 'Allein oder gemeinsam', zeithorizont: 'Zeitpunkt', aufmerksam: 'Aufmerksam geworden über', verkauf_objekt: 'Verkauf: Objektart', verkauf_ort: 'Verkauf: Lage', verkauf_umfang: 'Verkauf: Umfang', anfrage: 'Anfrage', erreichbarkeit: 'Beste Erreichbarkeit', berechnung: 'Berechnung aus dem Rechner', objekt_anfrage: 'Exposé angefragt für', nachricht_kunde: 'Nachricht' };
  function path() { var ids = hist.map(function (s) { return s; }).concat([cur]); return ids; }
  function summary() {
    var seen = {}, lines = [];
    path().forEach(function (s) { [].slice.call(s.querySelectorAll('input,textarea,select')).forEach(function (el) {
      var n = el.name; if (!n || !LABELS[n] || seen[n]) return;
      if ((el.type === 'radio' || el.type === 'checkbox') && !el.checked) return;
      var v = (el.value || '').trim(); if (!v) return; seen[n] = 1; lines.push(LABELS[n] + ': ' + v);
    }); });
    var bz = f.querySelector('[name="berechnung"]'); if (bz && bz.value && !seen.berechnung) lines.push(LABELS.berechnung + ': ' + bz.value);
    var oa = f.querySelector('[name="objekt_anfrage"]'); if (oa && oa.value) lines.unshift(LABELS.objekt_anfrage + ': ' + oa.value);
    f.querySelector('[name="nachricht"]').value = lines.join('\n');
  }
  function show(s, back) {
    cur.hidden = true; s.hidden = false; cur = s;
    if (bar) bar.style.transform = 'scaleX(' + (parseInt(s.getAttribute('data-p'), 10) || 0) / 100 + ')';
    s.classList.remove('fx-in', 'fx-back'); void s.offsetWidth; s.classList.add(back ? 'fx-back' : 'fx-in');
    var r = f.getBoundingClientRect(); if (r.top < 80 && document.activeElement && f.contains(document.activeElement)) window.scrollTo({ top: window.scrollY + r.top - 100, behavior: 'smooth' });
    var first = s.querySelector('input:not([type=radio]):not([type=hidden]),textarea'); if (first && !back) setTimeout(function () { try { first.focus({ preventScroll: true }); } catch (e) {} }, 350);
    steps.forEach(function (st) { st.disabled = !(st === cur || hist.indexOf(st) > -1); });
    summary();
  }
  function go(id) { var s = byId[id]; if (!s) return; hist.push(cur); show(s); }
  function valid(s) {
    var ok = true;
    [].slice.call(s.querySelectorAll('[data-req]')).forEach(function (el) { var bad = !el.value.trim(); el.classList.toggle('is-bad', bad); if (bad && ok) { ok = false; el.focus(); } });
    return ok;
  }
  function nextOf(s) {
    var chk = s.querySelector('input[type=radio]:checked'); if (chk) return chk.getAttribute('data-next');
    if (s.getAttribute('data-default')) return s.getAttribute('data-default');
    var id = s.getAttribute('data-step'); return { vk_ort: 'kontakt', sonst: 'kontakt' }[id];
  }
  f.addEventListener('change', function (e) {
    var el = e.target; summary();
  });
  f.addEventListener('input', summary);
  f.addEventListener('click', function (e) {
    var ri = e.target.matches && e.target.matches('.fx__opt input[type=radio]') ? e.target : null;
    if (ri) { var st = ri.closest('.fx__step'); setTimeout(function () { if (cur === st && ri.checked) go(ri.getAttribute('data-next')); }, 260); return; }
    var b = e.target.closest('[data-back]'); if (b) { e.preventDefault(); if (hist.length) show(hist.pop(), true); return; }
    var n = e.target.closest('[data-next-btn]'); if (n) { e.preventDefault(); if (valid(cur)) go(nextOf(cur)); }
  });
  f.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || e.target.tagName === 'TEXTAREA') return;
    if (cur.getAttribute('data-step') !== 'kontakt') { e.preventDefault(); var n = cur.querySelector('[data-next-btn]'); if (n) n.click(); }
  });
  /* Werte aus dem Renditerechner übernehmen */
  if (f.id === 'kontaktForm') try {
    var q = new URLSearchParams(location.search).get('berechnung');
    var OBJ = { pankow: ['Damerowstraße 21, Berlin Pankow', 'Neubau'], erikaweg: ['Erikaweg 21, Braunschweig', 'Neubau'], magdeburg: ['Rothenseer Straße 3, Magdeburg', 'Bestand'], halle: ['Landsberger Straße 58, Halle (Saale)', 'Bestand'] };
    var ob = OBJ[new URLSearchParams(location.search).get('objekt')];
    if (ob) {
      f.querySelector('[name="objekt_anfrage"]').value = ob[0];
      var r1 = f.querySelector('input[name="interesse"][value="Kapitalanlage Immobilie"]'), r2 = f.querySelector('input[name="objekt"][value="' + ob[1] + '"]');
      if (r1) r1.checked = true; if (r2) r2.checked = true;
      hist.push(cur); show(byId.ziel);
      var t = f.querySelector('.fx__top .fx__time'); if (t) t.textContent = 'Exposé: ' + ob[0];
    }
    if (q) { f.querySelector('[name="berechnung"]').value = q; var r = f.querySelector('input[name="interesse"][value="Kapitalanlage Immobilie"]'); if (r) { r.checked = true; hist.push(cur); show(byId.ziel); } }
  } catch (e) {}
  steps.forEach(function (st) { st.disabled = st !== cur && hist.indexOf(st) < 0; });
  summary();
  });
})();

/* Messung, Herkunft der Anfrage und Terminbuchung */
(function () {
  var CFG = window.SG_CFG || {};
  var PIXEL = CFG.pixel || '';          /* Meta Pixel ID */
  var HS = CFG.hubspot || '146550668';  /* HubSpot Portal fuer Seitenaufrufe am Kontakt */
  var MEET = CFG.meeting || '';         /* HubSpot Terminlink, z. B. https://meetings-eu1.hubspot.com/name */
  var KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'];

  /* Herkunft merken: erster Besuch mit Kampagnenparametern gewinnt bis zur naechsten Kampagne */
  var attr = {};
  try {
    attr = JSON.parse(localStorage.getItem('sg_attr') || '{}');
    var q = new URLSearchParams(location.search);
    if (KEYS.some(function (k) { return q.get(k); })) { attr = {}; KEYS.forEach(function (k) { if (q.get(k)) attr[k] = q.get(k); }); attr.einstieg = location.pathname; }
    if (!attr.einstieg) attr.einstieg = location.pathname;
    if (!attr.referrer && document.referrer && document.referrer.indexOf(location.host) < 0) attr.referrer = document.referrer.split('?')[0];
    localStorage.setItem('sg_attr', JSON.stringify(attr));
  } catch (e) {}
  function stamp(form) {
    var data = { seite: location.pathname };
    KEYS.concat(['einstieg', 'referrer']).forEach(function (k) { if (attr[k]) data[k] = attr[k]; });
    if (!form.querySelector('[name="event_id"]')) data.event_id = 'sg' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    Object.keys(data).forEach(function (k) {
      var el = form.querySelector('input[name="' + k + '"]');
      if (!el) { el = document.createElement('input'); el.type = 'hidden'; el.name = k; form.appendChild(el); }
      el.value = data[k];
    });
  }
  var forms = [].slice.call(document.querySelectorAll('form[data-funnel]'));
  forms.forEach(function (f) { f.setAttribute('data-hs-do-not-collect', 'true'); stamp(f); });

  /* Einwilligung ueber Cookiebot */
  function ok(kind) { var c = window.Cookiebot && window.Cookiebot.consent; return !!(c && c[kind]); }
  var pixelOn = false, hsOn = false;
  function loadPixel() {
    if (pixelOn || !PIXEL || !ok('marketing')) return; pixelOn = true;
    !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', PIXEL); window.fbq('track', 'PageView');
  }
  function loadHS() {
    if (hsOn || !HS || !(ok('statistics') || ok('marketing'))) return; hsOn = true;
    var s = document.createElement('script'); s.id = 'hs-script-loader'; s.async = true; s.defer = true; s.src = 'https://js-eu1.hs-scripts.com/' + HS + '.js'; document.body.appendChild(s);
  }
  function init() { loadPixel(); loadHS(); }
  window.addEventListener('CookiebotOnAccept', init); window.addEventListener('CookiebotOnConsentReady', init); init();

  /* Lead Ereignis beim Absenden */
  document.addEventListener('submit', function (e) {
    var f = e.target; if (!f.matches || !f.matches('form[data-funnel]')) return;
    stamp(f);
    if (!f.checkValidity()) return;
    var id = (f.querySelector('[name="event_id"]') || {}).value;
    var it = f.querySelector('[name="interesse"]:checked') || f.querySelector('[name="interesse"]');
    if (window.fbq && pixelOn) window.fbq('track', 'Lead', { content_name: it ? it.value : 'Anfrage' }, { eventID: id });
    if (window._hsq) window._hsq.push(['trackCustomBehavioralEvent', { name: 'website_anfrage' }]);
  }, true);

  /* Termin direkt buchen nach dem Fragebogen */
  var danke = document.getElementById('kontaktDanke'), box = document.getElementById('fxTermin');
  if (danke && box && MEET) {
    new MutationObserver(function () {
      if (danke.style.display === 'none' || box.dataset.done) return;
      var f = document.querySelector('form[data-funnel]'); if (!f) return;
      var it = f.querySelector('[name="interesse"]:checked');
      if (it && it.value !== 'Kapitalanlage Immobilie') return;
      box.dataset.done = '1';
      var v = function (n) { var el = f.querySelector('[name="' + n + '"]'); return el ? encodeURIComponent(el.value) : ''; };
      var src = MEET + (MEET.indexOf('?') < 0 ? '?' : '&') + 'embed=true&firstName=' + v('vorname') + '&lastName=' + v('nachname') + '&email=' + v('email');
      box.innerHTML = '<p class="fxt__lead">Wenn Sie möchten, wählen Sie jetzt direkt einen Termin für Ihr Erstgespräch:</p><div class="meetings-iframe-container" data-src="' + src + '"></div>';
      box.hidden = false;
      var s = document.createElement('script'); s.src = 'https://static.hsappstatic.net/MeetingsEmbed/ex/MeetingsEmbedCode.js'; document.body.appendChild(s);
    }).observe(danke, { attributes: true, attributeFilter: ['style'] });
  }
})();

/* Navigation: Untermenue per Klick und Tastatur */
(function () {
  [].slice.call(document.querySelectorAll('.nav__has-sub')).forEach(function (li) {
    var b = li.querySelector('.nav__sub-btn');
    b.addEventListener('click', function (e) { e.stopPropagation(); var o = li.classList.toggle('open'); b.setAttribute('aria-expanded', o ? 'true' : 'false'); });
    li.addEventListener('keydown', function (e) { if (e.key === 'Escape') { li.classList.remove('open'); b.setAttribute('aria-expanded', 'false'); b.focus(); } });
  });
  document.addEventListener('click', function () { [].slice.call(document.querySelectorAll('.nav__has-sub.open')).forEach(function (li) { li.classList.remove('open'); li.querySelector('.nav__sub-btn').setAttribute('aria-expanded', 'false'); }); });
})();

/* Versand fuer Formulare mit eigenem Webhook */
(function () {
  [].slice.call(document.querySelectorAll('form[data-webhook]')).forEach(function (f) {
    f.addEventListener('submit', function (e) {
      e.preventDefault(); if (!f.checkValidity()) { f.reportValidity(); return; }
      var btn = f.querySelector('button[type=submit]'); if (btn) { btn.disabled = true; btn.textContent = 'Wird gesendet \u2026'; }
      var data = new URLSearchParams(new FormData(f)); data.append('quelle', f.getAttribute('data-quelle') || 'Website');
      function done() { f.hidden = true; var d = document.getElementById(f.getAttribute('data-danke')); if (d) { d.hidden = false; d.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }
      fetch(f.getAttribute('data-webhook'), { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: data.toString() }).then(done).catch(done);
    });
  });
})();

/* Ratgeber: aktiver Abschnitt im Inhaltsverzeichnis */
(function () {
  var toc = document.querySelector('.rgx__toc'); if (!toc || !('IntersectionObserver' in window)) return;
  var links = [].slice.call(toc.querySelectorAll('a[href^="#"]')), map = {};
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (!e.isIntersecting || !map[e.target.id]) return; links.forEach(function (a) { a.classList.remove('on'); }); map[e.target.id].classList.add('on'); });
  }, { rootMargin: '-20% 0px -70% 0px' });
  links.forEach(function (a) { var h = document.getElementById(a.getAttribute('href').slice(1)); if (h) { map[h.id] = a; io.observe(h); } });
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
      root._j = j; root._f = f; if (root._cmp) root._cmp();
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
      var cta = root.querySelector('.rc__cta');
      if (cta) cta.href = '/?berechnung=' + encodeURIComponent('Kaufpreis ' + eur(j.price) + ', Kaltmiete ' + eur(j.rent) + ', Eigenkapital ' + eur(j.equity) + ', Zins ' + pct(j.rate, 1) + ', Tilgung ' + pct(j.tilg, 1) + ', Cashflow nach Steuern ' + sEur(f.cfNachM) + ' pro Monat') + '#kontakt';
    }
    /* Vergleich Neubau und Bestand */
    var cmpBox = root.querySelector('[data-cmp]'), cmpBtn = root.querySelector('[data-cmp-open]');
    if (cmpBox && cmpBtn) {
      var SZ = [{ afa: 2, sonder: false }, { afa: 4, sonder: false }, { afa: 5, sonder: true }];
      root._cmp = function () {
        if (cmpBox.hidden || !root._j) return;
        var rs = SZ.map(function (z) { var x = {}; for (var k in root._j) x[k] = root._j[k]; x.afa = z.afa; x.sonder = z.sonder; return sgFull(x); });
        var best = function (key) { var m = Math.max.apply(null, rs.map(function (r) { return r[key] == null ? -1e12 : r[key]; })); return rs.map(function (r) { return r[key] === m; }); };
        var rows = [['Abschreibung im ersten Jahr', 'afaJ', eur], ['Steuereffekt pro Monat', 'steuerJ', function (v) { return sEur(v / 12); }], ['Cashflow nach Steuern pro Monat', 'cfNachM', sEur], ['Eigenkapitalrendite', 'ek', function (v) { return v == null ? 'kein EK' : pct(v); }]];
        cmpBox.querySelector('[data-cmp-body]').innerHTML = rows.map(function (r) { var b = best(r[1]); return '<tr><th scope="row">' + r[0] + '</th>' + rs.map(function (x, i) { return '<td' + (b[i] ? ' class="is-best"' : '') + '>' + r[2](x[r[1]]) + '</td>'; }).join('') + '</tr>'; }).join('');
      };
      cmpBtn.addEventListener('click', function () { cmpBox.hidden = !cmpBox.hidden; cmpBtn.setAttribute('aria-expanded', !cmpBox.hidden); root._cmp(); });
    }
    /* Ergebnis als PDF */
    var pdfForm = root.querySelector('[data-pdf]'), pdfBtn = root.querySelector('[data-pdf-open]');
    if (pdfForm && pdfBtn) {
      pdfBtn.addEventListener('click', function () { pdfForm.hidden = !pdfForm.hidden; pdfBtn.setAttribute('aria-expanded', !pdfForm.hidden); if (!pdfForm.hidden) pdfForm.querySelector('input').focus(); });
      function loadPdf(cb) { if (window.jspdf) return cb(); var sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'; sc.onload = cb; document.head.appendChild(sc); }
      function makePdf(name) {
        var j = root._j, f = root._f, doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' }), y = 20;
        var W = 210, L = 20, R = 190; var _t = doc.text.bind(doc); doc.text = function (t) { var a = [].slice.call(arguments); var fx = function (x) { return String(x).replace(/\u2212/g, '-').replace(/\u202f|\u00a0/g, ' '); }; a[0] = Array.isArray(t) ? t.map(fx) : fx(t); return _t.apply(null, a); };
        doc.setFillColor(20, 20, 20); doc.rect(0, 0, W, 34, 'F');
        doc.setTextColor(242, 172, 60); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text('SIGNUM REAL ESTATE', L, 14);
        doc.setTextColor(247, 244, 237); doc.setFontSize(18); doc.text('Ihre Renditeberechnung', L, 25);
        doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.text('Erstellt am ' + new Date().toLocaleDateString('de-DE') + (name ? ' für ' + name : ''), R, 25, { align: 'right' });
        y = 48; doc.setTextColor(20, 20, 20);
        function head(t) { doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(176, 141, 87); doc.text(t.toUpperCase(), L, y); y += 3; doc.setDrawColor(220, 214, 204); doc.line(L, y, R, y); y += 7; doc.setTextColor(20, 20, 20); }
        function row(a, b, bold) { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(10); doc.text(a, L, y); doc.text(b, R, y, { align: 'right' }); y += 6; }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(28); doc.text(sEur(f.cfNachM), L, y + 4);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(107, 104, 99); doc.text('Cashflow nach Steuern pro Monat im ersten Jahr', L, y + 11);
        doc.text('Bruttomietrendite ' + pct(f.brutto) + '   |   Eigenkapitalrendite ' + (f.ek == null ? 'kein EK' : pct(f.ek)), L, y + 17); y += 30; doc.setTextColor(20, 20, 20);
        head('Ihre Annahmen');
        row('Kaufpreis', eur(j.price)); row('Wohnfläche', fmtIn(j.area, 0) + ' m²'); row('Kaltmiete pro Monat', eur(j.rent)); row('Eigenkapital', eur(j.equity));
        row('Sollzins / anfängliche Tilgung', pct(j.rate, 2) + ' / ' + pct(j.tilg, 2)); row('Abschreibung', pct(j.afa, 1) + ' auf ' + pct(j.gebaeude, 0) + ' Gebäudeanteil' + (j.sonder ? ' plus Sonder-AfA § 7b' : ''));
        row('Grenzsteuersatz / Wertentwicklung', pct(j.tax, 0) + ' / ' + pct(j.wert, 1) + ' p. a.'); y += 3;
        head('Investition');
        row('Kaufpreis', eur(j.price)); row('Kaufnebenkosten (' + pct(f.nebenPct, 1) + ')', eur(f.neben)); row('Gesamtkosten', eur(f.gesamt), true); row('Darlehen', eur(f.loan)); row('Monatliche Rate', eur(f.rateM)); y += 3;
        head('Monatliche Rechnung im ersten Jahr');
        row('Kaltmiete', eur(j.rent)); row('Zinsen', neg(f.zinsM)); row('Tilgung', neg(f.tilgM)); row('Verwaltung und Instandhaltung', neg(f.kostenM));
        row('Überschuss vor Steuern', sEur(f.cfVorM), true); row('Steuereffekt', sEur(f.steuerJ / 12)); row('Cashflow nach Steuern', sEur(f.cfNachM), true); y += 3;
        head('Vermögen in der Immobilie');
        [10, 20, 30].forEach(function (t) { var p = f.serie[t]; row('Nach ' + t + ' Jahren (Wert ' + eur(p.wert) + ', Restschuld ' + eur(p.rest) + ')', eur(p.netto)); });
        y += 6; doc.setFontSize(8); doc.setTextColor(107, 104, 99);
        doc.text(doc.splitTextToSize('Vereinfachte Modellrechnung ohne Mietsteigerung, Leerstand, Kirchensteuer und Solidaritätszuschlag. Keine Anlageberatung und keine Steuerberatung. Sonderabschreibung und Förderung hängen von den Voraussetzungen im Einzelfall ab.', R - L), L, y);
        doc.setFillColor(247, 244, 237); doc.rect(0, 280, W, 17, 'F'); doc.setTextColor(20, 20, 20); doc.setFontSize(8.5);
        doc.text('Signum Real Estate GmbH  |  Am Alten Bahnhof 13, 38122 Braunschweig', L, 287); doc.text('+49 531 31057760  |  info@signum-realestate.com  |  signum-realestate.com', L, 292);
        doc.save('Signum-Renditeberechnung.pdf');
      }
      pdfForm.addEventListener('submit', function (e) {
        e.preventDefault(); if (!pdfForm.checkValidity()) { pdfForm.reportValidity(); return; }
        var j = root._j, f = root._f, name = pdfForm.vorname.value.trim();
        var sum = 'Kaufpreis ' + eur(j.price) + ', Kaltmiete ' + eur(j.rent) + ', Eigenkapital ' + eur(j.equity) + ', Zins ' + pct(j.rate, 1) + ', Tilgung ' + pct(j.tilg, 1) + ', Cashflow nach Steuern ' + sEur(f.cfNachM) + ' pro Monat';
        var d = new URLSearchParams({ vorname: name, email: pdfForm.email.value.trim(), datenschutz: 'akzeptiert', interesse: 'Kapitalanlage Immobilie', berechnung: sum, nachricht: 'PDF aus dem Renditerechner angefordert\nBerechnung: ' + sum, seite: location.pathname, quelle: 'Website Rechner PDF' });
        try { var at = JSON.parse(localStorage.getItem('sg_attr') || '{}'); for (var k in at) d.append(k, at[k]); } catch (x) {}
        fetch('https://hooks.zapier.com/hooks/catch/24642695/43b965c/', { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: d.toString() }).catch(function () {});
        if (window.fbq) window.fbq('track', 'Lead', { content_name: 'Rechner PDF' });
        loadPdf(function () { makePdf(name); var ok = pdfForm.querySelector('.rc__pdfok'); if (ok) ok.hidden = false; });
      });
    }
    calc();
    var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(calc, 150); });
  }
  function ready(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  ready(function () { document.querySelectorAll('[data-rc]').forEach(init); });
})();
