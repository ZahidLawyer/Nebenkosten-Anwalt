/* Kartenformular der kostenlosen Vorprüfung (15.11.2026, Wunsch Zahid).
   Vier Schritte (Ende der Abrechnung, Abrechnung, Mietvertrag freiwillig, E-Mail mit Einwilligungen). Die Unterlagen
   gehen erst beim Absenden in einem Zug an den eigenen Server (POST /vorpruefung/einreichen, agent-service
   app/einreichung.py); Fotos werden vorher im Browser verkleinert (längste Seite 2400 px, JPEG). Danach wechselt die
   Seite wie bisher zu pruefung.html?vorgang=…, die das Ergebnis abruft.
   Vorgangskennung, Herkunft und Klick-IDs wie beim Tally-Formular (index.html). Umami zählt nur Schritte und
   Ereignisse, keine Inhalte. Aktiv nur, wenn <html> die Klasse „karten“ trägt (Test mit ?formular=neu). */
(function () {
  'use strict';
  if (!document.documentElement.classList.contains('karten')) return;
  var form = document.getElementById('kartenformular');
  if (!form) return;

  var MAX_DATEIEN = 30;
  var MAX_BYTES = 25 * 1024 * 1024;
  var MAX_KANTE = 2400;
  var GUELTIG = /^[a-f0-9]{32}$/;
  var EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
  var q = new URLSearchParams(location.search);

  function neueId() {
    var b = new Uint8Array(16); crypto.getRandomValues(b);
    return Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  }
  /* Kennung nur aus dem Speicher dieses Tabs oder neu, nie aus der Adresse (Sicherheitsfix 09.11.2026). */
  var vorgang = null;
  try { vorgang = sessionStorage.getItem('vorgang'); } catch (e) { vorgang = null; }
  if (!GUELTIG.test(vorgang || '')) vorgang = neueId();
  try { sessionStorage.setItem('vorgang', vorgang); } catch (e) {}
  var QUELLE_OK = /^[a-z0-9-]{1,32}$/;
  var quelle = QUELLE_OK.test(q.get('quelle') || '') ? q.get('quelle') : null;
  if (!quelle) { try { var qs = sessionStorage.getItem('quelle'); if (QUELLE_OK.test(qs || '')) quelle = qs; } catch (e) {} }
  if (quelle) { try { sessionStorage.setItem('quelle', quelle); } catch (e) {} }
  var quelleParam = quelle ? '&quelle=' + quelle : '';
  var klickParam = '';
  ['gclid', 'gbraid', 'wbraid'].forEach(function (k) {
    var v = q.get(k);
    if (v && /^[A-Za-z0-9_\-]{10,300}$/.test(v)) klickParam += '&' + k + '=' + v;
  });

  var herkunft = window.NKA_HERKUNFT || 'ohne';
  function zaehle(name, daten) {
    var d = daten || {};
    d.herkunft = herkunft;
    d.fassung = window.NKA_FASSUNG || 'L2';
    d.formular = 'karten';
    function senden() {
      if (window.umami && typeof window.umami.track === 'function') { try { window.umami.track(name, d); } catch (e) {} return true; }
      return false;
    }
    if (!senden() && document.readyState !== 'complete') window.addEventListener('load', senden);
  }

  var schritte = Array.prototype.slice.call(form.querySelectorAll('.kf__schritt'));
  var stand = document.getElementById('kf-stand');
  var balken = document.getElementById('kf-balken');
  var zustand = { schritt: 1, ende: null, dateien: { abrechnung: [], mietvertrag: [] }, sendet: false };
  var gesehen = {};
  var beruehrt = false;

  function beruehre() {
    if (beruehrt) return;
    beruehrt = true;
    zaehle('formular_beruehrt');
    try { sessionStorage.setItem('nka_formular_beruehrt', '1'); } catch (e) {}
  }

  function zeige(n, fokus) {
    zustand.schritt = n;
    schritte.forEach(function (s) { s.classList.toggle('is-aktiv', Number(s.getAttribute('data-schritt')) === n); });
    stand.textContent = n + ' von 4';
    balken.setAttribute('aria-valuenow', String(n));
    Array.prototype.forEach.call(balken.children, function (sp, i) { sp.classList.toggle('is-an', i < n); });
    if (n === 4) angabenAktualisieren();
    if (!gesehen[n]) { gesehen[n] = true; zaehle('formular_seite', { seite: String(n) }); }
    if (fokus !== false) {
      var aktiv = schritte[n - 1];
      var oben = form.getBoundingClientRect().top;
      if (oben < 0 || oben > window.innerHeight * 0.6) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      try { aktiv.focus({ preventScroll: true }); } catch (e) { aktiv.focus(); }
    }
  }

  /* Schritt 1: Ende der Abrechnung, ein Tipp genügt. */
  var weiter1 = schritte[0].querySelector('[data-weiter]');
  Array.prototype.forEach.call(form.querySelectorAll('input[name="ende"]'), function (r) {
    r.addEventListener('change', function () {
      beruehre();
      zustand.ende = r.value;
      Array.prototype.forEach.call(form.querySelectorAll('.kf__karte'), function (k) {
        k.classList.toggle('is-gewaehlt', k.contains(r));
      });
      weiter1.disabled = false;
      window.setTimeout(function () { if (zustand.schritt === 1) zeige(2); }, 260);
    });
  });

  /* Dateien: Fotos verkleinern (längste Seite 2400 px), PDF unverändert. */
  function istBild(datei) { return /^image\//i.test(datei.type) || /\.(heic|heif|jpe?g|png|webp)$/i.test(datei.name || ''); }
  function istPdf(datei) { return datei.type === 'application/pdf' || /\.pdf$/i.test(datei.name || ''); }
  function verkleinere(datei) {
    return new Promise(function (fertig) {
      if (!istBild(datei) || typeof createImageBitmap !== 'function') { fertig(null); return; }
      createImageBitmap(datei, { imageOrientation: 'from-image' }).then(function (bild) {
        var f = Math.min(1, MAX_KANTE / Math.max(bild.width, bild.height));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(bild.width * f));
        c.height = Math.max(1, Math.round(bild.height * f));
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(bild, 0, 0, c.width, c.height);
        if (bild.close) bild.close();
        c.toBlob(function (blob) {
          if (!blob) { fertig(null); return; }
          fertig(f < 1 || blob.size < datei.size ? blob : null);
        }, 'image/jpeg', 0.85);
      }).catch(function () { fertig(null); });
    });
  }
  function groesse(bytes) {
    return bytes >= 1048576 ? (bytes / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB';
  }
  function zeigeFehler(text) {
    var f = document.getElementById('kf-fehler');
    var aktiv = schritte[zustand.schritt - 1];
    var ziel = aktiv.querySelector('.kf__fehler') || f;
    if (ziel !== f && f) f.hidden = true;
    if (!text) { if (ziel) ziel.hidden = true; return; }
    if (!aktiv.contains(ziel)) {
      ziel = document.createElement('p'); ziel.className = 'kf__fehler'; ziel.setAttribute('role', 'alert');
      aktiv.appendChild(ziel);
    }
    ziel.textContent = text; ziel.hidden = false;
  }

  function nimmDateien(feld, liste) {
    beruehre();
    var dateien = zustand.dateien[feld];
    var abgelehnt = [];
    var arbeit = [];
    Array.prototype.forEach.call(liste, function (datei) {
      if (dateien.length + arbeit.length >= MAX_DATEIEN) { abgelehnt.push('höchstens ' + MAX_DATEIEN + ' Dateien'); return; }
      if (!istBild(datei) && !istPdf(datei)) { abgelehnt.push((datei.name || 'Datei') + ': nur Fotos oder PDF'); return; }
      var eintrag = { datei: datei, blob: null, url: null, pdf: istPdf(datei) };
      arbeit.push(eintrag);
    });
    zeigeFehler(abgelehnt.length ? 'Nicht übernommen: ' + abgelehnt.join(', ') + '.' : '');
    if (!arbeit.length) return;
    Promise.all(arbeit.map(function (e) {
      return (e.pdf ? Promise.resolve(null) : verkleinere(e.datei)).then(function (blob) { e.blob = blob; return e; });
    })).then(function (fertige) {
      var zuGross = [];
      fertige.forEach(function (e) {
        var g = (e.blob || e.datei).size;
        if (g > MAX_BYTES) { zuGross.push(e.datei.name || 'Datei'); return; }
        if (!e.pdf) { try { e.url = URL.createObjectURL(e.blob || e.datei); } catch (err) { e.url = null; } }
        dateien.push(e);
      });
      if (zuGross.length) zeigeFehler('Zu groß (mehr als 25 MB): ' + zuGross.join(', ') + '.');
      zeichneListe(feld);
    });
  }

  function zeichneListe(feld) {
    var ul = document.getElementById('kf-liste-' + feld);
    var dateien = zustand.dateien[feld];
    ul.innerHTML = '';
    ul.hidden = dateien.length === 0;
    if (dateien.length) {
      var kopf = document.createElement('li');
      kopf.className = 'kf__liste-kopf';
      kopf.innerHTML = '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
      kopf.appendChild(document.createTextNode(dateien.length === 1 ? '1 Datei ausgewählt' : dateien.length + ' Dateien ausgewählt'));
      ul.appendChild(kopf);
    }
    dateien.forEach(function (e, i) {
      var li = document.createElement('li'); li.className = 'kf__datei';
      var vor = document.createElement('span'); vor.className = 'kf__vorschau'; vor.setAttribute('aria-hidden', 'true');
      if (e.url) vor.style.backgroundImage = 'url("' + e.url + '")'; else vor.textContent = e.pdf ? 'PDF' : 'Foto';
      var text = document.createElement('span'); text.className = 'kf__datei-text';
      var name = document.createElement('span'); name.className = 'kf__datei-name';
      name.textContent = e.pdf ? (e.datei.name || 'PDF ' + (i + 1)) : 'Seite ' + (i + 1);
      var info = document.createElement('span'); info.className = 'kf__datei-info';
      info.textContent = (e.pdf ? 'PDF, ' : 'Foto, ') + groesse((e.blob || e.datei).size);
      text.appendChild(name); text.appendChild(info);
      var weg = document.createElement('button'); weg.type = 'button'; weg.className = 'kf__weg';
      weg.setAttribute('aria-label', name.textContent + ' entfernen');
      weg.innerHTML = '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
      weg.addEventListener('click', function () {
        if (e.url) { try { URL.revokeObjectURL(e.url); } catch (err) {} }
        dateien.splice(dateien.indexOf(e), 1);
        zeichneListe(feld);
      });
      li.appendChild(vor); li.appendChild(text); li.appendChild(weg);
      ul.appendChild(li);
    });
    if (feld === 'abrechnung') schritte[1].querySelector('[data-weiter]').disabled = dateien.length === 0;
    if (feld === 'mietvertrag') document.getElementById('kf-weiter-3').textContent = dateien.length ? 'Weiter' : 'Ohne Mietvertrag weiter';
  }

  Array.prototype.forEach.call(form.querySelectorAll('input[type="file"][data-feld]'), function (inp) {
    inp.addEventListener('change', function () {
      if (inp.files && inp.files.length) nimmDateien(inp.getAttribute('data-feld'), inp.files);
      inp.value = '';
    });
  });

  /* Navigation */
  Array.prototype.forEach.call(form.querySelectorAll('[data-weiter]'), function (b) {
    b.addEventListener('click', function () { if (!b.disabled && zustand.schritt < 4) { zeigeFehler(''); zeige(zustand.schritt + 1); } });
  });
  Array.prototype.forEach.call(form.querySelectorAll('[data-zurueck]'), function (b) {
    b.addEventListener('click', function () { if (zustand.sendet) return; zeigeFehler(''); zeige(Math.max(1, zustand.schritt - 1)); });
  });
  Array.prototype.forEach.call(form.querySelectorAll('[data-geh]'), function (b) {
    b.addEventListener('click', function () { if (zustand.sendet) return; zeige(Number(b.getAttribute('data-geh'))); });
  });

  function angabenAktualisieren() {
    var ende = { nachzahlung: 'Abrechnung endet mit Nachzahlung', guthaben: 'Abrechnung endet mit Guthaben', unklar: 'Ende der Abrechnung: lese ich aus' };
    document.getElementById('kf-angabe-ende').textContent = ende[zustand.ende] || 'Ende der Abrechnung: offen';
    var a = zustand.dateien.abrechnung.length, m = zustand.dateien.mietvertrag.length;
    document.getElementById('kf-angabe-abrechnung').textContent = 'Abrechnung: ' + a + (a === 1 ? ' Datei' : ' Dateien');
    document.getElementById('kf-angabe-mietvertrag').textContent = m ? 'Mietvertrag: ' + m + (m === 1 ? ' Datei' : ' Dateien') : 'Mietvertrag: nicht dabei';
  }

  /* Absenden */
  var sendenBox = document.getElementById('kf-senden-box');
  var balkenSenden = document.getElementById('kf-fortschritt');
  var statusText = document.getElementById('kf-status');
  var knopf = document.getElementById('kf-senden');

  function sperre(an) {
    zustand.sendet = an;
    Array.prototype.forEach.call(form.querySelectorAll('button, input'), function (el) { el.disabled = an; });
  }
  function fehlerNachStatus(st, antwort) {
    var feld = antwort && antwort.feld;
    if (st === 422 && feld === 'email') return 'Bitte prüfen Sie Ihre E-Mail-Adresse.';
    if (st === 422 && antwort && antwort.status === 'dateityp') return 'Eine Datei ließ sich nicht lesen. Bitte laden Sie Fotos (JPEG oder PNG) oder PDF-Dateien hoch und senden Sie noch einmal.';
    if (st === 413) return 'Die Dateien sind zusammen zu groß. Bitte laden Sie weniger oder kleinere Dateien hoch (höchstens 25 MB je Datei).';
    if (st === 429) return 'Gerade kamen zu viele Versuche von Ihrem Anschluss. Bitte versuchen Sie es in einer Stunde noch einmal.';
    return 'Die Übertragung hat nicht geklappt. Bitte prüfen Sie Ihre Verbindung und tippen Sie noch einmal auf „Vorprüfung starten“.';
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (zustand.sendet) return;
    zeigeFehler('');
    var email = String(document.getElementById('kf-email').value || '').trim();
    if (!zustand.dateien.abrechnung.length) { zeige(2); zeigeFehler('Bitte laden Sie zuerst Ihre Abrechnung hoch.'); return; }
    if (!EMAIL.test(email)) { zeigeFehler('Bitte geben Sie Ihre E-Mail-Adresse an.'); document.getElementById('kf-email').focus(); return; }
    if (!document.getElementById('kf-einwilligung').checked || !document.getElementById('kf-datenschutz').checked) {
      zeigeFehler('Bitte setzen Sie beide Häkchen. Ohne Ihre Einwilligung kann ich die Unterlagen nicht prüfen.'); return;
    }
    var daten = new FormData();
    daten.append('angaben', JSON.stringify({
      vorgang: vorgang, email: email, ende: zustand.ende, quelle: quelle,
      einwilligung_43e: true, datenschutz: true, firma: String(document.getElementById('kf-firma').value || '')
    }));
    ['abrechnung', 'mietvertrag'].forEach(function (feld) {
      zustand.dateien[feld].forEach(function (e, i) {
        var nr = ('0' + (i + 1)).slice(-2);
        var name = e.pdf ? feld + '-' + nr + '.pdf' : (e.blob ? feld + '-' + nr + '.jpg' : (e.datei.name || feld + '-' + nr));
        daten.append(feld, e.blob || e.datei, name);
      });
    });

    sperre(true);
    sendenBox.hidden = false;
    balkenSenden.style.width = '2%';
    statusText.textContent = 'Ihre Unterlagen werden übertragen …';
    var xhr = new XMLHttpRequest();
    xhr.open('POST', form.getAttribute('data-endpoint'));
    xhr.timeout = 10 * 60 * 1000;
    xhr.upload.addEventListener('progress', function (e) {
      if (!e.lengthComputable) return;
      var p = Math.max(2, Math.min(99, Math.round(e.loaded / e.total * 100)));
      balkenSenden.style.width = p + '%';
      statusText.textContent = 'Ihre Unterlagen werden übertragen … ' + p + ' %';
    });
    function scheitern(st, antwort) {
      sperre(false);
      sendenBox.hidden = true;
      zeigeFehler(fehlerNachStatus(st, antwort));
      zaehle('kartenformular_fehler', { grund: String(st || 'netz') });
    }
    xhr.addEventListener('load', function () {
      var antwort = null;
      try { antwort = JSON.parse(xhr.responseText); } catch (e) { antwort = null; }
      if (xhr.status === 202 && antwort && antwort.status === 'angenommen') {
        balkenSenden.style.width = '100%';
        statusText.textContent = 'Übertragen. Ihre Vorprüfung startet …';
        try {
          sessionStorage.setItem('nka_email', email);
          sessionStorage.setItem('nka_mv_' + vorgang, zustand.dateien.mietvertrag.length ? '1' : '0');
        } catch (e) {}
        if (typeof window.nkaMessung === 'function') { try { window.nkaMessung('vorpruefung', vorgang); } catch (e) {} }
        zaehle('vorpruefung_abgeschickt');
        window.setTimeout(function () {
          location.href = 'pruefung.html?vorgang=' + vorgang + quelleParam + klickParam + '#vorpruefung';
        }, 500);
        return;
      }
      scheitern(xhr.status, antwort);
    });
    xhr.addEventListener('error', function () { scheitern(0, null); });
    xhr.addEventListener('timeout', function () { scheitern(0, null); });
    xhr.send(daten);
  });

  zaehle('formular_geladen');
  gesehen[1] = true;
  zaehle('formular_seite', { seite: '1' });
})();
