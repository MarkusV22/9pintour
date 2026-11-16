import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Trophy, BarChart2, Home, PlusCircle, LogIn, LogOut, UserCircle, ChevronLeft, ChevronRight, Archive, CalendarDays, Shield, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { isTurnierAdmin } from '@/lib/roles';
import { useBrandingLogos } from '@/lib/useBrandingLogos';
import { useFutureSeriesSetting } from '@/lib/useFutureSeriesSetting';
import ProfileLinkBanner from '@/components/ProfileLinkBanner';

const navItems = [
  { to: '/', icon: Home, label: 'Dashboard' },
  { to: '/tournaments', icon: Trophy, label: 'Turniere' },
  { to: '/ranking', icon: BarChart2, label: 'Rangliste' },
  { to: '/future', icon: Sparkles, label: '9PinFuture', futureOnly: true },
  { to: '/archiv', icon: Archive, label: 'Archiv' },
  { to: '/meine-turniere', icon: CalendarDays, label: 'Meine Turniere', authOnly: true },
];

// Admin-Tools werden auf einer eigenen Seite gebündelt
const adminPaths = ['/admin-tools'];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const isAdmin = isTurnierAdmin(user);
  const isAdminPage = adminPaths.some(p => location.pathname.startsWith(p));
  const { tourLogoUrl } = useBrandingLogos();
  const { isVisible: futureVisible } = useFutureSeriesSetting();

  // Prüft, ob der angemeldete Nutzer bereits ein Spielerprofil verknüpft hat.
  const { data: myProfile, isLoading: profileLoading } = useQuery({
    queryKey: ['my-profile', user?.email],
    queryFn: () => base44.entities.Player.filter({ user_email: user.email }),
    select: (d) => d[0] || null,
    enabled: !!user?.email,
  });

  // Direkt nach der Anmeldung zum Verknüpfen des Profils weiterleiten
  // (einmalig pro Sitzung, damit die Navigation danach nicht blockiert wird).
  useEffect(() => {
    if (
      isAuthenticated &&
      !profileLoading &&
      myProfile === null &&
      location.pathname !== '/player-profile' &&
      !sessionStorage.getItem('profile_link_prompted')
    ) {
      sessionStorage.setItem('profile_link_prompted', '1');
      navigate('/player-profile');
    }
  }, [isAuthenticated, profileLoading, myProfile, location.pathname, navigate]);

  return (
    <div className="flex min-h-screen bg-background">
      {/* ── Desktop Sidebar ── */}
      <aside className={cn(
        "hidden md:flex bg-sidebar text-sidebar-foreground flex-col fixed h-full z-10 transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}>
        {/* Header */}
        <div className={cn("py-8 flex items-center", collapsed ? "px-3 justify-center" : "px-6")}>
          {!collapsed ? (
            <div className="flex items-center gap-3 flex-1">
              <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center flex-shrink-0 overflow-hidden">
                {tourLogoUrl ? (
                  <img src={tourLogoUrl} alt="9-Pin Tour" className="w-full h-full object-contain p-0.5" />
                ) : (
                  <Trophy className="w-5 h-5 text-primary-foreground" />
                )}
              </div>
              <div>
                <p className="font-bold text-white text-sm leading-tight">9-Pin Tour</p>
                <p className="text-xs text-sidebar-foreground/50 leading-tight">Ergebnisdienst</p>
              </div>
            </div>
          ) : (
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center overflow-hidden">
              {tourLogoUrl ? (
                <img src={tourLogoUrl} alt="9-Pin Tour" className="w-full h-full object-contain p-0.5" />
              ) : (
                <Trophy className="w-5 h-5 text-primary-foreground" />
              )}
            </div>
          )}
        </div>

        {/* Toggle Button */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="absolute -right-3 top-10 w-6 h-6 bg-sidebar border border-sidebar-border rounded-full flex items-center justify-center text-sidebar-foreground hover:text-white transition-colors z-20"
        >
          {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>

        <nav className={cn("flex-1 space-y-1", collapsed ? "px-2" : "px-3")}>
          {navItems.filter(n => (!n.authOnly || isAuthenticated) && (!n.futureOnly || futureVisible)).map(({ to, icon: Icon, label }) => {
            const isActive = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                title={collapsed ? label : undefined}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                  collapsed && 'justify-center px-2',
                  isActive
                    ? 'bg-sidebar-primary/20 text-white'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-white'
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {!collapsed && label}
                {!collapsed && isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
              </Link>
            );
          })}
        </nav>

        <div className={cn("p-4 space-y-2", collapsed && "px-2")}>
          {isAuthenticated && !collapsed && (
            <>
              <Link
                to="/player-profile"
                className={cn(
                  'flex items-center gap-2 w-full px-4 py-2.5 text-sm font-medium rounded-xl transition-colors',
                  location.pathname === '/player-profile'
                    ? 'bg-sidebar-primary/20 text-white'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-white'
                )}
              >
                <UserCircle className="w-4 h-4" />
                Mein Profil
              </Link>
              {isTurnierAdmin(user) && (
                <>
                  <Link
                    to="/admin-tools"
                    className={cn(
                      'flex items-center gap-2 w-full px-4 py-2.5 text-sm font-medium rounded-xl transition-colors',
                      isAdminPage ? 'bg-sidebar-accent text-white' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-white'
                    )}
                  >
                    <Shield className="w-4 h-4" />
                    Admin-Werkzeuge
                  </Link>
                  <Link
                    to="/tournaments/new"
                    className="flex items-center gap-2 w-full px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold rounded-xl transition-colors justify-center"
                  >
                    <PlusCircle className="w-4 h-4" />
                    Neues Turnier
                  </Link>
                </>
              )}
            </>
          )}
          {isAuthenticated && collapsed && (
            <>
              <Link to="/player-profile" title="Mein Profil" className="flex justify-center items-center w-full py-2.5 text-sidebar-foreground hover:text-white rounded-lg transition-colors">
                <UserCircle className="w-4 h-4" />
              </Link>
              {isTurnierAdmin(user) && (
                <>
                  <Link to="/admin-tools" title="Admin-Werkzeuge" className="flex justify-center items-center w-full py-2.5 text-sidebar-foreground hover:text-white rounded-lg transition-colors">
                    <Shield className="w-4 h-4" />
                  </Link>
                  <Link to="/tournaments/new" title="Neues Turnier" className="flex justify-center items-center w-full py-2.5 text-sidebar-foreground hover:text-white rounded-lg transition-colors">
                    <PlusCircle className="w-4 h-4" />
                  </Link>
                </>
              )}
            </>
          )}
          {isAuthenticated ? (
            <button
              onClick={() => base44.auth.logout(window.location.href)}
              title={collapsed ? `Abmelden (${user?.full_name || user?.email})` : undefined}
              className={cn(
                "flex items-center gap-2 w-full py-2 text-sidebar-foreground/60 hover:text-white text-xs rounded-lg transition-colors justify-center",
                collapsed ? "px-2" : "px-4"
              )}
            >
              <LogOut className="w-3.5 h-3.5 flex-shrink-0" />
              {!collapsed && `Abmelden (${user?.full_name || user?.email})`}
            </button>
          ) : (
            <button
              onClick={() => base44.auth.redirectToLogin(window.location.href)}
              title={collapsed ? "Anmelden" : undefined}
              className={cn(
                "flex items-center gap-2 w-full py-2.5 bg-sidebar-accent hover:bg-sidebar-accent/80 text-white text-sm font-semibold rounded-xl transition-colors justify-center",
                collapsed ? "px-2" : "px-4"
              )}
            >
              <LogIn className="w-4 h-4" />
              {!collapsed && "Anmelden"}
            </button>
          )}
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className={cn(
        "flex-1 min-w-0 min-h-screen pb-20 md:pb-0 transition-all duration-300 overflow-x-hidden",
        collapsed ? "md:ml-16" : "md:ml-64"
      )}>
        <ProfileLinkBanner profile={myProfile} loading={profileLoading} />
        <Outlet />
      </main>

      {/* ── Mobile Bottom Nav ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-20 bg-sidebar border-t border-sidebar-border flex items-center">
        {navItems.filter(n => (!n.authOnly || isAuthenticated) && (!n.futureOnly || futureVisible)).map(({ to, icon: Icon, label }) => {
          const isActive = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                'flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-xs font-medium transition-colors',
                isActive ? 'text-white' : 'text-sidebar-foreground/60 hover:text-white'
              )}
            >
              <Icon className={cn("w-5 h-5", isActive && "text-primary")} />
              <span className="text-[10px]">{label}</span>
            </Link>
          );
        })}
        {/* Profil / Login */}
        {isAuthenticated ? (
          <Link
            to="/player-profile"
            className={cn(
              'flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-xs font-medium transition-colors',
              location.pathname === '/player-profile' ? 'text-white' : 'text-sidebar-foreground/60 hover:text-white'
            )}
          >
            <UserCircle className={cn("w-5 h-5", location.pathname === '/player-profile' && "text-primary")} />
            <span className="text-[10px]">Profil</span>
          </Link>
        ) : (
          <button
            onClick={() => base44.auth.redirectToLogin(window.location.href)}
            className="flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-xs font-medium text-sidebar-foreground/60 hover:text-white transition-colors"
          >
            <LogIn className="w-5 h-5" />
            <span className="text-[10px]">Anmelden</span>
          </button>
        )}
        {/* Admin Link */}
        {isAdmin && (
          <Link
            to="/admin-tools"
            className={cn(
              'flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-xs font-medium transition-colors',
              isAdminPage ? 'text-white' : 'text-sidebar-foreground/60 hover:text-white'
            )}
          >
            <Shield className={cn("w-5 h-5", isAdminPage && "text-primary")} />
            <span className="text-[10px]">Admin</span>
          </Link>
        )}
      </nav>


    </div>
  );
}