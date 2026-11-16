// Gemeinsame Ranking-Logik und PDF-Generierung für Turnierabschluss-Mail und PDF-Download.
// Das PDF-Format ist identisch mit dem Frontend (exportErgebnissePDF).

// ── Punkteschlüssel (aus tournamentPoints.js) ──
const TIERS = [
  { value: 'Grand Slam', label: 'Grand Slam' },
  { value: 'Masters 1000', label: 'NPT 1000' },
  { value: 'Masters 500', label: 'NPT 500' },
  { value: 'Masters 250', label: 'NPT 250' },
  { value: 'Challenger', label: 'Challengers' },
  { value: 'Finalturnier', label: 'Finalturnier' },
  { value: 'Competition', label: 'Competition' },
];
const POINTS_TABLE = {
  'Grand Slam':   [2000, 1200, 720, 480, 300, 200, 120, 80, 50, 30, 20, 15, 10, 5, 1],
  'Masters 1000': [1000, 600, 360, 240, 150, 100, 60, 40, 25, 15, 10, 8, 5, 2, 1],
  'Masters 500':  [500, 300, 180, 120, 75, 50, 30, 20, 12, 8, 5, 4, 2, 1, 0],
  'Masters 250':  [250, 150, 90, 60, 38, 25, 15, 10, 6, 4, 3, 2, 1, 0, 0],
  'Challenger':   [125, 75, 45, 30, 19, 13, 8, 5, 3, 2, 1, 0, 0, 0, 0],
  'Finalturnier':  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Competition':   [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};
const TIER_LOGO_KEYS: Record<string, string> = {
  'Grand Slam': 'pdf_logo_grand_slam',
  'Masters 1000': 'pdf_logo_masters_1000',
  'Masters 500': 'pdf_logo_masters_500',
  'Masters 250': 'pdf_logo_masters_250',
  'Challenger': 'pdf_logo_challenger',
  'Competition': 'pdf_logo_competition',
};
const AGE_CLASSES_PDF = ['U-15', 'U-19', 'U-23', 'Allgemeine Klasse', 'Ü-50', 'Ü-60'];

// ── Score helpers ──

export function parseAbraeumen(notesStr: string): number {
  try {
    const parsed = JSON.parse(notesStr || '');
    if (parsed?.gesamt === true) return parseInt(parsed.abraeumen) || 0;
    if (Array.isArray(parsed)) return parsed.reduce((s: number, b: any) => s + (parseInt(b.abraeumen) || 0), 0);
  } catch {}
  return 0;
}

export function bestScoreOf(scoreRecords: any[]): any {
  return scoreRecords.reduce((best, s) => {
    if (s.score == null) return best;
    if (!best || s.score > best.score) return s;
    if (s.score === best.score && parseAbraeumen(s.notes) > parseAbraeumen(best.notes)) return s;
    return best;
  }, null);
}

export function getPlayerName(id: string, playerMap: Record<string, any>): string {
  if (!id) return '–';
  const p = playerMap[id];
  if (!p) return id;
  return p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || id;
}

export function collectPlayerEntries(teams: any[], scores: any[], schedules: any[], playerMap: Record<string, any>): any[] {
  const allCandidates: any[] = [];
  teams.forEach(team => {
    [team.player1_id, team.player2_id, team.player3_id, team.player4_id, team.player5_id, team.player6_id]
      .filter(Boolean)
      .forEach((playerId: string) => {
        const teamScores = scores.filter(s => s.team_id === team.id && s.player_id === playerId);
        const best = bestScoreOf(teamScores);
        allCandidates.push({ playerId, teamName: team.name, teamCategory: team.category, score: best?.score ?? null, notes: best?.notes || '' });
      });
  });
  (schedules || [])
    .filter(s => !s.is_placeholder && s.player_id && !s.team_id)
    .forEach(sched => {
      const ezScores = scores.filter(s => !s.team_id && s.player_id === sched.player_id);
      const best = bestScoreOf(ezScores);
      allCandidates.push({ playerId: sched.player_id, teamName: 'Einzelstarter', teamCategory: playerMap?.[sched.player_id]?.category || 'Herren', score: best?.score ?? null, notes: best?.notes || '' });
    });
  const byPlayer: Record<string, any> = {};
  allCandidates.forEach(c => {
    const prev = byPlayer[c.playerId];
    const merged = bestScoreOf([prev, c].filter(Boolean));
    byPlayer[c.playerId] = merged || prev || c;
  });
  return Object.values(byPlayer);
}

export function buildTeamRanked(teams: any[], scores: any[], cat: string, playerMap: Record<string, any>): any[] {
  const catTeams = teams.filter(t => t.category === cat);
  return catTeams.map(team => {
    const seen: Record<string, any> = {};
    scores.filter(s => s.team_id === team.id).forEach(s => {
      const cur = seen[s.player_id];
      if (!cur || s.score > cur.score || (s.score === cur.score && parseNotes(s.notes).abraeumen > parseNotes(cur.notes).abraeumen)) seen[s.player_id] = s;
    });
    const teamScores = Object.values(seen);
    const playerResults = [team.player1_id, team.player2_id, team.player3_id, team.player4_id, team.player5_id, team.player6_id]
      .filter(Boolean).map(pid => {
        const ps = teamScores.find(s => s.player_id === pid);
        const n = parseNotes(ps?.notes);
        const schnitt = n.bahnen > 0 && ps?.score != null ? Math.round((ps.score / n.bahnen) * 10) / 10 : null;
        return { name: getPlayerName(pid, playerMap), score: ps?.score ?? null, voll: n.voll, abraeumen: n.abraeumen, fehlwurf: n.fehlwurf, schnitt };
      }).sort((a, b) => {
        if ((b.score ?? -1) !== (a.score ?? -1)) return (b.score ?? -1) - (a.score ?? -1);
        if ((b.abraeumen ?? -1) !== (a.abraeumen ?? -1)) return (b.abraeumen ?? -1) - (a.abraeumen ?? -1);
        return (a.fehlwurf ?? 999) - (b.fehlwurf ?? 999);
      });
    const total = playerResults.reduce((sum, pr) => sum + (pr.score || 0), 0);
    const vollSum = playerResults.reduce((s, pr) => s + (pr.voll || 0), 0);
    const abraeumenSum = playerResults.reduce((s, pr) => s + (pr.abraeumen || 0), 0);
    const fehlwurfSum = playerResults.reduce((s, pr) => s + (pr.fehlwurf || 0), 0);
    const scoredCount = playerResults.filter(pr => pr.score != null).length;
    const avg = scoredCount > 0 ? Math.round((total / scoredCount) * 10) / 10 : null;
    return { team, total, playerResults, vollSum, abraeumenSum, fehlwurfSum, avg };
  }).filter(row => row.total > 0).sort((a, b) => b.total - a.total);
}

export function buildEinzelRanked(playerEntries: any[], playerMap: Record<string, any>, gender: string): any[] {
  const rows: any[] = [];
  playerEntries.forEach(entry => {
    if (entry.score == null) return;
    const pData = playerMap[entry.playerId];
    const pGender = pData?.category || entry.teamCategory;
    if (pGender !== gender) return;
    rows.push({ name: getPlayerName(entry.playerId, playerMap), score: entry.score });
  });
  return rows.sort((a, b) => b.score - a.score);
}

export function escapeHtml(s: string): string {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── Full notes parser (V/A/F/bahnen) ──
function parseNotes(notesStr: string) {
  try {
    const parsed = JSON.parse(notesStr || '');
    if (parsed?.gesamt === true) {
      return { voll: parseInt(parsed.voll) || 0, abraeumen: parseInt(parsed.abraeumen) || 0, fehlwurf: parseInt(parsed.fehlwurf) || 0, bahnen: 1 };
    }
    if (Array.isArray(parsed)) {
      return {
        voll: parsed.reduce((s: number, b: any) => s + (parseInt(b.voll) || 0), 0),
        abraeumen: parsed.reduce((s: number, b: any) => s + (parseInt(b.abraeumen) || 0), 0),
        fehlwurf: parsed.reduce((s: number, b: any) => s + (parseInt(b.fehlwurf) || 0), 0),
        bahnen: parsed.length,
      };
    }
  } catch {}
  return { voll: null, abraeumen: null, fehlwurf: null, bahnen: 0 };
}

// ── Branding (fetch images as base64 in Deno) ──

async function fetchImageAsDataURL(url: string): Promise<{ dataUrl: string; w: number; h: number } | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    const ct = res.headers.get('content-type') || 'image/png';
    const dataUrl = `data:${ct};base64,${base64}`;
    // Try to get dimensions from PNG/JPEG headers
    let w = 0, h = 0;
    if (ct.includes('png') && bytes.length > 24) {
      w = (bytes[16] << 24 | bytes[17] << 16 | bytes[18] << 8 | bytes[19]) >>> 0;
      h = (bytes[20] << 24 | bytes[21] << 16 | bytes[22] << 8 | bytes[23]) >>> 0;
    } else if (ct.includes('jpeg') || ct.includes('jpg')) {
      let i = 2;
      while (i < bytes.length - 1) {
        if (bytes[i] !== 0xFF) { i++; continue; }
        const marker = bytes[i + 1];
        if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
          h = (bytes[i + 5] << 8) | bytes[i + 6];
          w = (bytes[i + 7] << 8) | bytes[i + 8];
          break;
        }
        const len = (bytes[i + 2] << 8) | bytes[i + 3];
        i += 2 + len;
      }
    }
    return { dataUrl, w: w || 100, h: h || 100 };
  } catch { return null; }
}

