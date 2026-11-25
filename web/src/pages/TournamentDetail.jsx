import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { ArrowLeft, Calendar, MapPin, Plus, Users, Save, CheckCircle2, FileText, CalendarClock, Pencil, Trash2, MoreVertical, Settings, LogIn, ChevronDown, ChevronRight, HelpCircle, LayoutDashboard, Trophy, Video, Share2 } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { isTurnierAdmin } from '@/lib/roles';
import { usePlayerMap } from '@/lib/usePlayerMap';
import { useSeasons } from '@/lib/useSeason';
import { getCoOrganizerEmails } from '@/lib/coOrganizers';
import { isMultiVenue, getVenues } from '@/lib/venues';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import TeamFormDialog from '@/components/TeamFormDialog';
import EinzelstarterList from '@/components/EinzelstarterList';
import TournamentEditDialog from '@/components/TournamentEditDialog';
import SchedulePlanner from '@/components/SchedulePlanner';
import Zwischenstand from '@/components/Zwischenstand';
import ErgebnisseTab from '@/components/ErgebnisseTab';
import PunktevergabeTab from '@/components/PunktevergabeTab';
import FinalGroupPhase from '@/components/final/FinalGroupPhase';
import FinalBracket from '@/components/final/FinalBracket';
import FinalStartplan from '@/components/final/FinalStartplan';
import { exportStartplanPDF, exportErgebnissePDF } from '@/utils/pdfExport';
import { exportFinalStartplanPDF, exportFinalErgebnissePDF } from '@/utils/finalPdfExport';
import { exportAusschreibungPDF } from '@/utils/ausschreibungPdfExport';
import TutorialOverlay, { useTutorial } from '@/components/TutorialOverlay';
import ShareResultsDialog from '@/components/ShareResultsDialog';
import { generateResultRecords } from '@/lib/generateResults';
import { isScoreComplete } from '@/components/ScoreEntryCard';

const TABS = ['Startplan', 'Ergebnisse', 'Zwischenstand', 'Punktetabelle'];

