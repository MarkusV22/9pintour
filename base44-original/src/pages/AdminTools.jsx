import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { isTurnierAdmin } from '@/lib/roles';
import { useFutureSeriesSetting } from '@/lib/useFutureSeriesSetting';
import { Switch } from '@/components/ui/switch';
import { Sparkles } from 'lucide-react';
import NewPlayersBanner from '@/components/NewPlayersBanner';
import {
  Users, Settings, ClipboardList, BarChart2, FileImage, Mail,
  CreditCard, GitMerge, Shield, Trash2, FileText, CalendarDays, History, Megaphone
} from 'lucide-react';

const tools = [
  { to: '/players', icon: Users, label: 'Spieler', desc: 'Spielerprofile verwalten, CSV-Import, Zuordnungen' },
  { to: '/seasons', icon: CalendarDays, label: 'Saison-Verwaltung', desc: 'Saisons anlegen und aktivieren' },
  { to: '/turnier-anfragen', icon: ClipboardList, label: 'Turnier-Anfragen', desc: 'Eingehende Veranstalter-Anfragen' },
  { to: '/ranking/points', icon: BarChart2, label: 'Punkte-Verwaltung', desc: 'Punkte-Schlüssel für Rangliste' },
  { to: '/ads-admin', icon: Megaphone, label: 'Werbung & Werbefrei', desc: 'Werbeanzeigen steuern, Werbefrei-Preise' },
  { to: '/dashboard-banner', icon: FileImage, label: 'Dashboard-Banner', desc: 'Banner-Bild auf Startseite' },
  { to: '/pdf-branding', icon: FileImage, label: 'PDF-Branding', desc: 'Logos für PDF-Exporte' },
  { to: '/disclaimer-admin', icon: FileText, label: 'Datenschutz', desc: 'Datenschutz-Disclaimer URL' },
  { to: '/newsletter', icon: Mail, label: 'Newsletter', desc: 'Abonnenten verwalten, Versand' },
  { to: '/payment-admin', icon: CreditCard, label: 'Online-Zahlung', desc: 'Stripe-Transaktionen, Tour-Fee' },
  { to: '/player-merges', icon: GitMerge, label: 'Spieler-Zusammenlegung', desc: 'Profile mergen, verwaiste Referenzen' },
  { to: '/deleted-tournaments', icon: Trash2, label: 'Gelöschte Turniere', desc: 'Papierkorb, wiederherstellen' },
  { to: '/action-log', icon: History, label: 'Action-Log', desc: 'Nachverfolgung aller Ergebnis-Änderungen' },
  { to: '/player-action-log', icon: History, label: 'Spieler-Action-Log', desc: 'Alle Änderungen der Spieler-Datenbank' },
];

export default function AdminTools() {
  const { user } = useAuth();
  const { isVisible: futureVisible, toggle: setFutureVisible, isToggling } = useFutureSeriesSetting();

  if (!isTurnierAdmin(user)) {
    return (
      <div className="p-6 md:p-8 max-w-4xl mx-auto">
        <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
          Du hast keine Berechtigung für diesen Bereich.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Shield className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Admin-Werkzeuge</h1>
          <p className="text-sm text-muted-foreground">Zentrale Übersicht aller Verwaltungs-Funktionen</p>
        </div>
      </div>

      <NewPlayersBanner />

      {/* 9PinFuture Sichtbarkeit */}
      <div className="flex items-center justify-between gap-4 border border-border rounded-xl p-4 bg-card">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">9PinFuture-Serie einblenden</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Blendet die Nachwuchsserie in der App (Navigation &amp; Rangliste) ein oder aus. Ausgeblendet während der Entwicklung.
            </p>
          </div>
        </div>
        <Switch
          checked={futureVisible}
          disabled={isToggling}
          onCheckedChange={(v) => setFutureVisible(v)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {tools.map(({ to, icon: Icon, label, desc }) => (
          <Link
            key={to}
            to={to}
            className="group border border-border rounded-xl p-4 bg-card hover:border-primary/40 hover:shadow-sm transition-all flex flex-col gap-2"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-primary/10 group-hover:bg-primary/15 flex items-center justify-center transition-colors">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <h3 className="font-semibold text-sm">{label}</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}