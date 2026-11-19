import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import TournamentList from '@/pages/TournamentList';
import TournamentNew from '@/pages/TournamentNew';
import TournamentDetail from '@/pages/TournamentDetail';
import TournamentDashboard from '@/pages/TournamentDashboard';
import Ranking from '@/pages/Ranking';
import RankingPoints from '@/pages/RankingPoints';
import Players from '@/pages/Players';
import PlayerProfile from '@/pages/PlayerProfile';
import MyTournaments from '@/pages/MyTournaments';
import PlayerStats from '@/pages/PlayerStats';
import Archiv from '@/pages/Archiv';
import SeasonAdmin from '@/pages/SeasonAdmin';
import DisclaimerAdmin from '@/pages/DisclaimerAdmin';
import PdfBrandingAdmin from '@/pages/PdfBrandingAdmin';
import DashboardBannerAdmin from '@/pages/DashboardBannerAdmin';
import AdsAdmin from '@/pages/AdsAdmin';
import PaymentAdmin from '@/pages/PaymentAdmin';
import NewsletterAdmin from '@/pages/NewsletterAdmin';
import TournamentRequestForm from '@/pages/TournamentRequestForm';
import TournamentRequestAdmin from '@/pages/TournamentRequestAdmin';
import DeletedTournamentsAdmin from '@/pages/DeletedTournamentsAdmin';
import FinalTournamentAdmin from '@/pages/FinalTournamentAdmin';
import PlayerMergeAdmin from '@/pages/PlayerMergeAdmin';
import AdminTools from '@/pages/AdminTools';
import ActionLogAdmin from '@/pages/ActionLogAdmin';
import PlayerActionLogAdmin from '@/pages/PlayerActionLogAdmin';
import FutureRanking from '@/pages/FutureRanking';
import FutureDashboard from '@/pages/FutureDashboard';
import Login from '@/pages/Login';
import DataCheck from '@/pages/DataCheck';
import Setup from '@/pages/Setup';
import { Impressum, Datenschutz, Nutzungsbedingungen } from '@/pages/Legal';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    // For all auth errors (including user_not_registered), show the app publicly.
    // Access to admin features is handled per-action via isTurnierAdmin checks.
  }

  // Render the main app
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/tournaments" element={<TournamentList />} />
        <Route path="/tournaments/new" element={<TournamentNew />} />
        <Route path="/tournaments/:id" element={<TournamentDetail />} />
        <Route path="/tournaments/:id/dashboard" element={<TournamentDashboard />} />
        <Route path="/ranking" element={<Ranking />} />
        <Route path="/future" element={<FutureDashboard />} />
        <Route path="/future-ranking" element={<FutureRanking />} />
        <Route path="/ranking/points" element={<RankingPoints />} />
        <Route path="/players" element={<Players />} />
        <Route path="/stats" element={<PlayerStats />} />
        <Route path="/archiv" element={<Archiv />} />
        <Route path="/seasons" element={<SeasonAdmin />} />
        <Route path="/disclaimer-admin" element={<DisclaimerAdmin />} />
        <Route path="/pdf-branding" element={<PdfBrandingAdmin />} />
        <Route path="/dashboard-banner" element={<DashboardBannerAdmin />} />
        <Route path="/ads-admin" element={<AdsAdmin />} />
        <Route path="/payment-admin" element={<PaymentAdmin />} />
        <Route path="/newsletter" element={<NewsletterAdmin />} />
        <Route path="/turnier-anmelden" element={<TournamentRequestForm />} />
        <Route path="/turnier-anfragen" element={<TournamentRequestAdmin />} />
        <Route path="/deleted-tournaments" element={<DeletedTournamentsAdmin />} />
        <Route path="/tournaments/:id/final-admin" element={<FinalTournamentAdmin />} />
        <Route path="/player-profile" element={<PlayerProfile />} />
        <Route path="/meine-turniere" element={<MyTournaments />} />
        <Route path="/player-merges" element={<PlayerMergeAdmin />} />
        <Route path="/admin-tools" element={<AdminTools />} />
        <Route path="/action-log" element={<ActionLogAdmin />} />
        <Route path="/player-action-log" element={<PlayerActionLogAdmin />} />
        <Route path="/datenpruefung" element={<DataCheck />} />
        <Route path="/impressum" element={<Impressum />} />
        <Route path="/datenschutz" element={<Datenschutz />} />
        <Route path="/nutzungsbedingungen" element={<Nutzungsbedingungen />} />

      </Route>
      <Route path="/login" element={<Login />} />
      <Route path="/passwort" element={<Login />} />
      <Route path="/einrichtung" element={<Setup />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App