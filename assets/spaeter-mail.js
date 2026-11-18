/* Link per E-Mail (12.11.2026, n8n-Workflow „Nebenkosten - Link per E-Mail“)
   Wer die Abrechnung gerade nicht zur Hand hat, trägt seine E-Mail-Adresse ein und bekommt den Link zur Vorprüfung.
   Versand über einen n8n-Webhook (data-endpoint am Formular). Ohne Endpunkt (Vorschau) wird nichts verschickt,
   die Seite zeigt nur, wie es aussähe. Optional: eine einzige Erinnerung nach zwei Tagen (Häkchen, Einwilligung).
   Umami: „link_per_mail“ {erinnerung: ja/nein, ergebnis: geoeffnet/angefordert/gesendet/fehler/vorschau, stelle: kopf/upload}. Die Adresse geht nie an Umami. */
(function () {
  'use strict';
  var form = document.getElementById('spaeter-mail');
  if (!form) return;
  var feld = form.querySelector('input[type=email]');
  var haken = form.querySelector('input[name=erinnerung]');
  var knopf = form.querySelector('button[type=submit]');
  var status = document.getElementById('spaeter-mail-status');
  var falle = form.querySelector('input[name=firma]');   /* unsichtbares Feld: nur Bots füllen es aus */
  var ENDPUNKT = form.getAttribute('data-endpoint') || '';
  var GUELTIG = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function zaehle(ergebnis) {
    var d = { erinnerung: haken && haken.checked ? 'ja' : 'nein', ergebnis: ergebnis,
              herkunft: window.NKA_HERKUNFT || 'ohne', fassung: window.NKA_FASSUNG || 'L2',
              stelle: form.dataset.stelle === 'upload' ? 'upload' : 'kopf',
              formular_version: window.NKA_FORMULAR_VERSION || 'ohne' };
    try { if (window.umami && typeof window.umami.track === 'function') window.umami.track('link_per_mail', d); } catch (e) {}
  }
  function zeige(text, fehler) {
    status.textContent = text; status.hidden = false;
    status.classList.toggle('fehler', !!fehler);
  }
  /* 18.11.2026: Das Feld lässt sich oben im Formular oder aus dem Upload-Schritt öffnen (Knopf #kf-spaeter).
     „geoeffnet“ zählt je Stelle einmal; die Stelle gilt, bis das Feld wieder zugeklappt wird. */
  var klapp = document.getElementById('spaeter-klapp');
  var gemeldet = {};
  function stelle() { return form.dataset.stelle === 'upload' ? 'upload' : 'kopf'; }
  function meldeOffen() { var s = stelle(); if (!gemeldet[s]) { gemeldet[s] = true; zaehle('geoeffnet'); } }
  if (klapp) {
    klapp.addEventListener('toggle', function () {
      if (!klapp.open) { delete form.dataset.stelle; return; }
      meldeOffen();
      try { feld.focus({ preventScroll: true }); } catch (e) { feld.focus(); }
    });
    var ausUpload = document.getElementById('kf-spaeter');
    if (ausUpload) {
      ausUpload.addEventListener('click', function () {
        form.dataset.stelle = 'upload';
        if (klapp.open) meldeOffen(); else klapp.open = true;
        /* Feld unter die feste Kopfleiste scrollen (deren Höhe plus etwas Luft). */
        var kopf = document.querySelector('.topbar');
        var y = klapp.getBoundingClientRect().top + window.pageYOffset - ((kopf ? kopf.offsetHeight : 0) + 12);
        try { window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' }); } catch (e) { window.scrollTo(0, Math.max(0, y)); }
      });
    }
  }
  /* Herkunft für den Link in der Mail: aus dem Upload-Schritt mit Zusatz „upload-“ (n8n erlaubt höchstens 20 Zeichen). */
  function herkunftFuerLink() {
    var h = window.NKA_HERKUNFT || 'ohne';
    if (stelle() !== 'upload') return h;
    var u = 'upload-' + h;
    return /^[a-z0-9-]{1,20}$/.test(u) ? u : 'upload';
  }
  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var adresse = (feld.value || '').trim();
    if (!GUELTIG.test(adresse)) { zeige('Bitte prüfen Sie die E-Mail-Adresse.', true); feld.focus(); return; }
    knopf.disabled = true;
    var fertig = function () {
      form.classList.add('erledigt');
      zeige('Der Link ist unterwegs an ' + adresse + '. Schauen Sie auch im Spam-Ordner nach.' +
            (haken && haken.checked ? ' Haben Sie in zwei Tagen noch nicht hochgeladen, erinnere ich Sie einmal.' : ''));
    };
    if (!ENDPUNKT) { zaehle('vorschau'); fertig(); return; }
    zaehle('angefordert');
    fetch(ENDPUNKT, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adresse, erinnerung: !!(haken && haken.checked), herkunft: herkunftFuerLink(),
                             firma: falle ? falle.value : '' }) })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); zaehle('gesendet'); fertig(); })
      .catch(function () {
        zaehle('fehler'); knopf.disabled = false;
        zeige('Das hat leider nicht geklappt. Bitte versuchen Sie es noch einmal oder schreiben Sie an info@nebenkosten-anwalt.de.', true);
      });
  });
})();
