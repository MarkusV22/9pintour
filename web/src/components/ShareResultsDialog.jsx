import { useState, useRef, useMemo } from 'react';
import html2canvas from 'html2canvas';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Copy, Check, Download, MessageCircle, Facebook, Share2, Loader2 } from 'lucide-react';
import { collectPlayerEntries } from '@/lib/collectPlayerEntries';

const MEDAL = ['#f5c542', '#c0c0c0', '#cd7f52'];

function parseNotes(notesStr) {
  try {
    const parsed = JSON.parse(notesStr || '');
    if (parsed?.gesamt === true) return { abraeumen: parseInt(parsed.abraeumen) || 0 };
    if (Array.isArray(parsed)) return { abraeumen: parsed.reduce((s, b) => s + (parseInt(b.abraeumen) || 0), 0) };
  } catch {}
  return { abraeumen: 0 };
}

function pName(id, playerMap) {
  if (!id) return '–';
  const p = playerMap[id];
  if (!p) return id;
  return p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || id;
}

function buildTeamRanked(teams, scores, cat, playerMap) {
  const catTeams = teams.filter(t => t.category === cat);
  return catTeams.map(team => {
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
        return { name: pName(pid, playerMap), score: ps?.score ?? null, abraeumen: parseNotes(ps?.notes).abraeumen };
      });
    const total = playerResults.reduce((sum, pr) => sum + (pr.score || 0), 0);
    const abraeumenSum = playerResults.reduce((sum, pr) => sum + (pr.abraeumen || 0), 0);
    return { team, total, abraeumenSum };
  }).filter(row => row.total > 0).sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return (b.abraeumenSum || 0) - (a.abraeumenSum || 0);
  });
}

function buildEinzelRanked(playerEntries, playerMap, gender) {
  const rows = [];
  playerEntries.forEach(entry => {
    if (entry.score == null) return;
    const pData = playerMap[entry.playerId];
    const pGender = pData?.category || entry.teamCategory;
    if (pGender !== gender) return;
    rows.push({ name: pName(entry.playerId, playerMap), score: entry.score, abraeumen: parseNotes(entry.notes).abraeumen });
  });
  return rows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.abraeumen || 0) - (a.abraeumen || 0);
  });
}

function MedalBadge({ rank }) {
  return (
    <div
      style={{
        width: 26, height: 26, borderRadius: '50%',
        background: MEDAL[rank] || '#5a6b7d',
        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: 13, flexShrink: 0,
      }}
    >
      {rank + 1}
    </div>
  );
}

