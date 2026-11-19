// Anmelden / Registrieren / Passwort vergessen / Passwort festlegen (Link aus E-Mail)
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Trophy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/api/base44Client";

const safeRedirect = (p) => (p && p.startsWith("/") && !p.startsWith("//") ? p : "/");

function Shell({ title, subtitle, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
            <Trophy className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">{children}</div>
        <p className="text-center text-sm"><Link to="/" className="text-primary hover:underline">← Zurück zur 9-Pin Tour</Link></p>
        <p className="text-center text-xs text-muted-foreground space-x-3">
          <Link to="/impressum" className="hover:underline">Impressum</Link>
          <Link to="/datenschutz" className="hover:underline">Datenschutz</Link>
          <Link to="/nutzungsbedingungen" className="hover:underline">Nutzungsbedingungen</Link>
        </p>
      </div>
    </div>
  );
}

function GoogleButton({ redirect }) {
  return (
    <Button variant="outline" className="w-full gap-2" onClick={() => { window.location.href = `/api/auth/google?redirect=${encodeURIComponent(redirect)}`; }}>
      <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true"><path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7.1H2.1a11 11 0 0 0 0 9.9l3.7-2.8z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z"/></svg>
      Mit Google anmelden
    </Button>
  );
}

export default function Login() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const redirect = safeRedirect(params.get("redirect"));
  const [mode, setMode] = useState(token ? "password" : "login"); // login | register | forgot | password
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(params.get("fehler") || "");
  const [info, setInfo] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(""); setInfo("");
    try {
      if (mode === "login") await api("/auth/login", { method: "POST", body: { email, password } });
      else if (mode === "register") await api("/auth/register", { method: "POST", body: { email, password, full_name: fullName } });
      else if (mode === "password") await api("/auth/password", { method: "POST", body: { token, password } });
      else if (mode === "forgot") {
        const r = await api("/auth/forgot", { method: "POST", body: { email } });
        setInfo(r.message); setBusy(false); return;
      }
      window.location.href = redirect;
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const titles = {
    login: ["Anmelden", "Willkommen zurück bei der 9-Pin Tour"],
    register: ["Konto anlegen", "Für Turnieranmeldungen und dein Spielerprofil"],
    forgot: ["Passwort vergessen", "Wir schicken dir einen Link zum Festlegen eines neuen Passworts."],
    password: ["Passwort festlegen", "Wähle ein neues Passwort (mind. 8 Zeichen)."],
  };

  return (
    <Shell title={titles[mode][0]} subtitle={titles[mode][1]}>
      {(mode === "login" || mode === "register") && (
        <>
          <GoogleButton redirect={redirect} />
          <div className="flex items-center gap-3 text-xs text-muted-foreground"><div className="h-px flex-1 bg-border" />oder mit E-Mail<div className="h-px flex-1 bg-border" /></div>
        </>
      )}
      <form onSubmit={submit} className="space-y-3">
        {mode === "register" && (
          <div className="space-y-1.5"><Label htmlFor="name">Name</Label><Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" /></div>
        )}
        {mode !== "password" && (
          <div className="space-y-1.5"><Label htmlFor="email">E-Mail</Label><Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>
        )}
        {mode !== "forgot" && (
          <div className="space-y-1.5"><Label htmlFor="pw">Passwort</Label><Input id="pw" type="password" required minLength={mode === "login" ? undefined : 8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} /></div>
        )}
        {mode === "register" && (
          <p className="text-xs text-muted-foreground">Mit der Registrierung akzeptierst du die <Link to="/nutzungsbedingungen" className="text-primary hover:underline">Nutzungsbedingungen</Link>. Infos zum Umgang mit deinen Daten: <Link to="/datenschutz" className="text-primary hover:underline">Datenschutzerklärung</Link>.</p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {info && <p className="text-sm text-green-700">{info}</p>}
        <Button type="submit" className="w-full gap-2" disabled={busy}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {{ login: "Anmelden", register: "Konto anlegen", forgot: "Link schicken", password: "Passwort speichern" }[mode]}
        </Button>
      </form>
      <div className="text-sm text-center space-y-1">
        {mode === "login" && <>
          <button className="text-primary hover:underline" onClick={() => setMode("forgot")}>Passwort vergessen?</button>
          <p className="text-muted-foreground">Noch kein Konto? <button className="text-primary hover:underline" onClick={() => setMode("register")}>Registrieren</button></p>
        </>}
        {(mode === "register" || mode === "forgot") && <button className="text-primary hover:underline" onClick={() => setMode("login")}>Zur Anmeldung</button>}
      </div>
    </Shell>
  );
}
