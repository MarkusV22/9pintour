import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { TrendingUp, Building2, CreditCard, Wallet, ArrowUpCircle, CheckCircle2, AlertCircle } from 'lucide-react';

const fmtEuro = (v) => v.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

export default function TourFeeFinance({ tournament, teams, schedules, tourFeeCents, isOwner }) {
  const queryClient = useQueryClient();
  const [remittanceInput, setRemittanceInput] = useState('');

  const tourFeeEuros = (tourFeeCents || 0) / 100;
  const teamSize = tournament.team_size || 4;
  const startgeldPerPlayer = (tournament.payment_amount || 0) / 100 / teamSize;
  const startgeldEinzelstarter = (tournament.payment_amount_einzelstarter || 0) / 100;

  // Einzelstarter from schedules
  const einzelstarterSchedules = schedules.filter(s => !s.is_placeholder && s.player_id && !s.team_id);
  const einzelstarterIds = [...new Set(einzelstarterSchedules.map(s => s.player_id))];

  // Team player payment counts
  let teamCashPaid = 0, teamOnlinePaid = 0;
  teams.forEach(team => {
    const allIds = [team.player1_id, team.player2_id, team.player3_id, team.player4_id, team.player5_id, team.player6_id].filter(Boolean);
    const paidIds = JSON.parse(team.paid_player_ids || '[]');
    const onlinePaidIds = JSON.parse(team.online_paid_player_ids || '[]');
    teamCashPaid += allIds.filter(pid => paidIds.includes(pid)).length;
    teamOnlinePaid += allIds.filter(pid => onlinePaidIds.includes(pid)).length;
  });

  // Einzelstarter payment counts
  const ezPaidIds = JSON.parse(tournament.einzelstarter_paid_ids || '[]');
  const ezOnlinePaidIds = JSON.parse(tournament.einzelstarter_online_paid_ids || '[]');
  const ezCashPaid = einzelstarterIds.filter(pid => ezPaidIds.includes(pid)).length;
  const ezOnlinePaid = einzelstarterIds.filter(pid => ezOnlinePaidIds.includes(pid)).length;

  // Online: club receives startgeld, tour-fee is withheld
  const onlineClubRevenue = teamOnlinePaid * startgeldPerPlayer + ezOnlinePaid * startgeldEinzelstarter;
  const onlineTourFeeWithheld = (teamOnlinePaid + ezOnlinePaid) * tourFeeEuros;

  // Cash: club collects full amount (startgeld + tour-fee), must remit tour-fee
  const cashClubKeeps = teamCashPaid * startgeldPerPlayer + ezCashPaid * startgeldEinzelstarter;
  const cashTourFeeToRemit = (teamCashPaid + ezCashPaid) * tourFeeEuros;
  const cashCollectedTotal = cashClubKeeps + cashTourFeeToRemit;

  // Remittance tracking
  const tourFeeRemitted = (tournament.tour_fee_remitted_cents || 0) / 100;
  const tourFeeStillToRemit = Math.max(0, cashTourFeeToRemit - tourFeeRemitted);

  // Totals
  const totalClubNet = onlineClubRevenue + cashClubKeeps;
  const totalTourFee = onlineTourFeeWithheld + cashTourFeeToRemit;
  const totalCollected = onlineClubRevenue + onlineTourFeeWithheld + cashCollectedTotal;

  const hasTourFee = tourFeeEuros > 0;
  const hasAnyFee = startgeldPerPlayer > 0 || startgeldEinzelstarter > 0 || hasTourFee;

  const remitMutation = useMutation({
    mutationFn: async (addAmountCents) => {
      const current = tournament.tour_fee_remitted_cents || 0;
      const newTotal = Math.max(0, current + addAmountCents);
      return base44.entities.Tournament.update(tournament.id, { tour_fee_remitted_cents: newTotal });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament', tournament.id] });
      setRemittanceInput('');
    },
  });

  if (!hasAnyFee) return null;

  return (
    <div className="bg-card rounded-2xl border border-border p-5 mb-8">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Finanz-Übersicht</h3>
        {hasTourFee && (
          <span className="text-xs text-muted-foreground ml-auto">Tour-Fee: {fmtEuro(tourFeeEuros)}/Spieler</span>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-green-50 border border-green-200 rounded-xl p-3">
          <div className="flex items-center gap-1.5 text-xs text-green-700 font-medium mb-1">
            <Building2 className="w-3.5 h-3.5" /> Verein (Netto)
          </div>
          <div className="text-lg font-bold text-green-800">{fmtEuro(totalClubNet)}</div>
          <div className="text-[10px] text-green-600">Online {fmtEuro(onlineClubRevenue)} · Bar {fmtEuro(cashClubKeeps)}</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
          <div className="flex items-center gap-1.5 text-xs text-blue-700 font-medium mb-1">
            <CreditCard className="w-3.5 h-3.5" /> Online (brutto)
          </div>
          <div className="text-lg font-bold text-blue-800">{fmtEuro(onlineClubRevenue + onlineTourFeeWithheld)}</div>
          <div className="text-[10px] text-blue-600">davon Tour-Fee: {fmtEuro(onlineTourFeeWithheld)} (einbehalten)</div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <div className="flex items-center gap-1.5 text-xs text-amber-700 font-medium mb-1">
            <Wallet className="w-3.5 h-3.5" /> Bar (brutto)
          </div>
          <div className="text-lg font-bold text-amber-800">{fmtEuro(cashCollectedTotal)}</div>
          <div className="text-[10px] text-amber-600">davon Tour-Fee: {fmtEuro(cashTourFeeToRemit)} (abzuführen)</div>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
          <div className="flex items-center gap-1.5 text-xs text-purple-700 font-medium mb-1">
            <ArrowUpCircle className="w-3.5 h-3.5" /> Tour-Fee gesamt
          </div>
          <div className="text-lg font-bold text-purple-800">{fmtEuro(totalTourFee)}</div>
          <div className="text-[10px] text-purple-600">Online {fmtEuro(onlineTourFeeWithheld)} · Bar {fmtEuro(cashTourFeeToRemit)}</div>
        </div>
      </div>

      {/* Detailed table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="text-left py-2 pr-3 font-medium">Posten</th>
              <th className="text-right py-2 px-3 font-medium">Online</th>
              <th className="text-right py-2 px-3 font-medium">Bar</th>
              <th className="text-right py-2 pl-3 font-medium">Gesamt</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border/50">
              <td className="py-2 pr-3 text-foreground">Startgeld (Verein)</td>
              <td className="text-right py-2 px-3 text-green-700 font-medium">{fmtEuro(onlineClubRevenue)}</td>
              <td className="text-right py-2 px-3 text-green-700 font-medium">{fmtEuro(cashClubKeeps)}</td>
              <td className="text-right py-2 pl-3 text-green-800 font-bold">{fmtEuro(totalClubNet)}</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-2 pr-3 text-foreground">Tour-Fee (Abgabe)</td>
              <td className="text-right py-2 px-3 text-purple-700 font-medium">{fmtEuro(onlineTourFeeWithheld)}</td>
              <td className="text-right py-2 px-3 text-purple-700 font-medium">{fmtEuro(cashTourFeeToRemit)}</td>
              <td className="text-right py-2 pl-3 text-purple-800 font-bold">{fmtEuro(totalTourFee)}</td>
            </tr>
            <tr className="border-b-2 border-border">
              <td className="py-2 pr-3 text-foreground font-medium">Brutto kassiert</td>
              <td className="text-right py-2 px-3 font-medium">{fmtEuro(onlineClubRevenue + onlineTourFeeWithheld)}</td>
              <td className="text-right py-2 px-3 font-medium">{fmtEuro(cashCollectedTotal)}</td>
              <td className="text-right py-2 pl-3 font-bold">{fmtEuro(totalCollected)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Tour-Fee remittance section */}
      {hasTourFee && cashTourFeeToRemit > 0 && (
        <div className="mt-4 bg-purple-50/50 border border-purple-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-bold text-purple-800">Tour-Fee Abführung (Barzahlungen)</span>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div>
              <div className="text-xs text-muted-foreground">Abzuführen (Bar)</div>
              <div className="text-base font-bold text-purple-800">{fmtEuro(cashTourFeeToRemit)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Bereits abgeführt</div>
              <div className="text-base font-bold text-green-700">{fmtEuro(tourFeeRemitted)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Noch offen</div>
              <div className={`text-base font-bold ${tourFeeStillToRemit > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                {fmtEuro(tourFeeStillToRemit)}
              </div>
            </div>
          </div>
          {isOwner && (
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="number"
                step="0.01"
                min="0"
                value={remittanceInput}
                onChange={e => setRemittanceInput(e.target.value)}
                placeholder="Betrag (€)"
                className="w-28 px-3 py-1.5 rounded-lg border border-border bg-background text-sm"
              />
              <button
                onClick={() => {
                  const val = parseFloat(remittanceInput);
                  if (isNaN(val) || val <= 0) return;
                  remitMutation.mutate(Math.round(val * 100));
                }}
                disabled={remitMutation.isPending || !remittanceInput}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors disabled:opacity-50"
              >
                Abführung erfassen
              </button>
              <button
                onClick={() => {
                  const remaining = Math.round(tourFeeStillToRemit * 100);
                  if (remaining > 0) remitMutation.mutate(remaining);
                }}
                disabled={remitMutation.isPending || tourFeeStillToRemit <= 0}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Komplett abgeführt
              </button>
              {tourFeeRemitted > 0 && (
                <button
                  onClick={() => remitMutation.mutate(-Math.round(tourFeeRemitted * 100))}
                  disabled={remitMutation.isPending}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors"
                >
                  Zurücksetzen
                </button>
              )}
            </div>
          )}
          {tourFeeStillToRemit <= 0 && tourFeeRemitted > 0 && (
            <div className="flex items-center gap-2 text-sm text-green-700 font-medium mt-2">
              <CheckCircle2 className="w-4 h-4" /> Tour-Fee vollständig an die 9-Pin Tour abgeführt ✓
            </div>
          )}
        </div>
      )}

      {/* Info when no tour-fee set */}
      {!hasTourFee && hasAnyFee && (
        <div className="mt-3 text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
          Keine Tour-Fee hinterlegt – alle Einnahmen verbleiben beim Verein. Die Tour-Fee kann von Admins unter „Online-Zahlung" festgelegt werden.
        </div>
      )}
    </div>
  );
}