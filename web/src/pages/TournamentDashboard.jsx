import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { ArrowLeft, Calendar, MapPin, Users, User, Euro, TrendingUp, CheckCircle2, Clock, AlertCircle, LayoutDashboard, Building2 } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { isTurnierAdmin } from '@/lib/roles';
import { usePlayerMap } from '@/lib/usePlayerMap';
import { getCoOrganizerEmails } from '@/lib/coOrganizers';
import TourFeeFinance from '@/components/TourFeeFinance';

const CAT_STYLES = {
  Herren: { badge: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  Damen: { badge: 'bg-pink-100 text-pink-700', dot: 'bg-pink-500' },
  Mixed: { badge: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
};

function StatCard({ icon: Icon, label, value, sub, accent = 'primary' }) {
  const accents = {
    primary: 'bg-primary/10 text-primary',
    green: 'bg-green-100 text-green-700',
    amber: 'bg-amber-100 text-amber-700',
    blue: 'bg-blue-100 text-blue-700',
    purple: 'bg-purple-100 text-purple-700',
  };
  return (
    <div className="bg-card rounded-xl md:rounded-2xl border border-border p-3 md:p-5">
      <div className="flex items-center gap-2 md:gap-3">
        <div className={`w-9 h-9 md:w-10 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center flex-shrink-0 ${accents[accent]}`}>
          <Icon className="w-4 h-4 md:w-5 md:h-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xl md:text-2xl font-bold text-foreground leading-tight">{value}</div>
          <div className="text-[10px] md:text-xs text-muted-foreground">{label}</div>
        </div>
      </div>
      {sub && <div className="text-[10px] md:text-xs text-muted-foreground mt-1.5 md:mt-2">{sub}</div>}
    </div>
  );
}

export default function TournamentDashboard() {
  const { id } = useParams();
  const { user, isAuthenticated } = useAuth();
  const { getPlayerName } = usePlayerMap();

  const { data: tournament } = useQuery({
    queryKey: ['tournament', id],
    queryFn: () => base44.entities.Tournament.filter({ id }),
    select: d => d[0],
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams', id],
    queryFn: () => base44.entities.Team.filter({ tournament_id: id }),
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
  const tourFeeCents = appSettings.tour_fee_cents ? parseInt(appSettings.tour_fee_cents, 10) : 0;

  const coOrganizerEmails = getCoOrganizerEmails(tournament);
  const isOwner = isAuthenticated && !!tournament && (
    isTurnierAdmin(user) ||
    user?.id === tournament.created_by_id ||
    coOrganizerEmails.includes(user?.email)
  );

  if (!tournament) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="bg-card rounded-2xl border border-border p-8 text-center">
          <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h2 className="text-lg font-bold text-foreground mb-1">Kein Zugriff</h2>
          <p className="text-sm text-muted-foreground">Dieses Dashboard ist nur für Veranstalter und Mitveranstalter sichtbar.</p>
          <Link to={`/tournaments/${id}`} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mt-4">
            <ArrowLeft className="w-4 h-4" /> Zum Turnier
          </Link>
        </div>
      </div>
    );
  }

  const teamSize = tournament.team_size || 4;
  const paymentEnabled = tournament.payment_enabled;
  const teamFee = Math.round((tournament.payment_amount || 0) / teamSize);
  const einzelstarterFee = tournament.payment_amount_einzelstarter || 0;

  // Participants
  const teamPlayerIds = teams.flatMap(t => [t.player1_id, t.player2_id, t.player3_id, t.player4_id, t.player5_id, t.player6_id].filter(Boolean));
  const einzelstarterSchedules = schedules.filter(s => !s.is_placeholder && s.player_id && !s.team_id);
  const einzelstarterIds = [...new Set(einzelstarterSchedules.map(s => s.player_id))];
  const totalParticipants = teamPlayerIds.length + einzelstarterIds.length;

  // Payment tracking – teams
  let teamCashPaid = 0;
  let teamOnlinePaid = 0;
  teams.forEach(team => {
    const allIds = [team.player1_id, team.player2_id, team.player3_id, team.player4_id, team.player5_id, team.player6_id].filter(Boolean);
    const paidIds = JSON.parse(team.paid_player_ids || '[]');
    const onlinePaidIds = JSON.parse(team.online_paid_player_ids || '[]');
    teamCashPaid += allIds.filter(pid => paidIds.includes(pid)).length;
    teamOnlinePaid += allIds.filter(pid => onlinePaidIds.includes(pid)).length;
  });
  // Payment tracking – einzelstarter
  const ezPaidIds = JSON.parse(tournament.einzelstarter_paid_ids || '[]');
  const ezOnlinePaidIds = JSON.parse(tournament.einzelstarter_online_paid_ids || '[]');
  const ezCashPaid = einzelstarterIds.filter(pid => ezPaidIds.includes(pid)).length;
  const ezOnlinePaid = einzelstarterIds.filter(pid => ezOnlinePaidIds.includes(pid)).length;

  const cashPaidCount = teamCashPaid + ezCashPaid;
  const onlinePaidCount = teamOnlinePaid + ezOnlinePaid;
  const totalPaidCount = cashPaidCount + onlinePaidCount;
  const unpaidCount = Math.max(0, totalParticipants - totalPaidCount);

  const hasFee = teamFee > 0 || einzelstarterFee > 0;
  const projectedRevenue = (teamPlayerIds.length * teamFee + einzelstarterIds.length * einzelstarterFee) / 100;
  const collectedRevenue = (teamCashPaid + teamOnlinePaid) * teamFee / 100 + (ezCashPaid + ezOnlinePaid) * einzelstarterFee / 100;
  const outstandingRevenue = Math.max(0, projectedRevenue - collectedRevenue);

  // Teams by category
  const teamsByCategory = {
    Herren: teams.filter(t => t.category === 'Herren'),
    Damen: teams.filter(t => t.category === 'Damen'),
    Mixed: teams.filter(t => t.category === 'Mixed'),
  };

  // Incomplete teams
  const incompleteTeams = teams.filter(t => {
    const count = [t.player1_id, t.player2_id, t.player3_id, t.player4_id, t.player5_id, t.player6_id].filter(Boolean).length;
    return count < teamSize;
  });

  // Delete requests
  const deleteRequestedTeams = teams.filter(t => t.delete_requested);

  const fmtEuro = (v) => v.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

  return (
    <div className="p-4 md:p-8 max-w-5xl w-full">
      <Link to={`/tournaments/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Zurück zum Turnier
      </Link>

      {/* Header */}
      <div className="bg-card rounded-2xl border border-border p-4 md:p-6 mb-4 md:mb-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <LayoutDashboard className="w-3.5 h-3.5" />
          Veranstalter-Dashboard
        </div>
        <h1 className="text-xl md:text-2xl font-bold text-foreground tracking-tight mb-2">{tournament.name}</h1>
        <div className="flex items-center gap-3 md:gap-4 text-xs md:text-sm text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            {format(new Date(tournament.date), 'dd. MMMM yyyy', { locale: de })}
            {tournament.end_date && tournament.end_date !== tournament.date && (
              <> – {format(new Date(tournament.end_date), 'dd. MMMM yyyy', { locale: de })}</>
            )}
          </span>
          {tournament.location && (
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" />
              {tournament.location}
            </span>
          )}
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            tournament.status === 'abgeschlossen' ? 'bg-green-100 text-green-700' :
            tournament.status === 'laufend' ? 'bg-amber-100 text-amber-700' :
            'bg-blue-100 text-blue-700'
          }`}>{tournament.status}</span>
          <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-muted text-muted-foreground">{tournament.tier}</span>
        </div>
      </div>

      {/* Teilnehmer-Übersicht */}
      <h2 className="text-xs md:text-sm font-bold text-foreground uppercase tracking-wider mb-2 md:mb-3">Teilnehmer</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 mb-6 md:mb-8">
        <StatCard icon={Building2} label="Mannschaften" value={teams.length} accent="primary" />
        <StatCard icon={Users} label="Spieler in Mannschaften" value={teamPlayerIds.length} accent="blue" />
        <StatCard icon={User} label="Einzelstarter" value={einzelstarterIds.length} accent="purple" />
        <StatCard icon={Users} label="Gesamt Teilnehmer" value={totalParticipants} accent="green" />
      </div>

      {/* Einnahmen */}
      {hasFee ? (
        <>
          <h2 className="text-xs md:text-sm font-bold text-foreground uppercase tracking-wider mb-2 md:mb-3">Einnahmen</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-4 mb-3 md:mb-4">
            <StatCard icon={TrendingUp} label="Prognose (gesamt)" value={fmtEuro(projectedRevenue)} sub={`${fmtEuro(teamFee / 100)}/Mannschaft · ${fmtEuro(einzelstarterFee / 100)}/Einzelstarter`} accent="primary" />
            <StatCard icon={CheckCircle2} label="Eingenommen" value={fmtEuro(collectedRevenue)} sub={paymentEnabled ? `${totalPaidCount} bezahlt (${onlinePaidCount} online, ${cashPaidCount} bar)` : `${cashPaidCount} bar bezahlt`} accent="green" />
            <StatCard icon={Clock} label="Ausstehend" value={fmtEuro(outstandingRevenue)} sub={`${unpaidCount} noch offen`} accent="amber" />
          </div>
          {!paymentEnabled && (
            <div className="bg-muted/30 rounded-xl border border-border p-3 mb-8 flex items-center gap-2">
              <Euro className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <p className="text-xs text-muted-foreground">Online-Zahlung ist deaktiviert – die Prognose basiert auf der hinterlegten Startgebühr. Bar-Einnahmen können im Startplan markiert werden.</p>
            </div>
          )}
        </>
      ) : (
        <div className="bg-muted/30 rounded-2xl border border-border p-5 mb-8 flex items-center gap-3">
          <Euro className="w-5 h-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">Keine Startgebühr hinterlegt</p>
            <p className="text-xs text-muted-foreground">Trage eine Startgebühr in den Turnier-Details ein, um Einnahmen im Dashboard zu sehen.</p>
          </div>
        </div>
      )}

      {/* Finanz-Übersicht mit Tour-Fee */}
      <TourFeeFinance tournament={tournament} teams={teams} schedules={schedules} tourFeeCents={tourFeeCents} isOwner={isOwner} />

      {/* Mannschaften nach Kategorie */}
      <h2 className="text-xs md:text-sm font-bold text-foreground uppercase tracking-wider mb-2 md:mb-3">Mannschaften nach Kategorie</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-4 mb-6 md:mb-8">
        {Object.entries(teamsByCategory).map(([cat, catTeams]) => {
          const style = CAT_STYLES[cat] || CAT_STYLES.Herren;
          const playerCount = catTeams.flatMap(t => [t.player1_id, t.player2_id, t.player3_id, t.player4_id, t.player5_id, t.player6_id].filter(Boolean)).length;
          return (
            <div key={cat} className="bg-card rounded-xl md:rounded-2xl border border-border p-3 md:p-5">
              <div className="flex items-center justify-between mb-2 md:mb-3">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${style.badge}`}>{cat}</span>
                <span className="text-xs text-muted-foreground">{catTeams.length} Mannschaft{catTeams.length !== 1 ? 'en' : ''}</span>
              </div>
              <div className="text-xl md:text-2xl font-bold text-foreground mb-1">{playerCount} <span className="text-xs md:text-sm font-normal text-muted-foreground">Spieler</span></div>
              {catTeams.length === 0 ? (
                <p className="text-xs text-muted-foreground">Keine Mannschaften</p>
              ) : (
                <div className="space-y-1 mt-2">
                  {catTeams.slice(0, 5).map(t => {
                    const count = [t.player1_id, t.player2_id, t.player3_id, t.player4_id, t.player5_id, t.player6_id].filter(Boolean).length;
                    return (
                      <div key={t.id} className="flex items-center justify-between text-xs">
                        <span className="truncate text-foreground">{t.name}</span>
                        <span className={`flex-shrink-0 ml-2 ${count < teamSize ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>{count}/{teamSize}</span>
                      </div>
                    );
                  })}
                  {catTeams.length > 5 && <p className="text-xs text-muted-foreground pt-1">+{catTeams.length - 5} weitere</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Warnungen */}
      {(incompleteTeams.length > 0 || deleteRequestedTeams.length > 0) && (
        <>
          <h2 className="text-xs md:text-sm font-bold text-foreground uppercase tracking-wider mb-2 md:mb-3">Aktion erforderlich</h2>
          <div className="space-y-2 md:space-y-3 mb-6 md:mb-8">
            {incompleteTeams.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl md:rounded-2xl p-3 md:p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-4 h-4 text-red-600" />
                  <span className="text-xs md:text-sm font-bold text-red-800">{incompleteTeams.length} Mannschaft{incompleteTeams.length !== 1 ? 'en' : ''} mit fehlenden Spielern</span>
                </div>
                <div className="space-y-1">
                  {incompleteTeams.map(t => {
                    const count = [t.player1_id, t.player2_id, t.player3_id, t.player4_id, t.player5_id, t.player6_id].filter(Boolean).length;
                    return (
                      <div key={t.id} className="text-xs text-red-700">
                        <strong>{t.name}</strong> – {count}/{teamSize} Spieler
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {deleteRequestedTeams.length > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl md:rounded-2xl p-3 md:p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-4 h-4 text-orange-600" />
                  <span className="text-xs md:text-sm font-bold text-orange-800">{deleteRequestedTeams.length} Abmeldung{deleteRequestedTeams.length !== 1 ? 'en' : ''} beantragt</span>
                </div>
                <div className="space-y-1">
                  {deleteRequestedTeams.map(t => (
                    <div key={t.id} className="text-xs text-orange-700">
                      <strong>{t.name}</strong> – bitte im Turnier bestätigen oder zurückweisen
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}