import jsPDF from 'jspdf';
import { header, footer, fetchBranding } from '@/utils/pdfExport';
import { savePdf } from '@/utils/pdfDownload';
import { parseKONotes, computeDuelResult } from '@/components/final/KODuelCard';

// ── Shared helpers ────────────────────────────────────────────────────────────

function parseVA(notesStr) {
  try {
    const parsed = JSON.parse(notesStr || '');
    if (parsed?.gesamt === true) {
      return { voll: parseInt(parsed.voll) || 0, abraeumen: parseInt(parsed.abraeumen) || 0, fehlwurf: parseInt(parsed.fehlwurf) || 0 };
    }
    if (Array.isArray(parsed)) {
      return {
        voll: parsed.reduce((s, b) => s + (parseInt(b.voll) || 0), 0),
        abraeumen: parsed.reduce((s, b) => s + (parseInt(b.abraeumen) || 0), 0),
        fehlwurf: parsed.reduce((s, b) => s + (parseInt(b.fehlwurf) || 0), 0),
      };
    }
  } catch {}
  return { voll: 0, abraeumen: 0, fehlwurf: 0 };
}

function comparePlayers(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  if (b.abraeumen !== a.abraeumen) return b.abraeumen - a.abraeumen;
  return a.fehlwurf - b.fehlwurf;
}

