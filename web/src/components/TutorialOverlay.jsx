import { useState } from 'react';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

const GENERAL_STEPS = [
  {
    title: 'Willkommen beim Turnierverwaltungs-System!',
    content: 'Hier findest du alle Funktionen rund um die Verwaltung von Turnieren, Mannschaften und Spielern.',
  },
  {
    title: 'Turniere',
    content: 'Unter „Turniere" kannst du neue Turniere anlegen, bestehende verwalten und den aktuellen Status einsehen.',
  },
  {
    title: 'Spieler & Rangliste',
    content: 'Im Bereich „Spieler" pflegst du alle Spielerdaten. Die „Rangliste" zeigt die aktuellen Punktestände der Saison.',
  },
  {
    title: 'Dein Profil',
    content: 'Unter „Spielerprofil" kannst du dein eigenes Spielerprofil verknüpfen und persönliche Daten pflegen.',
  },
];

const ORGANIZER_STEPS = [
  {
    title: 'Als Veranstalter: Startplan',
    content: 'Im Tab „Startplan" kannst du Mannschaften per Drag & Drop auf Bahnen und Zeitslots einteilen.',
  },
  {
    title: 'Ergebnisse eintragen',
    content: 'Im Tab „Ergebnisse" gibst du die Kegelergebnisse pro Spieler ein. Die Eingabe wird automatisch gespeichert.',
  },
  {
    title: 'Zwischenstand & Punktetabelle',
    content: 'Der Zwischenstand zeigt Live-Rankings. In der Punktetabelle siehst du die Ranglistenpunkte nach Turnierabschluss.',
  },
  {
    title: 'Mannschaften verwalten',
    content: 'Im Bereich „Mannschaften" kannst du Teams anlegen, bearbeiten und Abmeldungen genehmigen oder ablehnen. Registrierte Spieler können sich selbst Slots ihrer Mannschaft reservieren, ohne dass du aktiv werden musst.',
  },
  {
    title: 'Turnier abschließen',
    content: 'Mit „Turnier abschließen" werden die Ergebnisse fixiert und die Ranglistenpunkte verteilt. Du kannst das Turnier danach wieder öffnen falls nötig.',
  },
];

export function useTutorial(isOrganizer = false) {
  const storageKey = isOrganizer ? 'tutorial_done_organizer' : 'tutorial_done_general';
  const [show, setShow] = useState(false);

  const open = () => setShow(true);
  const close = () => {
    localStorage.setItem(storageKey, '1');
    setShow(false);
  };

  return { show, open, close };
}

export default function TutorialOverlay({ show, onClose, isOrganizer = false }) {
  const [step, setStep] = useState(0);
  const steps = isOrganizer ? ORGANIZER_STEPS : GENERAL_STEPS;

  if (!show) return null;

  const isLast = step === steps.length - 1;
  const isFirst = step === 0;

  const handleClose = () => {
    setStep(0);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md p-6 relative">
        {/* Close */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Step indicator */}
        <div className="flex gap-1.5 mb-5">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full flex-1 transition-all ${i === step ? 'bg-primary' : 'bg-muted'}`}
            />
          ))}
        </div>

        {/* Content */}
        <h2 className="text-lg font-bold text-foreground mb-2">{steps[step].title}</h2>
        <p className="text-sm text-muted-foreground leading-relaxed mb-6">{steps[step].content}</p>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStep(s => s - 1)}
            disabled={isFirst}
            className="gap-1"
          >
            <ChevronLeft className="w-4 h-4" /> Zurück
          </Button>

          {isLast ? (
            <Button size="sm" onClick={handleClose}>
              Fertig
            </Button>
          ) : (
            <Button size="sm" onClick={() => setStep(s => s + 1)} className="gap-1">
              Weiter <ChevronRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}