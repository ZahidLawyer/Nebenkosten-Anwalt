/* Einwilligung und Messung des Werbeerfolgs (Google Ads), Stand 28.10.2026.

   Grundsätze
   - Solange KONFIG.googleAdsId leer ist, tut dieses Skript nichts: kein Banner, kein Fußzeilen-Link,
     nichts von Google. Scharf geschaltet wird erst mit der Konto-ID und den beiden Conversion-Labels,
     zusammen mit dem neuen Abschnitt der Datenschutzerklärung.
   - Ohne Einwilligung wird von Google nichts geladen und nichts an Google gesendet
     (kein "erweiterter" Consent Mode, keine cookielosen Pings).
   - Das Banner sehen nur Besucher, die über eine Google-Anzeige kommen (Klick-ID gclid, gbraid oder
     wbraid in der Adresse) und noch nicht entschieden haben. Alle anderen sehen kein Banner.
   - Gemessen werden nur zwei Ereignisse: "Vorprüfung abgeschickt" und "Kauf". Keine Remarketing-Listen,
     keine personalisierte Werbung (ad_personalization bleibt "denied"), keine erweiterten Conversions
     (keine E-Mail-Adressen an Google). Vorgangskennung und Stripe-Sitzung gehen nie im Klartext an
     Google: Die Seitenadresse wird ohne Parameter gemeldet, Transaktionskennungen nur als SHA-256-Wert.
   - Die Entscheidung liegt im localStorage ("nka_einwilligung" = "ja" oder "nein"). Das ist für den
     Dienst unbedingt erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG), damit das Banner nicht bei jedem Aufruf
     erscheint. Widerruf jederzeit über den Link "Einwilligungen" in der Fußzeile.
   - Muss im <head> synchron geladen werden: Es liest die Adresse, bevor pruefung.html sie umschreibt.
   - Schnittstelle für die Seiten: window.nkaMessung('vorpruefung', vorgang) und window.nkaMessung('kauf').
     Ohne Einwilligung tun beide nichts. */
