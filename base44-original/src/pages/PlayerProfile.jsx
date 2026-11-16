import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, CheckCircle2, User, LogIn, Pencil, Hash, Search, Link2, UserPlus, AlertCircle, LogOut, Mail, Lock, Eye, EyeOff, Phone, MessageCircle, CreditCard, FileText, Music, BarChart2 } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import TourCard from '@/components/TourCard';
import PlayerStats from '@/pages/PlayerStats';

const empty = { first_name: '', last_name: '', category: 'Herren', club: '', photo_url: '', phone: '', whatsapp: false, birth_date: '', personal_best: '', walk_on_song: '' };

function calcAgeClass(birthDateStr) {
  if (!birthDateStr) return 'Allgemeine Klasse';
  const birth = new Date(birthDateStr);
  // Stichtag 1. Juli des laufenden Jahres (saisonüblich)
  const ref = new Date(new Date().getFullYear(), 6, 1);
  let age = ref.getFullYear() - birth.getFullYear();
  const m = ref.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < birth.getDate())) age--;
  if (age < 10) return 'U-10';
  if (age < 15) return 'U-15';
  if (age < 19) return 'U-19';
  if (age < 23) return 'U-23';
  if (age < 50) return 'Allgemeine Klasse';
  if (age < 60) return 'Ü-50';
  return 'Ü-60';
}

