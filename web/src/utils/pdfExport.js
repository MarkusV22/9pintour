import jsPDF from 'jspdf';
import { base44 } from '@/api/base44Client';
import { savePdf } from '@/utils/pdfDownload';
import { TIERS, POINTS_TABLE, getTierLabel } from '@/lib/tournamentPoints';
import { collectPlayerEntries } from '@/lib/collectPlayerEntries';
import { getVenues, venueKeyOf } from '@/lib/venues';

// ── helpers ──────────────────────────────────────────────────────────────────

// Draw an image inside a square box, preserving aspect ratio (contain)
export function addImageSquareContain(doc, logoData, x, y, size) {
  if (!logoData) return;
  const dataUrl = typeof logoData === 'string' ? logoData : logoData.dataUrl;
  const w = typeof logoData === 'object' ? logoData.w : null;
  const h = typeof logoData === 'object' ? logoData.h : null;
  if (w && h) {
    const aspect = w / h;
    let drawW, drawH;
    if (aspect > 1) { drawW = size; drawH = size / aspect; }
    else { drawH = size; drawW = size * aspect; }
    try { doc.addImage(dataUrl, 'PNG', x + (size - drawW) / 2, y + (size - drawH) / 2, drawW, drawH); } catch (e) {}
  } else {
    try { doc.addImage(dataUrl, 'PNG', x, y, size, size); } catch (e) {}
  }
}

export function header(doc, title, tournament) {
  const pageW = doc.internal.pageSize.getWidth();
  const branding = doc._branding || {};
  const headerH = 32;
  const logoSize = 18;
  const logoGap = 3;
  const margin = 14;

  // White background
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageW, headerH, 'F');

  // Bottom border line
  doc.setDrawColor(210, 210, 210);
  doc.setLineWidth(0.3);
  doc.line(0, headerH, pageW, headerH);

  let cursorX = margin;
  const logoY = (headerH - logoSize) / 2;

  // Tour logo (square, left)
  if (branding.tourLogo) {
    addImageSquareContain(doc, branding.tourLogo, cursorX, logoY, logoSize);
    cursorX += logoSize + logoGap;
  }

  // Tier logo (same square size, next to tour logo)
  if (branding.tierLogo) {
    addImageSquareContain(doc, branding.tierLogo, cursorX, logoY, logoSize);
    cursorX += logoSize + logoGap;
  }

  // Info text next to logos
  const textX = cursorX + 4;
  const tournamentName = tournament?.name || '';
  // Bei Multi-Spielort-Turnieren alle Spielorte anzeigen (statt nur der ersten Adresse)
  const venues = getVenues(tournament);
  const location = venues.length > 1
    ? venues.map(v => [v.name, v.location].filter(Boolean).join(', ')).join('  ·  ')
    : (tournament?.location || '');

  // Date range (von – bis)
  const startDate = tournament?.date ? new Date(tournament.date).toLocaleDateString('de-AT') : '';
  const endDate = tournament?.end_date ? new Date(tournament.end_date).toLocaleDateString('de-AT') : '';
  const dateRange = startDate && endDate && startDate !== endDate ? `${startDate} – ${endDate}` : startDate;

  // NPT Wertung + Punkte (1st-place points)
  const tier = tournament?.tier;
  const isFuture = tournament?.series_type === 'future';
  const tierLabel = getTierLabel(tournament);
  const maxPoints = tier ? (POINTS_TABLE[tier]?.[0] || 0) : 0;
  const tierStr = isFuture ? tierLabel : (maxPoints > 0 ? `${tierLabel} – ${maxPoints} Pkt` : tierLabel);

  // Line 1: title + tournament name (bold)
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(`${title}  ${tournamentName}`, textX, 11);

  // Lines 2–4: location, date range, tier (normal, gray)
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  if (location) doc.text(location, textX, 16);
  if (dateRange) doc.text(`Zeitraum: ${dateRange}`, textX, 21);
  if (tierStr) doc.text(isFuture ? tierStr : `NPT: ${tierStr}`, textX, 26);

  // Tournament logo on the far right (square)
  if (branding.tournamentLogo) {
    addImageSquareContain(doc, branding.tournamentLogo, pageW - margin - logoSize, logoY, logoSize);
  } else if (tournament?.logo_url) {
    addImageSquareContain(doc, tournament.logo_url, pageW - margin - logoSize, logoY, logoSize);
  }

  // Sponsor logos (small, between text and tournament logo)
  if (branding.sponsorLogos && branding.sponsorLogos.length > 0) {
    const sponsorH = 8;
    const sponsorGap = 3;
    const logos = branding.sponsorLogos.slice(0, 4);
    const widths = logos.map(s => s.w && s.h ? sponsorH * (s.w / s.h) : sponsorH);
    const totalW = widths.reduce((sum, w) => sum + w + sponsorGap, 0);
    let sx = pageW - margin - logoSize - 6 - totalW + sponsorGap;
    if (branding.tournamentLogo || tournament?.logo_url) {
      // sponsors left of tournament logo
    } else {
      sx = pageW - margin - totalW + sponsorGap;
    }
    logos.forEach((s, i) => {
      try {
        doc.addImage(s.dataUrl, 'PNG', sx, (headerH - sponsorH) / 2, widths[i], sponsorH);
        sx += widths[i] + sponsorGap;
      } catch (e) {}
    });
  }

  doc.setTextColor(30, 30, 30);
  doc.setLineWidth(0.2);
}

export function footer(doc, pageNum) {
  const totalPages = doc.internal.getNumberOfPages();
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(`Seite ${pageNum} / ${totalPages}`, 196, 290, { align: 'right' });
}

// ── Branding helpers ──────────────────────────────────────────────────────────

const TIER_LOGO_KEYS = {
  'Grand Slam': 'pdf_logo_grand_slam',
  'Masters 1000': 'pdf_logo_masters_1000',
  'Masters 500': 'pdf_logo_masters_500',
  'Masters 250': 'pdf_logo_masters_250',
  'Challenger': 'pdf_logo_challenger',
  'Competition': 'pdf_logo_competition',
};

