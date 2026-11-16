import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Mail, CheckCircle2, Loader2 } from 'lucide-react';

export default function NewsletterSignup() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('loading');
    try {
      const res = await base44.functions.invoke('subscribeNewsletter', {
        email: email.trim(),
        source: 'dashboard',
      });
      setStatus('success');
      setMessage(res.data?.message || 'Erfolgreich angemeldet!');
      setEmail('');
    } catch (err) {
      setStatus('error');
      setMessage(err?.response?.data?.error || 'Anmeldung fehlgeschlagen');
    }
  };

  if (status === 'success') {
    return (
      <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-2xl p-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Newsletter abonniert!</p>
            <p className="text-sm text-muted-foreground">{message}</p>
          </div>
        </div>
        <button
          onClick={() => { setStatus('idle'); setMessage(''); }}
          className="text-xs text-primary hover:underline mt-3"
        >
          Andere E-Mail anmelden
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
          <Mail className="w-4 h-4 text-primary" />
        </div>
        <h3 className="font-bold text-foreground">Newsletter</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-3">
        Bleiben Sie informiert über neue Turniere und Ergebnisse.
      </p>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Ihre E-Mail-Adresse"
          disabled={status === 'loading'}
          className="flex-1"
        />
        <Button type="submit" disabled={status === 'loading' || !email.trim()} className="gap-2">
          {status === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Anmelden'}
        </Button>
      </form>
      {status === 'error' && (
        <p className="text-xs text-destructive mt-2">{message}</p>
      )}
    </div>
  );
}