function parseDayConfigs(str) {
  try {
    const parsed = JSON.parse(str || '');
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {}
  return [{ name: 'Tag 1', date: null, startHour: 8, startMinute: 0, endHour: 18, endMinute: 0 }];
}

function generateTimes(startHour, startMinute, slotMinutes, count) {
  const times = [];
  let total = startHour * 60 + startMinute;
  for (let i = 0; i < count; i++) {
    const h = Math.floor(total / 60);
    const m = total % 60;
    times.push(String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'));
    total += slotMinutes;
  }
  return times;
}

const LANE_ORDER = [1, 3, 4, 2];

// ── Final Startplan PDF ───────────────────────────────────────────────────────

export async function exportFinalStartplanPDF({ tournament, scores = [], playerMap = {}, canSeePhone = false }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const dateStr = tournament.date ? new Date(tournament.date).toLocaleDateString('de-AT') : '';
  doc._branding = await fetchBranding(tournament);

  const getPlayerName = (id) => {
    if (!id) return '–';
    const p = playerMap[id];
    if (!p) return id;
    return p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || id;
  };

  let finalGroups = {};
  try { finalGroups = JSON.parse(tournament.final_groups || '{}'); } catch {}

  const qualifiers = finalGroups.qualifiers || { Herren: [], Damen: [] };
  const groups = finalGroups.groups || {};
  const laneCount = tournament.lane_count || 4;
  const slotDuration = tournament.slot_duration || 60;
  const lanes = Array.from({ length: laneCount }, (_, i) => i + 1);

  const days = parseDayConfigs(tournament.day_configs);
  const day = days[0];
  const startHour = day.startHour ?? 8;
  const startMinute = day.startMinute ?? 0;

  const getLaneForIndex = (idx) => laneCount === 4 ? LANE_ORDER[idx] : idx + 1;

  // Build group-phase rounds
  const groupRounds = [];
  const maxBatches = Math.max(
    Math.ceil((qualifiers.Herren?.length || 0) / laneCount),
    Math.ceil((qualifiers.Damen?.length || 0) / laneCount)
  );
  for (let i = 0; i < maxBatches; i++) {
    const herrenBatch = (qualifiers.Herren || []).slice(i * laneCount, (i + 1) * laneCount);
    const damenBatch = (qualifiers.Damen || []).slice(i * laneCount, (i + 1) * laneCount);
    if (herrenBatch.length > 0) {
      const laneAssignments = {};
      herrenBatch.forEach((pid, idx) => { laneAssignments[getLaneForIndex(idx)] = pid; });
      groupRounds.push({ gender: 'Herren', range: `${i * laneCount + 1}–${i * laneCount + herrenBatch.length}`, laneAssignments });
    }
    if (damenBatch.length > 0) {
      const laneAssignments = {};
      damenBatch.forEach((pid, idx) => { laneAssignments[getLaneForIndex(idx)] = pid; });
      groupRounds.push({ gender: 'Damen', range: `${i * laneCount + 1}–${i * laneCount + damenBatch.length}`, laneAssignments });
    }
  }

  // K.O. rounds
  const getGroupRanking = (gender, groupKey) => {
    const playerIds = groups[gender]?.[groupKey] || [];
    return playerIds.map(pid => {
      const scoreRecord = scores.find(s => s.player_id === pid && s.group === groupKey);
      return {
        playerId: pid,
        name: getPlayerName(pid),
        score: scoreRecord?.score ?? 0,
        ...parseVA(scoreRecord?.notes),
        hasScore: !!scoreRecord,
      };
    }).sort(comparePlayers);
  };

  const getKOScore = (group, playerId) =>
    scores.find(s => s.player_id === playerId && s.group === group);

  const getKOWinner = (p1, p2, group) => {
    const s1 = getKOScore(group, p1?.playerId);
    const s2 = getKOScore(group, p2?.playerId);
    if (!s1 || !s2) return null;
    const ko1 = parseKONotes(s1.notes);
    const ko2 = parseKONotes(s2.notes);
    const result = computeDuelResult(ko1.lanes, ko2.lanes, ko1.sudden, ko2.sudden);
    if (!result.winner) return null;
    return result.winner === 1 ? p1 : p2;
  };

  const isGroupPhaseComplete = (gender) => {
    const groupA = groups[gender]?.['A'] || [];
    const groupB = groups[gender]?.['B'] || [];
    const allIds = [...groupA, ...groupB];
    if (allIds.length === 0) return false;
    return allIds.every(pid => scores.some(s => s.player_id === pid && (s.group === 'A' || s.group === 'B')));
  };

  const koRounds = [];
  if (groups.Herren || groups.Damen) {
    ['Herren', 'Damen'].forEach(gender => {
      const groupComplete = isGroupPhaseComplete(gender);
      const rankA = getGroupRanking(gender, 'A');
      const rankB = getGroupRanking(gender, 'B');
      const p1A = rankA[0], p2A = rankA[1], p1B = rankB[0], p2B = rankB[1];
      const sf1Group = `KO-SF1-${gender.charAt(0)}`;
      const sf2Group = `KO-SF2-${gender.charAt(0)}`;
      const sf1Winner = groupComplete && p1A && p2B ? getKOWinner(p1A, p2B, sf1Group) : null;
      const sf2Winner = groupComplete && p1B && p2A ? getKOWinner(p1B, p2A, sf2Group) : null;

      koRounds.push({
        gender,
        koLabel: 'Halbfinale',
        laneAssignments: {
          1: groupComplete && p1B ? { playerId: p1B.playerId, label: p1B.name, duel: 'HF 2', hasScore: p1B.hasScore } : { label: `1. Platz Gruppe B`, isPlaceholder: true, duel: 'HF 2' },
          2: groupComplete && p2A ? { playerId: p2A.playerId, label: p2A.name, duel: 'HF 2', hasScore: p2A.hasScore } : { label: `2. Platz Gruppe A`, isPlaceholder: true, duel: 'HF 2' },
          3: groupComplete && p1A ? { playerId: p1A.playerId, label: p1A.name, duel: 'HF 1', hasScore: p1A.hasScore } : { label: `1. Platz Gruppe A`, isPlaceholder: true, duel: 'HF 1' },
          4: groupComplete && p2B ? { playerId: p2B.playerId, label: p2B.name, duel: 'HF 1', hasScore: p2B.hasScore } : { label: `2. Platz Gruppe B`, isPlaceholder: true, duel: 'HF 1' },
        },
        _sf1Winner: sf1Winner,
        _sf2Winner: sf2Winner,
        _gender: gender,
      });
    });
    // Finale
    const herrenRound = koRounds.find(r => r._gender === 'Herren');
    const damenRound = koRounds.find(r => r._gender === 'Damen');
    koRounds.push({
      gender: 'Mixed',
      koLabel: 'Finale',
      laneAssignments: {
        1: herrenRound?._sf1Winner ? { playerId: herrenRound._sf1Winner.playerId, label: herrenRound._sf1Winner.name, duel: 'Finale Herren', hasScore: !!getKOScore('KO-FINAL-H', herrenRound._sf1Winner.playerId) } : { label: `Sieger HF Herren`, isPlaceholder: true, duel: 'Finale Herren' },
        2: herrenRound?._sf2Winner ? { playerId: herrenRound._sf2Winner.playerId, label: herrenRound._sf2Winner.name, duel: 'Finale Herren', hasScore: !!getKOScore('KO-FINAL-H', herrenRound._sf2Winner.playerId) } : { label: `Sieger HF Herren`, isPlaceholder: true, duel: 'Finale Herren' },
        3: damenRound?._sf1Winner ? { playerId: damenRound._sf1Winner.playerId, label: damenRound._sf1Winner.name, duel: 'Finale Damen', hasScore: !!getKOScore('KO-FINAL-D', damenRound._sf1Winner.playerId) } : { label: `Sieger HF Damen`, isPlaceholder: true, duel: 'Finale Damen' },
        4: damenRound?._sf2Winner ? { playerId: damenRound._sf2Winner.playerId, label: damenRound._sf2Winner.name, duel: 'Finale Damen', hasScore: !!getKOScore('KO-FINAL-D', damenRound._sf2Winner.playerId) } : { label: `Sieger HF Damen`, isPlaceholder: true, duel: 'Finale Damen' },
      },
    });
  }

  const allRounds = [...groupRounds, ...koRounds];
  const times = generateTimes(startHour, startMinute, slotDuration, allRounds.length);

  if (allRounds.length === 0) {
    header(doc, 'Startplan', tournament);
    doc.setFontSize(12);
    doc.setTextColor(150, 150, 150);
    doc.text('Keine Daten verfügbar – Gruppen müssen zuerst generiert werden.', 14, 50);
    footer(doc, 1);
    savePdf(doc, `Startplan_${tournament.name.replace(/\s+/g, '_')}.pdf`);
    return;
  }

  // Layout
  const pageW = 297;
  const pageH = 210;
  const marginL = 14;
  const tableW = pageW - marginL - 14;
  const timeColW = 28;
  const laneColW = (tableW - timeColW) / laneCount;
  const rowH = 16;
  const headerH = 8;
  const contentAreaH = pageH - 36 - 14;

  const laneX = (lane) => marginL + timeColW + (lane - 1) * laneColW;

  const catFill = (gender) =>
    gender === 'Herren' ? [219, 234, 254] :
    gender === 'Damen' ? [252, 231, 243] :
    [253, 230, 138]; // K.O. amber
  const catText = (gender) =>
    gender === 'Herren' ? [30, 64, 175] :
    gender === 'Damen' ? [157, 23, 77] :
    [120, 53, 15];

  let y = 36;
  let roundIdx = 0;

  const newPage = () => {
    footer(doc, doc.internal.getCurrentPageInfo().pageNumber);
    doc.addPage();
    header(doc, 'Startplan', tournament);
    y = 36;
  };

  // Table header
  const drawTableHeader = () => {
    doc.setFillColor(240, 242, 248);
    doc.rect(marginL, y, tableW, headerH, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(80, 80, 100);
    doc.text('Zeit', marginL + 2, y + 5.5);
    lanes.forEach(lane => {
      const x = laneX(lane);
      doc.text(`Bahn ${lane}`, x + laneColW / 2, y + 5.5, { align: 'center' });
      doc.setDrawColor(210, 214, 226);
      doc.line(x, y, x, y + headerH);
    });
    doc.setTextColor(30, 30, 30);
    y += headerH;
  };

  header(doc, 'Startplan', tournament);
  drawTableHeader();

  allRounds.forEach((round, ri) => {
    if (y + rowH > 36 + contentAreaH) {
      newPage();
      drawTableHeader();
    }

    const time = times[ri] || '';
    const isKO = !!round.koLabel;
    const roundGender = isKO ? (round._gender || round.gender) : round.gender;

    // Row background
    const rowBg = ri % 2 === 0 ? [255, 255, 255] : [248, 249, 253];
    doc.setFillColor(...rowBg);
    doc.rect(marginL, y, tableW, rowH, 'F');

    // Time + label
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text(time, marginL + 2, y + 5);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    if (isKO) {
      doc.setTextColor(120, 53, 15);
      doc.text(round.koLabel, marginL + 2, y + 11);
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text(round.gender === 'Mixed' ? 'H + D' : round.gender, marginL + 2, y + 15);
    } else {
      doc.setTextColor(...catText(round.gender));
      doc.text(round.gender, marginL + 2, y + 11);
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text(`Sp. ${round.range}`, marginL + 2, y + 15);
    }

    // Lane cells
    lanes.forEach(lane => {
      const x = laneX(lane);
      doc.setDrawColor(210, 214, 226);
      doc.line(x, y, x, y + rowH);

      const entry = round.laneAssignments?.[lane];
      if (!entry) {
        doc.setDrawColor(210, 214, 226);
        doc.setLineDashPattern([1.5, 1.5], 0);
        doc.roundedRect(x + 2, y + 2, laneColW - 4, rowH - 4, 1.5, 1.5, 'S');
        doc.setLineDashPattern([], 0);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(200, 200, 210);
        doc.text('–', x + laneColW / 2, y + rowH / 2 + 1, { align: 'center' });
        return;
      }

      // Placeholder entry (KO not yet resolved)
      if (typeof entry === 'object' && !entry.playerId) {
        const entryGender = entry.duel?.includes('Herren') ? 'Herren' : entry.duel?.includes('Damen') ? 'Damen' : roundGender;
        doc.setFillColor(...catFill(entryGender));
        doc.roundedRect(x + 2, y + 2, laneColW - 4, rowH - 4, 2, 2, 'F');
        doc.setFontSize(7);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(...catText(entryGender));
        doc.text(String(entry.label), x + laneColW / 2, y + 7, { align: 'center', maxWidth: laneColW - 6 });
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        doc.text(String(entry.duel || ''), x + laneColW / 2, y + 12, { align: 'center', maxWidth: laneColW - 6 });
        return;
      }

      // Resolved player entry
      if (typeof entry === 'object' && entry.playerId) {
        const entryGender = entry.duel?.includes('Herren') ? 'Herren' : entry.duel?.includes('Damen') ? 'Damen' : roundGender;
        doc.setFillColor(...catFill(entryGender));
        doc.roundedRect(x + 2, y + 2, laneColW - 4, rowH - 4, 2, 2, 'F');
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...catText(entryGender));
        doc.text(String(entry.label), x + laneColW / 2, y + 7, { align: 'center', maxWidth: laneColW - 6 });
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        doc.text(String(entry.duel || ''), x + laneColW / 2, y + 12, { align: 'center', maxWidth: laneColW - 6 });
        return;
      }

      // Real player ID (group phase)
      const p = playerMap[entry];
      doc.setFillColor(...catFill(round.gender));
      doc.roundedRect(x + 2, y + 2, laneColW - 4, rowH - 4, 2, 2, 'F');
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...catText(round.gender));
      doc.text(getPlayerName(entry), x + laneColW / 2, y + 7, { align: 'center', maxWidth: laneColW - 6 });
      doc.setFontSize(6);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...catText(round.gender));
      const phone = canSeePhone ? (p?.phone || '') : '';
      doc.text(phone ? `📱 ${phone}` : '', x + laneColW / 2, y + 12, { align: 'center', maxWidth: laneColW - 6 });
    });

    doc.setDrawColor(220, 222, 230);
    doc.setLineDashPattern([], 0);
    doc.line(marginL, y + rowH, marginL + tableW, y + rowH);
    y += rowH;
  });

  footer(doc, doc.internal.getCurrentPageInfo().pageNumber);
  savePdf(doc, `Startplan_${tournament.name.replace(/\s+/g, '_')}.pdf`);
}