async function fetchBranding(base44: any, tournament: any) {
  try {
    const all = await base44.asServiceRole.entities.AppSetting.list('-created_date', 200);
    const map: Record<string, string> = {};
    all.forEach((s: any) => { map[s.key] = s.value; });
    const tourLogoUrl = map['pdf_logo_tour'];
    const tierKey = TIER_LOGO_KEYS[tournament?.tier];
    const tierLogoUrl = tierKey ? map[tierKey] : null;
    let sponsorUrls: string[] = [];
    try { sponsorUrls = JSON.parse(map['pdf_sponsor_logos'] || '[]'); } catch {}
    const [tourLogo, tierLogo, tournamentLogo, ...sponsorData] = await Promise.all([
      tourLogoUrl ? fetchImageAsDataURL(tourLogoUrl) : Promise.resolve(null),
      tierLogoUrl ? fetchImageAsDataURL(tierLogoUrl) : Promise.resolve(null),
      tournament?.logo_url ? fetchImageAsDataURL(tournament.logo_url) : Promise.resolve(null),
      ...sponsorUrls.map(u => fetchImageAsDataURL(u)),
    ]);
    return { tourLogo, tierLogo, tournamentLogo, sponsorLogos: sponsorData.filter(Boolean) };
  } catch {
    return { tourLogo: null, tierLogo: null, tournamentLogo: null, sponsorLogos: [] };
  }
}