async function loadImageAsDataURL(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      try {
        resolve({ dataUrl: canvas.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export async function fetchBranding(tournament) {
  try {
    const all = await base44.entities.AppSetting.list();
    const map = {};
    all.forEach(s => { map[s.key] = s.value; });

    const tourLogoUrl = map['pdf_logo_tour'];
    const tierKey = TIER_LOGO_KEYS[tournament?.tier];
    // 9PinFuture: eigenes Logo verwenden (Fallback: normales Tier-Logo)
    const tierLogoUrl = tournament?.series_type === 'future'
      ? (map['pdf_logo_future'] || (tierKey ? map[tierKey] : null))
      : (tierKey ? map[tierKey] : null);
    let sponsorUrls = [];
    try { sponsorUrls = JSON.parse(map['pdf_sponsor_logos'] || '[]'); } catch {}

    const [tourLogo, tierLogo, tournamentLogo, ...sponsorData] = await Promise.all([
      tourLogoUrl ? loadImageAsDataURL(tourLogoUrl) : Promise.resolve(null),
      tierLogoUrl ? loadImageAsDataURL(tierLogoUrl) : Promise.resolve(null),
      tournament?.logo_url ? loadImageAsDataURL(tournament.logo_url) : Promise.resolve(null),
      ...sponsorUrls.map(u => loadImageAsDataURL(u)),
    ]);

    return {
      tourLogo: tourLogo || null,
      tierLogo: tierLogo || null,
      tournamentLogo: tournamentLogo || null,
      sponsorLogos: sponsorData.filter(Boolean),
    };
  } catch {
    return { tourLogo: null, tierLogo: null, tournamentLogo: null, sponsorLogos: [] };
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

function generateSlots(startHour, endHour, slotMinutes, startMinute = 0, endMinute = 0) {
  const slots = [];
  let totalMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;
  while (totalMinutes < endMinutes) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    slots.push(String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'));
    totalMinutes += slotMinutes;
  }
  return slots;
}

// ── Startplan PDF ─────────────────────────────────────────────────────────────

export async function exportStartplanPDF({ tournament, teams, schedules, dayConfigs = [], slotDuration = 60, playerMap = {} }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc._branding = await fetchBranding(tournament);

  const getPlayerName = (id) => {
    if (!id) return null;
    const p = playerMap[id];
    if (!p) return null;
    return p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || null;
  };

  // 9PinFuture: Altersklasse des Spielers anzeigen
  const isFutureSeries = tournament.series_type === 'future';
  const ageClassOf = (pid) => (isFutureSeries && pid && playerMap[pid]?.age_class) || '';

  header(doc, 'Startplan', tournament);

  // Multi-Spielort (9PinFuture): pro Spielort ein eigener Startplan-Abschnitt
  // mit eigenen Bahnen. Einzel-Spielort-Turniere bleiben unverändert.
  const venues = getVenues(tournament);
  const isMultiVenue = venues.length > 1;

  // Layout constants (landscape A4 = 297 × 210)
  const pageW = 297;
  const pageH = 210;
  const marginL = 14;
  const tableW = pageW - marginL - 14; // 269
  const timeColW = 22;
  const rowH = 14;
  const headerH = 8;
  const dayHeadingH = 8; // day title bar
  const venueHeadingH = 8; // venue title bar
  const contentAreaH = pageH - 36 - 14; // usable height after page header and footer margin

  let y = 36;
  let firstVenueSection = true;

  const newPage = () => {
    footer(doc, doc.internal.getCurrentPageInfo().pageNumber);
    doc.addPage();
    header(doc, 'Startplan', tournament);
    y = 36;
  };

  venues.forEach((venue, venueIdx) => {
    const venueSchedules = isMultiVenue
      ? schedules.filter(s => venueKeyOf(s) === String(venue.index))
      : schedules;
    const laneCount = isMultiVenue ? (venue.lane_count || 4) : (tournament.lane_count || 4);
    const laneColW = (tableW - timeColW) / laneCount;
    const LANES = Array.from({ length: laneCount }, (_, i) => i + 1);
    const getTeam = (id) => teams.find(t => t.id === id);

    // Columns: Zeit | Bahn1 | Bahn2 | ...
    const laneX = (lane) => marginL + timeColW + (lane - 1) * laneColW;

    // Collect all days — prefer dayConfigs (with time ranges), fall back to schedules
    const scheduledDays = [...new Set(venueSchedules.map(s => s.day || 'Tag 1'))];
    const configuredDayNames = dayConfigs.map(d => d.name);
    const allDayNames = [...new Set([...configuredDayNames, ...scheduledDays])];
    allDayNames.sort();
    if (allDayNames.length === 0) return;

    // Build a map of day -> time slots (from config or from scheduled times)
    const getDaySlots = (dayName) => {
      const cfg = dayConfigs.find(d => d.name === dayName);
      if (cfg) {
        return generateSlots(cfg.startHour, cfg.endHour, slotDuration, cfg.startMinute ?? 0, cfg.endMinute ?? 0);
      }
      // fallback: use scheduled times for this day
      const daySchedules = venueSchedules.filter(s => (s.day || 'Tag 1') === dayName);
      return [...new Set(daySchedules.map(s => s.start_time))].sort();
    };

    // Jeder Spielort startet auf einer frischen Seite (außer der erste)
    if (!firstVenueSection) newPage();
    firstVenueSection = false;

    if (isMultiVenue) {
      // Venue title bar
      doc.setFillColor(6, 95, 70);
      doc.rect(marginL, y, tableW, 7, 'F');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      const venueLabel = venue.name || `Spielort ${venueIdx + 1}`;
      const venueSub = venue.location && venue.location !== venueLabel ? `  –  ${venue.location}` : '';
      doc.text(`Spielort: ${venueLabel}${venueSub}`, marginL + 4, y + 5);
      doc.setTextColor(30, 30, 30);
      y += venueHeadingH;
    }

  // Category colors (fill RGB, text RGB)
  const catStyle = (cat) =>
    cat === 'Herren' ? { fill: [219, 234, 254], text: [30, 64, 175] } :
    cat === 'Damen'  ? { fill: [252, 231, 243], text: [157, 23, 77] } :
                       { fill: [237, 233, 254], text: [109, 40, 217] };

  // Pre-calculate height of one day's content
  const calcDayHeight = (dayName) => {
    const times = getDaySlots(dayName);
    if (times.length === 0) return 0;
    let h = headerH + times.length * rowH + 5; // table header + rows + spacing
    if (allDayNames.length > 1) h += dayHeadingH; // day title bar
    return h;
  };

  // Draw table header row
  const drawTableHeader = () => {
    doc.setFillColor(240, 242, 248);
    doc.rect(marginL, y, tableW, headerH, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(80, 80, 100);
    doc.text('Zeit', marginL + 2, y + 5.5);
    LANES.forEach(lane => {
      const x = laneX(lane);
      doc.text(`Bahn ${lane}`, x + laneColW / 2, y + 5.5, { align: 'center' });
      doc.setDrawColor(210, 214, 226);
      doc.line(x, y, x, y + headerH);
    });
    doc.setTextColor(30, 30, 30);
    y += headerH;
  };

  // Group days onto pages: fit 2 days per page when both fit, otherwise 1 per page
  let i = 0;
  while (i < allDayNames.length) {
    const day1 = allDayNames[i];
    const day2 = allDayNames[i + 1];
    const h1 = calcDayHeight(day1);
    const h2 = day2 ? calcDayHeight(day2) : 0;

    if (h1 === 0) { i++; continue; }

    // Start a new page for each group (first day always gets a fresh page after the very first)
    if (i > 0) newPage();

    // Check if both days fit on this page
    const bothFit = day2 && h2 > 0 && (h1 + h2) <= contentAreaH;

    const renderDay = (day) => {
      const daySchedules = venueSchedules.filter(s => (s.day || 'Tag 1') === day);
      const dayTimes = getDaySlots(day);
      if (dayTimes.length === 0) return;

      if (allDayNames.length > 1) {
        doc.setFillColor(30, 64, 175);
        doc.rect(marginL, y, tableW, 7, 'F');
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        const dayCfg = dayConfigs.find(d => d.name === day);
        const dayDateStr = dayCfg?.date ? new Date(dayCfg.date).toLocaleDateString('de-AT') : '';
        doc.text(dayDateStr ? `${day}  –  ${dayDateStr}` : day, marginL + 4, y + 5);
        doc.setTextColor(30, 30, 30);
        y += dayHeadingH;
      }

      drawTableHeader();

      dayTimes.forEach((time, ti) => {
        const rowBg = ti % 2 === 0 ? [255, 255, 255] : [248, 249, 253];
        doc.setFillColor(...rowBg);
        doc.rect(marginL, y, tableW, rowH, 'F');

        // Time label
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 30, 30);
        doc.text(time, marginL + 2, y + rowH / 2 + 1.5);

        // Lane cells
        LANES.forEach(lane => {
          const x = laneX(lane);
          doc.setDrawColor(210, 214, 226);
          doc.line(x, y, x, y + rowH);

          const slot = daySchedules.find(s => s.start_time === time && s.lane === lane);

          if (slot) {
            if (slot.is_placeholder) {
              doc.setFillColor(245, 245, 250);
              doc.roundedRect(x + 2, y + 1.5, laneColW - 4, rowH - 3, 1.5, 1.5, 'F');
              doc.setFontSize(7.5);
              doc.setFont('helvetica', 'italic');
              doc.setTextColor(160, 160, 180);
              doc.text(slot.placeholder_label || 'Platzhalter', x + laneColW / 2, y + rowH / 2 + 1.5, { align: 'center' });
            } else if (!slot.team_id && slot.player_id) {
              // Einzelstarter (no team, just a player)
              const playerName = getPlayerName(slot.player_id);
              const pData = playerMap[slot.player_id];
              const cat = pData?.category || '';
              const cs = catStyle(cat);
              doc.setFillColor(...cs.fill);
              doc.roundedRect(x + 2, y + 1.5, laneColW - 4, rowH - 3, 2, 2, 'F');
              doc.setTextColor(...cs.text);
              doc.setFontSize(8);
              doc.setFont('helvetica', 'bold');
              doc.text(String(playerName || 'Einzelstarter'), x + laneColW / 2, y + rowH / 2 - 1, { align: 'center', maxWidth: laneColW - 6 });
              doc.setFontSize(6.5);
              doc.setFont('helvetica', 'normal');
              const ak = ageClassOf(slot.player_id);
              const ezClub = isFutureSeries && pData?.club ? pData.club : '';
              doc.text([ak, ezClub || 'Einzelstarter'].filter(Boolean).join(' · '), x + laneColW / 2, y + rowH / 2 + 4, { align: 'center', maxWidth: laneColW - 6 });
            } else {
              const team = getTeam(slot.team_id);
              if (team) {
                const cs = catStyle(team.category);
                doc.setFillColor(...cs.fill);
                doc.roundedRect(x + 2, y + 1.5, laneColW - 4, rowH - 3, 2, 2, 'F');
                doc.setTextColor(...cs.text);
                doc.setFontSize(8);
                doc.setFont('helvetica', 'bold');
                const playerName = slot.player_id ? getPlayerName(slot.player_id) : null;
                const topLine = playerName || team.name;
                // 2 lines if playerName exists (name + team), else 1 line (team name)
                const lineCount = playerName ? 2 : 1;
                const startY = lineCount === 2 ? y + rowH / 2 - 1 : y + rowH / 2 + 1.5;
                doc.text(String(topLine), x + laneColW / 2, startY, { align: 'center', maxWidth: laneColW - 6 });
                if (playerName) {
                  doc.setFontSize(6.5);
                  doc.setFont('helvetica', 'normal');
                  const ak = ageClassOf(slot.player_id);
                  doc.text(ak ? `${team.name} · ${ak}` : String(team.name), x + laneColW / 2, startY + 4, { align: 'center', maxWidth: laneColW - 6 });
                }
              }
            }
          } else {
            doc.setDrawColor(210, 214, 226);
            doc.setLineDashPattern([1.5, 1.5], 0);
            doc.roundedRect(x + 2, y + 1.5, laneColW - 4, rowH - 3, 1.5, 1.5, 'S');
            doc.setLineDashPattern([], 0);
            doc.setFontSize(7);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(200, 200, 210);
            doc.text('–', x + laneColW / 2, y + rowH / 2 + 1.5, { align: 'center' });
          }
          doc.setTextColor(30, 30, 30);
        });

        doc.setDrawColor(220, 222, 230);
        doc.setLineDashPattern([], 0);
        doc.line(marginL, y + rowH, marginL + tableW, y + rowH);
        y += rowH;
      });

      y += 5; // spacing after day
    };

    renderDay(day1);
    if (bothFit) {
      renderDay(day2);
      i += 2;
    } else {
      i += 1;
    }
  }
  }); // Ende Spielorte

  footer(doc, doc.internal.getCurrentPageInfo().pageNumber);
  savePdf(doc, `Startplan_${tournament.name.replace(/\s+/g, '_')}.pdf`);
}

// ── Ergebnisliste PDF ─────────────────────────────────────────────────────────
// Format mirrors the Zwischenstand view: Mannschaftswertung + Einzelwertung by gender + age class

const AGE_CLASSES_PDF = ['U-10', 'U-15', 'U-19', 'U-23', 'Allgemeine Klasse', 'Ü-50', 'Ü-60'];

export async function exportErgebnissePDF({ tournament, teams, scores, schedules = [], playerMap = {} }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const dateStr = tournament.date ? new Date(tournament.date).toLocaleDateString('de-AT') : '';
  doc._branding = await fetchBranding(tournament);

  header(doc, 'Ergebnisliste', tournament);

  const getPlayerName = (id) => {
    if (!id) return '–';
    const p = playerMap[id];
    if (!p) return id;
    return p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || id;
  };

  // Einheitliche Spieler-Liste (Mannschaften + Einzelstarter) – gleiche Logik wie Zwischenstand
  const isFuture = tournament?.series_type === 'future';
  // 9PinFuture: Verein des Spielers statt „Einzelstarter" in den Einzelwertungen
  const playerEntries = collectPlayerEntries(teams, scores, schedules, playerMap, true, isFuture);

  // Sortierung wie in der App: 1. Score, 2. Abräumen, 3. Fehlwurf
  const sortByTieBreaker = (a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if ((b.abraeumen ?? -1) !== (a.abraeumen ?? -1)) return (b.abraeumen ?? -1) - (a.abraeumen ?? -1);
    return (a.fehlwurf ?? 999) - (b.fehlwurf ?? 999);
  };

  const marginL = 14;
  const tableW = 182;
  const rowH = 8;
  const subRowH = 6;

  // Colors
  const catStyle = (cat) =>
    cat === 'Herren' ? { bg: [219, 234, 254], text: [30, 64, 175] } :
    cat === 'Damen'  ? { bg: [252, 231, 243], text: [157, 23, 77]  } :
                       { bg: [237, 233, 254], text: [109, 40, 217] };
  const medalColor = (i) =>
    i === 0 ? [251, 191, 36] : i === 1 ? [156, 163, 175] : i === 2 ? [180, 120, 60] : [200, 200, 210];

  let y = 36;

  const pageBottom = 272;

  const checkPage = (needed = 10) => {
    if (y + needed > pageBottom) {
      footer(doc, doc.internal.getCurrentPageInfo().pageNumber);
      doc.addPage();
      header(doc, 'Ergebnisliste', tournament);
      y = 36;
    }
  };

  // Only break to a new page if we've drawn content AND the block fits on a fresh page
  // but not in the remaining space. If it wouldn't fit on a fresh page either, just start
  // drawing here — the per-row checkPage calls will handle mid-block page breaks.
  const ensureFits = (totalHeight) => {
    const remaining = pageBottom - y;
    const fullPage = pageBottom - 36;
    if (y > 36 && remaining < totalHeight && totalHeight <= fullPage) {
      footer(doc, doc.internal.getCurrentPageInfo().pageNumber);
      doc.addPage();
      header(doc, 'Ergebnisliste', tournament);
      y = 36;
    }
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

  const drawCatHeading = (cat) => {
    checkPage(10);
    const cs = catStyle(cat);
    doc.setFillColor(...cs.bg);
    doc.rect(marginL, y, tableW, rowH, 'F');
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...cs.text);
    doc.text(cat, marginL + 3, y + 5.5);
    doc.setTextColor(30, 30, 30);
    y += rowH + 1;
  };

  // Table col header
  const drawColHeader = (showTeam = false) => {
    doc.setFillColor(235, 238, 248);
    doc.rect(marginL, y, tableW, 6, 'F');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 110, 140);
    doc.text('#', marginL + 4, y + 4.2);
    doc.text('Spieler / Mannschaft', marginL + 16, y + 4.2);
    if (showTeam) doc.text('Mannschaft', marginL + 100, y + 4.2);
    doc.text('Score', marginL + tableW - 3, y + 4.2, { align: 'right' });
    doc.setTextColor(30, 30, 30);
    y += 6;
  };

  const drawRankRow = (rank, label, score, isBold = true) => {
    checkPage(rowH + 1);
    doc.setFillColor(rank % 2 === 0 ? 255 : 250, rank % 2 === 0 ? 255 : 250, rank % 2 === 0 ? 255 : 253);
    doc.rect(marginL, y, tableW, rowH, 'F');

    // medal
    const mc = medalColor(rank);
    doc.setFillColor(...mc);
    doc.circle(marginL + 4.5, y + rowH / 2, 3, 'F');
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(String(rank + 1), marginL + 4.5, y + rowH / 2 + 1.2, { align: 'center' });

    doc.setTextColor(30, 30, 30);
    doc.setFontSize(9);
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    doc.text(label, marginL + 12, y + 5.5);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 64, 175);
    doc.text(score != null ? String(score) : '–', marginL + tableW - 2, y + 5.5, { align: 'right' });
    doc.setTextColor(30, 30, 30);

    doc.setDrawColor(220, 224, 235);
    doc.line(marginL, y + rowH, marginL + tableW, y + rowH);
    y += rowH;
  };

  const drawSubRow = (label, teamName, score) => {
    checkPage(subRowH + 1);
    doc.setFillColor(248, 249, 253);
    doc.rect(marginL + 8, y, tableW - 8, subRowH, 'F');
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(90, 95, 120);
    doc.text(`· ${label}`, marginL + 14, y + 4.2);
    if (teamName) doc.text(teamName, marginL + 100, y + 4.2);
    doc.setTextColor(30, 30, 30);
    doc.setFont('helvetica', 'bold');
    doc.text(score != null ? String(score) : '–', marginL + tableW - 2, y + 4.2, { align: 'right' });
    doc.setDrawColor(230, 233, 244);
    doc.line(marginL + 8, y + subRowH, marginL + tableW, y + subRowH);
    y += subRowH;
  };

  // Helper: parse volle + abraeumen + fehlwurf + bahnen count from score notes
  const parseNotes = (notesStr) => {
    try {
      const parsed = JSON.parse(notesStr || '');
      if (parsed?.gesamt === true) {
        return {
          voll: parseInt(parsed.voll) || 0,
          abraeumen: parseInt(parsed.abraeumen) || 0,
          fehlwurf: parseInt(parsed.fehlwurf) || 0,
          bahnen: 1,
        };
      }
      if (Array.isArray(parsed)) {
        return {
          voll: parsed.reduce((s, b) => s + (parseInt(b.voll) || 0), 0),
          abraeumen: parsed.reduce((s, b) => s + (parseInt(b.abraeumen) || 0), 0),
          fehlwurf: parsed.reduce((s, b) => s + (parseInt(b.fehlwurf) || 0), 0),
          bahnen: parsed.length,
        };
      }
    } catch {}
    return { voll: null, abraeumen: null, fehlwurf: null, bahnen: 0 };
  };

  // ── 1. Mannschaftswertung — Herren/Damen nebeneinander ──
  let mannschaftHeadingDrawn = false;

  const buildTeamRanked = (cat) => {
    const catTeams = teams.filter(t => t.category === cat);
    return catTeams.map(team => {
      // Dedup pro Spieler: nur bester Score (Abräumen-Tie-Breaker) – wie Zwischenstand
      const seen = {};
      scores.filter(s => s.team_id === team.id).forEach(s => {
        const cur = seen[s.player_id];
        if (!cur || s.score > cur.score || (s.score === cur.score && parseNotes(s.notes).abraeumen > parseNotes(cur.notes).abraeumen)) {
          seen[s.player_id] = s;
        }
      });
      const teamScores = Object.values(seen);
      const playerResults = [team.player1_id, team.player2_id, team.player3_id, team.player4_id, team.player5_id, team.player6_id]
        .filter(Boolean)
        .map(pid => {
          const ps = teamScores.find(s => s.player_id === pid);
          const n = parseNotes(ps?.notes);
          const schnitt = n.bahnen > 0 && ps?.score != null ? Math.round((ps.score / n.bahnen) * 10) / 10 : null;
          return { name: getPlayerName(pid), score: ps?.score ?? null, voll: n.voll, abraeumen: n.abraeumen, fehlwurf: n.fehlwurf, schnitt };
        })
        // Spieler innerhalb des Teams nach Ergebnis sortieren (bester oben)
        .sort((a, b) => {
          if ((b.score ?? -1) !== (a.score ?? -1)) return (b.score ?? -1) - (a.score ?? -1);
          if ((b.abraeumen ?? -1) !== (a.abraeumen ?? -1)) return (b.abraeumen ?? -1) - (a.abraeumen ?? -1);
          return (a.fehlwurf ?? 999) - (b.fehlwurf ?? 999);
        });
      // Summe nur über Spieler, die aktuell im Kader stehen – verhindert,
      // dass Scores vormals zugeordneter (mittlerweile entfernten) Spieler
      // die Mannschaftssumme verfälschen.
      const total = playerResults.reduce((sum, pr) => sum + (pr.score || 0), 0);
      const vollSum = playerResults.reduce((s, pr) => s + (pr.voll || 0), 0);
      const abraeumenSum = playerResults.reduce((s, pr) => s + (pr.abraeumen || 0), 0);
      const fehlwurfSum = playerResults.reduce((s, pr) => s + (pr.fehlwurf || 0), 0);
      const scoredCount = playerResults.filter(pr => pr.score != null).length;
      const avg = scoredCount > 0 ? Math.round((total / scoredCount) * 10) / 10 : null;
      return { team, total, playerResults, vollSum, abraeumenSum, fehlwurfSum, avg };
    })
    .filter(row => row.total > 0) // hide teams with no scores
    .sort((a, b) => b.total - a.total);
  };

  // Render Herren + Damen side by side, Mixed below
  const sideBySideCats = ['Herren', 'Damen'];
  const herrenTeams = buildTeamRanked('Herren');
  const damenTeams = buildTeamRanked('Damen');

  if (herrenTeams.length > 0 || damenTeams.length > 0) {
    const colW = (tableW - 4) / 2;
    const colRight = marginL + colW + 4;
    const subRowH2 = 7;
    const colHdrH = 7;
    const teamRowH = 8;
    const playerRowH = 6;

    // Estimate total height for Herren/Damen side-by-side block
    const maxTeamsEst = Math.max(herrenTeams.length, damenTeams.length);
    const maxPlayersEst = Math.max(
      ...herrenTeams.map(t => t.playerResults.length),
      ...damenTeams.map(t => t.playerResults.length),
      0
    );
    const estimatedH = colHdrH + maxTeamsEst * (teamRowH + maxPlayersEst * playerRowH);
    ensureFits(estimatedH + 8);
    if (!mannschaftHeadingDrawn) {
      drawSectionHeading('Mannschaftswertung');
      mannschaftHeadingDrawn = true;
    }

    const drawSideBySideColHeader = () => {
      // Herren header
      doc.setFillColor(219, 234, 254);
      doc.rect(marginL, y, colW, colHdrH, 'F');
      doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 64, 175);
      doc.text('Herren', marginL + 3, y + 5);
      // V / A / F / G / Ø sub-headers
      doc.setFontSize(6.5); doc.setFont('helvetica', 'normal');
      doc.text('V', marginL + colW - 46, y + 5, { align: 'center' });
      doc.text('A', marginL + colW - 35, y + 5, { align: 'center' });
      doc.text('F', marginL + colW - 24, y + 5, { align: 'center' });
      doc.text('G', marginL + colW - 13, y + 5, { align: 'center' });
      doc.text('Ø', marginL + colW - 2, y + 5, { align: 'right' });
      // Damen header
      doc.setFillColor(252, 231, 243);
      doc.rect(colRight, y, colW, colHdrH, 'F');
      doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(157, 23, 77);
      doc.text('Damen', colRight + 3, y + 5);
      doc.setFontSize(6.5); doc.setFont('helvetica', 'normal');
      doc.text('V', colRight + colW - 46, y + 5, { align: 'center' });
      doc.text('A', colRight + colW - 35, y + 5, { align: 'center' });
      doc.text('F', colRight + colW - 24, y + 5, { align: 'center' });
      doc.text('G', colRight + colW - 13, y + 5, { align: 'center' });
      doc.text('Ø', colRight + colW - 2, y + 5, { align: 'right' });
      doc.setTextColor(30, 30, 30);
      y += colHdrH;
    };

    const drawTeamSideRow = (colX, colTextColor, rankIdx, teamRow) => {
      if (!teamRow) return;
      const mc = medalColor(rankIdx);
      doc.setFillColor(...mc);
      doc.circle(colX + 4, y + teamRowH / 2, 3, 'F');
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

    const drawPlayerSideRow = (colX, colTextColor, pr) => {
      doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(90, 95, 120);
      doc.text(`· ${pr.name}`, colX + 8, y + playerRowH / 2 + 1.5, { maxWidth: colW - 52 });
      doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 85, 110); doc.setFontSize(6.5);
      if (pr.voll != null) doc.text(String(pr.voll), colX + colW - 46, y + playerRowH / 2 + 1.5, { align: 'center' });
      if (pr.abraeumen != null) doc.text(String(pr.abraeumen), colX + colW - 35, y + playerRowH / 2 + 1.5, { align: 'center' });
      if (pr.fehlwurf != null) doc.text(String(pr.fehlwurf), colX + colW - 24, y + playerRowH / 2 + 1.5, { align: 'center' });
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...colTextColor); doc.setFontSize(7);
      doc.text(pr.score != null ? String(pr.score) : '–', colX + colW - 13, y + playerRowH / 2 + 1.5, { align: 'center' });
      doc.setTextColor(30, 30, 30);
    };

    checkPage(20);
    drawSideBySideColHeader();

    const maxTeams = Math.max(herrenTeams.length, damenTeams.length);
    for (let i = 0; i < maxTeams; i++) {
      const hRow = herrenTeams[i];
      const dRow = damenTeams[i];
      const maxPlayers = Math.max(hRow?.playerResults?.length || 0, dRow?.playerResults?.length || 0);
      const rowsNeeded = teamRowH + maxPlayers * playerRowH + 2;
      checkPage(rowsNeeded);

      const rowBg = i % 2 === 0 ? [255, 255, 255] : [250, 250, 253];
      doc.setFillColor(...rowBg); doc.rect(marginL, y, colW, teamRowH, 'F');
      doc.setFillColor(...rowBg); doc.rect(colRight, y, colW, teamRowH, 'F');
      drawTeamSideRow(marginL, [30, 64, 175], i, hRow);
      drawTeamSideRow(colRight, [157, 23, 77], i, dRow);
      doc.setDrawColor(220, 224, 235);
      doc.line(marginL, y + teamRowH, marginL + tableW, y + teamRowH);
      y += teamRowH;

      for (let pi = 0; pi < maxPlayers; pi++) {
        doc.setFillColor(248, 249, 253);
        doc.rect(marginL, y, colW, playerRowH, 'F');
        doc.rect(colRight, y, colW, playerRowH, 'F');
        if (hRow?.playerResults[pi]) drawPlayerSideRow(marginL, [30, 64, 175], hRow.playerResults[pi]);
        if (dRow?.playerResults[pi]) drawPlayerSideRow(colRight, [157, 23, 77], dRow.playerResults[pi]);
        doc.setDrawColor(230, 233, 244);
        doc.line(marginL, y + playerRowH, marginL + tableW, y + playerRowH);
        y += playerRowH;
      }
    }
    y += 6;
  }

  // Mixed below
  const mixedTeams = buildTeamRanked('Mixed');
  if (mixedTeams.length > 0) {
    const mixedH = 8 + 6 + mixedTeams.reduce((sum, row) => sum + rowH + row.playerResults.length * subRowH, 0);
    ensureFits(mixedH + (mannschaftHeadingDrawn ? 0 : 8));
    if (!mannschaftHeadingDrawn) {
      drawSectionHeading('Mannschaftswertung');
      mannschaftHeadingDrawn = true;
    }
    checkPage(rowH + 6 + rowH + subRowH); // cat heading + col header + first team row + first player
    drawCatHeading('Mixed');
    drawColHeader(false);
    mixedTeams.forEach((row, i) => {
      checkPage(rowH + row.playerResults.length * subRowH); // keep team + players together
      drawRankRow(i, row.team.name, row.total, true);
      row.playerResults.forEach(pr => {
        const parts = [];
        if (pr.voll != null) parts.push(`V:${pr.voll}`);
        if (pr.abraeumen != null) parts.push(`A:${pr.abraeumen}`);
        if (pr.fehlwurf != null) parts.push(`F:${pr.fehlwurf}`);
        const label = parts.length > 0 ? `${pr.name}  (${parts.join(' / ')})` : pr.name;
        drawSubRow(label, null, pr.score);
      });
    });
    y += 4;
  }

  // ── 2. Einzelwertung Herren / Damen — side by side ──
  // Build both lists
  const buildGenderRows = (gender) => {
    const rows = [];
    playerEntries.forEach(entry => {
      if (entry.score == null) return;
      const pData = playerMap[entry.playerId];
      const pGender = pData?.category || entry.teamCategory;
      if (pGender !== gender) return;
      const n = parseNotes(entry.notes);
      rows.push({ name: getPlayerName(entry.playerId), score: entry.score, voll: n.voll, abraeumen: n.abraeumen, fehlwurf: n.fehlwurf, club: isFuture ? (playerMap[entry.playerId]?.club || 'Einzelstarter') : null });
    });
    return rows.sort(sortByTieBreaker);
  };

  const herrenRows = buildGenderRows('Herren');
  const damenRows = buildGenderRows('Damen');

  // 9PinFuture: keine Einzelwertung Herren/Damen – nur Altersklassen (wie im Endstand)
  if (!isFuture && (herrenRows.length > 0 || damenRows.length > 0)) {
    const colW = (tableW - 4) / 2;
    const colRight = marginL + colW + 4;
    const subRowH2 = isFuture ? 9.5 : 7;
    const medalColor2 = (i) => i === 0 ? [251, 191, 36] : i === 1 ? [156, 163, 175] : i === 2 ? [180, 120, 60] : [200, 200, 210];

    const einzelH = 8 + 7 + Math.max(herrenRows.length, damenRows.length) * subRowH2;
    y += 4;
    ensureFits(einzelH + 15); // +15 for section heading

    checkPage(7 + 7 + subRowH2); // section heading + col headers + first row
    // Section heading
    doc.setFillColor(245, 247, 252);
    doc.rect(marginL, y, tableW, 7, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(80, 90, 120);
    doc.text('EINZELWERTUNG HERREN / DAMEN', marginL + 3, y + 5);
    doc.setTextColor(30, 30, 30);
    y += 8;

    // Column headers with V / A / ∑
    doc.setFillColor(219, 234, 254);
    doc.rect(marginL, y, colW, 7, 'F');
    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 64, 175);
    doc.text('Herren', marginL + 3, y + 5);
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal');
    doc.text('V', marginL + colW - 46, y + 5, { align: 'center' });
    doc.text('A', marginL + colW - 35, y + 5, { align: 'center' });
    doc.text('F', marginL + colW - 24, y + 5, { align: 'center' });
    doc.text('G', marginL + colW - 13, y + 5, { align: 'center' });

    doc.setFillColor(252, 231, 243);
    doc.rect(colRight, y, colW, 7, 'F');
    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(157, 23, 77);
    doc.text('Damen', colRight + 3, y + 5);
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal');
    doc.text('V', colRight + colW - 46, y + 5, { align: 'center' });
    doc.text('A', colRight + colW - 35, y + 5, { align: 'center' });
    doc.text('F', colRight + colW - 24, y + 5, { align: 'center' });
    doc.text('G', colRight + colW - 13, y + 5, { align: 'center' });
    doc.setTextColor(30, 30, 30);
    y += 7;

    const maxRows = Math.max(herrenRows.length, damenRows.length);
    for (let i = 0; i < maxRows; i++) {
      checkPage(subRowH2 + 1);
      const rowBg = i % 2 === 0 ? [255, 255, 255] : [250, 250, 253];
      doc.setFillColor(...rowBg);
      doc.rect(marginL, y, colW, subRowH2, 'F');
      doc.rect(colRight, y, colW, subRowH2, 'F');

      // Herren row
      if (herrenRows[i]) {
        const mc = medalColor2(i);
        doc.setFillColor(...mc);
        doc.circle(marginL + 4, y + subRowH2 / 2, 2.5, 'F');
        doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
        doc.text(String(i + 1), marginL + 4, y + subRowH2 / 2 + 1, { align: 'center' });
        doc.setTextColor(30, 30, 30); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
        if (isFuture) {
          doc.text(herrenRows[i].name, marginL + 10, y + 3.4, { maxWidth: colW - 52 });
          if (herrenRows[i].club) {
            doc.setFontSize(5.5);
            doc.setTextColor(120, 120, 140);
            doc.text(herrenRows[i].club, marginL + 10, y + 7.4, { maxWidth: colW - 52 });
            doc.setTextColor(30, 30, 30);
          }
        } else {
          doc.text(herrenRows[i].name, marginL + 10, y + subRowH2 / 2 + 1.2, { maxWidth: colW - 52 });
        }
        doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 85, 110); doc.setFontSize(6.5);
        if (herrenRows[i].voll != null) doc.text(String(herrenRows[i].voll), marginL + colW - 46, y + subRowH2 / 2 + 1.2, { align: 'center' });
        if (herrenRows[i].abraeumen != null) doc.text(String(herrenRows[i].abraeumen), marginL + colW - 35, y + subRowH2 / 2 + 1.2, { align: 'center' });
        if (herrenRows[i].fehlwurf != null) doc.text(String(herrenRows[i].fehlwurf), marginL + colW - 24, y + subRowH2 / 2 + 1.2, { align: 'center' });
        doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 64, 175); doc.setFontSize(7.5);
        doc.text(String(herrenRows[i].score), marginL + colW - 13, y + subRowH2 / 2 + 1.2, { align: 'center' });
      }

      // Damen row
      if (damenRows[i]) {
        const mc = medalColor2(i);
        doc.setFillColor(...mc);
        doc.circle(colRight + 4, y + subRowH2 / 2, 2.5, 'F');
        doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
        doc.text(String(i + 1), colRight + 4, y + subRowH2 / 2 + 1, { align: 'center' });
        doc.setTextColor(30, 30, 30); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
        if (isFuture) {
          doc.text(damenRows[i].name, colRight + 10, y + 3.4, { maxWidth: colW - 52 });
          if (damenRows[i].club) {
            doc.setFontSize(5.5);
            doc.setTextColor(120, 120, 140);
            doc.text(damenRows[i].club, colRight + 10, y + 7.4, { maxWidth: colW - 52 });
            doc.setTextColor(30, 30, 30);
          }
        } else {
          doc.text(damenRows[i].name, colRight + 10, y + subRowH2 / 2 + 1.2, { maxWidth: colW - 52 });
        }
        doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 85, 110); doc.setFontSize(6.5);
        if (damenRows[i].voll != null) doc.text(String(damenRows[i].voll), colRight + colW - 46, y + subRowH2 / 2 + 1.2, { align: 'center' });
        if (damenRows[i].abraeumen != null) doc.text(String(damenRows[i].abraeumen), colRight + colW - 35, y + subRowH2 / 2 + 1.2, { align: 'center' });
        if (damenRows[i].fehlwurf != null) doc.text(String(damenRows[i].fehlwurf), colRight + colW - 24, y + subRowH2 / 2 + 1.2, { align: 'center' });
        doc.setFont('helvetica', 'bold'); doc.setTextColor(157, 23, 77); doc.setFontSize(7.5);
        doc.text(String(damenRows[i].score), colRight + colW - 13, y + subRowH2 / 2 + 1.2, { align: 'center' });
      }

      doc.setDrawColor(220, 224, 235);
      doc.line(marginL, y + subRowH2, marginL + tableW, y + subRowH2);
      doc.setTextColor(30, 30, 30);
      y += subRowH2;
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
    const ageRowH = isFuture ? 9.5 : 7;
    const medalColor3 = (i) => i === 0 ? [251, 191, 36] : i === 1 ? [156, 163, 175] : i === 2 ? [180, 120, 60] : [200, 200, 210];

    const buildAgeRows = (ageClass, gender) => {
      const rows = [];
      playerEntries.forEach(entry => {
        if (entry.score == null) return;
        const pData = playerMap[entry.playerId];
        if (!pData) return;
        if ((pData.age_class || 'Allgemeine Klasse') !== ageClass) return;
        if ((pData.category || entry.teamCategory) !== gender) return;
        const n = parseNotes(entry.notes);
        rows.push({ name: getPlayerName(entry.playerId), score: entry.score, voll: n.voll, abraeumen: n.abraeumen, fehlwurf: n.fehlwurf, club: isFuture ? (pData.club || 'Einzelstarter') : null });
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

      if (!ageHeadingDrawn) {
        y += 4;
        drawSectionHeading('Einzelwertung nach Altersklassen');
        ageHeadingDrawn = true;
      }

      // Altersklasse label
      checkPage(blockH + 8);
      doc.setFillColor(245, 247, 252);
      doc.rect(marginL, y, tableW, 6, 'F');
      doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(80, 90, 120);
      doc.text(ageClass.toUpperCase(), marginL + 3, y + 4.2);
      doc.setTextColor(30, 30, 30);
      y += 6;

      // Col headers Herren / Damen
      doc.setFillColor(219, 234, 254);
      doc.rect(marginL, y, colW2, 6, 'F');
      doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 64, 175);
      doc.text('Herren', marginL + 3, y + 4.2);
      doc.setFontSize(6); doc.setFont('helvetica', 'normal');
      doc.text('V', marginL + colW2 - 46, y + 4.2, { align: 'center' });
      doc.text('A', marginL + colW2 - 35, y + 4.2, { align: 'center' });
      doc.text('F', marginL + colW2 - 24, y + 4.2, { align: 'center' });
      doc.text('G', marginL + colW2 - 13, y + 4.2, { align: 'center' });

      doc.setFillColor(252, 231, 243);
      doc.rect(colRight2, y, colW2, 6, 'F');
      doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(157, 23, 77);
      doc.text('Damen', colRight2 + 3, y + 4.2);
      doc.setFontSize(6); doc.setFont('helvetica', 'normal');
      doc.text('V', colRight2 + colW2 - 46, y + 4.2, { align: 'center' });
      doc.text('A', colRight2 + colW2 - 35, y + 4.2, { align: 'center' });
      doc.text('F', colRight2 + colW2 - 24, y + 4.2, { align: 'center' });
      doc.text('G', colRight2 + colW2 - 13, y + 4.2, { align: 'center' });
      doc.setTextColor(30, 30, 30);
      y += 6;

      const maxRows2 = Math.max(hRows.length, dRows.length);
      for (let i = 0; i < maxRows2; i++) {
        checkPage(ageRowH + 1);
        const rowBg = i % 2 === 0 ? [255, 255, 255] : [250, 250, 253];
        doc.setFillColor(...rowBg);
        doc.rect(marginL, y, colW2, ageRowH, 'F');
        doc.rect(colRight2, y, colW2, ageRowH, 'F');

        if (hRows[i]) {
          const mc = medalColor3(i);
          doc.setFillColor(...mc);
          doc.circle(marginL + 4, y + ageRowH / 2, 2.5, 'F');
          doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
          doc.text(String(i + 1), marginL + 4, y + ageRowH / 2 + 1, { align: 'center' });
          doc.setTextColor(30, 30, 30); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
          if (isFuture) {
            doc.text(hRows[i].name, marginL + 10, y + 3.4, { maxWidth: colW2 - 52 });
            if (hRows[i].club) {
              doc.setFontSize(5.5);
              doc.setTextColor(120, 120, 140);
              doc.text(hRows[i].club, marginL + 10, y + 7.4, { maxWidth: colW2 - 52 });
              doc.setTextColor(30, 30, 30);
            }
          } else {
            doc.text(hRows[i].name, marginL + 10, y + ageRowH / 2 + 1.2, { maxWidth: colW2 - 52 });
          }
          doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 85, 110); doc.setFontSize(6.5);
          if (hRows[i].voll != null) doc.text(String(hRows[i].voll), marginL + colW2 - 46, y + ageRowH / 2 + 1.2, { align: 'center' });
          if (hRows[i].abraeumen != null) doc.text(String(hRows[i].abraeumen), marginL + colW2 - 35, y + ageRowH / 2 + 1.2, { align: 'center' });
          if (hRows[i].fehlwurf != null) doc.text(String(hRows[i].fehlwurf), marginL + colW2 - 24, y + ageRowH / 2 + 1.2, { align: 'center' });
          doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 64, 175); doc.setFontSize(7.5);
          doc.text(String(hRows[i].score), marginL + colW2 - 13, y + ageRowH / 2 + 1.2, { align: 'center' });
        }

        if (dRows[i]) {
          const mc = medalColor3(i);
          doc.setFillColor(...mc);
          doc.circle(colRight2 + 4, y + ageRowH / 2, 2.5, 'F');
          doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
          doc.text(String(i + 1), colRight2 + 4, y + ageRowH / 2 + 1, { align: 'center' });
          doc.setTextColor(30, 30, 30); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
          if (isFuture) {
            doc.text(dRows[i].name, colRight2 + 10, y + 3.4, { maxWidth: colW2 - 52 });
            if (dRows[i].club) {
              doc.setFontSize(5.5);
              doc.setTextColor(120, 120, 140);
              doc.text(dRows[i].club, colRight2 + 10, y + 7.4, { maxWidth: colW2 - 52 });
              doc.setTextColor(30, 30, 30);
            }
          } else {
            doc.text(dRows[i].name, colRight2 + 10, y + ageRowH / 2 + 1.2, { maxWidth: colW2 - 52 });
          }
          doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 85, 110); doc.setFontSize(6.5);
          if (dRows[i].voll != null) doc.text(String(dRows[i].voll), colRight2 + colW2 - 46, y + ageRowH / 2 + 1.2, { align: 'center' });
          if (dRows[i].abraeumen != null) doc.text(String(dRows[i].abraeumen), colRight2 + colW2 - 35, y + ageRowH / 2 + 1.2, { align: 'center' });
          if (dRows[i].fehlwurf != null) doc.text(String(dRows[i].fehlwurf), colRight2 + colW2 - 24, y + ageRowH / 2 + 1.2, { align: 'center' });
          doc.setFont('helvetica', 'bold'); doc.setTextColor(157, 23, 77); doc.setFontSize(7.5);
          doc.text(String(dRows[i].score), colRight2 + colW2 - 13, y + ageRowH / 2 + 1.2, { align: 'center' });
        }

        doc.setDrawColor(220, 224, 235);
        doc.line(marginL, y + ageRowH, marginL + tableW, y + ageRowH);
        doc.setTextColor(30, 30, 30);
        y += ageRowH;
      }
      y += 4;
    });
  }

  footer(doc, doc.internal.getCurrentPageInfo().pageNumber);
  savePdf(doc, `Ergebnisse_${tournament.name.replace(/\s+/g, '_')}.pdf`);
}

