/* Befundkarte der Vorprüfung (Paket 1a, Freigabe Zahid 29.10.2026).
   Ein Code für das echte Ergebnis (pruefung.html) und das gekennzeichnete Beispiel (index.html, pruefung.html),
   damit das Beispiel nie anders aussieht als das, was die Vorprüfung wirklich liefert.
   Kein Ersparnisbetrag auf der Seite (Entscheidung Zahid 28.10.2026); die interne Obergrenze entscheidet nur
   über den Kasten „Anwaltliche Prüfung empfohlen“ (ab SCHWELLE_EMPFEHLUNG_CENT). */
(function () {
  'use strict';

  var SCHWELLE_EMPFEHLUNG_CENT = 6000; /* Empfehlung ab 60 € möglicher Ersparnis (Entscheidung Zahid 28.10.2026) */

  function euro(cent) {
    var z = Math.round(cent) / 100;
    try { return z.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
    catch (e) { return z.toFixed(2).replace('.', ',') + ' €'; }
  }
  function euroText(cent) { return euro(cent).replace(' €', ' Euro'); }
  function datumDe(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? m[3] + '.' + m[2] + '.' + m[1] : '';
  }
  function heuteIso() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  var ICON = {
    auffaellig: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
      '<circle cx="8" cy="8" r="6.5" fill="#F6E9D6" stroke="#B97C3B" stroke-width="1.2"/>' +
      '<line x1="8" y1="4.6" x2="8" y2="8.8" stroke="#B97C3B" stroke-width="1.5" stroke-linecap="round"/>' +
      '<circle cx="8" cy="11.2" r="0.9" fill="#B97C3B"/></svg>',
    pruefen: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
      '<circle cx="8" cy="8" r="6.5" fill="#EFEAE0" stroke="#7A8680" stroke-width="1.2"/>' +
      '<path d="M6.2 6.3a1.8 1.8 0 1 1 2.6 1.6c-.5.3-.8.6-.8 1.2" stroke="#55655D" stroke-width="1.4" stroke-linecap="round" fill="none"/>' +
      '<circle cx="8" cy="11.3" r="0.9" fill="#55655D"/></svg>',
    ok: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
      '<circle cx="8" cy="8" r="6.5" fill="#E6EFEA" stroke="#2F5D4C" stroke-width="1.2"/>' +
      '<path d="M5 8.2l2 2 4-4.3" stroke="#2F5D4C" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>'
  };
  var LABEL = { auffaellig: 'auffällig', pruefen: 'prüfen', ok: 'unauffällig' };

  /* Summen- und Ergebniszeilen sind keine Kostenpositionen. „Saldo …“ aus einer Messdienst-Abrechnung ist
     der Anteil für Heizung oder Wasser: bleibt sichtbar, „prüfen“ allein deshalb ist kein Anhaltspunkt
     (Test 28.10.2026; der Prüfdienst macht es seit 28.10.2026 genauso). */
  var KEINE_POSITION = /^\s*(summe|zwischensumme|gesamtsumme|gesamtbetrag|gesamtkosten\b|ihr kostenanteil|kostenanteil\b|vorauszahlung|abschl|nachzahlung|nachforderung|guthaben|abrechnungsergebnis|ergebnis\b)/i;
  function istKostenposition(p) { return !!(p && p.titel && !KEINE_POSITION.test(String(p.titel))); }
  function ohneSaldoPruefen(p) {
    return (p.status === 'pruefen' && /^\s*saldo/i.test(String(p.titel))) ? { titel: p.titel, betrag_cent: p.betrag_cent, status: 'ok' } : p;
  }

  /* Interne Obergrenze der möglichen Ersparnis; wird NICHT angezeigt, sondern entscheidet über die Empfehlung
     (Inhaberentscheidungen 28.10.2026). Sie stützt sich auf die AUFFÄLLIGEN Positionen, „prüfen“ zählt nur, wenn
     es keine auffälligen mit Betrag gibt; höchstens die Nachforderung; gibt es Punkte ohne Positionsbezug (Frist,
     Mindestangaben, Vertrag, Verteilerschlüssel insgesamt), die ganze Nachforderung. Ein höherer Wert des Dienstes geht vor. */
  function mitBetrag(p) { return typeof p.betrag_cent === 'number' && p.betrag_cent > 0; }
  /* Paket 1b (29.10.2026): Massgeblich ist der Betrag, den der Dienst je Position nennt (betrag_relevant_cent,
     bei Kabel 2024 anteilig); fehlt er, der Abrechnungsbetrag wie bisher. Die ganze Nachforderung tragen nur
     Hinweise, die die Abrechnung insgesamt betreffen (GANZE_NACHFORDERUNG); andere Hinweise ohne Positionsbezug
     zählen mit ihrem eigenen Betrag, ohne Betrag gar nicht. Antworten ohne 'art' (vor dem 29.10.2026) wie bisher. */
  var GANZE_NACHFORDERUNG = { frist: 1, mindestangaben: 1, keine_umlage: 1, schluessel_gesamt: 1 };
  function massgeblich(p) { return typeof p.betrag_relevant_cent === 'number' ? p.betrag_relevant_cent : p.betrag_cent; }
  function ersparnisObergrenze(markiert, andere, nachforderung, dienst) {
    var basis = markiert.filter(function (p) { return p.status === 'auffaellig' && mitBetrag(p); });
    var quelle = 'auffaellig';
    if (!basis.length) { basis = markiert.filter(function (p) { return p.status === 'pruefen' && mitBetrag(p); }); quelle = 'pruefen'; }
    var summe = basis.reduce(function (s, p) { var b = massgeblich(p); return s + (typeof b === 'number' && b > 0 ? b : 0); }, 0);
    var ganz = andere.filter(function (x) { return !x.art || GANZE_NACHFORDERUNG[x.art]; }).length;
    summe += andere.reduce(function (s, x) {
      return s + ((x.art && !GANZE_NACHFORDERUNG[x.art] && typeof x.betrag_cent === 'number' && x.betrag_cent > 0) ? x.betrag_cent : 0);
    }, 0);
    var wert = summe;
    if (nachforderung) {
      if (ganz > 0) { wert = nachforderung; quelle = 'nachforderung'; }
      else wert = Math.min(summe, nachforderung);
    }
    if (dienst > 0 && dienst >= wert) return { cent: dienst, quelle: 'dienst' };
    return { cent: wert, quelle: wert > 0 ? quelle : 'keine' };
  }

  /* Ergebnis des Prüfdienstes aufbereiten: Positionen, Punkte ohne Positionsbezug, Empfehlung. */
  function auswerten(erg, heute) {
    erg = erg || {};
    var liste = Array.isArray(erg.punkte) ? erg.punkte : [];
    var alle = Array.isArray(erg.positionen) ? erg.positionen.filter(function (p) { return p && p.titel; }) : [];
    var positionen = alle.filter(istKostenposition).map(ohneSaldoPruefen);
    var markiert = positionen.filter(function (p) { return p.status === 'auffaellig'; })
      .concat(positionen.filter(function (p) { return p.status === 'pruefen'; }));
    var unauffaellig = positionen.filter(function (p) { return p.status !== 'auffaellig' && p.status !== 'pruefen'; });
    /* Punkte zu einzelnen Positionen stehen schon in der Karte (Saldozeilen fallen ganz weg); übrig bleiben
       Frist, Form, Vertrag. */
    var titel = alle.map(function (p) { return String(p.titel) + ':'; });
    var andere = [];
    liste.forEach(function (x) {
      if (!x || !x.titel) return;
      var t = String(x.titel);
      if (!titel.some(function (pt) { return t.indexOf(pt) === 0; })) andere.push({ titel: t, art: x.art, betrag_cent: x.betrag_cent, baustein: x.baustein });
    });
    var andereTitel = andere.map(function (x) { return x.titel; });
    var n = markiert.length + andere.length;
    var nachforderung = (typeof erg.nachforderung_cent === 'number' && erg.nachforderung_cent > 0) ? erg.nachforderung_cent : null;
    var guthaben = (!nachforderung && typeof erg.guthaben_cent === 'number' && erg.guthaben_cent > 0) ? erg.guthaben_cent : null;
    var dienst = (typeof erg.moegliche_ersparnis_cent === 'number') ? erg.moegliche_ersparnis_cent : 0;
    /* Summenprobe des Prüfdienstes (seit 28.10.2026): gelesene Anteile passen nicht zur Summe der Abrechnung */
    var unsicher = !!(erg.summenprobe && erg.summenprobe.stimmig === false);
    var frist = erg.frist || {};
    var fristDatum = (frist.einwendung_bis && datumDe(frist.einwendung_bis)) ? String(frist.einwendung_bis).slice(0, 10) : null;
    var fristAbgelaufen = !!(fristDatum && fristDatum < (heute || heuteIso()));
    var ersparnis = unsicher ? { cent: dienst, quelle: dienst > 0 ? 'dienst' : 'unsicher' }
                             : ersparnisObergrenze(markiert, andere, nachforderung, dienst);
    var empfehlen = n > 0 && !unsicher && !fristAbgelaufen && ersparnis.cent >= SCHWELLE_EMPFEHLUNG_CENT;
    return {
      markiert: markiert, unauffaellig: unauffaellig, andere: andere, andereTitel: andereTitel, anzahl: n,
      nachforderung: nachforderung, guthaben: guthaben, geprueft: Array.isArray(erg.geprueft) ? erg.geprueft : null, unsicher: unsicher, fristDatum: fristDatum, fristAbgelaufen: fristAbgelaufen,
      ersparnis: ersparnis, empfehlen: empfehlen
    };
  }

  /* Kopfzeile über der Karte (Paket 1a): Nachforderung und Einwendungsfrist ganz oben. Die Nachforderung ist eine
     Angabe aus Formular oder Abrechnung, keine Ersparnis; bei unsicher gelesenen Beträgen entfällt sie. */
  function kopfzeile(b) {
    var teile = [];
    if (b.nachforderung && !b.unsicher) teile.push('Ihr Vermieter fordert ' + euroText(b.nachforderung) + ' nach.');
    else if (b.guthaben && !b.unsicher) teile.push('Ihre Abrechnung weist ein Guthaben von ' + euroText(b.guthaben) + ' aus.');
    if (b.fristDatum) {
      teile.push(b.fristAbgelaufen
        ? 'Die Frist für Einwendungen gegen diese Abrechnung ist am ' + datumDe(b.fristDatum) +
          ' abgelaufen (zwölf Monate ab Zugang). Danach sind Einwendungen in der Regel ausgeschlossen, ' +
          'außer Sie hatten die Verspätung nicht zu vertreten.'
        : 'Einwendungen sind bis zum ' + datumDe(b.fristDatum) + ' möglich (zwölf Monate ab Zugang). ' +
          'Fristen werden durch die Vorprüfung nicht gewahrt.');
    }
    return teile.length ? teile.join(' ') : null;
  }

  function zusammenfassung(b) {
    if (b.anzahl > 0) {
      return b.anzahl === 1
        ? 'Die Vorprüfung hat einen Anhaltspunkt gefunden, der eine anwaltliche Prüfung lohnen könnte:'
        : 'Die Vorprüfung hat ' + b.anzahl + ' Anhaltspunkte gefunden, die eine anwaltliche Prüfung lohnen könnten:';
    }
    return 'Die Vorprüfung hat keine Anhaltspunkte für typische Fehler gefunden. ' +
      'Das heißt nicht, dass die Abrechnung fehlerfrei ist — nur, dass das Programm nichts Auffälliges erkannt hat.';
  }

  /* Paket 1b: fester Textbaustein je Befundart (app/vorpruefung_texte.py, freigegeben 29.10.2026), aufklappbar. */
  function erklaerung(bs, art, beiOeffnen) {
    var d = document.createElement('details'); d.className = 'befund__erkl';
    var s = document.createElement('summary'); s.textContent = 'Was heißt das?';
    d.appendChild(s);
    [['Was das heißt: ', bs.was_das_heisst], ['Was ich in der Prüfung mache: ', bs.was_ich_mache]].forEach(function (z) {
      if (!z[1]) return;
      var para = document.createElement('p');
      var st = document.createElement('strong'); st.textContent = z[0];
      para.appendChild(st); para.appendChild(document.createTextNode(String(z[1])));
      d.appendChild(para);
    });
    var gemeldet = false;
    d.addEventListener('toggle', function () {
      if (d.open && !gemeldet && typeof beiOeffnen === 'function') { gemeldet = true; beiOeffnen(art); }
    });
    return d;
  }
  var beiOeffnen = null;

  function befundZeile(p, ohneBetrag) {
    var st = (p.status === 'auffaellig' || p.status === 'pruefen') ? p.status : 'ok';
    var row = document.createElement('div');
    row.className = 'befund__row befund__row--' + st;
    row.innerHTML = ICON[st];
    var name = document.createElement('div'); name.className = 'befund__name';
    name.appendChild(document.createTextNode(String(p.titel)));
    var sub = document.createElement('span');
    sub.textContent = LABEL[st];
    name.appendChild(sub);
    var betrag = document.createElement('div'); betrag.className = 'befund__betrag';
    betrag.textContent = (!ohneBetrag && typeof p.betrag_cent === 'number') ? euro(p.betrag_cent) : '—';
    row.appendChild(name); row.appendChild(betrag);
    /* Erklärung unter der Zeile über die volle Breite, nicht in der schmalen Namensspalte neben dem Betrag. */
    if (st !== 'ok' && p.baustein) row.appendChild(erklaerung(p.baustein, p.art, beiOeffnen));
    return row;
  }

  /* Befundkarte: oben nur die markierten Positionen (das sind die Anhaltspunkte aus dem Satz darüber),
     nacheinander eingeblendet; die unauffälligen eingeklappt darunter; zuletzt die Empfehlung (ab 60 €).
     opt.schritt: Versatz in ms zwischen zwei Zeilen (0 = sofort); liefert die Dauer bis zur letzten Zeile. */
  function baueBefund(el, b, opt) {
    opt = opt || {};
    var schritt = opt.schritt || 0;
    beiOeffnen = opt.beiOeffnen || null;
    el.innerHTML = '';
    if (!b.markiert.length && !b.unauffaellig.length && b.ersparnis.cent <= 0) {
      el.hidden = true; return 0;
    }
    var zeilen = [];
    b.markiert.forEach(function (p) {
      var row = befundZeile(p, b.unsicher);
      el.appendChild(row); zeilen.push(row);
    });
    if (b.unauffaellig.length) {
      var weitere = document.createElement('details'); weitere.className = 'befund__weitere';
      var kopf0 = document.createElement('summary');
      var zahl = b.unauffaellig.length;
      kopf0.innerHTML = ICON.ok;
      var text0 = document.createElement('span');
      text0.textContent = (b.markiert.length ? 'Weitere ' : '') + zahl + (zahl === 1 ? ' Position' : ' Positionen') + ': unauffällig';
      kopf0.appendChild(text0);
      weitere.appendChild(kopf0);
      b.unauffaellig.forEach(function (p) { weitere.appendChild(befundZeile(p, b.unsicher)); });
      el.appendChild(weitere); zeilen.push(weitere);
    }
    /* Kein Ersparnisbetrag auf der Seite (Entscheidung Zahid 28.10.2026). Stattdessen die Empfehlung, sobald die
       intern errechnete Obergrenze mindestens SCHWELLE_EMPFEHLUNG_CENT erreicht; nicht bei abgelaufener
       Einwendungsfrist und nicht, wenn die Beträge unsicher gelesen sind. */
    var sum = null;
    if (b.empfehlen || (b.anzahl > 0 && b.unsicher)) {
      sum = document.createElement('div'); sum.className = 'befund__sum';
      var kopf = document.createElement('div'); kopf.className = 'befund__sum-kopf';
      var titel = document.createElement('strong');
      var text = document.createElement('p'); text.className = 'befund__sum-text';
      if (b.empfehlen) {
        titel.textContent = 'Anwaltliche Prüfung empfohlen';
        var grund;
        if (b.ersparnis.quelle === 'nachforderung') grund = 'Die Vorprüfung hat einen Hinweis gefunden, der Ihre Abrechnung insgesamt betreffen kann.';
        else if (b.markiert.some(function (p) { return p.status === 'auffaellig'; })) {
          grund = b.markiert.filter(function (p) { return p.status === 'auffaellig'; }).length === 1
            ? 'Die Vorprüfung hat eine auffällige Position gefunden, die sich auf Ihr Ergebnis auswirken kann.'
            : 'Die Vorprüfung hat auffällige Positionen gefunden, die sich auf Ihr Ergebnis auswirken können.';
        } else grund = 'Die Vorprüfung hat Positionen gefunden, die genauer geprüft werden sollten.';
        text.textContent = grund + ' Ich prüfe jeden markierten Punkt am Original und sage Ihnen, ob und in welcher Höhe Sie weniger zahlen müssen.';
      } else {
        titel.textContent = 'Beträge nicht sicher lesbar';
        text.textContent = 'Die Beträge ließen sich aus Ihren Unterlagen nicht sicher lesen, etwa wegen eines unscharfen Fotos. In der anwaltlichen Prüfung lese ich das Original.';
      }
      kopf.appendChild(titel); sum.appendChild(kopf); sum.appendChild(text);
      el.appendChild(sum);
    }
    el.hidden = false;
    if (!schritt) {
      zeilen.forEach(function (row) { row.classList.add('is-in'); });
      if (sum) sum.classList.add('is-in');
      return 0;
    }
    zeilen.forEach(function (row, i) { window.setTimeout(function () { row.classList.add('is-in'); }, schritt * i); });
    var ende = schritt * zeilen.length;
    window.setTimeout(function () { if (sum) sum.classList.add('is-in'); }, ende);
    return ende + 500;
  }

  /* ---------- Gekennzeichnetes Beispiel (Paket 1a) ----------
     Erfundene, typische Werte einer Mietwohnung; zwei markierte Positionen. Nur Befundarten, die die Vorprüfung
     heute tatsächlich liefert (Kabel-TV erst nach Paket 2). Die Frist liegt immer rund fünf Monate in der Zukunft,
     damit das Beispiel nicht veraltet. */
  /* Wortgleich mit app/vorpruefung_texte.py (agent-service); der Playwright-Test vergleicht beide. */
  var BEISPIEL_BAUSTEINE = {
    nicht_umlagefaehig: {
      was_das_heisst: 'Kosten dieser Art gehören in der Regel nicht zu den Betriebskosten, die auf Mieter umgelegt werden dürfen.',
      was_ich_mache: 'Ich prüfe am Original, was hinter der Position steckt, und nehme den Betrag in das Schreiben an Ihren ' +
        'Vermieter auf, soweit er nicht umgelegt werden darf.'
    },
    kabel_nach_2024: {
      was_das_heisst: 'Seit Juli 2024 dürfen Gebühren für Kabelfernsehen und Breitbandanschluss in der Regel nicht mehr über die ' +
        'Nebenkosten abgerechnet werden. Betriebsstrom und Wartung einer Antennenanlage sind davon nicht erfasst.',
      was_ich_mache: 'Ich prüfe, für welchen Zeitraum die Gebühren angesetzt sind und ob es dafür eine eigene Vereinbarung gibt, ' +
        'und nehme den Betrag in das Schreiben an Ihren Vermieter auf.'
    },
    pruefen: {
      was_das_heisst: 'Die Position ist unklar bezeichnet oder fällt auf, etwa durch ihre Höhe. Das allein ist noch kein Fehler.',
      was_ich_mache: 'Ich prüfe, was dahinter steckt, und verlange bei Bedarf Einsicht in die Belege.'
    }
  };
  function beispielErgebnis() {
    var d = new Date(); d.setDate(d.getDate() + 150);
    var frist = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    return {
      punkte: [{ titel: 'Verwaltungskosten: auffällig' }, { titel: 'Kabelgebühren: auffällig' }, { titel: 'Hauswart: prüfen' }],
      positionen: [
        { titel: 'Grundsteuer', betrag_cent: 21840, status: 'ok' },
        { titel: 'Wasser und Abwasser', betrag_cent: 41275, status: 'ok' },
        { titel: 'Müllabfuhr', betrag_cent: 19620, status: 'ok' },
        { titel: 'Hauswart', betrag_cent: 34160, status: 'pruefen', art: 'pruefen', baustein: BEISPIEL_BAUSTEINE.pruefen },
        { titel: 'Gartenpflege', betrag_cent: 8830, status: 'ok' },
        { titel: 'Gebäudeversicherung', betrag_cent: 15290, status: 'ok' },
        { titel: 'Allgemeinstrom', betrag_cent: 4615, status: 'ok' },
        { titel: 'Verwaltungskosten', betrag_cent: 21480, status: 'auffaellig', art: 'nicht_umlagefaehig',
          betrag_relevant_cent: 21480, baustein: BEISPIEL_BAUSTEINE.nicht_umlagefaehig },
        { titel: 'Kabelgebühren', betrag_cent: 15600, status: 'auffaellig', art: 'kabel_nach_2024',
          betrag_relevant_cent: 15600, baustein: BEISPIEL_BAUSTEINE.kabel_nach_2024 },
        { titel: 'Heizung und Warmwasser', betrag_cent: 103450, status: 'ok' }
      ],
      nachforderung_cent: 41230, moegliche_ersparnis_cent: 37080,
      summenprobe: { stimmig: true }, frist: { einwendung_bis: frist }
    };
  }

  function zeigeBeispiel(container) {
    if (!container) return;
    var b = auswerten(beispielErgebnis());
    container.innerHTML = '';
    var marke = document.createElement('p'); marke.className = 'beispiel__marke';
    marke.textContent = 'Beispiel mit erfundenen Daten';
    var kopf = document.createElement('p'); kopf.className = 'vp-kopf';
    kopf.textContent = kopfzeile(b);
    var zf = document.createElement('p'); zf.className = 'beispiel__satz';
    zf.textContent = zusammenfassung(b);
    var karte = document.createElement('div'); karte.className = 'befund';
    karte.setAttribute('role', 'group'); karte.setAttribute('aria-label', 'Beispiel: Positionen einer Vorprüfung');
    container.appendChild(marke); container.appendChild(kopf); container.appendChild(zf); container.appendChild(karte);
    baueBefund(karte, b, { schritt: 0 });
  }

  /* Paket 1b: Was die Vorprüfung tatsächlich geprüft hat (Feld 'geprueft' des Dienstes). */
  var GEPRUEFT = {
    umlagefaehigkeit: 'ob Kostenarten abgerechnet sind, die nicht auf Mieter umgelegt werden dürfen',
    vertrag: 'ob Ihr Mietvertrag die abgerechneten Kostenarten vorsieht',
    schluessel: 'ob die Verteilerschlüssel zum Mietvertrag passen',
    frist: 'ob die Abrechnung rechtzeitig bei Ihnen ankam',
    kabel: 'ob Kabel- oder Fernsehgebühren nach Juni 2024 abgerechnet sind',
    rauchmelder: 'ob Miete für Rauchwarnmelder abgerechnet ist',
    mindestangaben: 'ob die Abrechnung die vorgeschriebenen Mindestangaben enthält',
    zeitraum: 'ob der Abrechnungszeitraum zwölf Monate umfasst'
  };
  function geprueftTexte(liste) {
    return (liste || []).map(function (k) { return GEPRUEFT[k]; }).filter(Boolean);
  }

  window.NkaBefund = {
    erklaerung: erklaerung, geprueftTexte: geprueftTexte, BEISPIEL_BAUSTEINE: BEISPIEL_BAUSTEINE,
    SCHWELLE_EMPFEHLUNG_CENT: SCHWELLE_EMPFEHLUNG_CENT,
    euro: euro, datumDe: datumDe, heuteIso: heuteIso, auswerten: auswerten, kopfzeile: kopfzeile,
    zusammenfassung: zusammenfassung, baueBefund: baueBefund, zeigeBeispiel: zeigeBeispiel,
    beispielErgebnis: beispielErgebnis
  };
})();
