/* „Link für später" (Freigabe Zahid ausstehend, Vorschau 30.10.2026)
   Wer seine Unterlagen gerade nicht zur Hand hat, schickt sich den Link zur Vorprüfung selbst:
   - Handy und Tablet (grober Zeiger) mit Teilen-Funktion: Teilen-Menü des Geräts (Mail, Notizen, Erinnerungen, Messenger).
   - sonst: E-Mail-Entwurf im eigenen Mailprogramm (mailto), ohne Empfänger.
   Es wird nichts an den Server geschickt und nichts im Browser gespeichert; diese Seite erfährt keine E-Mail-Adresse.
   Der Link trägt ?quelle=spaeter (bzw. spaeter-<Herkunft>), damit die Rückkehr über den gespeicherten Link in der
   Reichweitenmessung und im versteckten Tally-Feld „quelle" erkennbar ist. Die Klick-ID einer Anzeige geht nie mit.
   Umami-Ereignis „link_fuer_spaeter" mit Stelle, Weg (teilen, abgebrochen, mail) und Herkunft; Herkunft liefert die
   Seite über window.NKA_HERKUNFT (index.html, pruefung.html), sonst „ohne". */
(function () {
  'use strict';
  var OK = /^[a-z0-9-]{1,32}$/;
  var BASIS = 'https://nebenkosten-anwalt.de/pruefung.html';

  function herkunft() {
    var h = window.NKA_HERKUNFT;
    return OK.test(h || '') ? h : 'ohne';
  }
  function linkFuerSpaeter() {
    var h = herkunft();
    var q;
    if (h === 'ohne') q = 'spaeter';
    else if (h.indexOf('spaeter') === 0) q = h;          /* schon über einen gespeicherten Link gekommen */
    else q = ('spaeter-' + h).slice(0, 32);              /* z. B. spaeter-anzeige, spaeter-flyer-f1 */
    return BASIS + '?quelle=' + q;
  }
  function zaehle(stelle, weg) {
    var d = { stelle: stelle, weg: weg, herkunft: herkunft() };
    try { if (window.umami && typeof window.umami.track === 'function') window.umami.track('link_fuer_spaeter', d); } catch (e) {}
  }
  function grob() {
    try { return window.matchMedia('(pointer: coarse)').matches; } catch (e) { return false; }
  }

  var BETREFF = 'Nebenkostenabrechnung prüfen lassen';
  var TEXT = 'Kostenlose Vorprüfung meiner Nebenkostenabrechnung, sobald ich Abrechnung und Mietvertrag zur Hand habe:';

  function bestaetige(knopf, text) {
    var alt = knopf.getAttribute('data-text') || knopf.textContent;
    knopf.setAttribute('data-text', alt);
    knopf.textContent = text;
    window.setTimeout(function () { knopf.textContent = alt; }, 4000);
  }

  function klick(ev) {
    var knopf = ev.currentTarget;
    var stelle = knopf.getAttribute('data-spaeter') || 'ohne';
    var url = linkFuerSpaeter();
    if (navigator.share && grob()) {
      navigator.share({ title: BETREFF, text: TEXT, url: url }).then(function () {
        zaehle(stelle, 'teilen');
        bestaetige(knopf, 'Link gespeichert. Bis später!');
      }, function () {
        zaehle(stelle, 'abgebrochen');
      });
      return;
    }
    zaehle(stelle, 'mail');
    var body = TEXT + '\n' + url + '\n\nNebenkosten-Anwalt, Rechtsanwalt Zahid Akcay';
    window.location.href = 'mailto:?subject=' + encodeURIComponent(BETREFF) + '&body=' + encodeURIComponent(body);
  }

  function start() {
    var knoepfe = document.querySelectorAll('[data-spaeter]');
    Array.prototype.forEach.call(knoepfe, function (k) {
      k.addEventListener('click', klick);
      var zeile = k.closest('[data-spaeter-zeile]');
      if (zeile) zeile.hidden = false;
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
