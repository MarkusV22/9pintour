import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Swords, Crown, AlertCircle, Zap } from 'lucide-react';

const NUM_LANES = 4;

export function parseKONotes(notesStr) {
  try {
    const parsed = JSON.parse(notesStr || '');
    if (parsed && Array.isArray(parsed.lanes)) {
      const lanes = [...parsed.lanes];
      while (lanes.length < NUM_LANES) lanes.push('');
      return { lanes: lanes.slice(0, NUM_LANES).map(v => String(v ?? '')), sudden: parsed.sudden != null ? String(parsed.sudden) : '' };
    }
  } catch {}
  return { lanes: ['', '', '', ''], sudden: '' };
}

// Compute duel result: per-lane kegeln, ties award 0.5 to each, player with >2 sets wins, else total kegeln, else sudden victory
export function computeDuelResult(lanes1, lanes2, sudden1, sudden2) {
  let sets1 = 0, sets2 = 0;
  for (let i = 0; i < NUM_LANES; i++) {
    const v1 = parseInt(lanes1[i]) || 0;
    const v2 = parseInt(lanes2[i]) || 0;
    if (v1 > v2) sets1++;
    else if (v2 > v1) sets2++;
    else { sets1 += 0.5; sets2 += 0.5; } // tie → 0.5 each
  }
  const total1 = lanes1.reduce((s, v) => s + (parseInt(v) || 0), 0);
  const total2 = lanes2.reduce((s, v) => s + (parseInt(v) || 0), 0);

  const fmt = (s) => Number.isInteger(s) ? s : s.toFixed(1);

  // More than 2 sets → direct win (2.5, 3, 3.5, 4)
  if (sets1 > 2) return { winner: 1, sets1, sets2, total1, total2, method: `${fmt(sets1)}:${fmt(sets2)} Sätze` };
  if (sets2 > 2) return { winner: 2, sets1, sets2, total1, total2, method: `${fmt(sets2)}:${fmt(sets1)} Sätze` };

  // 2:2 → total kegeln decides
  if (sets1 === 2 && sets2 === 2) {
    if (total1 > total2) return { winner: 1, sets1, sets2, total1, total2, method: `2:2 · ${total1}:${total2} Kegel` };
    if (total2 > total1) return { winner: 2, sets1, sets2, total1, total2, method: `2:2 · ${total2}:${total1} Kegel` };
    // Sudden victory: 3 throws each
    const sv1 = parseInt(sudden1) || 0;
    const sv2 = parseInt(sudden2) || 0;
    if (sv1 > sv2) return { winner: 1, sets1, sets2, total1, total2, sudden1: sv1, sudden2: sv2, method: `Sudden Victory ${sv1}:${sv2}` };
    if (sv2 > sv1) return { winner: 2, sets1, sets2, total1, total2, sudden1: sv1, sudden2: sv2, method: `Sudden Victory ${sv2}:${sv1}` };
    return { winner: null, sets1, sets2, total1, total2, sudden1: sv1, sudden2: sv2, method: 'Sudden Victory', needSudden: true };
  }

  return { winner: null, sets1, sets2, total1, total2, method: '' };
}