function addImageSquareContain(doc: any, logoData: any, x: number, y: number, size: number) {
  if (!logoData) return;
  const dataUrl = typeof logoData === 'string' ? logoData : logoData.dataUrl;
  const w = typeof logoData === 'object' ? logoData.w : null;
  const h = typeof logoData === 'object' ? logoData.h : null;
  const format = dataUrl.includes('image/png') ? 'PNG' : 'JPEG';
  if (w && h) {
    const aspect = w / h;
    let drawW, drawH;
    if (aspect > 1) { drawW = size; drawH = size / aspect; }
    else { drawH = size; drawW = size * aspect; }
    try { doc.addImage(dataUrl, format, x + (size - drawW) / 2, y + (size - drawH) / 2, drawW, drawH); } catch {}
  } else {
    try { doc.addImage(dataUrl, format, x, y, size, size); } catch {}
  }
}

function drawHeader(doc: any, title: string, tournament: any, branding: any) {
  const pageW = doc.internal.pageSize.getWidth();
  const headerH = 32, logoSize = 18, logoGap = 3, margin = 14;
  doc.setFillColor(255, 255, 255); doc.rect(0, 0, pageW, headerH, 'F');
  doc.setDrawColor(210, 210, 210); doc.setLineWidth(0.3); doc.line(0, headerH, pageW, headerH);
  let cursorX = margin;
  const logoY = (headerH - logoSize) / 2;
  if (branding.tourLogo) { addImageSquareContain(doc, branding.tourLogo, cursorX, logoY, logoSize); cursorX += logoSize + logoGap; }
  if (branding.tierLogo) { addImageSquareContain(doc, branding.tierLogo, cursorX, logoY, logoSize); cursorX += logoSize + logoGap; }
  const textX = cursorX + 4;
  const tournamentName = tournament?.name || '';
  const location = tournament?.location || '';
  const startDate = tournament?.date ? new Date(tournament.date).toLocaleDateString('de-AT') : '';
  const endDate = tournament?.end_date ? new Date(tournament.end_date).toLocaleDateString('de-AT') : '';
  const dateRange = startDate && endDate && startDate !== endDate ? `${startDate} – ${endDate}` : startDate;
  const tier = tournament?.tier;
  const tierLabel = TIERS.find(t => t.value === tier)?.label || tier || '';
  const maxPoints = tier ? (POINTS_TABLE[tier]?.[0] || 0) : 0;
  const tierStr = maxPoints > 0 ? `${tierLabel} – ${maxPoints} Pkt` : tierLabel;
  doc.setTextColor(30, 30, 30); doc.setFontSize(14); doc.setFont('helvetica', 'bold');
  doc.text(`${title}  ${tournamentName}`, textX, 11);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
  if (location) doc.text(location, textX, 16);
  if (dateRange) doc.text(`Zeitraum: ${dateRange}`, textX, 21);
  if (tierStr) doc.text(`NPT: ${tierStr}`, textX, 26);
  if (branding.tournamentLogo) {
    addImageSquareContain(doc, branding.tournamentLogo, pageW - margin - logoSize, logoY, logoSize);
  } else if (tournament?.logo_url) {
    addImageSquareContain(doc, branding.tournamentLogo || tournament.logo_url, pageW - margin - logoSize, logoY, logoSize);
  }
  if (branding.sponsorLogos && branding.sponsorLogos.length > 0) {
    const sponsorH = 8, sponsorGap = 3;
    const logos = branding.sponsorLogos.slice(0, 4);
    const widths = logos.map((s: any) => s.w && s.h ? sponsorH * (s.w / s.h) : sponsorH);
    const totalW = widths.reduce((sum: number, w: number) => sum + w + sponsorGap, 0);
    let sx = pageW - margin - logoSize - 6 - totalW + sponsorGap;
    if (!branding.tournamentLogo && !tournament?.logo_url) sx = pageW - margin - totalW + sponsorGap;
    logos.forEach((s: any, i: number) => {
      try { doc.addImage(s.dataUrl, s.dataUrl.includes('png') ? 'PNG' : 'JPEG', sx, (headerH - sponsorH) / 2, widths[i], sponsorH); sx += widths[i] + sponsorGap; } catch {}
    });
  }
  doc.setTextColor(30, 30, 30); doc.setLineWidth(0.2);
}

function drawFooter(doc: any, pageNum: number) {
  const totalPages = doc.internal.getNumberOfPages();
  doc.setFontSize(8); doc.setTextColor(150, 150, 150);
  doc.text(`Seite ${pageNum} / ${totalPages}`, 196, 290, { align: 'right' });
}

// ── PDF-Generierung (identisch mit Frontend exportErgebnissePDF) ──

