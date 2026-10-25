/* Signum Rechenkern v2: reine Funktionen, ohne DOM. Wird in signum-v2.js eingebettet und per Node getestet. */
var SG_GREST = { BW:5.0, BY:3.5, BE:6.0, BB:6.5, HB:5.5, HH:5.5, HE:6.0, MV:6.0, NI:5.0, NW:6.5, RP:5.0, SL:6.5, SN:5.5, ST:5.0, SH:6.5, TH:5.0 };
var SG_NOTAR = 2.0;          // Notar und Grundbuch, pauschal in % des Kaufpreises
var SG_7B_CAP_M2 = 4000;     // Bemessungsgrundlage § 7b, max. 4.000 €/m² Wohnfläche

/* Annuitätendarlehen: Zins und Tilgung über n Monate exakt fortschreiben */
function sgAmort(loan, ratePct, tilgPct, months) {
  var r = ratePct / 100 / 12;
  var pay = loan * (ratePct + tilgPct) / 100 / 12;   // konstante Monatsrate
  var rest = loan, zins = 0, tilg = 0;
  for (var m = 0; m < months && rest > 0; m++) {
    var zi = rest * r;
    var ti = Math.min(rest, pay - zi);
    zins += zi; tilg += ti; rest -= ti;
  }
  return { rate: pay, zins: zins, tilg: tilg, rest: Math.max(0, rest) };
}

/* Kurzrechner Startseite: Cashflow vor Steuern und vor Bewirtschaftung */
function sgTeaser(i) {
  var loan = Math.max(0, i.price - i.equity);
  var y1 = sgAmort(loan, i.rate, i.tilg, 12);
  var mieteJ = i.rent * 12;
  return {
    loan: loan,
    rateM: y1.rate,
    cashflowM: i.rent - y1.rate,
    brutto: i.price > 0 ? mieteJ / i.price * 100 : 0,
    tilgJ: y1.tilg,
    zinsJ: y1.zins,
    // Eigenkapitalrendite inkl. Tilgung: (Miete minus Zinsen) / Eigenkapital
    ek: i.equity > 0 ? (mieteJ - y1.zins) / i.equity * 100 : null
  };
}

/* Vollrechner Investieren-Seite */
function sgFull(i) {
  var grest = SG_GREST[i.bl] != null ? SG_GREST[i.bl] : 5.0;
  var nebenPct = grest + SG_NOTAR;
  var neben = i.price * nebenPct / 100;
  var gesamt = i.price + neben;
  var loan = Math.max(0, gesamt - i.equity);                // Eigenkapital deckt zuerst die Nebenkosten
  var y1 = sgAmort(loan, i.rate, i.tilg, 12);
  var y10 = sgAmort(loan, i.rate, i.tilg, 120);

  var mieteJ = i.rent * 12;
  var instandM = i.instand * i.area;                         // €/m² und Monat × Wohnfläche
  var kostenJ = (i.mgmt + instandM) * 12;                    // nicht umlagefähige Kosten

  // AfA: nur der Gebäudeanteil inkl. anteiliger Nebenkosten ist abschreibbar
  var afaBasis = gesamt * i.gebaeude / 100;
  var afaRegel = afaBasis * i.afa / 100;                     // linear oder degressiv (Jahr 1)
  var sonderBasis = Math.min(afaBasis, SG_7B_CAP_M2 * i.area);
  var afaSonder = i.sonder ? sonderBasis * 5 / 100 : 0;      // § 7b: 5 % p.a. in Jahr 1 bis 4
  var afaJ = afaRegel + afaSonder;

  // Steuer Jahr 1: Mieteinnahmen minus Werbungskosten (Zinsen, AfA, Bewirtschaftung)
  var ergebnis = mieteJ - y1.zins - afaJ - kostenJ;
  var steuerJ = -ergebnis * i.tax / 100;                     // positiv = Erstattung, negativ = Steuerlast

  var cfVorM = i.rent - y1.rate - instandM - i.mgmt;
  var cfNachM = cfVorM + steuerJ / 12;

  var wert10 = i.price * Math.pow(1 + i.wert / 100, 10);
  var vermoegen10 = wert10 - y10.rest;                       // Eigenkapital in der Immobilie nach 10 Jahren

  return {
    grest: grest, nebenPct: nebenPct, neben: neben, gesamt: gesamt, loan: loan,
    rateM: y1.rate, zinsJ: y1.zins, tilgJ: y1.tilg,
    brutto: i.price > 0 ? mieteJ / i.price * 100 : 0,
    netto: gesamt > 0 ? (mieteJ - kostenJ) / gesamt * 100 : 0,
    afaBasis: afaBasis, afaJ: afaJ, afaSonder: afaSonder,
    steuerJ: steuerJ, cfVorM: cfVorM, cfNachM: cfNachM,
    ek: i.equity > 0 ? (cfNachM * 12 + y1.tilg) / i.equity * 100 : null,
    wert10: wert10, rest10: y10.rest, vermoegen10: vermoegen10
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