export default function PlayerProfile() {
  const { user, isAuthenticated, isLoadingAuth } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef(null);

  const [form, setForm] = useState(empty);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data: disclaimerSettings = [] } = useQuery({
    queryKey: ['app-settings-disclaimer'],
    queryFn: () => base44.entities.AppSetting.filter({ key: 'privacy_disclaimer_url' }),
  });
  const disclaimerUrl = disclaimerSettings[0]?.value || null;

  // Account settings state
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [accountSaved, setAccountSaved] = useState(false);
  const [accountError, setAccountError] = useState('');

  // Name change state
  const [nameForm, setNameForm] = useState({ first_name: '', last_name: '' });
  const [nameSaved, setNameSaved] = useState(false);
  const [nameError, setNameError] = useState('');
  const [nameLoading, setNameLoading] = useState(false);

  const [activeTab, setActiveTab] = useState('profil');

  // Link flow state – only shown when no profile exists yet
  const [linkStep, setLinkStep] = useState('idle');
  const [searchFirst, setSearchFirst] = useState('');
  const [searchLast, setSearchLast] = useState('');
  const [searchNumber, setSearchNumber] = useState('');
  const [searchMode, setSearchMode] = useState('name'); // 'name' | 'number'
  const [matches, setMatches] = useState([]);
  const [linkError, setLinkError] = useState('');

  const { data: myProfile, isLoading: loadingProfile } = useQuery({
    queryKey: ['my-profile', user?.email],
    queryFn: () => base44.entities.Player.filter({ user_email: user.email }),
    select: (data) => data[0] || null,
    enabled: !!user,
  });

  const { data: allPlayers = [] } = useQuery({
    queryKey: ['players'],
    queryFn: () => base44.entities.Player.list('name', 9999),
    enabled: !!user,
  });

  useEffect(() => {
    if (myProfile) {
      setLinkStep('done');
      setForm({
        first_name: myProfile.first_name || '',
        last_name: myProfile.last_name || '',
        category: myProfile.category || 'Herren',
        club: myProfile.club || '',
        photo_url: myProfile.photo_url || '',
        phone: myProfile.phone || '',
        whatsapp: myProfile.whatsapp || false,
        birth_date: myProfile.birth_date || '',
        personal_best: myProfile.personal_best || '',
        walk_on_song: myProfile.walk_on_song || '',
      });
      setNameForm({
        first_name: myProfile.first_name || '',
        last_name: myProfile.last_name || '',
      });
    } else if (user && !loadingProfile) {
      setLinkStep('search');
      if (user.full_name) {
        const parts = user.full_name.trim().split(' ');
        setSearchFirst(parts.slice(0, -1).join(' ') || parts[0] || '');
        setSearchLast(parts.length > 1 ? parts[parts.length - 1] : '');
      }
    }
  }, [myProfile, user, loadingProfile]);

  const nextNumber = () => {
    const nums = allPlayers
      .filter(p => p.category === form.category && p.number)
      .map(p => Number(p.number))
      .filter(n => !isNaN(n));
    const fallback = form.category === 'Damen' ? 20001 : 10001;
    return nums.length > 0 ? Math.max(...nums) + 1 : fallback;
  };

  const linkMutation = useMutation({
    mutationFn: async ({ id }) => {
      await base44.entities.Player.update(id, { user_email: user.email });
      return id;
    },
    onSuccess: (playerId) => {
      // Directly set the myProfile state instead of waiting for refetch
      const linkedPlayer = allPlayers.find(p => p.id === playerId);
      if (linkedPlayer) {
        setForm({
          first_name: linkedPlayer.first_name || '',
          last_name: linkedPlayer.last_name || '',
          category: linkedPlayer.category || 'Herren',
          club: linkedPlayer.club || '',
          photo_url: linkedPlayer.photo_url || '',
          phone: linkedPlayer.phone || '',
          whatsapp: linkedPlayer.whatsapp || false,
          birth_date: linkedPlayer.birth_date || '',
          walk_on_song: linkedPlayer.walk_on_song || '',
        });
        setNameForm({
          first_name: linkedPlayer.first_name || '',
          last_name: linkedPlayer.last_name || '',
        });
      }
      setLinkStep('done');
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['my-profile', user?.email] });
    },
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Player.create({
      ...data,
      number: nextNumber(),
      user_email: user.email,
      personal_best: (data.personal_best === '' || data.personal_best == null) ? null : Number(data.personal_best),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['my-profile', user?.email] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (err) => setProfileError(err?.data?.message || String(err?.message || err) || 'Beim Erstellen ist ein Fehler aufgetreten.'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Player.update(id, {
      ...data,
      personal_best: (data.personal_best === '' || data.personal_best == null) ? null : Number(data.personal_best),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['my-profile', user?.email] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (err) => setProfileError(err?.data?.message || String(err?.message || err) || 'Beim Speichern ist ein Fehler aufgetreten.'),
  });

  const handleSearch = () => {
    setLinkError('');
    if (searchMode === 'number') {
      const num = parseInt(searchNumber.trim());
      if (!num) { setLinkError('Bitte eine gültige Nummer eingeben.'); return; }
      const found = allPlayers.filter(p => Number(p.number) === num);
      setMatches(found);
      setLinkStep('results');
    } else {
      const first = searchFirst.trim().toLowerCase();
      const last = searchLast.trim().toLowerCase();
      if (!first || !last) { setLinkError('Bitte Vor- und Nachname eingeben.'); return; }
      const found = allPlayers.filter(p => {
        const pFirst = (p.first_name || '').toLowerCase();
        const pLast = (p.last_name || '').toLowerCase();
        const pName = (p.name || '').toLowerCase();
        return (pFirst.includes(first) && pLast.includes(last)) ||
               (pName.includes(first) && pName.includes(last));
      });
      setMatches(found);
      setLinkStep('results');
    }
  };

  const handleLink = (player) => linkMutation.mutate({ id: player.id });

  const handleCreateNew = () => {
    setForm({ ...empty, first_name: searchFirst, last_name: searchLast });
    setLinkStep('create');
  };

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    set('photo_url', file_url);
    setUploading(false);
  };

  const needsPrivacyConfirm = myProfile && !myProfile.privacy_accepted;

  const handleProfileSubmit = (e) => {
    e.preventDefault();
    setProfileError('');
    const data = { ...form };
    data.first_name = myProfile ? myProfile.first_name : form.first_name;
    data.last_name = myProfile ? myProfile.last_name : form.last_name;
    data.name = `${data.first_name} ${data.last_name}`.trim();
    data.age_class = calcAgeClass(form.birth_date);
    if (myProfile) {
      if (needsPrivacyConfirm) {
        data.privacy_accepted = true;
        data.privacy_accepted_at = new Date().toISOString();
      }
      updateMutation.mutate({ id: myProfile.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleNameSave = async (e) => {
    e.preventDefault();
    setNameError('');
    const newFirst = nameForm.first_name.trim();
    const newLast = nameForm.last_name.trim();
    if (!newFirst || !newLast) return;
    const newName = `${newFirst} ${newLast}`.trim();
    setNameLoading(true);
    await base44.entities.Player.update(myProfile.id, { first_name: newFirst, last_name: newLast, name: newName });
    queryClient.invalidateQueries();
    setNameLoading(false);
    setNameSaved(true);
    setTimeout(() => setNameSaved(false), 3000);
  };

  const handleAccountSave = async (e) => {
    e.preventDefault();
    setAccountError('');
    const updates = {};
    if (newEmail.trim()) updates.email = newEmail.trim();
    if (newPassword) {
      if (newPassword !== confirmPassword) { setAccountError('Passwörter stimmen nicht überein.'); return; }
      updates.password = newPassword;
    }
    if (Object.keys(updates).length === 0) return;
    await base44.auth.updateMe(updates);
    setAccountSaved(true);
    setNewEmail(''); setNewPassword(''); setConfirmPassword('');
    setTimeout(() => setAccountSaved(false), 3000);
  };

  // Newsletter subscription
  const { data: newsletterStatus, refetch: refetchNewsletter } = useQuery({
    queryKey: ['newsletter-status', user?.email],
    queryFn: async () => {
      const res = await base44.functions.invoke('getNewsletterStatus');
      return res.data;
    },
    enabled: !!user,
  });

  const subscribeMutation = useMutation({
    mutationFn: () => base44.functions.invoke('subscribeNewsletter', { email: user.email, source: 'dashboard' }),
    onSuccess: () => refetchNewsletter(),
  });

  const unsubscribeMutation = useMutation({
    mutationFn: () => base44.functions.invoke('unsubscribeNewsletter'),
    onSuccess: () => refetchNewsletter(),
  });

  if (isLoadingAuth || loadingProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-card border border-border rounded-2xl p-10 text-center max-w-md w-full">
          <User className="w-14 h-14 text-muted-foreground/30 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-2">Spielerprofil</h1>
          <p className="text-sm text-muted-foreground mb-6">Melde dich an, um dein Spielerprofil zu erstellen oder zu bearbeiten.</p>
          <Button onClick={() => base44.auth.redirectToLogin(window.location.href)} className="gap-2 w-full">
            <LogIn className="w-4 h-4" />Jetzt anmelden
          </Button>
        </div>
      </div>
    );
  }

  if (linkStep === 'search') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-card border border-border rounded-2xl p-8 max-w-md w-full space-y-6">
          <div className="text-center">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Link2 className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Profil verknüpfen</h1>
            <p className="text-sm text-muted-foreground mt-1">Suche dein Spielerprofil per Name oder Nummer.</p>
            {user?.email && <p className="text-xs text-muted-foreground mt-2">Angemeldet als: <span className="font-mono">{user.email}</span></p>}
          </div>

          {/* Mode toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button onClick={() => setSearchMode('name')} className={`flex-1 py-2 text-sm font-medium transition-colors ${searchMode === 'name' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted'}`}>
              Nach Name
            </button>
            <button onClick={() => setSearchMode('number')} className={`flex-1 py-2 text-sm font-medium transition-colors ${searchMode === 'number' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted'}`}>
              Nach Nummer
            </button>
          </div>

          {searchMode === 'name' ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Vorname</Label>
                <Input value={searchFirst} onChange={e => setSearchFirst(e.target.value)} placeholder="Max" onKeyDown={e => e.key === 'Enter' && handleSearch()} />
              </div>
              <div className="space-y-1.5">
                <Label>Nachname</Label>
                <Input value={searchLast} onChange={e => setSearchLast(e.target.value)} placeholder="Mustermann" onKeyDown={e => e.key === 'Enter' && handleSearch()} />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Spielernummer</Label>
              <Input type="number" value={searchNumber} onChange={e => setSearchNumber(e.target.value)} placeholder="z.B. 1042" onKeyDown={e => e.key === 'Enter' && handleSearch()} />
            </div>
          )}

          {linkError && <div className="flex items-center gap-2 text-destructive text-sm"><AlertCircle className="w-4 h-4 flex-shrink-0" />{linkError}</div>}
          <Button onClick={handleSearch} className="w-full gap-2"
            disabled={searchMode === 'name' ? (!searchFirst.trim() || !searchLast.trim()) : !searchNumber.trim()}>
            <Search className="w-4 h-4" />Suchen
          </Button>
        </div>
      </div>
    );
  }

  if (linkStep === 'results') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-card border border-border rounded-2xl p-8 max-w-md w-full space-y-5">
          <div className="text-center">
            <h1 className="text-xl font-bold text-foreground">Spieler gefunden</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {matches.length > 0 ? 'Bist du eine der folgenden Personen?' : `Kein Spieler mit dem Namen „${searchFirst} ${searchLast}" gefunden.`}
            </p>
          </div>
          {matches.length > 0 && (
            <div className="space-y-2">
              {matches.map(player => (
                <div key={player.id} className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/20">
                  <div className="flex items-center gap-3">
                    {player.photo_url
                      ? <img src={player.photo_url} className="w-10 h-10 rounded-full object-cover" alt={player.name} />
                      : <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"><User className="w-5 h-5 text-primary" /></div>}
                    <div>
                      <p className="font-semibold text-sm text-foreground">{player.name || `${player.first_name} ${player.last_name}`}</p>
                      <p className="text-xs text-muted-foreground">{player.category}{player.club ? ` · ${player.club}` : ''}</p>
                    </div>
                  </div>
                  <Button size="sm" onClick={() => handleLink(player)} disabled={linkMutation.isPending}>
                    <Link2 className="w-3.5 h-3.5 mr-1" />Das bin ich
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-2 pt-1">
            <Button variant="outline" onClick={() => setLinkStep('search')} className="w-full">Anderen Namen suchen</Button>
            <Button variant="ghost" onClick={handleCreateNew} className="w-full gap-2 text-muted-foreground">
              <UserPlus className="w-4 h-4" />Neues Profil erstellen
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (linkStep === 'create') {
    return (
      <div className="p-4 md:p-8 max-w-lg">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Profil erstellen</h1>
          <p className="text-muted-foreground mt-1 text-sm">Erstelle dein Profil für die Spielerdatenbank</p>
        </div>
        <form onSubmit={handleProfileSubmit} className="bg-card border border-border rounded-2xl p-6 space-y-5">
          <div className="flex flex-col items-center gap-2">
            <div onClick={() => fileRef.current?.click()} className="w-28 h-28 rounded-full border-2 border-dashed border-border bg-muted/30 flex items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors overflow-hidden">
              {form.photo_url
                ? <img src={form.photo_url} alt="Foto" className="w-full h-full object-cover" />
                : uploading
                ? <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                : <div className="flex flex-col items-center gap-1 text-muted-foreground"><Upload className="w-6 h-6" /><span className="text-xs">Foto</span></div>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Vorname *</Label><Input value={form.first_name} onChange={e => set('first_name', e.target.value)} placeholder="Max" required /></div>
            <div className="space-y-1.5"><Label>Nachname *</Label><Input value={form.last_name} onChange={e => set('last_name', e.target.value)} placeholder="Mustermann" required /></div>
          </div>
          <div className="space-y-1.5">
            <Label>Kategorie</Label>
            <Select value={form.category} onValueChange={v => set('category', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Herren">Herren</SelectItem>
                <SelectItem value="Damen">Damen</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Verein</Label><Input value={form.club} onChange={e => set('club', e.target.value)} placeholder="Optional" /></div>

          {/* Datenschutz-Disclaimer */}
          <div className="bg-muted/40 rounded-xl border border-border p-4 space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground">Datenschutzhinweis:</span> Mit dem Erstellen deines Profils stimmst du zu, dass deine personenbezogenen Daten (Name, Geburtsdatum, Profilfoto) in der Spielerdatenbank gespeichert und für die Turnierverwaltung, Ranglisten und Ergebnisveröffentlichungen verwendet werden dürfen.
            </p>
            {disclaimerUrl && (
              <a href={disclaimerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium">
                <FileText className="w-3.5 h-3.5" />Datenschutzerklärung lesen (PDF)
              </a>
            )}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={privacyAccepted}
                onChange={e => setPrivacyAccepted(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-border flex-shrink-0"
                required
              />
              <span className="text-xs text-foreground">Ich stimme der Speicherung und Verwendung meiner Daten (Name, Geburtsdatum, Foto) zu.*</span>
            </label>
          </div>

          {profileError && <p className="text-sm text-destructive flex items-center gap-1.5"><AlertCircle className="w-4 h-4" />{profileError}</p>}
          <Button type="submit" disabled={!form.first_name.trim() || !form.last_name.trim() || !privacyAccepted || createMutation.isPending} className="w-full">
            {createMutation.isPending ? 'Erstellen...' : 'Profil erstellen'}
          </Button>
        </form>
      </div>
    );
  }

  // Main profile page (linked user)
  const isStatsTab = activeTab === 'statistik';
  return (
    <div className={`p-4 md:p-8 ${isStatsTab ? 'max-w-3xl' : 'max-w-lg'} space-y-6`}>
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">Mein Profil</h1>
        <p className="text-muted-foreground mt-1 text-sm">Bearbeite deine Spielerdaten</p>
      </div>

      {/* Tab switcher */}
      <div className="flex rounded-xl border border-border overflow-hidden">
        <button
          onClick={() => setActiveTab('profil')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${activeTab === 'profil' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted'}`}
        >
          <User className="w-4 h-4" />Mein Profil
        </button>
        <button
          onClick={() => setActiveTab('tourcard')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${activeTab === 'tourcard' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted'}`}
        >
          <CreditCard className="w-4 h-4" />Tour Card
        </button>
        <button
          onClick={() => setActiveTab('statistik')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${activeTab === 'statistik' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted'}`}
        >
          <BarChart2 className="w-4 h-4" />Statistik
        </button>
      </div>

      <div className={activeTab === 'tourcard' ? 'py-4' : 'hidden'}>
        <TourCard player={myProfile} />
      </div>

      {isStatsTab && (
        <PlayerStats playerId={myProfile.id} embedded />
      )}

      {activeTab === 'profil' && (<>

      {/* Profile info */}
      <form onSubmit={handleProfileSubmit} className="bg-card border border-border rounded-2xl p-6 space-y-5">
        <h2 className="text-base font-semibold text-foreground">Profilinformationen</h2>
        {myProfile?.number && (
          <div className="flex items-center gap-2 bg-muted/40 rounded-xl px-4 py-3">
            <Hash className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Spielernummer:</span>
            <span className="font-bold text-foreground">{myProfile.number}</span>
          </div>
        )}
        {myProfile?.id && (
          <div className="flex items-center gap-2 bg-muted/40 rounded-xl px-4 py-3">
            <span className="text-sm text-muted-foreground">Spieler-ID:</span>
            <span className="font-mono text-xs text-foreground select-all">{myProfile.id}</span>
          </div>
        )}
        <div className="flex flex-col items-center gap-2">
             <div onClick={() => fileRef.current?.click()} className="w-24 h-24 rounded-full border-2 border-dashed border-border bg-muted/30 flex items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors overflow-hidden">
               {form.photo_url
                 ? <img src={form.photo_url} alt="Foto" className="w-full h-full object-cover" />
                 : uploading
                 ? <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                 : <div className="flex flex-col items-center gap-1 text-muted-foreground"><Upload className="w-5 h-5" /><span className="text-xs">Foto</span></div>}
             </div>
             <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
             <p className="text-sm font-semibold text-foreground">{form.first_name && form.last_name ? `${form.first_name} ${form.last_name}` : 'Spielername'}</p>
             {form.photo_url && <button type="button" onClick={() => set('photo_url', '')} className="text-xs text-destructive hover:underline">Foto entfernen</button>}
           </div>
        <div className="space-y-1.5">
          <Label>Kategorie</Label>
          <Select value={form.category} onValueChange={v => set('category', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Herren">Herren</SelectItem>
              <SelectItem value="Damen">Damen</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Verein</Label>
          <Input value={form.club} onChange={e => set('club', e.target.value)} placeholder="Optional" />
        </div>
        <div className="space-y-1.5">
          <Label>Geburtsdatum</Label>
          <Input type="date" value={form.birth_date} onChange={e => set('birth_date', e.target.value)} />
          {form.birth_date && (
            <p className="text-xs text-muted-foreground">
              Altersklasse: <span className="font-semibold text-primary">{calcAgeClass(form.birth_date)}</span>
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />Telefonnummer</Label>
          <Input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="Optional" />
        </div>
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">🏆 Personal Best</Label>
          <Input
            type="number"
            min={0}
            max={1200}
            value={form.personal_best}
            onChange={e => set('personal_best', e.target.value === '' ? '' : Number(e.target.value))}
            placeholder="z.B. 742"
          />
          <p className="text-xs text-muted-foreground">Deine persönliche Bestleistung (Gesamtholz in einem Durchgang)</p>
        </div>
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5"><Music className="w-3.5 h-3.5" />Walk-on Song</Label>
          <Input
            value={form.walk_on_song}
            onChange={e => set('walk_on_song', e.target.value)}
            placeholder="z.B. Enter Sandman – Metallica"
          />
          <p className="text-xs text-muted-foreground">Dein Song beim Walk-on (Song + Interpret)</p>
        </div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={form.whatsapp} onChange={e => set('whatsapp', e.target.checked)} className="w-4 h-4 rounded border-border" />
          <span className="flex items-center gap-2 text-sm text-foreground"><MessageCircle className="w-3.5 h-3.5" />Über WhatsApp erreichbar</span>
        </label>
        {needsPrivacyConfirm ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
            <p className="text-xs text-amber-900 leading-relaxed font-medium">
              Datenschutzhinweis: Bevor du dein Profil zum ersten Mal speicherst, bestätige bitte die Verwendung deiner Daten.
            </p>
            <p className="text-xs text-amber-800 leading-relaxed">
              Deine personenbezogenen Daten (Name, Geburtsdatum, Profilfoto) werden in der Spielerdatenbank gespeichert und für die Turnierverwaltung, Ranglisten und Ergebnisveröffentlichungen verwendet.
            </p>
            {disclaimerUrl && (
              <a href={disclaimerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium">
                <FileText className="w-3.5 h-3.5" />Datenschutzerklärung lesen (PDF)
              </a>
            )}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={privacyAccepted}
                onChange={e => setPrivacyAccepted(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-border flex-shrink-0"
                required
              />
              <span className="text-xs text-amber-900 font-medium">Ich stimme der Speicherung und Verwendung meiner Daten zu.*</span>
            </label>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground bg-green-50 rounded-xl border border-green-200 px-4 py-3 leading-relaxed text-green-800">
            ✓ Du hast der Datenschutzbestimmung bereits zugestimmt.
            {disclaimerUrl && (
              <a href={disclaimerUrl} target="_blank" rel="noopener noreferrer" className="ml-1 text-primary hover:underline inline-flex items-center gap-1">
                <FileText className="w-3 h-3" />Datenschutzerklärung
              </a>
            )}
          </p>
        )}
        {profileError && <p className="text-sm text-destructive flex items-center gap-1.5"><AlertCircle className="w-4 h-4" />{profileError}</p>}
        <Button type="submit" disabled={(needsPrivacyConfirm && !privacyAccepted) || updateMutation.isPending || uploading} className="w-full gap-2">
          {saved ? <><CheckCircle2 className="w-4 h-4 text-green-400" />Gespeichert!</> : updateMutation.isPending ? 'Speichern...' : <><Pencil className="w-4 h-4" />Profil aktualisieren</>}
        </Button>
        </form>

      {/* Name change */}
      <form onSubmit={handleNameSave} className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Name ändern</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Wird in allen Turnieren und der Rangliste aktualisiert.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Vorname</Label>
            <Input value={nameForm.first_name} onChange={e => setNameForm(n => ({ ...n, first_name: e.target.value }))} placeholder="Max" />
          </div>
          <div className="space-y-1.5">
            <Label>Nachname</Label>
            <Input value={nameForm.last_name} onChange={e => setNameForm(n => ({ ...n, last_name: e.target.value }))} placeholder="Mustermann" />
          </div>
        </div>
        {nameError && <p className="text-sm text-destructive flex items-center gap-1.5"><AlertCircle className="w-4 h-4" />{nameError}</p>}
        <Button type="submit" variant="outline" className="w-full gap-2" disabled={!nameForm.first_name.trim() || !nameForm.last_name.trim() || nameLoading}>
          {nameSaved ? <><CheckCircle2 className="w-4 h-4 text-green-500" />Name aktualisiert!</> : nameLoading ? 'Aktualisieren...' : 'Name aktualisieren'}
        </Button>
      </form>

      {/* Account settings */}
      <form onSubmit={handleAccountSave} className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <h2 className="text-base font-semibold text-foreground">Zugangsdaten ändern</h2>
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />Neue E-Mail-Adresse</Label>
          <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder={user?.email || 'Aktuelle E-Mail'} />
        </div>
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" />Neues Passwort</Label>
          <div className="relative">
            <Input type={showPassword ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Neues Passwort" className="pr-10" />
            <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        {newPassword && (
          <div className="space-y-1.5">
            <Label>Passwort bestätigen</Label>
            <Input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Passwort wiederholen" />
          </div>
        )}
        {accountError && <p className="text-sm text-destructive flex items-center gap-1.5"><AlertCircle className="w-4 h-4" />{accountError}</p>}
        <Button type="submit" variant="outline" className="w-full gap-2" disabled={!newEmail.trim() && !newPassword}>
          {accountSaved ? <><CheckCircle2 className="w-4 h-4 text-green-500" />Gespeichert!</> : 'Zugangsdaten aktualisieren'}
        </Button>
      </form>

      {/* Newsletter */}
      <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Newsletter</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Bleibe informiert über neue Turniere und Ergebnisse.
        </p>
        {newsletterStatus?.is_active ? (
          <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span className="text-sm text-green-800 font-medium">Newsletter abonniert</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => unsubscribeMutation.mutate()}
              disabled={unsubscribeMutation.isPending}
            >
              {unsubscribeMutation.isPending ? 'Wird abgemeldet...' : 'Abbestellen'}
            </Button>
          </div>
        ) : (
          <Button
            onClick={() => subscribeMutation.mutate()}
            disabled={subscribeMutation.isPending}
            className="w-full gap-2"
          >
            {subscribeMutation.isPending ? 'Wird angemeldet...' : <><Mail className="w-4 h-4" />Newsletter abonnieren</>}
          </Button>
        )}
      </div>

      <div className="text-center">
        <Button variant="ghost" onClick={() => base44.auth.logout()} className="gap-2 text-muted-foreground hover:text-destructive">
          <LogOut className="w-4 h-4" />Abmelden
        </Button>
      </div>
      </>)}
    </div>
  );
}