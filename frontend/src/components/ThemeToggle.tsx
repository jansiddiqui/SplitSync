import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

interface ThemeToggleProps {
  /** If true, render as a compact icon-only toggle (for mobile header) */
  compact?: boolean;
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ compact = false, className = '' }) => {
  const [theme, setTheme] = useState<'midnight' | 'aurora'>('midnight');

  // Sync state from DOM on mount
  useEffect(() => {
    const isLight = document.body.classList.contains('theme-light');
    setTheme(isLight ? 'aurora' : 'midnight');
  }, []);

  const applyTheme = (next: 'midnight' | 'aurora') => {
    if (next === 'aurora') {
      document.body.classList.add('theme-light');
      localStorage.setItem('split-sync-theme', 'light');
    } else {
      document.body.classList.remove('theme-light');
      localStorage.setItem('split-sync-theme', 'dark');
    }
    setTheme(next);
    window.dispatchEvent(new CustomEvent('splitsync:themechange', { detail: { theme: next } }));
  };

  const toggle = () => applyTheme(theme === 'midnight' ? 'aurora' : 'midnight');

  /* ── Compact (icon-only) mode ── */
  if (compact) {
    return (
      <button
        id="btn-theme-toggle-compact"
        onClick={toggle}
        title={`Switch to ${theme === 'midnight' ? 'Aurora' : 'Midnight'} theme`}
        className={`relative p-2 rounded-xl border transition-all duration-300 hover:cursor-pointer group ${
          theme === 'midnight'
            ? 'bg-white/5 border-white/10 text-slate-400 hover:text-primary hover:border-primary/30 hover:bg-primary/5'
            : 'bg-amber-50/10 border-amber-400/20 text-amber-500 hover:text-amber-400'
        } ${className}`}
      >
        <span className="relative block w-4 h-4">
          {theme === 'midnight' ? (
            <Moon className="w-4 h-4 transition-transform group-hover:rotate-12 duration-300" />
          ) : (
            <Sun className="w-4 h-4 transition-transform group-hover:rotate-45 duration-500" />
          )}
        </span>
      </button>
    );
  }

  /* ── Full pill toggle ── */
  const isMidnight = theme === 'midnight';

  return (
    <div
      className={`relative flex items-center p-1 rounded-2xl border border-white/8 bg-black/30 backdrop-blur-md gap-0 ${className}`}
      role="group"
      aria-label="Theme selector"
    >
      {/* Sliding pill indicator */}
      <span
        aria-hidden
        className="absolute top-1 bottom-1 rounded-xl transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] pointer-events-none"
        style={{
          width: 'calc(50% - 4px)',
          left: isMidnight ? '4px' : 'calc(50%)',
          background: isMidnight
            ? 'linear-gradient(135deg, rgba(61,255,211,0.18), rgba(0,217,255,0.10))'
            : 'linear-gradient(135deg, rgba(251,191,36,0.20), rgba(253,224,71,0.10))',
          boxShadow: isMidnight
            ? '0 0 16px -2px rgba(61,255,211,0.25), inset 0 1px 0 rgba(255,255,255,0.08)'
            : '0 0 16px -2px rgba(251,191,36,0.25), inset 0 1px 0 rgba(255,255,255,0.08)',
          border: isMidnight
            ? '1px solid rgba(61,255,211,0.22)'
            : '1px solid rgba(251,191,36,0.28)',
        }}
      />

      {/* Midnight */}
      <button
        id="btn-theme-midnight"
        onClick={() => applyTheme('midnight')}
        aria-pressed={isMidnight}
        className={`relative z-10 flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-bold tracking-wide transition-all duration-200 hover:cursor-pointer select-none w-[90px] ${
          isMidnight ? 'text-primary' : 'text-slate-500 hover:text-slate-300'
        }`}
      >
        <Moon className={`w-3.5 h-3.5 shrink-0 transition-transform duration-300 ${isMidnight ? 'rotate-[-15deg]' : ''}`} />
        <span>Midnight</span>
      </button>

      {/* Aurora */}
      <button
        id="btn-theme-aurora"
        onClick={() => applyTheme('aurora')}
        aria-pressed={!isMidnight}
        className={`relative z-10 flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-bold tracking-wide transition-all duration-200 hover:cursor-pointer select-none w-[80px] ${
          !isMidnight ? 'text-amber-400' : 'text-slate-500 hover:text-slate-300'
        }`}
      >
        <Sun className={`w-3.5 h-3.5 shrink-0 transition-transform duration-500 ${!isMidnight ? 'rotate-45' : ''}`} />
        <span>Aurora</span>
      </button>
    </div>
  );
};