export async function generateResultsPDF(base44: any, tournament: any, teams: any[], scores: any[], schedules: any[], playerMap: Record<string, any>): Promise<any> {
  const { jsPDF } = await import('npm:jspdf@2.5.2');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let branding = { tourLogo: null, tierLogo: null, tournamentLogo: null, sponsorLogos: [] };
  try {
    branding = await fetchBranding(base44, tournament);
  } catch (e) {
    console.error('Branding fetch failed, continuing without:', e?.message || e);
  }
  drawHeader(doc, 'Ergebnisliste', tournament, branding);

  const pName = (id: string) => getPlayerName(id, playerMap);
  const playerEntries = collectPlayerEntries(teams, scores, schedules, playerMap);
  const sortByTieBreaker = (a: any, b: any) => {
    if (b.score !== a.score) return b.score - a.score;
    if ((b.abraeumen ?? -1) !== (a.abraeumen ?? -1)) return (b.abraeumen ?? -1) - (a.abraeumen ?? -1);
    return (a.fehlwurf ?? 999) - (b.fehlwurf ?? 999);
  };

  const marginL = 14, tableW = 182, rowH = 8, subRowH = 6;
  const catStyle = (cat: string) =>
    cat === 'Herren' ? { bg: [219, 234, 254], text: [30, 64, 175] } :
    cat === 'Damen' ? { bg: [252, 231, 243], text: [157, 23, 77] } :
    { bg: [237, 233, 254], text: [109, 40, 217] };
  const medalColor = (i: number) => i === 0 ? [251, 191, 36] : i === 1 ? [156, 163, 175] : i === 2 ? [180, 120, 60] : [200, 200, 210];

  let y = 36;
  const pageBottom = 272;
  const checkPage = (needed = 10) => {
    if (y + needed > pageBottom) {
      drawFooter(doc, doc.internal.getCurrentPageInfo().pageNumber);
      doc.addPage(); drawHeader(doc, 'Ergebnisliste', tournament, branding); y = 36;
    }
  };
  const ensureFits = (totalHeight: number) => {
    const remaining = pageBottom - y;
    const fullPage = pageBottom - 36;
    if (y > 36 && remaining < totalHeight && totalHeight <= fullPage) {
      drawFooter(doc, doc.internal.getCurrentPageInfo().pageNumber);
      doc.addPage(); drawHeader(doc, 'Ergebnisliste', tournament, branding); y = 36;
    }
  };

  const drawSectionHeading = (label: string) => {
    checkPage(12);
    doc.setFillColor(245, 247, 252); doc.rect(marginL, y, tableW, 7, 'F');
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(80, 90, 120);
    doc.text(label.toUpperCase(), marginL + 3, y + 5); doc.setTextColor(30, 30, 30); y += 8;
  };
  const drawCatHeading = (cat: string) => {
    checkPage(10);
    const cs = catStyle(cat);
    doc.setFillColor(...cs.bg); doc.rect(marginL, y, tableW, rowH, 'F');
    doc.setFontSize(9.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...cs.text);
    doc.text(cat, marginL + 3, y + 5.5); doc.setTextColor(30, 30, 30); y += rowH + 1;
  };
  const drawColHeader = (showTeam = false) => {
    doc.setFillColor(235, 238, 248); doc.rect(marginL, y, tableW, 6, 'F');
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 110, 140);
    doc.text('#', marginL + 4, y + 4.2);
    doc.text('Spieler / Mannschaft', marginL + 16, y + 4.2);
    if (showTeam) doc.text('Mannschaft', marginL + 100, y + 4.2);
    doc.text('Score', marginL + tableW - 3, y + 4.2, { align: 'right' });
    doc.setTextColor(30, 30, 30); y += 6;
  };
  const drawRankRow = (rank: number, label: string, score: any, isBold = true) => {
    checkPage(rowH + 1);
    doc.setFillColor(rank % 2 === 0 ? 255 : 250, rank % 2 === 0 ? 255 : 250, rank % 2 === 0 ? 255 : 253);
    doc.rect(marginL, y, tableW, rowH, 'F');
    const mc = medalColor(rank);
    doc.setFillColor(...mc); doc.circle(marginL + 4.5, y + rowH / 2, 3, 'F');
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
    doc.text(String(rank + 1), marginL + 4.5, y + rowH / 2 + 1.2, { align: 'center' });
    doc.setTextColor(30, 30, 30); doc.setFontSize(9); doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    doc.text(label, marginL + 12, y + 5.5);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 64, 175);
    doc.text(score != null ? String(score) : '–', marginL + tableW - 2, y + 5.5, { align: 'right' });
    doc.setTextColor(30, 30, 30); doc.setDrawColor(220, 224, 235);
    doc.line(marginL, y + rowH, marginL + tableW, y + rowH); y += rowH;
  };
  const drawSubRow = (label: string, teamName: string | null, score: any) => {
    checkPage(subRowH + 1);
    doc.setFillColor(248, 249, 253); doc.rect(marginL + 8, y, tableW - 8, subRowH, 'F');
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(90, 95, 120);
    doc.text(`· ${label}`, marginL + 14, y + 4.2);
    if (teamName) doc.text(teamName, marginL + 100, y + 4.2);
    doc.setTextColor(30, 30, 30); doc.setFont('helvetica', 'bold');
    doc.text(score != null ? String(score) : '–', marginL + tableW - 2, y + 4.2, { align: 'right' });
    doc.setDrawColor(230, 233, 244); doc.line(marginL + 8, y + subRowH, marginL + tableW, y + subRowH); y += subRowH;
  };

  // ── 1. Mannschaftswertung ──
  let mannschaftHeadingDrawn = false;
  const herrenTeams = buildTeamRanked(teams, scores, 'Herren', playerMap);
  const damenTeams = buildTeamRanked(teams, scores, 'Damen', playerMap);

  if (herrenTeams.length > 0 || damenTeams.length > 0) {
    const colW = (tableW - 4) / 2;
    const colRight = marginL + colW + 4;
    const subRowH2 = 7, colHdrH = 7, teamRowH = 8, playerRowH = 6;
    const maxTeamsEst = Math.max(herrenTeams.length, damenTeams.length);
    const maxPlayersEst = Math.max(...herrenTeams.map(t => t.playerResults.length), ...damenTeams.map(t => t.playerResults.length), 0);
    const estimatedH = colHdrH + maxTeamsEst * (teamRowH + maxPlayersEst * playerRowH);
    ensureFits(estimatedH + 8);
    if (!mannschaftHeadingDrawn) { drawSectionHeading('Mannschaftswertung'); mannschaftHeadingDrawn = true; }

    const drawSideBySideColHeader = () => {
      doc.setFillColor(219, 234, 254); doc.rect(marginL, y, colW, colHdrH, 'F');
      doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 64, 175);
      doc.text('Herren', marginL + 3, y + 5);
      doc.setFontSize(6.5); doc.setFont('helvetica', 'normal');
      doc.text('V', marginL + colW - 46, y + 5, { align: 'center' });
      doc.text('A', marginL + colW - 35, y + 5, { align: 'center' });
      doc.text('F', marginL + colW - 24, y + 5, { align: 'center' });
      doc.text('G', marginL + colW - 13, y + 5, { align: 'center' });
      doc.text('Ø', marginL + colW - 2, y + 5, { align: 'right' });
      doc.setFillColor(252, 231, 243); doc.rect(colRight, y, colW, colHdrH, 'F');
      doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(157, 23, 77);
      doc.text('Damen', colRight + 3, y + 5);
      doc.setFontSize(6.5); doc.setFont('helvetica', 'normal');
      doc.text('V', colRight + colW - 46, y + 5, { align: 'center' });
      doc.text('A', colRight + colW - 35, y + 5, { align: 'center' });
      doc.text('F', colRight + colW - 24, y + 5, { align: 'center' });
      doc.text('G', colRight + colW - 13, y + 5, { align: 'center' });
      doc.text('Ø', colRight + colW - 2, y + 5, { align: 'right' });
      doc.setTextColor(30, 30, 30); y += colHdrH;
    };
    const drawTeamSideRow = (colX: number, colTextColor: number[], rankIdx: number, teamRow: any) => {
      if (!teamRow) return;
      const mc = medalColor(rankIdx);
      doc.setFillColor(...mc); doc.circle(colX + 4, y + teamRowH / 2, 3, 'F');
      doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
      doc.text(String(rankIdx + 1), colX + 4, y + teamRowH / 2 + 1.2, { align: 'center' });
      doc.setTextColor(30, 30, 30); doc.setFontSize(8.5); doc.setFont('helvetica', 'bold');
      doc.text(teamRow.team.name, colX + 10, y + teamRowH / 2 + 1.2, { maxWidth: colW - 52 });
      doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 85, 110); doc.setFontSize(7);
      if (teamRow.vollSum != null) doc.text(String(teamRow.vollSum), colX + colW - 46, y + teamRowH / 2 + 1.2, { align: 'center' });
      if (teamRow.abraeumenSum != null) doc.text(String(teamRow.abraeumenSum), colX + colW - 35, y + teamRowH / 2 + 1.2, { align: 'center' });
      if (teamRow.fehlwurfSum != null) doc.text(String(teamRow.fehlwurfSum), colX + colW - 24, y + teamRowH / 2 + 1.2, { align: 'center' });
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...colTextColor);
      doc.text(String(teamRow.total || '–'), colX + colW - 13, y + teamRowH / 2 + 1.2, { align: 'center' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(80, 85, 110);
      if (teamRow.avg != null) doc.text(String(teamRow.avg), colX + colW - 2, y + teamRowH / 2 + 1.2, { align: 'right' });
      doc.setTextColor(30, 30, 30);
    };
    const drawPlayerSideRow = (colX: number, colTextColor: number[], pr: any) => {
      doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(90, 95, 120);
      doc.text(`· ${pr.name}`, colX + 8, y + playerRowH / 2 + 1.5, { maxWidth: colW - 52 });
      doc.setTextColor(80, 85, 110); doc.setFontSize(6.5);
      if (pr.voll != null) doc.text(String(pr.voll), colX + colW - 46, y + playerRowH / 2 + 1.5, { align: 'center' });
      if (pr.abraeumen != null) doc.text(String(pr.abraeumen), colX + colW - 35, y + playerRowH / 2 + 1.5, { align: 'center' });
      if (pr.fehlwurf != null) doc.text(String(pr.fehlwurf), colX + colW - 24, y + playerRowH / 2 + 1.5, { align: 'center' });
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...colTextColor); doc.setFontSize(7);
      doc.text(pr.score != null ? String(pr.score) : '–', colX + colW - 13, y + playerRowH / 2 + 1.5, { align: 'center' });
      doc.setTextColor(30, 30, 30);
    };

    checkPage(20); drawSideBySideColHeader();
    const maxTeams = Math.max(herrenTeams.length, damenTeams.length);
    for (let i = 0; i < maxTeams; i++) {
      const hRow = herrenTeams[i], dRow = damenTeams[i];
      const maxPlayers = Math.max(hRow?.playerResults?.length || 0, dRow?.playerResults?.length || 0);
      const rowsNeeded = teamRowH + maxPlayers * playerRowH + 2;
      checkPage(rowsNeeded);
      const rowBg = i % 2 === 0 ? [255, 255, 255] : [250, 250, 253];
      doc.setFillColor(...rowBg); doc.rect(marginL, y, colW, teamRowH, 'F');
      doc.setFillColor(...rowBg); doc.rect(colRight, y, colW, teamRowH, 'F');
      drawTeamSideRow(marginL, [30, 64, 175], i, hRow);
      drawTeamSideRow(colRight, [157, 23, 77], i, dRow);
      doc.setDrawColor(220, 224, 235); doc.line(marginL, y + teamRowH, marginL + tableW, y + teamRowH); y += teamRowH;
      for (let pi = 0; pi < maxPlayers; pi++) {
        doc.setFillColor(248, 249, 253); doc.rect(marginL, y, colW, playerRowH, 'F'); doc.rect(colRight, y, colW, playerRowH, 'F');
        if (hRow?.playerResults[pi]) drawPlayerSideRow(marginL, [30, 64, 175], hRow.playerResults[pi]);
        if (dRow?.playerResults[pi]) drawPlayerSideRow(colRight, [157, 23, 77], dRow.playerResults[pi]);
        doc.setDrawColor(230, 233, 244); doc.line(marginL, y + playerRowH, marginL + tableW, y + playerRowH); y += playerRowH;
      }
    }
    y += 6;
  }

  // Mixed below
  const mixedTeams = buildTeamRanked(teams, scores, 'Mixed', playerMap);
  if (mixedTeams.length > 0) {
    const mixedH = 8 + 6 + mixedTeams.reduce((sum, row) => sum + rowH + row.playerResults.length * subRowH, 0);
    ensureFits(mixedH + (mannschaftHeadingDrawn ? 0 : 8));
    if (!mannschaftHeadingDrawn) { drawSectionHeading('Mannschaftswertung'); mannschaftHeadingDrawn = true; }
    checkPage(rowH + 6 + rowH + subRowH);
    drawCatHeading('Mixed'); drawColHeader(false);
    mixedTeams.forEach((row, i) => {
      checkPage(rowH + row.playerResults.length * subRowH);
      drawRankRow(i, row.team.name, row.total, true);
      row.playerResults.forEach(pr => {
        const parts: string[] = [];
        if (pr.voll != null) parts.push(`V:${pr.voll}`);
        if (pr.abraeumen != null) parts.push(`A:${pr.abraeumen}`);
        if (pr.fehlwurf != null) parts.push(`F:${pr.fehlwurf}`);
        const label = parts.length > 0 ? `${pr.name}  (${parts.join(' / ')})` : pr.name;
        drawSubRow(label, null, pr.score);
      });
    });
    y += 4;
  }

  // ── 2. Einzelwertung Herren / Damen side by side ──
  const buildGenderRows = (gender: string) => {
    const rows: any[] = [];
    playerEntries.forEach(entry => {
      if (entry.score == null) return;
      const pData = playerMap[entry.playerId];
      const pGender = pData?.category || entry.teamCategory;
      if (pGender !== gender) return;
      const n = parseNotes(entry.notes);
      rows.push({ name: pName(entry.playerId), score: entry.score, voll: n.voll, abraeumen: n.abraeumen, fehlwurf: n.fehlwurf });
    });
    return rows.sort(sortByTieBreaker);
  };
  const herrenRows = buildGenderRows('Herren');
  const damenRows = buildGenderRows('Damen');

  if (herrenRows.length > 0 || damenRows.length > 0) {
    const colW = (tableW - 4) / 2;
    const colRight = marginL + colW + 4;
    const subRowH2 = 7;
    const medalColor2 = (i: number) => i === 0 ? [251, 191, 36] : i === 1 ? [156, 163, 175] : i === 2 ? [180, 120, 60] : [200, 200, 210];
    const einzelH = 8 + 7 + Math.max(herrenRows.length, damenRows.length) * subRowH2;
    y += 4; ensureFits(einzelH + 15);
    checkPage(7 + 7 + subRowH2);
    doc.setFillColor(245, 247, 252); doc.rect(marginL, y, tableW, 7, 'F');
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(80, 90, 120);
    doc.text('EINZELWERTUNG HERREN / DAMEN', marginL + 3, y + 5); doc.setTextColor(30, 30, 30); y += 8;
    doc.setFillColor(219, 234, 254); doc.rect(marginL, y, colW, 7, 'F');
    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 64, 175);
    doc.text('Herren', marginL + 3, y + 5);
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal');
    doc.text('V', marginL + colW - 46, y + 5, { align: 'center' });
    doc.text('A', marginL + colW - 35, y + 5, { align: 'center' });
    doc.text('F', marginL + colW - 24, y + 5, { align: 'center' });
    doc.text('G', marginL + colW - 13, y + 5, { align: 'center' });
    doc.setFillColor(252, 231, 243); doc.rect(colRight, y, colW, 7, 'F');
    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(157, 23, 77);
    doc.text('Damen', colRight + 3, y + 5);
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal');
    doc.text('V', colRight + colW - 46, y + 5, { align: 'center' });
    doc.text('A', colRight + colW - 35, y + 5, { align: 'center' });
    doc.text('F', colRight + colW - 24, y + 5, { align: 'center' });
    doc.text('G', colRight + colW - 13, y + 5, { align: 'center' });
    doc.setTextColor(30, 30, 30); y += 7;

    const maxRows = Math.max(herrenRows.length, damenRows.length);
    for (let i = 0; i < maxRows; i++) {
      checkPage(subRowH2 + 1);
      const rowBg = i % 2 === 0 ? [255, 255, 255] : [250, 250, 253];
      doc.setFillColor(...rowBg); doc.rect(marginL, y, colW, subRowH2, 'F'); doc.rect(colRight, y, colW, subRowH2, 'F');
      if (herrenRows[i]) {
        const mc = medalColor2(i);
        doc.setFillColor(...mc); doc.circle(marginL + 4, y + subRowH2 / 2, 2.5, 'F');
        doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
        doc.text(String(i + 1), marginL + 4, y + subRowH2 / 2 + 1, { align: 'center' });
        doc.setTextColor(30, 30, 30); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
        doc.text(herrenRows[i].name, marginL + 10, y + subRowH2 / 2 + 1.2, { maxWidth: colW - 52 });
        doc.setTextColor(80, 85, 110); doc.setFontSize(6.5);
        if (herrenRows[i].voll != null) doc.text(String(herrenRows[i].voll), marginL + colW - 46, y + subRowH2 / 2 + 1.2, { align: 'center' });
        if (herrenRows[i].abraeumen != null) doc.text(String(herrenRows[i].abraeumen), marginL + colW - 35, y + subRowH2 / 2 + 1.2, { align: 'center' });
        if (herrenRows[i].fehlwurf != null) doc.text(String(herrenRows[i].fehlwurf), marginL + colW - 24, y + subRowH2 / 2 + 1.2, { align: 'center' });
        doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 64, 175); doc.setFontSize(7.5);
        doc.text(String(herrenRows[i].score), marginL + colW - 13, y + subRowH2 / 2 + 1.2, { align: 'center' });
      }
      if (damenRows[i]) {
        const mc = medalColor2(i);
        doc.setFillColor(...mc); doc.circle(colRight + 4, y + subRowH2 / 2, 2.5, 'F');
        doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
        doc.text(String(i + 1), colRight + 4, y + subRowH2 / 2 + 1, { align: 'center' });
        doc.setTextColor(30, 30, 30); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
        doc.text(damenRows[i].name, colRight + 10, y + subRowH2 / 2 + 1.2, { maxWidth: colW - 52 });
        doc.setTextColor(80, 85, 110); doc.setFontSize(6.5);
        if (damenRows[i].voll != null) doc.text(String(damenRows[i].voll), colRight + colW - 46, y + subRowH2 / 2 + 1.2, { align: 'center' });
        if (damenRows[i].abraeumen != null) doc.text(String(damenRows[i].abraeumen), colRight + colW - 35, y + subRowH2 / 2 + 1.2, { align: 'center' });
        if (damenRows[i].fehlwurf != null) doc.text(String(damenRows[i].fehlwurf), colRight + colW - 24, y + subRowH2 / 2 + 1.2, { align: 'center' });
        doc.setFont('helvetica', 'bold'); doc.setTextColor(157, 23, 77); doc.setFontSize(7.5);
        doc.text(String(damenRows[i].score), colRight + colW - 13, y + subRowH2 / 2 + 1.2, { align: 'center' });
      }
      doc.setDrawColor(220, 224, 235); doc.line(marginL, y + subRowH2, marginL + tableW, y + subRowH2);
      doc.setTextColor(30, 30, 30); y += subRowH2;
    }
    y += 4;
  }

  // ── 3. Einzelwertung nach Altersklassen ──
  const hasAgeData = AGE_CLASSES_PDF.some(ac =>
    playerEntries.some(entry => {
      const pData = playerMap[entry.playerId];
      return pData && (pData.age_class || 'Allgemeine Klasse') === ac && entry.score != null;
    })
  );
  if (hasAgeData) {
    const colW2 = (tableW - 4) / 2;
    const colRight2 = marginL + colW2 + 4;
    const ageRowH = 7;
    const medalColor3 = (i: number) => i === 0 ? [251, 191, 36] : i === 1 ? [156, 163, 175] : i === 2 ? [180, 120, 60] : [200, 200, 210];
    const buildAgeRows = (ageClass: string, gender: string) => {
      const rows: any[] = [];
      playerEntries.forEach(entry => {
        if (entry.score == null) return;
        const pData = playerMap[entry.playerId];
        if (!pData) return;
        if ((pData.age_class || 'Allgemeine Klasse') !== ageClass) return;
        if ((pData.category || entry.teamCategory) !== gender) return;
        const n = parseNotes(entry.notes);
        rows.push({ name: pName(entry.playerId), score: entry.score, voll: n.voll, abraeumen: n.abraeumen, fehlwurf: n.fehlwurf });
      });
      return rows.sort(sortByTieBreaker);
    };
    let ageHeadingDrawn = false;
    AGE_CLASSES_PDF.forEach(ageClass => {
      const hRows = buildAgeRows(ageClass, 'Herren');
      const dRows = buildAgeRows(ageClass, 'Damen');
      if (hRows.length === 0 && dRows.length === 0) return;
      const blockH = 7 + Math.max(hRows.length, dRows.length) * ageRowH;
      const headingExtra = ageHeadingDrawn ? 0 : 19;
      ensureFits(blockH + headingExtra);
      if (!ageHeadingDrawn) { y += 4; drawSectionHeading('Einzelwertung nach Altersklassen'); ageHeadingDrawn = true; }
      checkPage(blockH + 8);
      doc.setFillColor(245, 247, 252); doc.rect(marginL, y, tableW, 6, 'F');
      doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(80, 90, 120);
      doc.text(ageClass.toUpperCase(), marginL + 3, y + 4.2); doc.setTextColor(30, 30, 30); y += 6;
      doc.setFillColor(219, 234, 254); doc.rect(marginL, y, colW2, 6, 'F');
      doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 64, 175);
      doc.text('Herren', marginL + 3, y + 4.2);
      doc.setFontSize(6); doc.setFont('helvetica', 'normal');
      doc.text('V', marginL + colW2 - 46, y + 4.2, { align: 'center' });
      doc.text('A', marginL + colW2 - 35, y + 4.2, { align: 'center' });
      doc.text('F', marginL + colW2 - 24, y + 4.2, { align: 'center' });
      doc.text('G', marginL + colW2 - 13, y + 4.2, { align: 'center' });
      doc.setFillColor(252, 231, 243); doc.rect(colRight2, y, colW2, 6, 'F');
      doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(157, 23, 77);
      doc.text('Damen', colRight2 + 3, y + 4.2);
      doc.setFontSize(6); doc.setFont('helvetica', 'normal');
      doc.text('V', colRight2 + colW2 - 46, y + 4.2, { align: 'center' });
      doc.text('A', colRight2 + colW2 - 35, y + 4.2, { align: 'center' });
      doc.text('F', colRight2 + colW2 - 24, y + 4.2, { align: 'center' });
      doc.text('G', colRight2 + colW2 - 13, y + 4.2, { align: 'center' });
      doc.setTextColor(30, 30, 30); y += 6;
      const maxRows2 = Math.max(hRows.length, dRows.length);
      for (let i = 0; i < maxRows2; i++) {
        checkPage(ageRowH + 1);
        const rowBg = i % 2 === 0 ? [255, 255, 255] : [250, 250, 253];
        doc.setFillColor(...rowBg); doc.rect(marginL, y, colW2, ageRowH, 'F'); doc.rect(colRight2, y, colW2, ageRowH, 'F');
        if (hRows[i]) {
          const mc = medalColor3(i);
          doc.setFillColor(...mc); doc.circle(marginL + 4, y + ageRowH / 2, 2.5, 'F');
          doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
          doc.text(String(i + 1), marginL + 4, y + ageRowH / 2 + 1, { align: 'center' });
          doc.setTextColor(30, 30, 30); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
          doc.text(hRows[i].name, marginL + 10, y + ageRowH / 2 + 1.2, { maxWidth: colW2 - 52 });
          doc.setTextColor(80, 85, 110); doc.setFontSize(6.5);
          if (hRows[i].voll != null) doc.text(String(hRows[i].voll), marginL + colW2 - 46, y + ageRowH / 2 + 1.2, { align: 'center' });
          if (hRows[i].abraeumen != null) doc.text(String(hRows[i].abraeumen), marginL + colW2 - 35, y + ageRowH / 2 + 1.2, { align: 'center' });
          if (hRows[i].fehlwurf != null) doc.text(String(hRows[i].fehlwurf), marginL + colW2 - 24, y + ageRowH / 2 + 1.2, { align: 'center' });
          doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 64, 175); doc.setFontSize(7.5);
          doc.text(String(hRows[i].score), marginL + colW2 - 13, y + ageRowH / 2 + 1.2, { align: 'center' });
        }
        if (dRows[i]) {
          const mc = medalColor3(i);
          doc.setFillColor(...mc); doc.circle(colRight2 + 4, y + ageRowH / 2, 2.5, 'F');
          doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
          doc.text(String(i + 1), colRight2 + 4, y + ageRowH / 2 + 1, { align: 'center' });
          doc.setTextColor(30, 30, 30); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
          doc.text(dRows[i].name, colRight2 + 10, y + ageRowH / 2 + 1.2, { maxWidth: colW2 - 52 });
          doc.setTextColor(80, 85, 110); doc.setFontSize(6.5);
          if (dRows[i].voll != null) doc.text(String(dRows[i].voll), colRight2 + colW2 - 46, y + ageRowH / 2 + 1.2, { align: 'center' });
          if (dRows[i].abraeumen != null) doc.text(String(dRows[i].abraeumen), colRight2 + colW2 - 35, y + ageRowH / 2 + 1.2, { align: 'center' });
          if (dRows[i].fehlwurf != null) doc.text(String(dRows[i].fehlwurf), colRight2 + colW2 - 24, y + ageRowH / 2 + 1.2, { align: 'center' });
          doc.setFont('helvetica', 'bold'); doc.setTextColor(157, 23, 77); doc.setFontSize(7.5);
          doc.text(String(dRows[i].score), colRight2 + colW2 - 13, y + ageRowH / 2 + 1.2, { align: 'center' });
        }
        doc.setDrawColor(220, 224, 235); doc.line(marginL, y + ageRowH, marginL + tableW, y + ageRowH);
        doc.setTextColor(30, 30, 30); y += ageRowH;
      }
      y += 4;
    });
  }

  drawFooter(doc, doc.internal.getCurrentPageInfo().pageNumber);
  return doc;
}