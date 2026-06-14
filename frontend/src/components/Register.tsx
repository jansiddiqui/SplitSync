import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserPlus, User, Mail, Lock, ArrowLeft, Palette } from 'lucide-react';
import { Logo } from './Logo';

interface RegisterProps {
  onToggleView: () => void;
  onBackToHome: () => void;
}

export const Register: React.FC<RegisterProps> = ({ onToggleView, onBackToHome }) => {
  const { register } = useAuth();
  const toggleTheme = () => {
    const isLight = document.body.classList.contains('theme-light');
    if (isLight) {
      document.body.classList.remove('theme-light');
      localStorage.setItem('split-sync-theme', 'dark');
    } else {
      document.body.classList.add('theme-light');
      localStorage.setItem('split-sync-theme', 'light');
    }
  };
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) {
      setError('Please fill in all fields.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await register(name, email, password);
    } catch (err: any) {
      setError(err.message || 'Registration failed. Email might already be registered.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-transparent relative overflow-hidden cyber-dots font-sans" id="register-root">
      
      {/* Visual background glows */}
      <div className="absolute top-[-15%] left-[-15%] w-[500px] h-[500px] rounded-full bg-primary/10 blur-[130px] pointer-events-none animate-float-slow" />
      <div className="absolute bottom-[-15%] right-[-15%] w-[500px] h-[500px] rounded-full bg-accent/10 blur-[130px] pointer-events-none animate-float-medium" />

      {/* Back to Home floating action */}
      <button 
        onClick={onBackToHome}
        className="absolute top-6 left-6 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold border border-white/5 hover:cursor-pointer flex items-center gap-1.5 transition btn-magnetic"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Home
      </button>

      {/* Theme Switcher floating action */}
      <button
        id="btn-register-theme-toggle"
        onClick={toggleTheme}
        className="absolute top-6 right-6 p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-350 border border-white/5 transition hover:cursor-pointer flex items-center justify-center btn-magnetic"
        title="Toggle theme color"
      >
        <Palette className="w-4 h-4" />
      </button>

      <article className="w-full max-w-md glass-card rounded-2xl p-8 border border-white/10 shadow-2xl relative z-10 animate-slide-up hover:border-primary/20 transition-all duration-300 card-glow-theme" id="register-card">
        <header className="text-center mb-8 flex flex-col items-center gap-3">
          <Logo className="w-12 h-12 hover:cursor-pointer btn-magnetic" onClick={onBackToHome} />
          <h1 
            onClick={onBackToHome}
            className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent hover:cursor-pointer text-cyber-glow" 
            id="register-title"
          >
            SplitSync
          </h1>
          <p className="text-slate-400 mt-2 text-xs font-medium tracking-wide">
            Create an account to start sharing expenses
          </p>
        </header>

        {error && (
          <div 
            className="bg-red-955/40 border border-red-500/30 text-red-200 rounded-xl p-3.5 text-xs font-semibold mb-6 flex items-start gap-2 animate-fade-in" 
            id="container-register-error"
          >
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5" id="form-register">
          <div className="space-y-2">
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block" htmlFor="input-register-name">
              Full Name
            </label>
            <div className="relative">
              <User className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
              <input
                id="input-register-name"
                type="text"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-xl glass-input text-xs font-medium"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block" htmlFor="input-register-email">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
              <input
                id="input-register-email"
                type="email"
                placeholder="john@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-xl glass-input text-xs font-medium"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block" htmlFor="input-register-password">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
              <input
                id="input-register-password"
                type="password"
                placeholder="Min. 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-xl glass-input text-xs font-medium"
                required
              />
            </div>
          </div>

          <button
            id="btn-register-submit"
            type="submit"
            disabled={submitting}
            className="w-full bg-gradient-to-r from-primary to-accent hover:brightness-110 hover:shadow-lg hover:shadow-primary/20 text-obsidian text-xs font-extrabold py-3.5 px-4 rounded-xl transition-all duration-202 flex items-center justify-center gap-2 hover:cursor-pointer btn-magnetic"
          >
            {submitting ? (
              <span className="w-4 h-4 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin"></span>
            ) : (
              <>
                <UserPlus className="w-4 h-4 text-obsidian" />
                Create Account
              </>
            )}
          </button>
        </form>

        <footer className="mt-8 text-center text-xs text-slate-400 border-t border-white/5 pt-6">
          Already have an account?{' '}
          <button
            id="btn-register-toggle"
            onClick={onToggleView}
            className="text-fuchsia-400 hover:text-fuchsia-300 font-bold transition hover:cursor-pointer underline decoration-fuchsia-500/30 underline-offset-4"
          >
            Sign In
          </button>
        </footer>
      </article>
    </main>
  );
};
