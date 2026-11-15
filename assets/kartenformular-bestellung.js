/* Bestellformular mit Preiswahl auf der Ergebnisseite (15.11.2026, statt Tally-Formular 2).
   Zwei Pakete (agent-service app/pakete.py): mit Schreiben an den Vermieter 79,90 € (vorausgewählt, Entscheidung
   Zahid) und ohne Schreiben 59,90 €. Das Formular schickt Paket, E-Mail, freiwillig das Zugangsdatum und die beiden
   Erklärungen an POST /vorpruefung/bestellen (app/bestellformular.py, Wortlaut dort je Fassung); danach geht es zum
   Stripe-Zahlungslink des Pakets, die Vorgangskennung als client_reference_id. Zahlungspflichtig bestellt wird erst
   mit „Zahlen“ bei Stripe. Aktiv nur mit <html class="karten">; sonst bleibt Tally-Formular 2. */
(function () {
  'use strict';
  if (!document.documentElement.classList.contains('karten')) return;
  var form = document.getElementById('kf-bestellung');
  if (!form) return;
  var GUELTIG = /^[a-f0-9]{32}$/;
  var EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
  var STRIPE = /^https:\/\/buy\.stripe\.com\/[A-Za-z0-9]+$/;
  var PAKETE = {
    mit_schreiben: {
      name: 'Prüfung mit Schreiben an Ihren Vermieter', preis: '79,90 Euro', kurz: '79,90 €',
      leistung: 'anwaltliche Prüfung Ihrer Nebenkostenabrechnung durch Rechtsanwalt Zahid Akcay: Rechtseinschätzung ' +
        'an Sie und der Entwurf eines Schreibens an Ihren Vermieter, das Sie selbst absenden (lohnt sich kein ' +
        'Widerspruch, verlangen Sie damit Einsicht in die Abrechnungsbelege); Rückfragen per E-Mail 14 Tage.'
    },
    ohne_schreiben: {
      name: 'Prüfung ohne Schreiben an Ihren Vermieter', preis: '59,90 Euro', kurz: '59,90 €',
      leistung: 'anwaltliche Prüfung Ihrer Nebenkostenabrechnung durch Rechtsanwalt Zahid Akcay: Rechtseinschätzung ' +
        'an Sie, ohne Schreiben an Ihren Vermieter; Rückfragen per E-Mail 14 Tage.'
    }
  };
  var q = new URLSearchParams(location.search);
  var vorgang = q.get('vorgang') || '';
  if (!GUELTIG.test(vorgang)) { try { vorgang = sessionStorage.getItem('vorgang') || ''; } catch (e) { vorgang = ''; } }
  var quelle = null;
  try { quelle = sessionStorage.getItem('quelle'); } catch (e) { quelle = null; }
  var emailFeld = document.getElementById('kf-b-email');
  try { var em = sessionStorage.getItem('nka_email'); if (em && !emailFeld.value) emailFeld.value = em; } catch (e) {}
  var knopf = document.getElementById('kf-b-senden');
  var fehler = document.getElementById('kf-b-fehler');
  var sendet = false;

  function zaehle(name, daten) {
    var d = daten || {};
    d.formular = 'karten';
    d.herkunft = window.NKA_HERKUNFT || (quelle ? quelle.split('-')[0] : 'ohne');
    if (window.umami && typeof window.umami.track === 'function') { try { window.umami.track(name, d); } catch (e) {} }
  }
  function gewaehlt() {
    var r = form.querySelector('input[name="paket"]:checked');
    return r && PAKETE[r.value] ? r.value : 'mit_schreiben';
  }
  function zeige() {
    var p = gewaehlt(), info = PAKETE[p];
    Array.prototype.forEach.call(form.querySelectorAll('.kf__paket'), function (k) {
      k.classList.toggle('is-gewaehlt', k.querySelector('input').checked);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-paket-name]'), function (el) { el.textContent = info.name; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-paket-preis]'), function (el) { el.textContent = info.preis; });
    var leistung = document.getElementById('bestell-leistung');
    if (leistung) leistung.textContent = info.leistung;
    var preis = document.getElementById('bestell-preis');
    if (preis) preis.textContent = info.preis + ' einmalig, Endpreis einschließlich Umsatzsteuer, kein Abo.';
    knopf.textContent = 'Weiter zur Bezahlung, ' + info.kurz;
  }
  Array.prototype.forEach.call(form.querySelectorAll('input[name="paket"]'), function (r) {
    r.addEventListener('change', function () { zeige(); zaehle('paket_gewaehlt', { paket: r.value }); });
  });
  zeige();

  function zeigeFehler(t) { fehler.textContent = t || ''; fehler.hidden = !t; }
  function meldung(st, a) {
    var feld = a && a.feld;
    if (st === 422 && feld === 'email') return 'Bitte prüfen Sie Ihre E-Mail-Adresse.';
    if (st === 422 && feld === 'vorgang') return 'Zu diesem Ergebnis finde ich keine Unterlagen mehr. Bitte starten Sie die Vorprüfung neu.';
    if (st === 422) return 'Bitte setzen Sie beide Häkchen, dann geht es weiter zur Bezahlung.';
    if (st === 429) return 'Gerade kamen zu viele Versuche von Ihrem Anschluss. Bitte versuchen Sie es später noch einmal.';
    return 'Das hat nicht geklappt. Bitte prüfen Sie Ihre Verbindung und tippen Sie noch einmal auf „Weiter zur Bezahlung“.';
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (sendet) return;
    zeigeFehler('');
    var paket = gewaehlt();
    var link = form.getAttribute('data-link-' + paket) || '';
    var email = String(emailFeld.value || '').trim();
    if (!GUELTIG.test(vorgang)) { zeigeFehler(meldung(422, { feld: 'vorgang' })); return; }
    if (!STRIPE.test(link)) { zeigeFehler('Dieses Paket kann gerade nicht bestellt werden. Bitte schreiben Sie mir an info@nebenkosten-anwalt.de.'); return; }
    if (!EMAIL.test(email)) { zeigeFehler(meldung(422, { feld: 'email' })); emailFeld.focus(); return; }
    if (!document.getElementById('kf-b-bestellung').checked || !document.getElementById('kf-b-sofort').checked) {
      zeigeFehler(meldung(422, {})); return;
    }
    var daten = new FormData();
    daten.append('angaben', JSON.stringify({
      vorgang: vorgang, paket: paket, email: email, bestellung: true, vorzeitiger_beginn: true,
      zugang_datum: document.getElementById('kf-b-zugang').value || null, quelle: quelle,
      firma: String(document.getElementById('kf-b-firma').value || '')
    }));
    sendet = true; knopf.disabled = true; knopf.textContent = 'Einen Moment …';
    fetch(form.getAttribute('data-endpoint'), { method: 'POST', body: daten, cache: 'no-store' })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (a) { return { st: r.status, a: a }; }); })
      .then(function (x) {
        if (x.st !== 200 || !x.a || x.a.status !== 'vorgemerkt') throw x;
        try { sessionStorage.setItem('bezahl_vorgang', vorgang); sessionStorage.setItem('nka_email', email); } catch (e) {}
        var ziel = link + '?client_reference_id=' + vorgang + '&locale=de&prefilled_email=' + encodeURIComponent(email);
        var box = document.getElementById('bezahl-weiter');
        if (box) { document.getElementById('bezahl-link').href = ziel; box.hidden = false; }
        zaehle('weiter_zur_zahlung', { paket: paket });
        window.setTimeout(function () { window.location.href = ziel; }, 600);
      })
      .catch(function (x) {
        sendet = false; knopf.disabled = false; zeige();
        var st = x && typeof x.st === 'number' ? x.st : 0;
        zeigeFehler(meldung(st, x && x.a));
        zaehle('kartenformular_fehler', { grund: String(st || 'netz'), stelle: 'bestellung' });
      });
  });
})();