export default function KODuelCard({ title, p1, p2, group, category, score1, score2, onChange, isOwner, saving = {}, saved = {} }) {
  const [lanes1, setLanes1] = useState(() => parseKONotes(score1?.notes).lanes);
  const [lanes2, setLanes2] = useState(() => parseKONotes(score2?.notes).lanes);
  const [sudden1, setSudden1] = useState(() => parseKONotes(score1?.notes).sudden);
  const [sudden2, setSudden2] = useState(() => parseKONotes(score2?.notes).sudden);

  useEffect(() => {
    const parsed = parseKONotes(score1?.notes);
    setLanes1(parsed.lanes);
    setSudden1(parsed.sudden);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score1?.id]);

  useEffect(() => {
    const parsed = parseKONotes(score2?.notes);
    setLanes2(parsed.lanes);
    setSudden2(parsed.sudden);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score2?.id]);

  const result = computeDuelResult(lanes1, lanes2, sudden1, sudden2);
  const needSudden = result.sets1 === 2 && result.sets2 === 2 && result.total1 === result.total2;

  const saveKey = (pid) => `${group}::${pid}`;

  const setLane = (player, idx, value) => {
    if (!isOwner || !onChange) return;
    if (player === 1) {
      const next = lanes1.map((v, i) => i === idx ? value : v);
      setLanes1(next);
      const score = next.reduce((s, v) => s + (parseInt(v) || 0), 0);
      onChange(p1.playerId, { lanes: next, sudden: sudden1 }, score);
    } else {
      const next = lanes2.map((v, i) => i === idx ? value : v);
      setLanes2(next);
      const score = next.reduce((s, v) => s + (parseInt(v) || 0), 0);
      onChange(p2.playerId, { lanes: next, sudden: sudden2 }, score);
    }
  };

  const setSudden = (player, value) => {
    if (!isOwner || !onChange) return;
    if (player === 1) {
      setSudden1(value);
      const score = lanes1.reduce((s, v) => s + (parseInt(v) || 0), 0);
      onChange(p1.playerId, { lanes: lanes1, sudden: value }, score);
    } else {
      setSudden2(value);
      const score = lanes2.reduce((s, v) => s + (parseInt(v) || 0), 0);
      onChange(p2.playerId, { lanes: lanes2, sudden: value }, score);
    }
  };

  const renderPlayer = (player, p, lanes, sudden, setLaneFn, setSuddenFn, sets, total, isWinner) => (
    <tr className={isWinner ? 'bg-green-50/60' : ''}>
      <td className="px-3 py-2 align-middle">
        <div className="flex items-center gap-1.5">
          {isWinner && <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
          <span className={`text-sm font-semibold truncate ${isWinner ? 'text-green-700' : 'text-foreground'}`}>{p.name}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {saving[saveKey(p.playerId)] && <span className="text-xs text-muted-foreground animate-pulse">…</span>}
          {saved[saveKey(p.playerId)] && <span className="text-xs text-green-600">✓</span>}
        </div>
      </td>
      {lanes.map((val, idx) => {
        const oppVal = player === 1 ? (parseInt(lanes2[idx]) || 0) : (parseInt(lanes1[idx]) || 0);
        const myVal = parseInt(val) || 0;
        const isTie = val !== '' && oppVal > 0 && myVal === oppVal;
        const won = val !== '' && oppVal > 0 && myVal > oppVal;
        const lost = val !== '' && oppVal > 0 && myVal < oppVal;
        return (
          <td key={idx} className="px-1 py-2 text-center">
            <Input
              type="number" min="0"
              value={val}
              onChange={e => setLaneFn(idx, e.target.value)}
              placeholder="–"
              readOnly={!isOwner}
              className={`h-9 w-14 text-center font-bold text-sm no-spinner mx-auto ${won ? 'border-green-400 bg-green-50' : lost ? 'border-red-200 bg-red-50/40' : ''} ${isTie ? 'border-amber-300 bg-amber-50/50' : ''} ${!isOwner ? 'bg-muted/30 cursor-default' : ''}`}
            />
            {won && <span className="block text-[9px] text-green-600 font-bold mt-0.5">Satz</span>}
            {isTie && <span className="block text-[9px] text-amber-600 font-bold mt-0.5">½</span>}
          </td>
        );
      })}
      <td className="px-1 py-2 text-center">
      {needSudden ? (
      <Input
        type="number" min="0"
        value={sudden}
        onChange={e => setSuddenFn(e.target.value)}
        placeholder="–"
        readOnly={!isOwner}
        className={`h-9 w-14 text-center font-bold text-sm no-spinner mx-auto border-amber-300 bg-amber-50 ${!isOwner ? 'cursor-default' : ''}`}
      />
      ) : (
      <span className="text-xs text-muted-foreground/40">–</span>
      )}
      </td>
      <td className="px-1 py-2 text-center">
      <span className={`text-sm font-bold ${isWinner ? 'text-green-700' : 'text-foreground'}`}>{sets}</span>
      </td>
      <td className="px-1 py-2 text-center">
      <span className={`text-sm font-bold ${isWinner ? 'text-green-700' : 'text-foreground'}`}>{total}</span>
      </td>
      </tr>
  );

  return (
    <div className="bg-background rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-2 bg-muted/30 border-b border-border flex items-center gap-2">
        <Swords className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-bold text-foreground">{title}</span>
        {result.method && (
          <span className="text-[10px] text-muted-foreground font-medium">{result.method}</span>
        )}
        {result.winner && (
          <span className="ml-auto flex items-center gap-1 text-xs text-green-600 font-semibold">
            <Crown className="w-3.5 h-3.5" /> {result.winner === 1 ? p1.name : p2.name}
          </span>
        )}
      </div>
      <table className="w-full">
        <thead>
          <tr className="bg-muted/20">
            <th className="text-left px-3 py-1.5 text-[10px] font-semibold text-muted-foreground">Spieler</th>
            {[1, 2, 3, 4].map(n => (
              <th key={n} className="text-center px-1 py-1.5 text-[10px] font-semibold text-muted-foreground min-w-[4rem]">Bahn {n}</th>
            ))}
            <th className="text-center px-1 py-1.5 text-[10px] font-semibold text-muted-foreground min-w-[4rem]">
              <span className={`flex items-center justify-center gap-0.5 ${needSudden ? 'text-amber-600' : ''}`}>
                {needSudden && <Zap className="w-2.5 h-2.5" />} SV
              </span>
            </th>
            <th className="text-center px-1 py-1.5 text-[10px] font-semibold text-muted-foreground min-w-[3rem]">Sätze</th>
            <th className="text-center px-1 py-1.5 text-[10px] font-semibold text-muted-foreground min-w-[4rem]">Kegel</th>
          </tr>
        </thead>
        <tbody>
          {renderPlayer(1, p1, lanes1, sudden1, (idx, v) => setLane(1, idx, v), (v) => setSudden(1, v), result.sets1, result.total1, result.winner === 1)}
          {renderPlayer(2, p2, lanes2, sudden2, (idx, v) => setLane(2, idx, v), (v) => setSudden(2, v), result.sets2, result.total2, result.winner === 2)}
        </tbody>
      </table>
      {needSudden && (
        <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 flex items-center gap-1.5 text-xs text-amber-700">
          <AlertCircle className="w-3.5 h-3.5" />
          2:2 und gleiche Kegel – Sudden Victory (3 Wurf pro Spieler)
        </div>
      )}
    </div>
  );
}