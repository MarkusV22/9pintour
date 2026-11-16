import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { CheckCircle2, AlertCircle } from 'lucide-react';

const NUM_BAHNEN = 4;

function emptyBahnen() {
  return Array.from({ length: NUM_BAHNEN }, () => ({ voll: '', abraeumen: '', fehlwurf: '' }));
}

export function calcScore(bahnen, volleOnly = false) {
  return bahnen.reduce((sum, b) => {
    const v = parseInt(b.voll) || 0;
    const a = volleOnly ? 0 : (parseInt(b.abraeumen) || 0);
    return sum + v + a;
  }, 0);
}

function isBahnFilled(b, volleOnly = false) {
  return b.voll !== '' && (volleOnly || b.abraeumen !== '');
}

function initBahnenFromNotes(notesStr) {
  try {
    const parsed = JSON.parse(notesStr || '');
    if (Array.isArray(parsed) && parsed.length === NUM_BAHNEN) return parsed;
  } catch {}
  return emptyBahnen();
}

// Detect if saved data is "gesamt" mode (all 4 bahnen identical non-zero total → stored as gesamt)
// We store gesamt as a special marker: [{gesamt: true, voll, abraeumen, fehlwurf}]
function initGesamt(notesStr) {
  try {
    const parsed = JSON.parse(notesStr || '');
    if (parsed?.gesamt === true) return { voll: String(parsed.voll ?? ''), abraeumen: String(parsed.abraeumen ?? ''), fehlwurf: String(parsed.fehlwurf ?? '') };
  } catch {}
  return { voll: '', abraeumen: '', fehlwurf: '' };
}

function isGesamtNotes(notesStr) {
  try {
    const parsed = JSON.parse(notesStr || '');
    return parsed?.gesamt === true;
  } catch {}
  return false;
}

// Erkennt den gespeicherten Eingabe-Modus aus den Notes:
// 'gesamt' = {gesamt:true, ...}, 'bahnen' = Array mit 4 Bahnen, null = keine Daten.
function parseSavedMode(notesStr) {
  try {
    const parsed = JSON.parse(notesStr || '');
    if (parsed?.gesamt === true) return 'gesamt';
    if (Array.isArray(parsed) && parsed.length === NUM_BAHNEN) return 'bahnen';
  } catch {}
  return null;
}

// Vollständigkeit eines gespeicherten Score-Datensatzes (für die Auto-Einklapp-Logik
// der Ergebnisse): nur ausgefüllte Einträge (bzw. W.O./No-Show) gelten als fertig.
export function isScoreComplete(sc, volleOnly = false) {
  if (!sc || sc.score == null) return false;
  if (isWalkover(sc.notes) || isNoShow(sc.notes)) return true;
  try {
    const parsed = JSON.parse(sc.notes || '');
    if (parsed?.gesamt === true) {
      return String(parsed.voll ?? '') !== '' && (volleOnly || String(parsed.abraeumen ?? '') !== '');
    }
    if (Array.isArray(parsed) && parsed.length === NUM_BAHNEN) {
      return parsed.every(b => String(b.voll ?? '') !== '' && (volleOnly || String(b.abraeumen ?? '') !== ''));
    }
  } catch {}
  // Altes/anderes Format (z.B. Legacy-K.O.-Notizen) oder Score ohne Notes:
  // als vollständig behandeln – nur der Score zählt.
  return true;
}

// W.O. (Walkover / vorzeitiger Abbruch): Spieler bricht ab, bekommt aber die
// Antrittspunkte und das Spiel wird nicht in den Schnitt gewertet.
export function isWalkover(notesStr) {
  try {
    const parsed = JSON.parse(notesStr || '');
    return parsed?.wo === true;
  } catch {}
  return false;
}

// No-Show (nicht angetreten): Spieler bleibt im Startplan, wird aber
// komplett aus allen Wertungen entfernt (keine Punkte, keine Position).
export function isNoShow(notesStr) {
  try {
    const parsed = JSON.parse(notesStr || '');
    return parsed?.no_show === true;
  } catch {}
  return false;
}