export default function TournamentDetail() {
  const id = window.location.pathname.split('/').pop();
  const initialDay = new URLSearchParams(window.location.search).get('day');
  const queryClient = useQueryClient();
  const [showTeamDialog, setShowTeamDialog] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [finishSaved, setFinishSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('Startplan');
  const [dayConfigs, setDayConfigs] = useState([{ name: 'Tag 1', date: null, startHour: 8, endHour: 18 }]);
  const [teamsExpanded, setTeamsExpanded] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [showShareDialog, setShowShareDialog] = useState(false);

  const { user, isAuthenticated } = useAuth();
  const { playerMap } = usePlayerMap();
  const { seasons } = useSeasons();
  const { show: showOrgTutorial, open: openOrgTutorial, close: closeOrgTutorial } = useTutorial(true);

  const { data: tournament } = useQuery({
    queryKey: ['tournament', id],
    queryFn: () => base44.entities.Tournament.filter({ id }),
    select: d => d[0],
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams', id],
    queryFn: () => base44.entities.Team.filter({ tournament_id: id }),
  });

  const { data: scores = [] } = useQuery({
    queryKey: ['scores', id],
    queryFn: () => base44.entities.TournamentScore.filter({ tournament_id: id }),
  });

  const { data: schedules = [] } = useQuery({
    queryKey: ['schedules', id],
    queryFn: () => base44.entities.TournamentSchedule.filter({ tournament_id: id }),
  });

  const { data: appSettings = {} } = useQuery({
    queryKey: ['appSettings'],
    queryFn: async () => {
      const data = await base44.entities.AppSetting.filter({});
      return Object.fromEntries(data.map(s => [s.key, s.value]));
    },
  });
  const globalPaymentEnabled = appSettings.online_payment_enabled !== 'false';
  const tourFeeCents = appSettings.tour_fee_cents ? parseInt(appSettings.tour_fee_cents, 10) : 0;

  const addTeamMutation = useMutation({
    mutationFn: (data) => base44.entities.Team.create({ ...data, tournament_id: id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams', id] });
      setShowTeamDialog(false);
    },
  });

  const updateTeamMutation = useMutation({
    mutationFn: async ({ teamId, data }) => {
      // Find removed players and delete their scores
      const oldTeam = teams.find(t => t.id === teamId);
      if (oldTeam) {
        const oldPlayerIds = [oldTeam.player1_id, oldTeam.player2_id, oldTeam.player3_id, oldTeam.player4_id, oldTeam.player5_id, oldTeam.player6_id].filter(Boolean);
        const newPlayerIds = [data.player1_id, data.player2_id, data.player3_id, data.player4_id, data.player5_id, data.player6_id].filter(Boolean);
        const removedPlayerIds = oldPlayerIds.filter(pid => !newPlayerIds.includes(pid));
        if (removedPlayerIds.length > 0) {
          const scoresToDelete = scores.filter(s => s.team_id === teamId && removedPlayerIds.includes(s.player_id));
          await Promise.all(scoresToDelete.map(s => base44.entities.TournamentScore.delete(s.id)));
        }
      }
      return base44.entities.Team.update(teamId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams', id] });
      queryClient.invalidateQueries({ queryKey: ['scores', id] });
      setShowTeamDialog(false);
      setEditingTeam(null);
    },
  });

  const deleteTeamMutation = useMutation({
    mutationFn: async (teamId) => {
      await base44.entities.Team.delete(teamId);
      const teamScores = scores.filter(s => s.team_id === teamId);
      const teamSchedules = schedules.filter(s => s.team_id === teamId);
      await Promise.all([
        ...teamScores.map(s => base44.entities.TournamentScore.delete(s.id)),
        ...teamSchedules.map(s => base44.entities.TournamentSchedule.delete(s.id)),
      ]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams', id] });
      queryClient.invalidateQueries({ queryKey: ['scores', id] });
      queryClient.invalidateQueries({ queryKey: ['schedules', id] });
    },
  });

  // Hilfsfunktion: schreibt einen Audit-Log-Eintrag für Ergebnis-Änderungen
  const logAction = async (entry) => {
    try {
      await base44.entities.ActionLog.create({
        tournament_id: id,
        tournament_name: tournament?.name || '',
        actor_id: user?.id || '',
        actor_email: user?.email || '',
        actor_name: user?.full_name || user?.email || '',
        ...entry,
      });
    } catch (e) {
      console.warn('ActionLog konnte nicht geschrieben werden', e);
    }
  };

  const saveScoresMutation = useMutation({
    mutationFn: async ({ teamId, player_id, score, bahnen_json, schedule_id }) => {
      const team = teams.find(t => t.id === teamId);
      const category = team?.category || playerMap[player_id]?.category || '';
      // Bestehende Datensätze direkt aus der DB holen – der React-Query-Cache
      // kann bei schnellen Eingaben veraltet sein, sonst entstehen Duplikate.
      const dbScores = await base44.entities.TournamentScore.filter({ tournament_id: id, player_id });
      // Mannschaft: ein Score pro Spieler pro Mannschaft (team_id + player_id).
      // Einzelstarter: ein Score pro Start (schedule_id), damit ein Spieler mit
      // mehreren Starts mehrere unabhängige Scores erhält – der beste zählt.
      let candidates = teamId
        ? dbScores.filter(s => s.team_id === teamId)
        : dbScores.filter(s => !s.team_id && (s.schedule_id || '') === (schedule_id || ''));
      if (!teamId && (schedule_id || '') !== '' && candidates.length === 0) {
        // Legacy-Fallback (alter Score ohne schedule_id): nur bei genau einem
        // Start verwenden – bei mehreren Starts wäre die Zuordnung mehrdeutig.
        const playerSlots = schedules.filter(s => !s.is_placeholder && s.player_id === player_id && !s.team_id);
        if (playerSlots.length <= 1) {
          candidates = dbScores.filter(s => !s.team_id && !s.schedule_id);
        }
      }
      // Falls schon Duplikate existieren (alter Bug): den vollständigsten
      // Datensatz behalten (höchster Score bei gleicher Vollständigkeit),
      // den Rest löschen.
      const vollständigkeit = (s) => (isScoreComplete(s, playerMap[player_id]?.age_class === 'U-10') ? 1 : 0);
      const target = candidates
        .slice()
        .sort((a, b) => (vollständigkeit(b) - vollständigkeit(a)) || ((b.score || 0) - (a.score || 0)))[0];
      if (target) {
        if (target.score !== score || (target.notes || '') !== (bahnen_json || '')) {
          await base44.entities.TournamentScore.update(target.id, { score, notes: bahnen_json || '' });
        }
        // Duplikate aufräumen
        const stale = candidates.filter(s => s.id !== target.id);
        await Promise.all(stale.map(s => base44.entities.TournamentScore.delete(s.id)));
      } else {
        await base44.entities.TournamentScore.create({
          tournament_id: id,
          team_id: teamId || '',
          schedule_id: schedule_id || '',
          player_id,
          score,
          notes: bahnen_json || '',
          category,
          co_organizer_emails: getCoOrganizerEmails(tournament),
        });
      }
      await logAction({
        player_id: player_id || '',
        player_name: playerMap[player_id]?.name || '',
        team_id: teamId || '',
        team_name: team?.name || '',
        action: target ? 'score_update' : 'score_create',
        field: 'score',
        old_value: target?.score != null ? String(target.score) : '',
        new_value: score != null ? String(score) : '',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scores', id] });
      queryClient.invalidateQueries({ queryKey: ['action-logs'] });
    },
  });

  const deleteScheduleMutation = useMutation({
    mutationFn: (scheduleId) => base44.entities.TournamentSchedule.delete(scheduleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules', id] });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status) => base44.entities.Tournament.update(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament', id] });
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
    },
  });

  const deleteTournamentMutation = useMutation({
    mutationFn: async () => {
      await base44.entities.Tournament.update(id, { deleted_at: new Date().toISOString() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      window.location.href = '/tournaments';
    },
  });

  const handleFinish = async () => {
    // Delete existing results (in case of re-finishing)
    await base44.entities.TournamentResult.deleteMany({ tournament_id: id });
    // Generate and store results from current scores
    const tier = tournament.tier || 'Masters 250';
    const isFinal = tournament.mode === 'final';
    const newResults = generateResultRecords({ scores, playerMap, tier, tournamentId: id, isFinal, includeHobby: true, seriesType: tournament.series_type || 'standard', teams, schedules });
    if (newResults.length > 0) {
      await base44.entities.TournamentResult.bulkCreate(
        newResults.map(r => ({ ...r, co_organizer_emails: getCoOrganizerEmails(tournament) }))
      );
    }
    await logAction({
      action: 'tournament_finish',
      field: 'status',
      old_value: tournament?.status || '',
      new_value: 'abgeschlossen',
    });
    queryClient.invalidateQueries({ queryKey: ['results', id] });
    queryClient.invalidateQueries({ queryKey: ['all-results'] });
    queryClient.invalidateQueries({ queryKey: ['action-logs'] });
    updateStatusMutation.mutate('abgeschlossen');
    setFinishSaved(true);
    setTimeout(() => setFinishSaved(false), 2000);
  };

  // Compute derived values (safe with tournament possibly null)
  const isFinished = tournament?.status === 'abgeschlossen';
  const isFinalTournament = tournament?.mode === 'final';
  const standingsLabel = isFinished ? 'Endstand' : 'Zwischenstand';
  const tabs = isFinalTournament ? ['Startplan', 'Gruppen', 'K.O.-Phase'] : ['Startplan', 'Ergebnisse', standingsLabel, 'Punktetabelle'];
  const hasDayConfigs = (() => {
    try { const d = JSON.parse(tournament?.day_configs || '[]'); return Array.isArray(d) && d.length > 0; } catch { return false; }
  })();
  const tournamentSeason = tournament?.season_id ? seasons.find(s => s.id === tournament.season_id) : null;
  const isSeasonClosed = tournamentSeason ? !tournamentSeason.is_active : false;
  const coOrganizerEmails = getCoOrganizerEmails(tournament);
  const allowedCategories = useMemo(() => {
    try { const a = JSON.parse(tournament?.allowed_categories || ''); return Array.isArray(a) && a.length > 0 ? a : ['Herren', 'Damen', 'Mixed']; } catch { return ['Herren', 'Damen', 'Mixed']; }
  }, [tournament?.allowed_categories]);
  const isOwner = isAuthenticated && !!tournament && (
    isTurnierAdmin(user) ||
    user?.id === tournament.created_by_id ||
    coOrganizerEmails.some(e => String(e).toLowerCase() === String(user?.email || '').toLowerCase())
  );
  const canEdit = isOwner && !isFinished && !isSeasonClosed;
  const canReopen = isOwner && isFinished && !isSeasonClosed;
  const canAddTeam = isAuthenticated && !isFinished && !isSeasonClosed;
  const isInvitation = tournament?.registration_type === 'einladung';
  // Bei Einladungsturnieren dürfen nur Veranstalter Slots vergeben –
  // Spieler können sich nicht selbst in freie Startplätze einbuchen.
  const canScheduleOwn = canAddTeam && !canEdit && !isInvitation;
  const userTeamIds = teams.filter(t => t.created_by_id === user?.id).map(t => t.id);
  // Future-Turniere nutzen Einzelstarter (Spieler im Schedule ohne Team). Tabs/Inhalte
  // dürfen daher nicht ausschließlich an teams.length geknüpft sein.
  const hasScheduledPlayers = schedules.some(s => s.player_id && !s.is_placeholder && !s.team_id);
  const hasPlayers = teams.length > 0 || hasScheduledPlayers;
  const isEinzelturnier = tournament?.team_size === 1;
  const einzelstarter = schedules.filter(s => s.player_id && !s.is_placeholder && !s.team_id);

  // Show organizer tutorial automatically when user first becomes an owner
  useEffect(() => {
    if (isOwner) {
      const done = localStorage.getItem('tutorial_done_organizer');
      if (!done) openOrgTutorial();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner]);

  useEffect(() => {
    if (isFinalTournament && !['Startplan', 'Gruppen', 'K.O.-Phase'].includes(activeTab)) {
      setActiveTab('Startplan');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFinalTournament]);

  if (!tournament) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl w-full overflow-x-hidden">
      <TutorialOverlay show={showOrgTutorial} onClose={closeOrgTutorial} isOrganizer={true} />
      <Link to="/tournaments" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Zurück zu Turniere
      </Link>

      {/* Header */}
      <div className="bg-card rounded-2xl border border-border p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-foreground tracking-tight">{tournament.name}</h1>
              {tournament.livestream_url && (
                <a
                  href={tournament.livestream_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                  title="Livestream öffnen"
                >
                  <Video className="w-4 h-4" />
                </a>
              )}
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                isFinished ? 'bg-green-100 text-green-700' :
                tournament.status === 'laufend' ? 'bg-amber-100 text-amber-700' :
                'bg-blue-100 text-blue-700'
              }`}>{tournament.status}</span>
              {isInvitation && (
                <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-amber-100 text-amber-700 border border-amber-200">
                  Anmeldung über Veranstalter
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                {format(new Date(tournament.date), 'dd. MMMM yyyy', { locale: de })}
                {tournament.end_date && tournament.end_date !== tournament.date && (
                  <> – {format(new Date(tournament.end_date), 'dd. MMMM yyyy', { locale: de })}</>
                )}
              </span>
              {isMultiVenue(tournament) ? (
                <span className="flex items-center gap-1.5" title="Spielorte">
                  <MapPin className="w-3.5 h-3.5" />
                  {getVenues(tournament).map(v => [v.name, v.location].filter(Boolean).join(', ')).join('  ·  ')}
                </span>
              ) : tournament.location && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(tournament.location)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 hover:text-primary transition-colors"
                  title="In Google Maps öffnen"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  {tournament.location}
                </a>
              )}
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                {isEinzelturnier
                  ? `${einzelstarter.length} Einzelstarter`
                  : `${teams.length} Mannschaft${teams.length !== 1 ? 'en' : ''}`}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isOwner && (
              <Link to={`/tournaments/${id}/dashboard`} className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors">
                <LayoutDashboard className="w-3.5 h-3.5" />
                Dashboard
              </Link>
            )}
            {isFinalTournament && isOwner && (
              <Link to={`/tournaments/${id}/final-admin`} className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors">
                <Trophy className="w-3.5 h-3.5" />
                Final-Admin
              </Link>
            )}
            {/* PDF Buttons */}
            <Button
              variant="outline" size="sm" className="gap-2"
              onClick={() => exportAusschreibungPDF({ tournament, teams, playerMap })}
            >
              <FileText className="w-4 h-4" />
              Ausschreibung
            </Button>
            {isFinalTournament && (
              <Button
                variant="outline" size="sm" className="gap-2"
                onClick={() => exportFinalStartplanPDF({ tournament, scores, playerMap, canSeePhone: isOwner })}
              >
                <CalendarClock className="w-4 h-4" />
                Startplan PDF
              </Button>
            )}
            {isFinalTournament && (
              <Button
                variant="outline" size="sm" className="gap-2"
                onClick={() => exportFinalErgebnissePDF({ tournament, scores, playerMap })}
              >
                <FileText className="w-4 h-4" />
                Ergebnisse PDF
              </Button>
            )}
            {!isFinalTournament && hasPlayers && (
              <Button
                variant="outline" size="sm" className="gap-2"
                onClick={() => exportStartplanPDF({ tournament, teams, schedules, dayConfigs, slotDuration: tournament?.slot_duration || 60, playerMap })}
              >
                <CalendarClock className="w-4 h-4" />
                Startplan PDF
              </Button>
            )}
            {!isFinalTournament && hasPlayers && (
              <Button
                variant="outline" size="sm" className="gap-2"
                onClick={() => exportErgebnissePDF({ tournament, teams, scores, schedules, playerMap })}
              >
                <FileText className="w-4 h-4" />
                Ergebnisse PDF
              </Button>
            )}
            {isFinished && isOwner && (
              <Button
                variant="outline" size="sm" className="gap-2"
                onClick={() => setShowShareDialog(true)}
              >
                <Share2 className="w-4 h-4" />
                Teilen
              </Button>
            )}

            {canEdit && (hasPlayers || isFinalTournament) && (
              <Button onClick={handleFinish} size="sm" className="gap-2 bg-green-600 hover:bg-green-700 text-white">
                {finishSaved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                {finishSaved ? 'Gespeichert!' : 'Turnier abschließen'}
              </Button>
            )}
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => setShowEditDialog(true)} className="gap-2">
                <Settings className="w-4 h-4" />
                Details
              </Button>
            )}
            {canReopen && (
              <Button variant="outline" size="sm" onClick={async () => {
                await base44.entities.TournamentResult.deleteMany({ tournament_id: id });
                await logAction({
                  action: 'tournament_reopen',
                  field: 'status',
                  old_value: 'abgeschlossen',
                  new_value: 'laufend',
                });
                queryClient.invalidateQueries({ queryKey: ['results', id] });
                queryClient.invalidateQueries({ queryKey: ['all-results'] });
                queryClient.invalidateQueries({ queryKey: ['action-logs'] });
                updateStatusMutation.mutate('laufend');
              }}>
                Wieder öffnen
              </Button>
            )}
            {isSeasonClosed && isOwner && (
              <span className="text-xs text-muted-foreground border border-border rounded-lg px-3 py-1.5">
                Saison beendet – schreibgeschützt
              </span>
            )}
            {isOwner && (
              <button
                onClick={openOrgTutorial}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 transition-colors"
                title="Hilfe / Tutorial"
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </button>
            )}
            {isOwner && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 transition-colors">
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setShowDeleteDialog(true)} className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5 mr-2" />
                    Turnier löschen
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {!isAuthenticated && (
              <button
                onClick={() => base44.auth.redirectToLogin(window.location.href)}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 transition-colors">
                <LogIn className="w-3.5 h-3.5" />
                Anmelden zum Verwalten
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mannschaften / Einzelstarter Dropdown */}
      {!isFinalTournament && !isEinzelturnier && (
      <div className="bg-card rounded-2xl border border-border mb-6 overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/30 transition-colors"
          onClick={() => setTeamsExpanded(e => !e)}
        >
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold text-sm text-foreground">Mannschaften</span>
            <span className="text-xs text-muted-foreground">({teams.length})</span>
          </div>
          <div className="flex items-center gap-2">
            {canAddTeam && (
              <span
                className="flex items-center gap-1 text-xs text-primary font-medium px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors"
                onClick={e => { e.stopPropagation(); setEditingTeam(null); setShowTeamDialog(true); }}
              >
                <Plus className="w-3 h-3" /> Mannschaft
              </span>
            )}
            {teamsExpanded
              ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
              : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          </div>
        </button>

        {teamsExpanded && (
          <div className="border-t border-border px-5 py-4">
            {teams.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground mb-3">Noch keine Mannschaften vorhanden</p>
                {canAddTeam && (
                  <Button onClick={() => setShowTeamDialog(true)} size="sm" className="gap-2">
                    <Plus className="w-4 h-4" /> Mannschaft anlegen
                  </Button>
                )}
              </div>
            ) : (
              (() => {
                const sortedTeams = [...teams].sort((a, b) => a.name.localeCompare(b.name, 'de'));
                const categories = [
                  { key: 'Damen',  label: 'Damen',  badge: 'bg-pink-100 text-pink-700',   col: 'border-pink-200' },
                  { key: 'Herren', label: 'Herren', badge: 'bg-blue-100 text-blue-700',   col: 'border-blue-200' },
                  { key: 'Mixed',  label: 'Mixed',  badge: 'bg-purple-100 text-purple-700', col: 'border-purple-200' },
                ];
                return (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {categories.map(({ key, label, badge, col }) => {
                      const catTeams = sortedTeams.filter(t => t.category === key);
                      return (
                        <div key={key} className={`bg-background rounded-xl border ${col} overflow-hidden`}>
                          <div className={`px-4 py-2 border-b ${col} flex items-center justify-between`}>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badge}`}>{label}</span>
                            <span className="text-xs text-muted-foreground">{catTeams.length} Mannschaft{catTeams.length !== 1 ? 'en' : ''}</span>
                          </div>
                          <div className="divide-y divide-border/40">
                          {catTeams.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-4">Keine Mannschaften</p>
                          ) : catTeams.map(team => {
                            const teamSize = tournament?.team_size || 4;
                            const playerIds = [team.player1_id, team.player2_id, team.player3_id, team.player4_id, team.player5_id, team.player6_id].filter(Boolean);
                            const playerCount = playerIds.length;
                            const missingPlayers = teamSize - playerCount;
                            const hasMissing = missingPlayers > 0;
                            const isOwnTeam = team.created_by_id === user?.id;
                            const deleteRequested = !!team.delete_requested;
                            return (
                              <div key={team.id} className={`flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors ${deleteRequested ? 'bg-orange-50/60' : hasMissing ? 'bg-red-50/60' : ''}`}>
                                <div>
                                  <div className={`text-sm font-medium flex items-center gap-2 ${deleteRequested ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                                    {team.name}
                                    {tournament?.payment_enabled && team.payment_status === 'paid' && (
                                      <span className="text-xs text-green-600 font-medium bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full">✓ Bezahlt</span>
                                    )}
                                    {tournament?.payment_enabled && team.payment_status === 'pending' && (
                                      <span className="text-xs text-amber-600 font-medium bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">Zahlung ausstehend</span>
                                    )}
                                  </div>
                                  {deleteRequested ? (
                                    <div className="flex items-center gap-1 text-xs text-orange-600 font-medium mt-0.5">
                                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-500" />
                                      Abmeldung beantragt
                                    </div>
                                  ) : hasMissing ? (
                                    <div className="flex items-center gap-1 text-xs text-red-600 font-medium mt-0.5">
                                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
                                      {missingPlayers} Spieler fehlt{missingPlayers > 1 ? 'en' : ''} – bitte ergänzen
                                    </div>
                                  ) : (
                                    <div className="text-xs text-muted-foreground">{playerCount}/{teamSize} Spieler</div>
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  {canEdit ? (
                                    <>
                                      {deleteRequested && (
                                        <button
                                          className="opacity-70 hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-muted text-orange-600 text-xs font-medium flex items-center gap-1"
                                          onClick={() => updateTeamMutation.mutate({ teamId: team.id, data: { delete_requested: false } })}
                                          title="Abmeldung zurückweisen"
                                        >
                                          ↩
                                        </button>
                                      )}
                                      <button
                                        className="opacity-50 hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-muted"
                                        onClick={() => { setEditingTeam(team); setShowTeamDialog(true); }}
                                        title="Team bearbeiten"
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        className="opacity-40 hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-red-50 hover:text-destructive text-muted-foreground"
                                        onClick={() => { if (confirm(`Mannschaft "${team.name}" wirklich löschen?`)) deleteTeamMutation.mutate(team.id); }}
                                        title="Team löschen"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </>
                                  ) : isOwnTeam && !deleteRequested && canAddTeam ? (
                                    <button
                                      className="opacity-60 hover:opacity-100 transition-opacity px-2.5 py-1 rounded-lg hover:bg-orange-50 hover:text-orange-700 text-muted-foreground text-xs font-medium border border-border flex items-center gap-1"
                                      onClick={() => { if (confirm(`Abmeldung für "${team.name}" beantragen?`)) updateTeamMutation.mutate({ teamId: team.id, data: { delete_requested: true } }); }}
                                      title="Abmeldung beantragen"
                                    >
                                      <Trash2 className="w-3 h-3" /> Abmelden
                                    </button>
                                  ) : isOwnTeam && deleteRequested && canAddTeam ? (
                                    <button
                                      className="opacity-60 hover:opacity-100 transition-opacity px-2.5 py-1 rounded-lg hover:bg-muted text-orange-600 text-xs font-medium border border-orange-200 flex items-center gap-1"
                                      onClick={() => updateTeamMutation.mutate({ teamId: team.id, data: { delete_requested: false } })}
                                      title="Abmeldung zurückziehen"
                                    >
                                      ↩ Zurückziehen
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            )}
          </div>
        )}
      </div>
      )}

      {/* Einzelstarter-Übersicht bei Team-Turnieren */}
      {!isFinalTournament && !isEinzelturnier && einzelstarter.length > 0 && (
        <EinzelstarterList
          einzelstarter={einzelstarter}
          playerMap={playerMap}
          tournament={tournament}
          canEdit={canEdit}
          onDelete={(scheduleId) => deleteScheduleMutation.mutate(scheduleId)}
        />
      )}

      {/* Einzelstarter-Verwaltung bei Einzelturnier */}
      {!isFinalTournament && isEinzelturnier && (
      <div className="bg-card rounded-2xl border border-border mb-6 overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/30 transition-colors"
          onClick={() => setTeamsExpanded(e => !e)}
        >
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold text-sm text-foreground">Einzelspieler</span>
            <span className="text-xs text-muted-foreground">({einzelstarter.length})</span>
          </div>
          <div className="flex items-center gap-2">
            {teamsExpanded
              ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
              : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          </div>
        </button>

        {teamsExpanded && (
          <div className="border-t border-border px-5 py-4">
            {einzelstarter.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground mb-2">Noch keine Einzelspieler eingeplant</p>
                <p className="text-xs text-muted-foreground">Wechsle zum Tab „Startplan", um Einzelspieler in freie Slots einzutragen.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {einzelstarter.map(es => {
                  const pData = playerMap[es.player_id];
                  const name = pData?.name || `${pData?.first_name || ''} ${pData?.last_name || ''}`.trim() || es.player_id;
                  const cat = pData?.category || '';
                  const catBadge = cat === 'Herren' ? 'bg-blue-100 text-blue-700' : cat === 'Damen' ? 'bg-pink-100 text-pink-700' : 'bg-muted text-muted-foreground';
                  const ezPaidIds = (() => { try { return JSON.parse(tournament?.einzelstarter_paid_ids || '[]'); } catch { return []; } })();
                  const ezOnlinePaidIds = (() => { try { return JSON.parse(tournament?.einzelstarter_online_paid_ids || '[]'); } catch { return []; } })();
                  const isPaidCash = ezPaidIds.includes(es.player_id);
                  const isPaidOnline = ezOnlinePaidIds.includes(es.player_id);
                  return (
                    <div key={es.id} className="flex items-center justify-between px-2 py-2.5 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0">{es.start_time}</span>
                        {cat && <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${catBadge}`}>{cat}</span>}
                        <span className="text-sm font-medium text-foreground truncate">{name}</span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">Bahn {es.lane}</span>
                        {tournament?.payment_enabled && (isPaidCash || isPaidOnline) && (
                          <span className="text-xs text-green-600 font-medium bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full flex-shrink-0">✓ Bezahlt</span>
                        )}
                      </div>
                      {canEdit && (
                        <button
                          className="opacity-40 hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-red-50 hover:text-destructive text-muted-foreground flex-shrink-0"
                          onClick={() => deleteScheduleMutation.mutate(es.id)}
                          title="Spieler entfernen"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {(hasPlayers || hasDayConfigs || isFinalTournament) && (
        <>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 bg-muted/50 p-1 rounded-xl w-full md:w-fit flex-wrap">
            {tabs.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex-1 md:flex-none text-center ${
                  activeTab === tab
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab: Startplan (Final Tournament) */}
          {activeTab === 'Startplan' && isFinalTournament && (
            <FinalStartplan tournament={tournament} scores={scores} canSeePhone={isOwner} />
          )}
          {/* Tab: Startplan (Regular Tournament) */}
          {activeTab === 'Startplan' && !isFinalTournament && (
            <div className="bg-card rounded-2xl border border-border p-6 overflow-x-auto">
              <SchedulePlanner tournamentId={id} tournament={tournament} teams={teams} slotDuration={tournament?.slot_duration || 60} teamSize={tournament?.team_size || 4} laneCount={tournament?.lane_count || 4} onDaysChange={setDayConfigs} isOwner={canEdit} userTeamIds={canEdit ? [] : userTeamIds} canScheduleOwnTeams={canScheduleOwn} onEditTeam={(team) => { setEditingTeam(team); setShowTeamDialog(true); }} globalPaymentEnabled={globalPaymentEnabled} userId={user?.id} userEmail={user?.email} tourFeeCents={tourFeeCents} canSeePhone={isOwner} initialDay={initialDay} />
            </div>
          )}

          {/* Tab: Ergebnisse */}
          {activeTab === 'Ergebnisse' && hasPlayers && (
            <ErgebnisseTab
              teams={teams}
              scores={scores}
              schedules={schedules}
              isFinished={isFinished}
              onSavePlayer={({ teamId, player_id, score, bahnen_json, schedule_id }) =>
                saveScoresMutation.mutateAsync({ teamId, player_id, score, bahnen_json, schedule_id })}
              isSaving={saveScoresMutation.isPending}
              isOwner={canEdit}
              tournament={tournament}
            />
          )}

          {/* Tab: Zwischenstand / Endstand */}
          {activeTab === standingsLabel && hasPlayers && (
            <Zwischenstand teams={teams} scores={scores} schedules={schedules} isFuture={tournament?.series_type === 'future'} />
          )}

          {/* Tab: Punktetabelle */}
          {activeTab === 'Punktetabelle' && hasPlayers && (
            <PunktevergabeTab
              tournamentId={id}
              teams={teams}
              scores={scores}
              schedules={schedules}
              tournament={tournament}
              isAdmin={isOwner}
            />
          )}

          {activeTab === 'Gruppen' && (
            <FinalGroupPhase tournament={tournament} scores={scores} isOwner={canEdit} />
          )}
          {activeTab === 'K.O.-Phase' && (
            <FinalBracket tournament={tournament} scores={scores} isOwner={canEdit} />
          )}
        </>
      )}

      <TournamentEditDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        tournament={tournament}
        isAdmin={isTurnierAdmin(user)}
      />
      <TeamFormDialog
        open={showTeamDialog}
        onOpenChange={(v) => { setShowTeamDialog(v); if (!v) setEditingTeam(null); }}
        initialData={editingTeam}
        existingTeams={teams}
        teamSize={tournament?.team_size || 4}
        allowedCategories={allowedCategories}
        mixedCombinations={(() => { try { const m = JSON.parse(tournament?.mixed_combinations || ''); return Array.isArray(m) ? m : []; } catch { return []; } })()}
        onSave={(data) => {
          if (editingTeam) {
            updateTeamMutation.mutate({ teamId: editingTeam.id, data });
          } else {
            addTeamMutation.mutate(data);
          }
        }}
        isPending={addTeamMutation.isPending || updateTeamMutation.isPending}
      />

      {/* Delete Tournament Dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl border border-border shadow-lg max-w-sm w-full p-6 space-y-5">
            <div>
              <h2 className="text-lg font-bold text-foreground">Turnier löschen?</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Das Löschen von <strong>{tournament.name}</strong> kann nicht rückgängig gemacht werden. Alle Mannschaften, Ergebnisse und Zeitpläne werden gelöscht.
              </p>
            </div>
            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground">Sicherheitspasswort eingeben:</label>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Passwort"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => {
                  setShowDeleteDialog(false);
                  setDeletePassword('');
                }}
                className="flex-1 px-4 py-2 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-muted transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={() => {
                  if (deletePassword === 'delete') {
                    deleteTournamentMutation.mutate();
                  } else {
                    alert('Falsches Passwort');
                    setDeletePassword('');
                  }
                }}
                disabled={deleteTournamentMutation.isPending || deletePassword !== 'delete'}
                className="flex-1 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleteTournamentMutation.isPending ? 'Wird gelöscht...' : 'Löschen'}
              </button>
            </div>
            <p className="text-xs text-muted-foreground text-center">
             Passwort: <span className="font-mono">delete</span> · Daten bleiben 30 Tage wiederrufbar
            </p>
            </div>
            </div>
            )}

            {showShareDialog && (
            <ShareResultsDialog
            open={showShareDialog}
            onOpenChange={setShowShareDialog}
            tournament={tournament}
            teams={teams}
            scores={scores}
            schedules={schedules}
            playerMap={playerMap}
            />
            )}
            </div>
            );
            }