(function () {
  'use strict';

  var KONFIG = {
    googleAdsId: 'AW-18542620852',          /* z. B. 'AW-123456789'; leer = alles aus */
    labelVorpruefung: '0pteCM7e-awdELTh54lF',     /* Conversion-Label "Vorprüfung abgeschickt" */
    labelKauf: 'T2XHCNWP-qwdELTh54lF',            /* Conversion-Label "Kauf" */
    wertKauf: 79.90,
    waehrung: 'EUR'
  };

  var SCHLUESSEL = 'nka_einwilligung';
  var KLICK_IDS = ['gclid', 'gbraid', 'wbraid'];
  var KLICK_OK = /^[A-Za-z0-9_\-]{10,300}$/;
  var aktiv = /^AW-\d{6,}$/.test(KONFIG.googleAdsId);

  /* ---------- Adresse lesen, bevor die Seite sie umschreibt ---------- */
  var params = new URLSearchParams(location.search);
  var klick = {};
  KLICK_IDS.forEach(function (k) {
    var v = params.get(k);
    if (v && KLICK_OK.test(v)) klick[k] = v;
  });
  var hatKlick = Object.keys(klick).length > 0;
  var stripeSitzung = params.get('bezahlt') === '1' ? params.get('session_id') : null;
  if (stripeSitzung && !/^cs_(live|test)_[A-Za-z0-9]{10,300}$/.test(stripeSitzung)) stripeSitzung = null;

  function seitenAdresse() {
    var p = new URLSearchParams();
    KLICK_IDS.forEach(function (k) { if (klick[k]) p.set(k, klick[k]); });
    var rest = p.toString();
    return location.origin + location.pathname + (rest ? '?' + rest : '');
  }
  function herkunft() {
    try { return document.referrer ? new URL(document.referrer).origin + '/' : ''; } catch (e) { return ''; }
  }

  function lesen() { try { return localStorage.getItem(SCHLUESSEL); } catch (e) { return null; } }
  function speichern(w) { try { localStorage.setItem(SCHLUESSEL, w); } catch (e) {} }
  function umami(name) {
    try { if (window.umami && typeof window.umami.track === 'function') window.umami.track(name); } catch (e) {}
  }

  /* ---------- Google erst nach Einwilligung laden ---------- */
  var geladen = false;
  function ladeGoogle() {
    if (!aktiv || geladen) return;
    geladen = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('consent', 'default', {
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'denied',
      analytics_storage: 'denied'
    });
    window.gtag('set', 'allow_ad_personalization_signals', false);
    window.gtag('js', new Date());
    window.gtag('config', KONFIG.googleAdsId, {
      page_location: seitenAdresse(),
      page_referrer: herkunft(),
      allow_enhanced_conversions: false
    });
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(KONFIG.googleAdsId);
    document.head.appendChild(s);
  }

  function googleCookiesLoeschen() {
    var namen = document.cookie.split(';')
      .map(function (c) { return c.split('=')[0].trim(); })
      .filter(function (n) { return /^(_gcl_|_gac_)/.test(n); });
    var teile = location.hostname.split('.');
    var domains = ['', location.hostname];
    if (teile.length >= 2) domains.push('.' + teile.slice(-2).join('.'));
    namen.forEach(function (n) {
      domains.forEach(function (d) {
        document.cookie = n + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + (d ? '; domain=' + d : '');
      });
    });
  }

  /* ---------- Messung ---------- */
  function sha256Hex(text) {
    try {
      if (!window.crypto || !window.crypto.subtle || !window.TextEncoder) return Promise.resolve(null);
      return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (b) {
        return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
      }).catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }
  function melde(label, wert, kennung) {
    var daten = { send_to: KONFIG.googleAdsId + '/' + label };
    if (wert) { daten.value = wert; daten.currency = KONFIG.waehrung; }
    var fertig = kennung ? sha256Hex(kennung) : Promise.resolve(null);
    fertig.then(function (h) {
      if (h) daten.transaction_id = h.slice(0, 40);
      window.gtag('event', 'conversion', daten);
    });
  }
  window.nkaMessung = function (art, vorgang) {
    if (!aktiv || lesen() !== 'ja') return;
    ladeGoogle();
    if (art === 'vorpruefung' && KONFIG.labelVorpruefung) {
      melde(KONFIG.labelVorpruefung, 0, typeof vorgang === 'string' ? 'nka-vorpruefung:' + vorgang : null);
    } else if (art === 'kauf' && KONFIG.labelKauf) {
      melde(KONFIG.labelKauf, KONFIG.wertKauf, stripeSitzung ? 'nka-kauf:' + stripeSitzung : null);
    }
  };

  if (!aktiv) return;
  if (lesen() === 'ja') ladeGoogle();

  /* ---------- Banner ---------- */
  var CSS =
    '.nka-einw{position:fixed;left:1rem;right:1rem;bottom:1rem;z-index:9999;max-width:34rem;margin:0 auto;' +
    'background:#F7F4EE;color:#24312B;border:1px solid #C2B8A3;border-radius:8px;' +
    'box-shadow:0 10px 30px rgba(36,49,43,.18);padding:1.1rem 1.2rem 1rem;' +
    'font-family:"Inter","Avenir Next","Segoe UI",system-ui,sans-serif;font-size:.95rem;line-height:1.5}' +
    '.nka-einw h2{font-family:"Source Serif 4",Georgia,serif;font-size:1.15rem;line-height:1.3;margin:0 2rem .4rem 0;color:#24312B}' +
    '.nka-einw p{margin:0 0 .6rem}' +
    '.nka-einw a{color:#2F5D4C;text-decoration:underline}' +
    '.nka-einw__stand{font-weight:600}' +
    '.nka-einw__knoepfe{display:flex;gap:.6rem;flex-wrap:wrap;margin-top:.8rem}' +
    '.nka-einw__knoepfe button{flex:1 1 9rem;min-height:44px;padding:.55rem 1rem;border-radius:6px;' +
    'border:1px solid #2F5D4C;background:#2F5D4C;color:#fff;font:inherit;font-weight:600;cursor:pointer}' +
    '.nka-einw__knoepfe button:hover{background:#24493C;border-color:#24493C}' +
    '.nka-einw__knoepfe button:focus-visible,.nka-einw__zu:focus-visible,.nka-einw-link:focus-visible{outline:3px solid #B97C3B;outline-offset:2px}' +
    '.nka-einw__zu{position:absolute;top:.5rem;right:.5rem;width:44px;height:44px;border:0;background:none;' +
    'color:#55655D;font-size:1.5rem;line-height:1;cursor:pointer;border-radius:6px}' +
    '.nka-einw-link{background:none;border:0;padding:0;font:inherit;color:inherit;text-decoration:underline;cursor:pointer}' +
    '@media (max-width:480px){.nka-einw{left:0;right:0;bottom:0;border-radius:8px 8px 0 0;border-bottom:0}}';

  var box = null;
  function schliessen() { if (box && box.parentNode) box.parentNode.removeChild(box); box = null; }

  function zeigeBanner(ausFusszeile) {
    schliessen();
    if (!document.getElementById('nka-einw-css')) {
      var st = document.createElement('style');
      st.id = 'nka-einw-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    var stand = lesen();
    box = document.createElement('section');
    box.className = 'nka-einw';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'false');
    box.setAttribute('aria-labelledby', 'nka-einw-titel');
    box.innerHTML =
      '<h2 id="nka-einw-titel">Darf ich messen, ob meine Anzeige wirkt?</h2>' +
      '<p>' + (ausFusszeile ? '' : 'Sie kommen über eine Google-Anzeige. ') +
      'Mit Ihrer Zustimmung meldet diese Seite an Google, ob danach eine Vorprüfung abgeschickt oder ' +
      'eine Prüfung bestellt wird. Dafür setzt Google ein Cookie (Google Ireland Limited, Übermittlung ' +
      'in die USA möglich). Ihre Unterlagen und Ihr Ergebnis erfährt Google nicht.</p>' +
      '<p>Lehnen Sie ab, geht nichts an Google. Ändern können Sie das jederzeit unter „Einwilligungen“ ' +
      'unten auf jeder Seite. <a href="/datenschutz.html#werbemessung">Datenschutzerklärung</a></p>' +
      (ausFusszeile
        ? '<p class="nka-einw__stand">Ihre Einwilligung ist derzeit ' + (stand === 'ja' ? 'erteilt.' : 'nicht erteilt.') + '</p>' +
          '<button type="button" class="nka-einw__zu" aria-label="Schließen">×</button>'
        : '') +
      '<div class="nka-einw__knoepfe">' +
      '<button type="button" data-wahl="nein">' + (ausFusszeile && stand === 'ja' ? 'Widerrufen' : 'Ablehnen') + '</button>' +
      '<button type="button" data-wahl="ja">Zustimmen</button>' +
      '</div>';
    box.addEventListener('click', function (e) {
      var t = e.target;
      if (!(t instanceof Element)) return;
      if (t.classList.contains('nka-einw__zu')) { schliessen(); return; }
      var wahl = t.getAttribute('data-wahl');
      if (wahl === 'ja') {
        speichern('ja');
        umami('einwilligung_ja');
        ladeGoogle();
        schliessen();
      } else if (wahl === 'nein') {
        var vorher = lesen();
        speichern('nein');
        umami(vorher === 'ja' ? 'einwilligung_widerruf' : 'einwilligung_nein');
        if (geladen && typeof window.gtag === 'function') {
          window.gtag('consent', 'update', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
        }
        googleCookiesLoeschen();
        schliessen();
      }
    });
    box.addEventListener('keydown', function (e) {
      if (ausFusszeile && (e.key === 'Escape' || e.key === 'Esc')) schliessen();
    });
    document.body.appendChild(box);
    if (ausFusszeile) {
      var erster = box.querySelector('[data-wahl]');
      if (erster) erster.focus();
    }
  }

  function fusszeilenLink() {
    var listen = document.querySelectorAll('.footer__links');
    Array.prototype.forEach.call(listen, function (ul) {
      if (ul.querySelector('.nka-einw-link')) return;
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'nka-einw-link';
      b.textContent = 'Einwilligungen';
      b.addEventListener('click', function () { zeigeBanner(true); });
      li.appendChild(b);
      ul.appendChild(li);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-einwilligung-oeffnen]'), function (el) {
      el.hidden = false;
      el.addEventListener('click', function (e) { e.preventDefault(); zeigeBanner(true); });
    });
  }

  function start() {
    if (!document.getElementById('nka-einw-css')) {
      var st = document.createElement('style');
      st.id = 'nka-einw-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    fusszeilenLink();
    var stand = lesen();
    if (hatKlick && stand !== 'ja' && stand !== 'nein') zeigeBanner(false);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