function parseBahnen(notesStr) {
  try {
    const parsed = JSON.parse(notesStr || '');
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return null;
}

// ── Leeres Eingabeblatt PDF (pro Durchgang / Zeitslot) ────────────────────────

export async function exportEingabeblattPDF({ tournament, players, timeLabel, venueLabel }) {
  // 2 players per A4 page — each player gets half the page (148.5mm)
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const dateStr = tournament.date ? new Date(tournament.date).toLocaleDateString('de-AT') : '';
  doc._branding = await fetchBranding(tournament);

  const pageW = 210;
  const pageH = 297;
  const halfH = pageH / 2; // 148.5mm per player slot
  const marginL = 12;
  const contentW = pageW - marginL * 2;

  const drawPlayerBlock = (player, offsetY) => {
    // ── Mini header bar (white) ──
    const branding = doc._branding || {};
    const miniHeaderH = 18;
    const miniLogoSize = 12;
    const miniLogoGap = 2;

    doc.setFillColor(255, 255, 255);
    doc.rect(0, offsetY, pageW, miniHeaderH, 'F');
    doc.setDrawColor(210, 210, 210);
    doc.setLineWidth(0.3);
    doc.line(0, offsetY + miniHeaderH, pageW, offsetY + miniHeaderH);

    let mcX = marginL;
    const mcLogoY = offsetY + (miniHeaderH - miniLogoSize) / 2;

    if (branding.tourLogo) {
      addImageSquareContain(doc, branding.tourLogo, mcX, mcLogoY, miniLogoSize);
      mcX += miniLogoSize + miniLogoGap;
    }
    if (branding.tierLogo) {
      addImageSquareContain(doc, branding.tierLogo, mcX, mcLogoY, miniLogoSize);
      mcX += miniLogoSize + miniLogoGap;
    }

    doc.setTextColor(30, 30, 30);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(tournament.name, mcX + 3, offsetY + 8);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    // Bei Multi-Spielort-Turnieren den Spielort des Durchgangs anzeigen, sonst die Turnier-Adresse
    const ortStr = venueLabel || tournament.location || '';
    doc.text(`${dateStr}${ortStr ? '  ·  ' + ortStr : ''}`, mcX + 3, offsetY + 14.5);

    // Tournament logo on the far right
    if (branding.tournamentLogo) {
      addImageSquareContain(doc, branding.tournamentLogo, pageW - marginL - miniLogoSize, mcLogoY, miniLogoSize);
    }

    if (timeLabel) {
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(7.5);
      doc.text(`Durchgang: ${timeLabel}`, pageW - marginL - miniLogoSize - 4, offsetY + 8, { align: 'right' });
    }
    if (player.lane) {
      doc.text(`Bahn ${player.lane}`, pageW - marginL - miniLogoSize - 4, offsetY + 14.5, { align: 'right' });
    }
    doc.setTextColor(30, 30, 30);
    doc.setLineWidth(0.2);

    // ── Player name ──
    let y = offsetY + 24;
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(player.playerName || '–', marginL, y);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 120);
    doc.text(player.teamName || '', marginL, y + 6);
    doc.setTextColor(30, 30, 30);

    y += 13;

    // ── Score table ──
    const NUM_BAHNEN = 4;
    const colLabels = ['Voll', 'Abräumen', 'Fehlwurf', 'Summe'];
    const colWidths = [33, 43, 33, 33];
    const rowH = 11;
    const labelColW = 24;

    // Table header
    doc.setFillColor(30, 64, 175);
    doc.rect(marginL + labelColW, y, contentW - labelColW, 7.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    let cx = marginL + labelColW;
    colWidths.forEach((w, ci) => {
      doc.text(colLabels[ci], cx + w / 2, y + 5, { align: 'center' });
      cx += w;
    });
    doc.setTextColor(30, 30, 30);
    y += 7.5;

    // Bahn rows
    for (let b = 1; b <= NUM_BAHNEN; b++) {
      const rowBg = b % 2 === 0 ? [245, 247, 255] : [255, 255, 255];
      doc.setFillColor(...rowBg);
      doc.rect(marginL, y, contentW, rowH, 'F');

      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 64, 175);
      doc.text(`Bahn ${b}`, marginL + labelColW / 2, y + rowH / 2 + 1.2, { align: 'center' });
      doc.setTextColor(30, 30, 30);

      cx = marginL + labelColW;
      colWidths.forEach((w, ci) => {
        const isSumCol = ci === colWidths.length - 1;
        doc.setDrawColor(180, 185, 210);
        doc.setFillColor(isSumCol ? 235 : 255, isSumCol ? 240 : 255, 255);
        doc.rect(cx + 3, y + 1.5, w - 6, rowH - 3, 'FD');
        cx += w;
      });

      doc.setDrawColor(220, 222, 235);
      doc.line(marginL, y + rowH, marginL + contentW, y + rowH);
      y += rowH;
    }

    // Total row
    doc.setFillColor(30, 64, 175);
    doc.rect(marginL, y, contentW, rowH, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.text('Gesamtergebnis', marginL + labelColW / 2, y + rowH / 2 + 1.2, { align: 'center' });
    cx = marginL + labelColW + colWidths[0] + colWidths[1] + colWidths[2];
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(255, 255, 255);
    doc.rect(cx + 3, y + 1.5, colWidths[3] - 6, rowH - 3, 'FD');
    y += rowH;

    // ── Signature area ──
    y += 10;
    const sigW = (contentW - 8) / 2;
    doc.setDrawColor(30, 64, 175);
    doc.line(marginL, y, marginL + sigW, y);
    doc.line(marginL + sigW + 8, y, marginL + contentW, y);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 140);
    doc.text('Schiedsrichter (Unterschrift)', marginL, y + 5);
    doc.text('Spieler (Unterschrift)', marginL + sigW + 8, y + 5);
    doc.setTextColor(30, 30, 30);
  };

  // Draw players: 2 per page
  players.forEach((player, idx) => {
    if (idx > 0 && idx % 2 === 0) doc.addPage();
    const isBottom = idx % 2 === 1;
    const offsetY = isBottom ? halfH : 0;

    drawPlayerBlock(player, offsetY);

    // Divider line between the two halves
    if (isBottom) {
      doc.setDrawColor(200, 200, 200);
      doc.setLineDashPattern([3, 2], 0);
      doc.line(0, halfH, pageW, halfH);
      doc.setLineDashPattern([], 0);
    }
  });

  const slotLabel = timeLabel ? timeLabel.replace(':', '') : 'Eingabe';
  savePdf(doc, `Eingabeblatt_${tournament.name.replace(/\s+/g, '_')}_${slotLabel}.pdf`);
}