// ── Final Ergebnisse PDF ──────────────────────────────────────────────────────

export async function exportFinalErgebnissePDF({ tournament, scores = [], playerMap = {} }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const dateStr = tournament.date ? new Date(tournament.date).toLocaleDateString('de-AT') : '';
  doc._branding = await fetchBranding(tournament);

  const getPlayerName = (id) => {
    if (!id) return '–';
    const p = playerMap[id];
    if (!p) return id;
    return p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || id;
  };

  let finalGroups = {};
  try { finalGroups = JSON.parse(tournament.final_groups || '{}'); } catch {}
  const groups = finalGroups.groups || {};

  const marginL = 14;
  const tableW = 182;
  const rowH = 7;
  const pageBottom = 272;
  let y = 36;

  const catFill = (gender) =>
    gender === 'Herren' ? [219, 234, 254] : [252, 231, 243];
  const catText = (gender) =>
    gender === 'Herren' ? [30, 64, 175] : [157, 23, 77];
  const medalColor = (i) =>
    i === 0 ? [251, 191, 36] : i === 1 ? [156, 163, 175] : i === 2 ? [180, 120, 60] : [200, 200, 210];

  const checkPage = (needed = 10) => {
    if (y + needed > pageBottom) {
      footer(doc, doc.internal.getCurrentPageInfo().pageNumber);
      doc.addPage();
      header(doc, 'Ergebnisliste', tournament);
      y = 36;
    }
  };

  const getGroupRanking = (gender, groupKey) => {
    const playerIds = groups[gender]?.[groupKey] || [];
    return playerIds.map(pid => {
      const scoreRecord = scores.find(s => s.player_id === pid && s.group === groupKey);
      return {
        playerId: pid,
        name: getPlayerName(pid),
        score: scoreRecord?.score ?? 0,
        ...parseVA(scoreRecord?.notes),
        hasScore: !!scoreRecord,
      };
    }).sort(comparePlayers);
  };

  const getKOScore = (group, playerId) =>
    scores.find(s => s.player_id === playerId && s.group === group);

  const getKOResult = (p1, p2, group) => {
    const s1 = getKOScore(group, p1?.playerId);
    const s2 = getKOScore(group, p2?.playerId);
    if (!s1 || !s2) return null;
    const ko1 = parseKONotes(s1.notes);
    const ko2 = parseKONotes(s2.notes);
    return computeDuelResult(ko1.lanes, ko2.lanes, ko1.sudden, ko2.sudden);
  };

  const drawSectionHeading = (label) => {
    checkPage(12);
    doc.setFillColor(245, 247, 252);
    doc.rect(marginL, y, tableW, 7, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(80, 90, 120);
    doc.text(label.toUpperCase(), marginL + 3, y + 5);
    doc.setTextColor(30, 30, 30);
    y += 8;
  };

  const drawGroupRanking = (gender, groupKey) => {
    const ranked = getGroupRanking(gender, groupKey);
    if (ranked.length === 0) return;

    checkPage(10 + ranked.length * rowH);
    // Group header
    doc.setFillColor(...catFill(gender));
    doc.rect(marginL, y, tableW, 7, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...catText(gender));
    doc.text(`${gender} – Gruppe ${groupKey}`, marginL + 3, y + 5);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.text('V', marginL + tableW - 36, y + 5, { align: 'center' });
    doc.text('A', marginL + tableW - 22, y + 5, { align: 'center' });
    doc.text('∑', marginL + tableW - 4, y + 5, { align: 'right' });
    doc.setTextColor(30, 30, 30);
    y += 7;

    ranked.forEach((p, i) => {
      checkPage(rowH + 1);
      const rowBg = i % 2 === 0 ? [255, 255, 255] : [248, 249, 253];
      doc.setFillColor(...rowBg);
      doc.rect(marginL, y, tableW, rowH, 'F');

      // Medal
      const mc = medalColor(i);
      doc.setFillColor(...mc);
      doc.circle(marginL + 4.5, y + rowH / 2, 2.8, 'F');
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text(String(i + 1), marginL + 4.5, y + rowH / 2 + 1, { align: 'center' });

      // Name
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(8.5);
      doc.setFont('helvetica', i < 2 ? 'bold' : 'normal');
      doc.text(p.name, marginL + 10, y + rowH / 2 + 1.2, { maxWidth: tableW - 55 });

      // V / A / Score
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...catText(gender));
      doc.text(String(p.voll || '–'), marginL + tableW - 36, y + rowH / 2 + 1.2, { align: 'center' });
      doc.text(String(p.abraeumen || '–'), marginL + tableW - 22, y + rowH / 2 + 1.2, { align: 'center' });
      doc.setFont('helvetica', 'bold');
      doc.text(String(p.score || '–'), marginL + tableW - 4, y + rowH / 2 + 1.2, { align: 'right' });
      doc.setTextColor(30, 30, 30);

      // KO qualifier indicator
      if (i < 2 && ranked.every(pl => pl.hasScore)) {
        doc.setFontSize(6);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(34, 197, 94);
        doc.text('→ K.O.', marginL + tableW - 48, y + rowH / 2 + 1.2, { align: 'right' });
        doc.setTextColor(30, 30, 30);
      }

      doc.setDrawColor(220, 224, 235);
      doc.line(marginL, y + rowH, marginL + tableW, y + rowH);
      y += rowH;
    });
    y += 3;
  };

  const drawKODuel = (title, p1, p2, group, gender) => {
    checkPage(20);
    const result = getKOResult(p1, p2, group);

    // Duel header
    doc.setFillColor(...catFill(gender));
    doc.rect(marginL, y, tableW, 7, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...catText(gender));
    doc.text(`${title} (${gender})`, marginL + 3, y + 5);
    if (result?.method) {
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text(result.method, marginL + tableW - 3, y + 5, { align: 'right' });
    }
    doc.setTextColor(30, 30, 30);
    y += 7;

    // Player rows
    [p1, p2].forEach((p, idx) => {
      checkPage(rowH + 1);
      const isWinner = result?.winner === (idx + 1);
      const rowBg = isWinner ? [240, 253, 244] : [250, 250, 253];
      doc.setFillColor(...rowBg);
      doc.rect(marginL, y, tableW, rowH, 'F');

      // Crown for winner
      if (isWinner) {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(251, 191, 36);
        doc.text('★', marginL + 3, y + rowH / 2 + 1.2, { align: 'center' });
      } else {
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(180, 180, 180);
        doc.text(String(idx + 1), marginL + 4.5, y + rowH / 2 + 1, { align: 'center' });
      }

      doc.setTextColor(30, 30, 30);
      doc.setFontSize(8.5);
      doc.setFont('helvetica', isWinner ? 'bold' : 'normal');
      doc.text(p?.name || '–', marginL + 10, y + rowH / 2 + 1.2, { maxWidth: tableW - 60 });

      // Lane scores
      const koScore = getKOScore(group, p?.playerId);
      const ko = parseKONotes(koScore?.notes);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...catText(gender));
      ko.lanes.forEach((lv, li) => {
        doc.text(lv || '–', marginL + tableW - 50 + li * 8, y + rowH / 2 + 1.2, { align: 'center' });
      });

      // Total
      const total = ko.lanes.reduce((s, v) => s + (parseInt(v) || 0), 0);
      doc.setFont('helvetica', 'bold');
      doc.text(String(total), marginL + tableW - 4, y + rowH / 2 + 1.2, { align: 'right' });
      doc.setTextColor(30, 30, 30);

      doc.setDrawColor(220, 224, 235);
      doc.line(marginL, y + rowH, marginL + tableW, y + rowH);
      y += rowH;
    });
    y += 3;
  };

  // ── Render ──
  header(doc, 'Ergebnisliste', tournament);

  if (!groups.Herren && !groups.Damen) {
    doc.setFontSize(12);
    doc.setTextColor(150, 150, 150);
    doc.text('Gruppen noch nicht generiert.', marginL, 50);
    footer(doc, 1);
    savePdf(doc, `Ergebnisse_${tournament.name.replace(/\s+/g, '_')}.pdf`);
    return;
  }

  // 1. Gruppenphase
  drawSectionHeading('Gruppenphase – 120 Wurf');

  ['Herren', 'Damen'].forEach(gender => {
    if (!groups[gender]) return;
    drawGroupRanking(gender, 'A');
    drawGroupRanking(gender, 'B');
  });

  // 2. K.O.-Phase: Halbfinale (Herren, Damen), dann Finale (Herren, Damen)
  const hasKO = ['Herren', 'Damen'].some(gender => {
    if (!groups[gender]) return false;
    const rankA = getGroupRanking(gender, 'A');
    const rankB = getGroupRanking(gender, 'B');
    return rankA[0] && rankA[1] && rankB[0] && rankB[1];
  });

  if (hasKO) {
    y += 2;
    drawSectionHeading('K.O.-Phase – Halbfinale');

    ['Herren', 'Damen'].forEach(gender => {
      if (!groups[gender]) return;
      const rankA = getGroupRanking(gender, 'A');
      const rankB = getGroupRanking(gender, 'B');
      const p1A = rankA[0], p2A = rankA[1], p1B = rankB[0], p2B = rankB[1];
      if (!p1A || !p2A || !p1B || !p2B) return;

      const sf1Group = `KO-SF1-${gender.charAt(0)}`;
      const sf2Group = `KO-SF2-${gender.charAt(0)}`;
      drawKODuel('Halbfinale 1 (1.A vs 2.B)', p1A, p2B, sf1Group, gender);
      drawKODuel('Halbfinale 2 (1.B vs 2.A)', p1B, p2A, sf2Group, gender);
    });

    // Finale
    y += 2;
    drawSectionHeading('K.O.-Phase – Finale');

    ['Herren', 'Damen'].forEach(gender => {
      if (!groups[gender]) return;
      const rankA = getGroupRanking(gender, 'A');
      const rankB = getGroupRanking(gender, 'B');
      const p1A = rankA[0], p2A = rankA[1], p1B = rankB[0], p2B = rankB[1];
      if (!p1A || !p2A || !p1B || !p2B) return;

      const sf1Group = `KO-SF1-${gender.charAt(0)}`;
      const sf2Group = `KO-SF2-${gender.charAt(0)}`;
      const sf1Winner = getKOResult(p1A, p2B, sf1Group)?.winner === 1 ? p1A : p2B;
      const sf2Winner = getKOResult(p1B, p2A, sf2Group)?.winner === 1 ? p1B : p2A;

      if (sf1Winner && sf2Winner) {
        const finalGroup = `KO-FINAL-${gender.charAt(0)}`;
        drawKODuel('Finale', sf1Winner, sf2Winner, finalGroup, gender);
      } else {
        checkPage(10);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.setFont('helvetica', 'italic');
        doc.text(`Finale ${gender}: Noch nicht entschieden.`, marginL + 3, y + 5);
        doc.setTextColor(30, 30, 30);
        y += 8;
      }
    });
  }

  footer(doc, doc.internal.getCurrentPageInfo().pageNumber);
  savePdf(doc, `Ergebnisse_${tournament.name.replace(/\s+/g, '_')}.pdf`);
}