/* Mietvertrag nachreichen im Kartenformular (15.11.2026). Ergebnisseite, Abschnitt „Noch ein Schritt: Ihr Mietvertrag“.
   Statt Tally-Formular 1 mit schritt=mv gehen die Dateien direkt an POST /vorpruefung/einreichen (angaben.schritt "mv",
   agent-service app/einreichung.py). E-Mail und Einwilligung nimmt der Server aus der ersten Einsendung; das Skript schickt
   nur Kennung und Dateien. Nach der Annahme meldet es der Seite den Eingang (window.nkaMietvertragHochgeladen in
   pruefung.html), die die Vorprüfung neu abfragt und dann zur Bestellung weiterführt. Fotos werden wie im Formular der
   Startseite im Browser verkleinert (längste Seite 2400 px, JPEG). Aktiv nur mit <html class="karten">. */
(function () {
  'use strict';
  if (!document.documentElement.classList.contains('karten')) return;
  var box = document.getElementById('kf-mv');
  if (!box) return;

  var MAX_DATEIEN = 30, MAX_BYTES = 25 * 1024 * 1024, MAX_KANTE = 2400;
  var GUELTIG = /^[a-f0-9]{32}$/;
  var vorgang = new URLSearchParams(location.search).get('vorgang') || '';
  if (!GUELTIG.test(vorgang)) { try { vorgang = sessionStorage.getItem('vorgang') || ''; } catch (e) { vorgang = ''; } }

  var liste = document.getElementById('kf-mv-liste');
  var knopf = document.getElementById('kf-mv-senden');
  var sendenBox = document.getElementById('kf-mv-box');
  var balken = document.getElementById('kf-mv-fortschritt');
  var statusText = document.getElementById('kf-mv-status');
  var fehler = document.getElementById('kf-mv-fehler');
  var dateien = [];
  var sendet = false;

  function zaehle(name, daten) {
    var d = daten || {};
    d.formular = 'karten';
    d.herkunft = window.NKA_HERKUNFT || 'ohne';
    if (window.umami && typeof window.umami.track === 'function') { try { window.umami.track(name, d); } catch (e) {} }
  }
  function zeigeFehler(text) { fehler.textContent = text || ''; fehler.hidden = !text; }
  function istBild(d) { return /^image\//i.test(d.type) || /\.(heic|heif|jpe?g|png|webp)$/i.test(d.name || ''); }
  function istPdf(d) { return d.type === 'application/pdf' || /\.pdf$/i.test(d.name || ''); }
  function groesse(b) { return b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  function verkleinere(datei) {
    return new Promise(function (fertig) {
      if (!istBild(datei) || typeof createImageBitmap !== 'function') { fertig(null); return; }
      createImageBitmap(datei, { imageOrientation: 'from-image' }).then(function (bild) {
        var f = Math.min(1, MAX_KANTE / Math.max(bild.width, bild.height));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(bild.width * f)); c.height = Math.max(1, Math.round(bild.height * f));
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(bild, 0, 0, c.width, c.height);
        if (bild.close) bild.close();
        c.toBlob(function (blob) { fertig(blob && (f < 1 || blob.size < datei.size) ? blob : null); }, 'image/jpeg', 0.85);
      }).catch(function () { fertig(null); });
    });
  }

  function zeichne() {
    liste.innerHTML = '';
    liste.hidden = dateien.length === 0;
    if (dateien.length) {
      var kopf = document.createElement('li'); kopf.className = 'kf__liste-kopf';
      kopf.textContent = dateien.length === 1 ? '1 Datei ausgewählt' : dateien.length + ' Dateien ausgewählt';
      liste.appendChild(kopf);
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
      weg.setAttribute('aria-label', name.textContent + ' entfernen'); weg.textContent = '×';
      weg.addEventListener('click', function () {
        if (sendet) return;
        if (e.url) { try { URL.revokeObjectURL(e.url); } catch (err) {} }
        dateien.splice(dateien.indexOf(e), 1); zeichne();
      });
      li.appendChild(vor); li.appendChild(text); li.appendChild(weg);
      liste.appendChild(li);
    });
    knopf.disabled = sendet || dateien.length === 0;
  }

  function nimm(auswahl) {
    var abgelehnt = [], arbeit = [];
    Array.prototype.forEach.call(auswahl, function (d) {
      if (dateien.length + arbeit.length >= MAX_DATEIEN) { abgelehnt.push('höchstens ' + MAX_DATEIEN + ' Dateien'); return; }
      if (!istBild(d) && !istPdf(d)) { abgelehnt.push((d.name || 'Datei') + ': nur Fotos oder PDF'); return; }
      arbeit.push({ datei: d, blob: null, url: null, pdf: istPdf(d) });
    });
    zeigeFehler(abgelehnt.length ? 'Nicht übernommen: ' + abgelehnt.join(', ') + '.' : '');
    Promise.all(arbeit.map(function (e) {
      return (e.pdf ? Promise.resolve(null) : verkleinere(e.datei)).then(function (b) { e.blob = b; return e; });
    })).then(function (fertige) {
      var zuGross = [];
      fertige.forEach(function (e) {
        if ((e.blob || e.datei).size > MAX_BYTES) { zuGross.push(e.datei.name || 'Datei'); return; }
        if (!e.pdf) { try { e.url = URL.createObjectURL(e.blob || e.datei); } catch (err) { e.url = null; } }
        dateien.push(e);
      });
      if (zuGross.length) zeigeFehler('Zu groß (mehr als 25 MB): ' + zuGross.join(', ') + '.');
      zeichne();
    });
  }
  Array.prototype.forEach.call(box.querySelectorAll('input[type="file"]'), function (inp) {
    inp.addEventListener('change', function () { if (inp.files && inp.files.length && !sendet) nimm(inp.files); inp.value = ''; });
  });

  function meldung(st, a) {
    if (st === 409) return 'Ihre Vorprüfung läuft gerade noch. Bitte warten Sie, bis das Ergebnis oben steht, und senden Sie dann noch einmal.';
    if (st === 422 && a && a.feld === 'vorgang') return 'Zu diesem Ergebnis finde ich keine Unterlagen mehr. Bitte starten Sie die Vorprüfung auf der Startseite neu.';
    if (st === 422 && a && a.status === 'dateityp') return 'Eine Datei ließ sich nicht lesen. Bitte laden Sie Fotos (JPEG oder PNG) oder PDF-Dateien hoch.';
    if (st === 413) return 'Die Dateien sind zusammen zu groß. Bitte laden Sie weniger oder kleinere Dateien hoch (höchstens 25 MB je Datei).';
    if (st === 429) return 'Gerade kamen zu viele Versuche von Ihrem Anschluss. Bitte versuchen Sie es in einer Stunde noch einmal.';
    return 'Die Übertragung hat nicht geklappt. Bitte prüfen Sie Ihre Verbindung und tippen Sie noch einmal auf „Mietvertrag senden“.';
  }

  knopf.addEventListener('click', function () {
    if (sendet || !dateien.length) return;
    if (!GUELTIG.test(vorgang)) { zeigeFehler(meldung(422, { feld: 'vorgang' })); return; }
    zeigeFehler('');
    var daten = new FormData();
    daten.append('angaben', JSON.stringify({ vorgang: vorgang, schritt: 'mv', firma: '' }));
    dateien.forEach(function (e, i) {
      var nr = ('0' + (i + 1)).slice(-2);
      daten.append('mietvertrag', e.blob || e.datei, e.pdf ? 'mietvertrag-' + nr + '.pdf' : (e.blob ? 'mietvertrag-' + nr + '.jpg' : (e.datei.name || 'mietvertrag-' + nr)));
    });
    sendet = true; zeichne();
    sendenBox.hidden = false; balken.style.width = '2%';
    statusText.textContent = 'Ihr Mietvertrag wird übertragen …';
    var xhr = new XMLHttpRequest();
    xhr.open('POST', box.getAttribute('data-endpoint'));
    xhr.timeout = 10 * 60 * 1000;
    xhr.upload.addEventListener('progress', function (e) {
      if (!e.lengthComputable) return;
      var p = Math.max(2, Math.min(99, Math.round(e.loaded / e.total * 100)));
      balken.style.width = p + '%';
      statusText.textContent = 'Ihr Mietvertrag wird übertragen … ' + p + ' %';
    });
    function ende() { sendet = false; sendenBox.hidden = true; }
    function scheitern(st, a) { ende(); zeichne(); zeigeFehler(meldung(st, a)); zaehle('kartenformular_fehler', { grund: String(st || 'netz'), stelle: 'mietvertrag' }); }
    xhr.addEventListener('load', function () {
      var a = null; try { a = JSON.parse(xhr.responseText); } catch (e) { a = null; }
      if (xhr.status === 202 && a && a.status === 'angenommen') {
        dateien.forEach(function (e) { if (e.url) { try { URL.revokeObjectURL(e.url); } catch (err) {} } });
        dateien = []; ende(); zeichne();
        try { sessionStorage.setItem('nka_mv_' + vorgang, '1'); } catch (e) {}
        if (typeof window.nkaMietvertragHochgeladen === 'function') window.nkaMietvertragHochgeladen();
        return;
      }
      scheitern(xhr.status, a);
    });
    xhr.addEventListener('error', function () { scheitern(0, null); });
    xhr.addEventListener('timeout', function () { scheitern(0, null); });
    xhr.send(daten);
  });
})();
