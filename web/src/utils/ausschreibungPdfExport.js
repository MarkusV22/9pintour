import jsPDF from 'jspdf';
import { savePdf } from '@/utils/pdfDownload';
import { header, footer, fetchBranding, addImageSquareContain } from '@/utils/pdfExport';
import { TIERS, POINTS_TABLE, PLACEMENT_GROUPS, getTierLabel } from '@/lib/tournamentPoints';

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('de-AT', { day: '2-digit', month: 'long', year: 'numeric' });
}

function parseDayConfigs(tournament) {
  try {
    const d = JSON.parse(tournament?.day_configs || '[]');
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}

function parseAllowedCategories(tournament) {
  try {
    const a = JSON.parse(tournament?.allowed_categories || '');
    return Array.isArray(a) && a.length > 0 ? a : ['Herren', 'Damen', 'Mixed'];
  } catch {
    return ['Herren', 'Damen', 'Mixed'];
  }
}

function parseCoOrganizers(tournament) {
  try {
    const e = JSON.parse(tournament?.co_organizer_emails || '[]');
    return Array.isArray(e) ? e : [];
  } catch {
    return [];
  }
}

const STATUS_LABELS = {
  geplant: 'Geplant',
  laufend: 'Läuft',
  abgeschlossen: 'Abgeschlossen',
};

export async function exportAusschreibungPDF({ tournament, teams = [], playerMap = {} }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pageW - margin * 2;

  doc._branding = await fetchBranding(tournament);

  header(doc, 'Ausschreibung', tournament);

  let y = 42;
  const lineH = 6;
  const sectionGap = 4;

  const isFuture = tournament?.series_type === 'future';
  const tierLabel = getTierLabel(tournament);
  const maxPoints = tournament?.tier ? (POINTS_TABLE[tournament.tier]?.[0] || 0) : 0;
  const statusLabel = STATUS_LABELS[tournament?.status] || tournament?.status || '';
  const dayConfigs = parseDayConfigs(tournament);
  const allowedCats = parseAllowedCategories(tournament);
  const coOrgs = parseCoOrganizers(tournament);

  const startDate = fmtDate(tournament?.date);
  const endDate = tournament?.end_date && tournament.end_date !== tournament.date ? fmtDate(tournament.end_date) : '';
  const dateRange = startDate && endDate ? `${startDate} – ${endDate}` : startDate;

  // ── Title (tournament name) ──
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(20, 20, 20);
  const titleLines = doc.splitTextToSize(tournament?.name || 'Turnier', contentW);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 7 + 2;

  // Tier + status badges
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  if (tierLabel) {
    doc.setTextColor(60, 60, 60);
    doc.text(tierLabel, margin, y);
  }
  if (statusLabel) {
    doc.setTextColor(100, 100, 100);
    doc.text(statusLabel, pageW - margin, y, { align: 'right' });
  }
  y += lineH + sectionGap;

  // ── Section: Allgemeine Informationen ──
  y = drawSectionTitle(doc, 'Allgemeine Informationen', margin, y, contentW);
  y = drawInfoRow(doc, 'Turniername', tournament?.name || '–', margin, y, contentW);
  y = drawInfoRow(doc, isFuture ? 'Kategorie' : 'NPT-Kategorie', tierLabel || '–', margin, y, contentW);
  y = drawInfoRow(doc, 'Zeitraum', dateRange || '–', margin, y, contentW);
  y = drawInfoRow(doc, 'Veranstaltungsort', tournament?.location || '–', margin, y, contentW);
  y = drawInfoRow(doc, 'Status', statusLabel || '–', margin, y, contentW);
  y += sectionGap;

  // ── Section: Turnierdetails (zwei Spalten) ──
  y = drawSectionTitle(doc, 'Turnierdetails', margin, y, contentW);
  {
    const colW = contentW / 2;
    const rowH = 6;
    const rows = [
      ['Spieler pro Mannschaft', `${tournament?.team_size || 4}`],
      ['Bahnanlage', `${tournament?.lane_count || 4} Bahnen`],
      ['Dauer pro Durchgang', `${tournament?.slot_duration || 60} Minuten`],
      ['Erlaubte Kategorien', allowedCats.join(', ')],
      ['Modus', tournament?.mode === 'final' ? 'Finalturnier' : '120 Wurf'],
    ];
    const half = Math.ceil(rows.length / 2);
    const left = rows.slice(0, half);
    const right = rows.slice(half);
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
      const drawCol = (item, x) => {
        if (!item) return;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(90, 90, 90);
        const labelLines = doc.splitTextToSize(item[0], colW - 50);
        doc.text(labelLines, x, y);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(30, 30, 30);
        const valueLines = doc.splitTextToSize(item[1] || '–', colW - 2);
        doc.text(valueLines, x + 48, y);
      };
      drawCol(left[i], margin);
      drawCol(right[i], margin + colW);
      y += rowH;
    }
    y += sectionGap;
  }

  // ── Section: Spieltage (two columns) ──
  if (dayConfigs.length > 0) {
    y = drawSectionTitle(doc, 'Spieltage', margin, y, contentW);
    const colW = contentW / 2;
    const rowH = 6;
    const half = Math.ceil(dayConfigs.length / 2);
    const left = dayConfigs.slice(0, half);
    const right = dayConfigs.slice(half);
    const startY = y;
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
      const drawDay = (d, x) => {
        if (!d) return;
        const idx = dayConfigs.indexOf(d);
        const dayDate = d.date ? fmtDate(d.date) : '';
        const dayName = d.name || `Tag ${idx + 1}`;
        const timeStr = `${String(d.startHour ?? 8).padStart(2, '0')}:${String(d.startMinute ?? 0).padStart(2, '0')} – ${String(d.endHour ?? 18).padStart(2, '0')}:${String(d.endMinute ?? 0).padStart(2, '0')}`;
        const label = dayDate ? `${dayName}: ${dayDate} (${timeStr})` : `${dayName} (${timeStr})`;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(90, 90, 90);
        doc.text(`Tag ${idx + 1}`, x, y);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(30, 30, 30);
        doc.text(doc.splitTextToSize(label, colW - 24), x + 20, y);
      };
      drawDay(left[i], margin);
      drawDay(right[i], margin + colW);
      y += rowH;
    }
    y += sectionGap;
  }

  // ── Section: Startgebühr ──
  if (tournament?.payment_enabled) {
    y = drawSectionTitle(doc, 'Startgebühr', margin, y, contentW);
    const teamCents = tournament.payment_amount || 0;
    const teamTotal = (teamCents / 100).toLocaleString('de-AT', { style: 'currency', currency: (tournament.payment_currency || 'eur').toUpperCase() });
    y = drawInfoRow(doc, 'Mannschaft', teamTotal, margin, y, contentW);
    if (tournament.payment_amount_einzelstarter) {
      const einz = (tournament.payment_amount_einzelstarter / 100).toLocaleString('de-AT', { style: 'currency', currency: (tournament.payment_currency || 'eur').toUpperCase() });
      y = drawInfoRow(doc, 'Einzelstarter', einz, margin, y, contentW);
    }
    y += sectionGap;
  }

  // ── Section: Livestream ──
  if (tournament?.livestream_url) {
    y = drawSectionTitle(doc, 'Livestream', margin, y, contentW);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(37, 99, 235);
    const streamLines = doc.splitTextToSize(tournament.livestream_url, contentW);
    doc.text(streamLines, margin, y);
    y += streamLines.length * 5 + sectionGap;
  }

  // ── Section: Zusätzliche Infos ──
  if (tournament?.description) {
    y = ensureSpace(doc, y, 30, pageH, margin, contentW, tournament);
    y = drawSectionTitle(doc, 'Zusätzliche Infos', margin, y, contentW);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(50, 50, 50);
    const descLines = doc.splitTextToSize(tournament.description, contentW);
    descLines.forEach((line) => {
      y = ensureSpace(doc, y, lineH, pageH, margin, contentW, tournament);
      doc.text(line, margin, y);
      y += 4.5;
    });
    y += sectionGap;
  }



  // Footer on all pages
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    footer(doc, p);
  }

  const safeName = (tournament?.name || 'Turnier').replace(/[^a-zA-Z0-9äöüÄÖÜß\- ]/g, '').trim() || 'Turnier';
  savePdf(doc, `Ausschreibung_${safeName}.pdf`);
}

function drawSectionTitle(doc, title, x, y, w) {
  doc.setFillColor(240, 240, 245);
  doc.rect(x, y - 4, w, 7, 'F');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  doc.text(title, x + 2, y);
  return y + 8;
}

function drawInfoRow(doc, label, value, x, y, w) {
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(90, 90, 90);
  const labelW = 60;
  const labelLines = doc.splitTextToSize(label, labelW);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 30, 30);
  const valueLines = doc.splitTextToSize(value || '–', w - labelW - 2);
  const maxLines = Math.max(labelLines.length, valueLines.length);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(90, 90, 90);
  doc.text(labelLines, x, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 30, 30);
  doc.text(valueLines, x + labelW, y);
  return y + maxLines * 4.5 + 1.5;
}

function ensureSpace(doc, y, needed, pageH, margin, contentW, tournament) {
  if (y + needed > pageH - 16) {
    doc.addPage();
    header(doc, 'Ausschreibung', tournament);
    return 42;
  }
  return y;
}