function RankingList({ title, rows, scoreLabel = 'Kegel' }) {
  const top3 = rows.slice(0, 3);
  return (
    <div style={{ flex: '1 1 0', minWidth: 0 }}>
      <div style={{
        fontSize: 13, fontWeight: 700, color: '#9bb8d4', textTransform: 'uppercase',
        letterSpacing: '0.05em', marginBottom: 10, paddingBottom: 6,
        borderBottom: '1px solid rgba(255,255,255,0.12)',
      }}>
        {title}
      </div>
      {top3.length === 0 ? (
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>–</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {top3.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <MedalBadge rank={i} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 14, fontWeight: 600, color: '#fff',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {r.team?.name || r.name}
                </div>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#f5c542' }}>
                {r.total ?? r.score}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Das off-screen Grafik-Element, das mit html2canvas gerendert wird.
function ShareGraphic({ tournament, herrenTeams, damenTeams, herrenEinzel, damenEinzel, graphicRef }) {
  const dateStr = tournament?.date
    ? new Date(tournament.date).toLocaleDateString('de-AT')
    : '';
  return (
    <div
      ref={graphicRef}
      style={{
        width: 800, padding: 36, background: '#1e3a5f',
        color: '#fff', fontFamily: 'Inter, Arial, sans-serif',
        display: 'flex', flexDirection: 'column', gap: 24,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#9bb8d4', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
            9-Pin Tour · Ergebnisse
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.15, marginBottom: 6 }}>
            {tournament?.name || 'Turnier'}
          </div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>
            {[dateStr, tournament?.location].filter(Boolean).join(' · ')}
          </div>
        </div>
        {tournament?.logo_url && (
          <img
            src={tournament.logo_url}
            alt="Logo"
            style={{ width: 72, height: 72, objectFit: 'contain', borderRadius: 12, background: '#fff', padding: 6, flexShrink: 0 }}
          />
        )}
      </div>

      {/* Rankings 2x2 Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <RankingList title="🥇 Mannschaft Herren" rows={herrenTeams} />
        <RankingList title="🥇 Mannschaft Damen" rows={damenTeams} />
        <RankingList title="🥇 Einzel Herren" rows={herrenEinzel} />
        <RankingList title="🥇 Einzel Damen" rows={damenEinzel} />
      </div>

      {/* Footer */}
      <div style={{
        fontSize: 11, color: 'rgba(255,255,255,0.45)', textAlign: 'center',
        borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 12,
      }}>
        9-Pin Tour · Ergebnisse & Rankings unter 9pintour.at
      </div>
    </div>
  );
}

export default function ShareResultsDialog({ open, onOpenChange, tournament, teams, scores, schedules = [], playerMap = {} }) {
  const [copied, setCopied] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const graphicRef = useRef(null);

  const shareUrl = useMemo(() => {
    if (!tournament?.id) return '';
    return `https://9pintour.at/tournaments/${tournament.id}`;
  }, [tournament?.id]);

  const shareText = useMemo(() => {
    const name = tournament?.name || 'Turnier';
    return `Ergebnisse ${name} – 9-Pin Tour`;
  }, [tournament?.name]);

  const herrenTeams = useMemo(() => buildTeamRanked(teams, scores, 'Herren', playerMap), [teams, scores, playerMap]);
  const damenTeams = useMemo(() => buildTeamRanked(teams, scores, 'Damen', playerMap), [teams, scores, playerMap]);
  const playerEntries = useMemo(() => collectPlayerEntries(teams, scores, schedules, playerMap, true), [teams, scores, schedules, playerMap]);
  const herrenEinzel = useMemo(() => buildEinzelRanked(playerEntries, playerMap, 'Herren'), [playerEntries, playerMap]);
  const damenEinzel = useMemo(() => buildEinzelRanked(playerEntries, playerMap, 'Damen'), [playerEntries, playerMap]);

  const fullShareText = useMemo(() => {
    const name = tournament?.name || 'Turnier';
    const medals = ['🥇', '🥈', '🥉'];
    const formatTop3 = (rows, unitLabel = 'Kegel') =>
      rows.slice(0, 3).map((r, i) => `${medals[i] || ''} ${r.team?.name || r.name || '–'} – ${r.total ?? r.score ?? '–'} ${unitLabel}`).join('\n');
    let top3Sections = '';
    if (herrenTeams.length > 0) top3Sections += `\n🏆 Mannschaft Herren – Top 3:\n${formatTop3(herrenTeams)}\n`;
    if (damenTeams.length > 0) top3Sections += `\n🏆 Mannschaft Damen – Top 3:\n${formatTop3(damenTeams)}\n`;
    if (herrenEinzel.length > 0) top3Sections += `\n🏆 Einzel Herren – Top 3:\n${formatTop3(herrenEinzel)}\n`;
    if (damenEinzel.length > 0) top3Sections += `\n🏆 Einzel Damen – Top 3:\n${formatTop3(damenEinzel)}\n`;
    return `Liebe 9-Pin Tour Community,

ein weiteres Turnier ist erfolgreich beendet und wir möchten uns herzlich bei allen Teilnehmerinnen und Teilnehmern für euren Einsatz und die großartige Stimmung bedanken!

Das Turnier ${name} ist damit abgeschlossen. Alle Ergebnisse und die vollständigen Listen findet ihr hier:
${shareUrl}${top3Sections}
Wir gratulieren allen Teilnehmerinnen und Teilnehmern zu ihren Leistungen und freuen uns bereits auf das nächste Turnier mit euch!

Sportliche Grüße
Euer 9-Pin Tour Team 🎳`;
  }, [tournament?.name, shareUrl, herrenTeams, damenTeams, herrenEinzel, damenEinzel]);

  const generatePreview = async () => {
    if (!graphicRef.current) return;
    setGenerating(true);
    try {
      const canvas = await html2canvas(graphicRef.current, {
        scale: 2, backgroundColor: '#1e3a5f', useCORS: true, logging: false,
      });
      setPreviewUrl(canvas.toDataURL('image/png'));
    } catch (e) {
      console.error('Preview generation failed:', e);
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async () => {
    if (!graphicRef.current) return;
    setGenerating(true);
    try {
      const canvas = await html2canvas(graphicRef.current, {
        scale: 2, backgroundColor: '#1e3a5f', useCORS: true, logging: false,
      });
      const url = canvas.toDataURL('image/png');
      const safeName = (tournament?.name || 'Turnier').replace(/[^\wäöüÄÖÜß\s-]/g, '').replace(/\s+/g, '_');
      const a = document.createElement('a');
      a.href = url;
      a.download = `Ergebnisse_${safeName}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      console.error('Download failed:', e);
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Copy failed:', e);
    }
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(fullShareText);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    } catch (e) {
      console.error('Copy text failed:', e);
    }
  };

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(fullShareText)}`;
  const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;

  return (
    <>
      {/* Off-screen Grafik für html2canvas */}
      <div
        style={{ position: 'absolute', left: '-9999px', top: 0, visibility: 'hidden', pointerEvents: 'none' }}
        aria-hidden="true"
      >
        <ShareGraphic
          tournament={tournament}
          herrenTeams={herrenTeams}
          damenTeams={damenTeams}
          herrenEinzel={herrenEinzel}
          damenEinzel={damenEinzel}
          graphicRef={graphicRef}
        />
      </div>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="w-4 h-4" />
              Ergebnisse teilen
            </DialogTitle>
          </DialogHeader>

          {/* Sektion 1: Link teilen */}
          <div className="space-y-3">
            <div className="text-sm font-medium text-foreground">Link teilen</div>
            <div className="grid grid-cols-3 gap-2">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex flex-col items-center gap-1.5 px-2 py-3 rounded-lg border border-border hover:bg-muted/60 transition-colors"
              >
                <MessageCircle className="w-5 h-5 text-green-600" />
                <span className="text-xs font-medium">WhatsApp</span>
              </a>
              <a
                href={facebookUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex flex-col items-center gap-1.5 px-2 py-3 rounded-lg border border-border hover:bg-muted/60 transition-colors"
              >
                <Facebook className="w-5 h-5 text-blue-600" />
                <span className="text-xs font-medium">Facebook</span>
              </a>
              <button
                onClick={handleCopy}
                className="inline-flex flex-col items-center gap-1.5 px-2 py-3 rounded-lg border border-border hover:bg-muted/60 transition-colors"
              >
                {copied ? <Check className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5 text-foreground" />}
                <span className="text-xs font-medium">{copied ? 'Kopiert!' : 'Link kopieren'}</span>
              </button>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 rounded-md border border-border">
              <span className="text-xs text-muted-foreground truncate flex-1">{shareUrl}</span>
            </div>
          </div>

          {/* Sektion 1b: Fertig formulierter Text */}
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-foreground">Fertig formulierter Text</div>
              <button
                onClick={handleCopyText}
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                {copiedText ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedText ? 'Kopiert!' : 'Text kopieren'}
              </button>
            </div>
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap bg-muted/30 rounded-md border border-border p-3 max-h-40 overflow-y-auto font-sans leading-relaxed">{fullShareText}</pre>
          </div>

          {/* Sektion 2: Ergebnis-Grafik */}
          <div className="space-y-3 pt-2 border-t border-border">
            <div className="text-sm font-medium text-foreground">Ergebnis-Grafik</div>
            <div className="flex items-center gap-3">
              <div className="w-32 h-20 rounded-lg border border-border bg-muted/40 overflow-hidden flex items-center justify-center flex-shrink-0">
                {previewUrl ? (
                  <img src={previewUrl} alt="Vorschau" className="w-full h-full object-cover" />
                ) : (
                  <button
                    onClick={generatePreview}
                    disabled={generating}
                    className="text-xs text-primary hover:underline disabled:opacity-50"
                  >
                    {generating ? 'Lädt…' : 'Vorschau laden'}
                  </button>
                )}
              </div>
              <div className="flex-1 text-xs text-muted-foreground">
                PNG-Grafik mit Turnierlogo, Top 3 Mannschaften (Herren/Damen) und Top 3 Einzel (Herren/Damen).
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Schließen</Button>
            <Button onClick={handleDownload} disabled={generating} className="gap-2">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Grafik herunterladen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}