// Single player row — uses player_id as identifier
export function PlayerScoreRow({ playerId, playerName, teamName, category, schedule, existingScore, onChange, readOnly = false, isSaving = false, isSaved = false, isPending = false, volleOnly = false, mobile = false }) {
  const [mode, setMode] = useState(() => parseSavedMode(existingScore?.notes) || 'gesamt');
  const [wo, setWo] = useState(() => isWalkover(existingScore?.notes));
  const [noShow, setNoShow] = useState(() => isNoShow(existingScore?.notes));

  const [bahnen, setBahnenState] = useState(() =>
    existingScore ? initBahnenFromNotes(existingScore.notes) : emptyBahnen()
  );
  const [gesamt, setGesamtState] = useState(() =>
    existingScore ? initGesamt(existingScore.notes) : { voll: '', abraeumen: '', fehlwurf: '' }
  );

  useEffect(() => {
    // Only reset state when a new score record is loaded (id changes), not on every score update.
    // Also skip reset if a save is currently pending — user might still be typing.
    if (isSaving || isPending) return;
    const nextGesamt = isGesamtNotes(existingScore?.notes);
    setWo(isWalkover(existingScore?.notes));
    setNoShow(isNoShow(existingScore?.notes));
    // Modus aus den gespeicherten Notes übernehmen, damit ein Datensatz, der
    // pro Bahn erfasst wurde, auch wieder im Pro-Bahn-Modus geöffnet wird.
    const savedMode = parseSavedMode(existingScore?.notes);
    if (savedMode) setMode(savedMode);
    const nextBahnen = existingScore ? initBahnenFromNotes(existingScore.notes) : emptyBahnen();
    // Feld-Reset überspringen, solange unbeantwortete Eingaben vorliegen –
    // sonst würden begonnene Bahnen (z.B. Bahn 3–4) durch den gespeicherten
    // Zwischenstand überschrieben, sobald das Speichern abgeschlossen ist.
    const hasLocalInput = bahnen.some(b => b.voll !== '' || b.abraeumen !== '' || b.fehlwurf !== '')
      || gesamt.voll !== '' || gesamt.abraeumen !== '' || gesamt.fehlwurf !== '';
    if (hasLocalInput) return;
    setBahnenState(nextBahnen);
    if (nextGesamt) {
      setGesamtState(existingScore ? initGesamt(existingScore.notes) : { voll: '', abraeumen: '', fehlwurf: '' });
    } else {
      // Pro-Bahn-Daten: Gesamt-Werte aus den Bahn-Summen ableiten, damit die
      // „Gesamt"-Eingaben synchron bleiben, ohne dass der Modus hin- und
      // hergeschaltet werden muss.
      const totalVoll = nextBahnen.reduce((s, b) => s + (parseInt(b.voll) || 0), 0);
      const totalAbr = nextBahnen.reduce((s, b) => s + (parseInt(b.abraeumen) || 0), 0);
      const totalFeh = nextBahnen.reduce((s, b) => s + (parseInt(b.fehlwurf) || 0), 0);
      setGesamtState({
        voll: totalVoll > 0 ? String(totalVoll) : '',
        abraeumen: totalAbr > 0 ? String(totalAbr) : '',
        fehlwurf: totalFeh > 0 ? String(totalFeh) : '',
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingScore?.id]);

  const toggleWo = () => {
    if (readOnly || !onChange) return;
    if (noShow) setNoShow(false); // W.O. und No-Show schließen sich gegenseitig aus
    const next = !wo;
    setWo(next);
    if (next) {
      // W.O. aktiv: Score 0, notes markiert -> Spieler bekommt Antrittspunkte,
      // Spiel wird nicht in den Schnitt gewertet.
      onChange({ schedule_id: schedule?.id || '', player_id: playerId, score: 0, bahnen_json: JSON.stringify({ wo: true }) });
    } else {
      // W.O. deaktiviert: leeres Score-Feld wiederherstellen
      setBahnenState(emptyBahnen());
      setGesamtState({ voll: '', abraeumen: '', fehlwurf: '' });
      onChange({ schedule_id: schedule?.id || '', player_id: playerId, score: 0, bahnen_json: JSON.stringify({ gesamt: true, voll: '', abraeumen: '', fehlwurf: '' }) });
    }
  };

  const toggleNoShow = () => {
    if (readOnly || !onChange) return;
    if (wo) setWo(false); // W.O. und No-Show schließen sich gegenseitig aus
    const next = !noShow;
    setNoShow(next);
    if (next) {
      // No-Show aktiv: Score 0, notes markiert -> Spieler bleibt im Startplan,
      // wird aber komplett aus allen Wertungen entfernt.
      onChange({ schedule_id: schedule?.id || '', player_id: playerId, score: 0, bahnen_json: JSON.stringify({ no_show: true }) });
    } else {
      // No-Show deaktiviert: leeres Score-Feld wiederherstellen
      setBahnenState(emptyBahnen());
      setGesamtState({ voll: '', abraeumen: '', fehlwurf: '' });
      onChange({ schedule_id: schedule?.id || '', player_id: playerId, score: 0, bahnen_json: JSON.stringify({ gesamt: true, voll: '', abraeumen: '', fehlwurf: '' }) });
    }
  };

  const setBahn = (bi, field, value) => {
    if (readOnly || !onChange) return;
    const next = bahnen.map((b, i) => i === bi ? { ...b, [field]: value } : b);
    setBahnenState(next);
    // Sync gesamt state from bahnen totals
    const totalVoll = next.reduce((s, b) => s + (parseInt(b.voll) || 0), 0);
    const totalAbr = next.reduce((s, b) => s + (parseInt(b.abraeumen) || 0), 0);
    const totalFeh = next.reduce((s, b) => s + (parseInt(b.fehlwurf) || 0), 0);
    setGesamtState({
      voll: totalVoll > 0 ? String(totalVoll) : '',
      abraeumen: volleOnly ? '' : (totalAbr > 0 ? String(totalAbr) : ''),
      fehlwurf: totalFeh > 0 ? String(totalFeh) : '',
    });
    onChange({ schedule_id: schedule?.id || '', player_id: playerId, score: calcScore(next, volleOnly), bahnen_json: JSON.stringify(next) });
  };

  const setGesamtField = (field, value) => {
    if (readOnly || !onChange) return;
    const next = { ...gesamt, [field]: value };
    setGesamtState(next);
    const score = (parseInt(next.voll) || 0) + (volleOnly ? 0 : (parseInt(next.abraeumen) || 0));
    onChange({ schedule_id: schedule?.id || '', player_id: playerId, score, bahnen_json: JSON.stringify({ gesamt: true, ...next }) });
  };

  const switchMode = (newMode) => {
    if (readOnly) return;
    if (newMode === 'gesamt' && mode === 'bahnen') {
      // Sync bahnen totals → gesamt
      const totalVoll = bahnen.reduce((s, b) => s + (parseInt(b.voll) || 0), 0);
      const totalAbr = bahnen.reduce((s, b) => s + (parseInt(b.abraeumen) || 0), 0);
      const totalFeh = bahnen.reduce((s, b) => s + (parseInt(b.fehlwurf) || 0), 0);
      setGesamtState({
        voll: totalVoll > 0 ? String(totalVoll) : gesamt.voll,
        abraeumen: totalAbr > 0 ? String(totalAbr) : gesamt.abraeumen,
        fehlwurf: totalFeh > 0 ? String(totalFeh) : gesamt.fehlwurf,
      });
    }
    setMode(newMode);
  };

  const total = mode === 'bahnen'
    ? calcScore(bahnen, volleOnly)
    : (parseInt(gesamt.voll) || 0) + (volleOnly ? 0 : (parseInt(gesamt.abraeumen) || 0));

  // Fehlermeldung, sobald ein Pflichtfeld nicht ausgefüllt ist (aber bereits
  // Eingaben vorhanden sind) – ersetzt die frühere Fehlwurf-Zählanzeige.
  const hasAnyInput = mode === 'bahnen'
    ? bahnen.some(b => b.voll !== '' || b.abraeumen !== '' || b.fehlwurf !== '')
    : gesamt.voll !== '' || gesamt.abraeumen !== '' || gesamt.fehlwurf !== '';
  const isComplete = (wo || noShow) ? true : (mode === 'bahnen'
    ? bahnen.every(b => isBahnFilled(b, volleOnly))
    : gesamt.voll !== '' && (volleOnly || gesamt.abraeumen !== ''));
  const showIncompleteError = !readOnly && !wo && !noShow && hasAnyInput && !isComplete;

  const badgeColor = category === 'Herren'
    ? 'bg-blue-100 text-blue-700'
    : category === 'Damen'
    ? 'bg-pink-100 text-pink-700'
    : 'bg-purple-100 text-purple-700';

  if (mobile) {
    const bahnInputs = (b, bi) => {
      const bahnSum = (parseInt(b.voll) || 0) + (volleOnly ? 0 : (parseInt(b.abraeumen) || 0));
      return (
        <div key={bi} className="flex flex-col items-stretch gap-0.5">
          <div className="text-[9px] font-bold text-muted-foreground text-center leading-none">B{bi + 1}</div>
          <div className="flex items-center gap-0.5">
            <span className={`text-[8px] w-2.5 shrink-0 ${b.voll !== '' ? 'text-green-500' : 'text-muted-foreground'}`}>{b.voll !== '' ? '✓' : 'V'}</span>
            <Input
              type="number" min="0" max="9" value={b.voll} onChange={e => setBahn(bi, 'voll', e.target.value)} placeholder="–" readOnly={readOnly}
              className={`h-7 text-center font-bold text-xs px-0.5 flex-1 no-spinner ${b.voll !== '' ? 'border-green-400 bg-green-50/60' : ''} ${readOnly ? 'bg-muted/30 cursor-default' : ''}`}
            />
          </div>
          {!volleOnly && (
            <div className="flex items-center gap-0.5">
              <span className={`text-[8px] w-2.5 shrink-0 ${b.abraeumen !== '' ? 'text-green-500' : 'text-muted-foreground'}`}>{b.abraeumen !== '' ? '✓' : 'A'}</span>
              <Input
                type="number" min="0" max="9" value={b.abraeumen} onChange={e => setBahn(bi, 'abraeumen', e.target.value)} placeholder="–" readOnly={readOnly}
                className={`h-7 text-center font-bold text-xs px-0.5 flex-1 no-spinner ${b.abraeumen !== '' ? 'border-green-400 bg-green-50/60' : ''} ${readOnly ? 'bg-muted/30 cursor-default' : ''}`}
              />
            </div>
          )}
          <div className="flex items-center gap-0.5">
            <span className={`text-[8px] w-2.5 shrink-0 ${b.fehlwurf !== '' ? 'text-green-500' : 'text-amber-500'}`}>{b.fehlwurf !== '' ? '✓' : 'F'}</span>
            <Input
              type="number" min="0" value={b.fehlwurf} onChange={e => setBahn(bi, 'fehlwurf', e.target.value)} placeholder="–" readOnly={readOnly}
              className={`h-6 text-center text-[11px] px-0.5 flex-1 no-spinner ${b.fehlwurf !== '' ? 'border-green-400 bg-green-50/60 text-green-700' : 'text-amber-600 border-amber-200 bg-amber-50/50'} ${readOnly ? 'cursor-default' : ''}`}
            />
          </div>
          {isBahnFilled(b, volleOnly) && <div className="text-[10px] font-bold text-primary text-center leading-none">{bahnSum}</div>}
        </div>
      );
    };

    return (
      <div className="p-2.5 border-b border-border/30 last:border-b-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sm text-foreground truncate">{playerName}</div>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${badgeColor}`}>{teamName}</span>
              {schedule && <span className="text-xs text-muted-foreground">{schedule.start_time} · B{schedule.lane}</span>}
              {showIncompleteError && <span className="flex items-center gap-0.5 text-xs text-red-600 font-medium"><AlertCircle className="w-3 h-3" />Bitte alle Felder ausfüllen</span>}
              {isSaving && <span className="text-xs text-muted-foreground animate-pulse">speichert…</span>}
              {isSaved && <span className="text-xs text-green-600 flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3" />✓</span>}
            </div>
            {!readOnly && (
              <div className="flex gap-1 mt-1.5 flex-wrap">
                <button type="button" onClick={() => switchMode('gesamt')} disabled={wo || noShow} className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold transition-all ${mode === 'gesamt' && !wo ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50'} ${wo || noShow ? 'opacity-40 cursor-not-allowed' : ''}`}>Gesamt</button>
                <button type="button" onClick={() => switchMode('bahnen')} disabled={wo || noShow} className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold transition-all ${mode === 'bahnen' && !wo ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50'} ${wo || noShow ? 'opacity-40 cursor-not-allowed' : ''}`}>Pro Bahn</button>
                <button type="button" onClick={toggleWo} className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold transition-all ${wo ? 'bg-amber-500 text-white border-amber-500' : 'border-border text-amber-600 hover:border-amber-400'}`} title="W.O.">W.O.</button>
                <button type="button" onClick={toggleNoShow} className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold transition-all ${noShow ? 'bg-red-500 text-white border-red-500' : 'border-border text-red-600 hover:border-red-400'}`} title="No-Show">No-Show</button>
              </div>
            )}
          </div>
          <div className="text-right flex-shrink-0 pl-2 self-stretch flex flex-col justify-center">
            <div className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold leading-none mb-0.5">Gesamt</div>
            <div className="font-bold text-primary text-xl leading-none">{wo ? <span className="text-amber-500">W.O.</span> : noShow ? <span className="text-red-500">No-Show</span> : (total > 0 ? total : '–')}</div>
          </div>
        </div>
        {wo ? (
          <div className="mt-2 flex items-center justify-center gap-2 py-2 rounded-lg bg-amber-50 border border-dashed border-amber-300">
            <span className="text-sm font-bold text-amber-600">W.O.</span>
            <span className="text-xs text-amber-600/80">Spielabbruch – nicht im Schnitt gewertet</span>
          </div>
        ) : noShow ? (
          <div className="mt-2 flex items-center justify-center gap-2 py-2 rounded-lg bg-red-50 border border-dashed border-red-300">
            <span className="text-sm font-bold text-red-600">No-Show</span>
            <span className="text-xs text-red-600/80">Nicht angetreten – aus der Wertung entfernt</span>
          </div>
        ) : mode === 'bahnen' ? (
          <div className="grid grid-cols-4 gap-1 mt-2">{bahnen.map((b, bi) => bahnInputs(b, bi))}</div>
        ) : (
          <div className={`grid ${volleOnly ? 'grid-cols-2' : 'grid-cols-3'} gap-1 mt-2`}>
            <div className="flex flex-col gap-0.5">
              <div className="text-[9px] font-bold text-muted-foreground text-center leading-none">Volle</div>
              <Input type="number" min="0" value={gesamt.voll} onChange={e => setGesamtField('voll', e.target.value)} placeholder="–" readOnly={readOnly} className={`h-8 text-center font-bold text-sm no-spinner ${gesamt.voll !== '' ? 'border-green-400 bg-green-50/60' : ''}`} />
            </div>
            {!volleOnly && (
              <div className="flex flex-col gap-0.5">
                <div className="text-[9px] font-bold text-muted-foreground text-center leading-none">Abräumen</div>
                <Input type="number" min="0" value={gesamt.abraeumen} onChange={e => setGesamtField('abraeumen', e.target.value)} placeholder="–" readOnly={readOnly} className={`h-8 text-center font-bold text-sm no-spinner ${gesamt.abraeumen !== '' ? 'border-green-400 bg-green-50/60' : ''}`} />
              </div>
            )}
            <div className="flex flex-col gap-0.5">
              <div className="text-[9px] font-bold text-amber-600 text-center leading-none">Fehlw.</div>
              <Input type="number" min="0" value={gesamt.fehlwurf} onChange={e => setGesamtField('fehlwurf', e.target.value)} placeholder="–" readOnly={readOnly} className="h-8 text-center text-sm no-spinner border-amber-200 bg-amber-50/50 text-amber-700" />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <tr className="border-b border-border/30 hover:bg-muted/10 transition-colors">
      <td className="px-4 py-2 align-middle">
        <div className="font-semibold text-sm text-foreground">{playerName}</div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${badgeColor}`}>{teamName}</span>
          {schedule && (
            <span className="text-xs text-muted-foreground">{schedule.start_time} · Bahn {schedule.lane}</span>
          )}
          {showIncompleteError && (
            <span className="flex items-center gap-0.5 text-xs text-red-600 font-medium">
              <AlertCircle className="w-3 h-3" />Bitte alle Felder ausfüllen
            </span>
          )}
          {isSaving && <span className="text-xs text-muted-foreground animate-pulse">speichert…</span>}
          {isSaved && <span className="text-xs text-green-600 flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3" />✓</span>}
        </div>
        {/* Mode toggle */}
        {!readOnly && (
          <div className="flex gap-1 mt-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => switchMode('gesamt')}
              disabled={wo || noShow}
              className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold transition-all ${mode === 'gesamt' && !wo ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50'} ${wo || noShow ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              Gesamt
            </button>
            <button
              type="button"
              onClick={() => switchMode('bahnen')}
              disabled={wo || noShow}
              className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold transition-all ${mode === 'bahnen' && !wo ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50'} ${wo || noShow ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              Pro Bahn
            </button>
            <button
              type="button"
              onClick={toggleWo}
              className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold transition-all ${wo ? 'bg-amber-500 text-white border-amber-500' : 'border-border text-amber-600 hover:border-amber-400'}`}
              title="W.O. – Spieler bricht ab, bekommt aber die Antrittspunkte und das Spiel wird nicht in den Schnitt gewertet"
            >
              W.O.
            </button>
            <button
              type="button"
              onClick={toggleNoShow}
              className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold transition-all ${noShow ? 'bg-red-500 text-white border-red-500' : 'border-border text-red-600 hover:border-red-400'}`}
              title="No-Show – Spieler tritt nicht an, bleibt im Startplan, wird aber komplett aus der Wertung entfernt"
            >
              No-Show
            </button>
          </div>
        )}
      </td>

      {wo ? (
        <td colSpan={4} className="px-3 py-2 align-middle">
          <div className="flex items-center justify-center gap-2 h-full py-3 rounded-lg bg-amber-50 border border-dashed border-amber-300">
            <span className="text-sm font-bold text-amber-600 tracking-wide">W.O.</span>
            <span className="text-xs text-amber-600/80">Spielabbruch – nicht im Schnitt gewertet</span>
          </div>
        </td>
      ) : noShow ? (
        <td colSpan={4} className="px-3 py-2 align-middle">
          <div className="flex items-center justify-center gap-2 h-full py-3 rounded-lg bg-red-50 border border-dashed border-red-300">
            <span className="text-sm font-bold text-red-600 tracking-wide">No-Show</span>
            <span className="text-xs text-red-600/80">Nicht angetreten – aus der Wertung entfernt</span>
          </div>
        </td>
      ) : mode === 'bahnen' ? (
        <>
          {bahnen.map((b, bi) => {
            const bahnSum = (parseInt(b.voll) || 0) + (volleOnly ? 0 : (parseInt(b.abraeumen) || 0));
            const vollFilled = b.voll !== '';
            const abraeumenFilled = b.abraeumen !== '';
            const fehlwurfFilled = b.fehlwurf !== '';
            return (
              <td key={bi} className="px-1 py-1.5 align-middle">
                <div className="flex flex-col gap-0.5 w-16">
                  <div className="text-center text-[10px] font-bold text-muted-foreground mb-0.5">Bahn {bi + 1}</div>
                  <div className="flex items-center gap-1">
                    <span className={`text-[9px] w-3 shrink-0 ${vollFilled ? 'text-green-500' : 'text-muted-foreground'}`}>
                      {vollFilled ? '✓' : 'V'}
                    </span>
                    <Input
                      type="number" min="0" max="9"
                      value={b.voll}
                      onChange={e => setBahn(bi, 'voll', e.target.value)}
                      placeholder="–"
                      readOnly={readOnly}
                      className={`h-7 text-center font-bold text-sm px-0.5 flex-1 no-spinner transition-colors ${vollFilled ? 'border-green-400 bg-green-50/60' : ''} ${readOnly ? 'bg-muted/30 cursor-default' : ''}`}
                    />
                  </div>
                  {!volleOnly && (
                  <div className="flex items-center gap-1">
                    <span className={`text-[9px] w-3 shrink-0 ${abraeumenFilled ? 'text-green-500' : 'text-muted-foreground'}`}>
                      {abraeumenFilled ? '✓' : 'A'}
                    </span>
                    <Input
                      type="number" min="0" max="9"
                      value={b.abraeumen}
                      onChange={e => setBahn(bi, 'abraeumen', e.target.value)}
                      placeholder="–"
                      readOnly={readOnly}
                      className={`h-7 text-center font-bold text-sm px-0.5 flex-1 no-spinner transition-colors ${abraeumenFilled ? 'border-green-400 bg-green-50/60' : ''} ${readOnly ? 'bg-muted/30 cursor-default' : ''}`}
                    />
                  </div>
                  )}
                  <div className="flex items-center gap-1">
                    <span className={`text-[9px] w-3 shrink-0 ${fehlwurfFilled ? 'text-green-500' : 'text-amber-500'}`}>
                      {fehlwurfFilled ? '✓' : 'F'}
                    </span>
                    <Input
                      type="number" min="0"
                      value={b.fehlwurf}
                      onChange={e => setBahn(bi, 'fehlwurf', e.target.value)}
                      placeholder="–"
                      readOnly={readOnly}
                      className={`h-6 text-center text-xs px-0.5 flex-1 no-spinner transition-colors ${fehlwurfFilled ? 'border-green-400 bg-green-50/60 text-green-700' : 'text-amber-600 border-amber-200 bg-amber-50/50'} ${readOnly ? 'cursor-default' : ''}`}
                    />
                  </div>
                  {isBahnFilled(b, volleOnly) && (
                    <div className="text-center text-[10px] font-bold text-primary">{bahnSum}</div>
                  )}
                </div>
              </td>
            );
          })}
        </>
      ) : (
        // Gesamt mode: spans all 4 bahn columns
        <td colSpan={4} className="px-3 py-2 align-middle">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground font-medium w-20">Volle gesamt</span>
              <Input
                type="number" min="0"
                value={gesamt.voll}
                onChange={e => setGesamtField('voll', e.target.value)}
                placeholder="–"
                readOnly={readOnly}
                className={`h-8 w-20 text-center font-bold text-sm no-spinner ${gesamt.voll !== '' ? 'border-green-400 bg-green-50/60' : ''}`}
              />
            </div>
            {!volleOnly && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground font-medium w-24">Abräumen gesamt</span>
              <Input
                type="number" min="0"
                value={gesamt.abraeumen}
                onChange={e => setGesamtField('abraeumen', e.target.value)}
                placeholder="–"
                readOnly={readOnly}
                className={`h-8 w-20 text-center font-bold text-sm no-spinner ${gesamt.abraeumen !== '' ? 'border-green-400 bg-green-50/60' : ''}`}
              />
            </div>
            )}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-amber-600 font-medium w-24">Fehlwurf gesamt</span>
              <Input
                type="number" min="0"
                value={gesamt.fehlwurf}
                onChange={e => setGesamtField('fehlwurf', e.target.value)}
                placeholder="–"
                readOnly={readOnly}
                className={`h-8 w-20 text-center text-sm no-spinner border-amber-200 bg-amber-50/50 text-amber-700`}
              />
            </div>
          </div>
        </td>
      )}

      <td className="px-3 py-2 align-middle text-center font-bold text-primary text-base">
        {wo ? <span className="text-amber-500">W.O.</span> : noShow ? <span className="text-red-500">No-Show</span> : (total > 0 ? total : '–')}
      </td>
    </tr>
  );
}

export default PlayerScoreRow;