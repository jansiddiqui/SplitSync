import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { supabase } from './utils/supabase';
import { Landing } from './components/Landing';
import { Login } from './components/Login';
import { Register } from './components/Register';
import { Dashboard } from './components/Dashboard';
import { GroupDetail } from './components/GroupDetail';
import { CommandPalette } from './components/CommandPalette';
import { ToastProvider } from './components/Toast';
import { X } from 'lucide-react';

type AuthView = 'landing' | 'login' | 'register';

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();
  const [authView, setAuthView] = useState<AuthView>('landing');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  // 1-Click Join Invite Links listener
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinCode = params.get('join');
    if (joinCode) {
      if (user) {
        const joinGroupFromLink = async () => {
          try {
            const cleanCode = joinCode.trim().toUpperCase();
            let query = supabase.from('Group').select('id, name');
            if (cleanCode.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
              query = query.eq('id', cleanCode);
            } else {
              query = query.ilike('name', `%[invite:${cleanCode}]%`);
            }
            
            const { data: group } = await query.maybeSingle();
            if (group) {
              // Check membership
              const { data: member } = await supabase
                .from('GroupMember')
                .select('id')
                .eq('group_id', group.id)
                .eq('user_id', user.id)
                .maybeSingle();

              if (!member) {
                await supabase.from('GroupMember').insert({
                  group_id: group.id,
                  user_id: user.id,
                  role: 'member',
                });
              }
              setSelectedGroupId(group.id);
            }
          } catch (err) {
            console.error('Failed to auto-join group from link:', err);
          } finally {
            // Clean up query param from URL without reloading page
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
          }
        };
        joinGroupFromLink();
      } else {
        // Cache in localStorage to process immediately after sign in/up
        localStorage.setItem('splitsync-pending-join', joinCode);
      }
    }
  }, [user]);

  // Check cached join code from localStorage on login
  useEffect(() => {
    if (user) {
      const pendingJoin = localStorage.getItem('splitsync-pending-join');
      if (pendingJoin) {
        localStorage.removeItem('splitsync-pending-join');
        const joinGroupFromStorage = async () => {
          try {
            const cleanCode = pendingJoin.trim().toUpperCase();
            let query = supabase.from('Group').select('id, name');
            if (cleanCode.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
              query = query.eq('id', cleanCode);
            } else {
              query = query.ilike('name', `%[invite:${cleanCode}]%`);
            }
            
            const { data: group } = await query.maybeSingle();
            if (group) {
              // Check membership
              const { data: member } = await supabase
                .from('GroupMember')
                .select('id')
                .eq('group_id', group.id)
                .eq('user_id', user.id)
                .maybeSingle();

              if (!member) {
                await supabase.from('GroupMember').insert({
                  group_id: group.id,
                  user_id: user.id,
                  role: 'member',
                });
              }
              setSelectedGroupId(group.id);
            }
          } catch (err) {
            console.error('Failed to auto-join from pending storage:', err);
          }
        };
        joinGroupFromStorage();
      }
    }
  }, [user]);

  // Command Palette & Keyboard Shortcuts state
  const [cmdOpen, setCmdOpen] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);

  // Initialize theme from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('split-sync-theme');
    if (savedTheme === 'light') {
      document.body.classList.add('theme-light');
    } else {
      document.body.classList.remove('theme-light');
    }
  }, []);

  // Keyboard shortcut refs for sequences
  const lastKeyRef = React.useRef<string | null>(null);
  const lastKeyTimeRef = React.useRef<number>(0);

  // Global Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore shortcut actions if typing in fields
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      const key = e.key.toLowerCase();

      // Ctrl+K / Cmd+K -> Toggle Command Palette
      if ((e.ctrlKey || e.metaKey) && key === 'k') {
        e.preventDefault();
        setCmdOpen((prev) => !prev);
        return;
      }

      // '?' key -> Toggle Keyboard Shortcuts
      if (e.key === '?') {
        e.preventDefault();
        setShowShortcutsModal((prev) => !prev);
        return;
      }

      // Escape key -> Close shortcuts
      if (e.key === 'Escape') {
        setShowShortcutsModal(false);
        return;
      }

      // G then D sequence -> Go to Dashboard
      const now = Date.now();
      if (lastKeyRef.current === 'g' && key === 'd' && now - lastKeyTimeRef.current < 1000) {
        e.preventDefault();
        setSelectedGroupId(null);
        lastKeyRef.current = null;
        return;
      }

      lastKeyRef.current = key;
      lastKeyTimeRef.current = now;

      // N key -> New Expense (inside active group)
      if (user && key === 'n') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('splitsync:cmd', { detail: { action: 'add-expense' } }));
      }

      // S key -> Settle Up (inside active group)
      if (user && key === 's') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('splitsync:cmd', { detail: { action: 'record-settlement' } }));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [user]);

  // Dynamic Document Title Updates for SEO
  useEffect(() => {
    if (loading) {
      document.title = 'Syncing Account... | SplitSync';
    } else if (!user) {
      if (authView === 'landing') {
        document.title = 'SplitSync | Settle Group Expenses Dynamically';
      } else if (authView === 'login') {
        document.title = 'Sign In | SplitSync';
      } else {
        document.title = 'Create Account | SplitSync';
      }
    } else if (selectedGroupId) {
      document.title = 'View Group | SplitSync';
    } else {
      document.title = 'Dashboard | SplitSync - Track & Split Group Expenses';
    }
  }, [user, authView, selectedGroupId, loading]);

  const handleCreateGroup = useCallback(() => {
    // Navigate to dashboard and trigger create modal
    setSelectedGroupId(null);
    // Signal via sessionStorage so Dashboard can pick it up
    sessionStorage.setItem('splitsync-cmd-action', 'create-group');
    window.dispatchEvent(new CustomEvent('splitsync:cmd', { detail: { action: 'create-group' } }));
  }, []);

  const handleAddExpense = useCallback(() => {
    window.dispatchEvent(new CustomEvent('splitsync:cmd', { detail: { action: 'add-expense' } }));
  }, []);

  const handleRecordSettlement = useCallback(() => {
    window.dispatchEvent(new CustomEvent('splitsync:cmd', { detail: { action: 'record-settlement' } }));
  }, []);

  const handleGoToDashboard = useCallback(() => {
    setSelectedGroupId(null);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-transparent">
        <div className="flex flex-col items-center gap-4">
          {/* Premium loading state — no spinner, use pulsing logo mark */}
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-ping" />
            <div className="absolute inset-1 rounded-full border-2 border-primary/40 animate-ping [animation-delay:150ms]" />
            <div className="absolute inset-2 rounded-full bg-primary/20 border border-primary/30 animate-pulse" />
          </div>
          <span className="text-slate-400 text-xs font-semibold tracking-widest uppercase animate-pulse">
            Syncing
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Global Command Palette — available everywhere when user is logged in */}
      {user && (
        <CommandPalette
          isOpen={cmdOpen}
          onClose={() => setCmdOpen(false)}
          onCreateGroup={handleCreateGroup}
          onAddExpense={handleAddExpense}
          onRecordSettlement={handleRecordSettlement}
          onGoToDashboard={handleGoToDashboard}
          groups={[]} // Dashboard will manage passing actual groups
          onSelectGroup={setSelectedGroupId}
        />
      )}

      {!user ? (
        authView === 'landing' ? (
          <Landing
            onLogin={() => setAuthView('login')}
            onRegister={() => setAuthView('register')}
          />
        ) : authView === 'login' ? (
          <Login
            onToggleView={() => setAuthView('register')}
            onBackToHome={() => setAuthView('landing')}
          />
        ) : (
          <Register
            onToggleView={() => setAuthView('login')}
            onBackToHome={() => setAuthView('landing')}
          />
        )
      ) : selectedGroupId ? (
        <GroupDetail groupId={selectedGroupId} onBack={() => setSelectedGroupId(null)} />
      ) : (
        <Dashboard
          onSelectGroup={setSelectedGroupId}
          onOpenCommandPalette={() => setCmdOpen(true)}
        />
      )}

      {/* Keyboard Shortcuts Modal */}
      {showShortcutsModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-md rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 card-glow-theme p-6 relative">
            <button
              onClick={() => setShowShortcutsModal(false)}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-200 transition hover:cursor-pointer rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2 mb-6">
              <span className="p-1.5 bg-primary/10 text-primary border border-primary/20 rounded-lg">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                </svg>
              </span>
              Keyboard Shortcuts
            </h3>

            <div className="space-y-4">
              <div className="flex justify-between items-center py-2.5 border-b border-white/5">
                <span className="text-xs text-slate-400 font-medium">Toggle Shortcut Help</span>
                <kbd className="text-[10px] font-bold border border-white/10 bg-white/3 rounded-lg px-2.5 py-1 text-slate-300 font-outfit shadow-sm">?</kbd>
              </div>

              <div className="flex justify-between items-center py-2.5 border-b border-white/5">
                <span className="text-xs text-slate-400 font-medium">Toggle Command Palette</span>
                <kbd className="text-[10px] font-bold border border-white/10 bg-white/3 rounded-lg px-2.5 py-1 text-slate-300 font-outfit shadow-sm">⌘K / Ctrl+K</kbd>
              </div>

              <div className="flex justify-between items-center py-2.5 border-b border-white/5">
                <span className="text-xs text-slate-400 font-medium">Go to Dashboard</span>
                <div className="flex gap-1 items-center">
                  <kbd className="text-[10px] font-bold border border-white/10 bg-white/3 rounded-lg px-2.5 py-1 text-slate-300 font-outfit shadow-sm">G</kbd>
                  <span className="text-[10px] text-slate-500 font-bold">then</span>
                  <kbd className="text-[10px] font-bold border border-white/10 bg-white/3 rounded-lg px-2.5 py-1 text-slate-300 font-outfit shadow-sm">D</kbd>
                </div>
              </div>

              <div className="flex justify-between items-center py-2.5 border-b border-white/5">
                <span className="text-xs text-slate-400 font-medium">Add New Expense</span>
                <kbd className="text-[10px] font-bold border border-white/10 bg-white/3 rounded-lg px-2.5 py-1 text-slate-300 font-outfit shadow-sm">N</kbd>
              </div>

              <div className="flex justify-between items-center py-2.5 border-b border-white/5">
                <span className="text-xs text-slate-400 font-medium">Clear Open Balance</span>
                <kbd className="text-[10px] font-bold border border-white/10 bg-white/3 rounded-lg px-2.5 py-1 text-slate-300 font-outfit shadow-sm">S</kbd>
              </div>

              <div className="flex justify-between items-center py-2.5">
                <span className="text-xs text-slate-400 font-medium">Close Modal / Esc</span>
                <kbd className="text-[10px] font-bold border border-white/10 bg-white/3 rounded-lg px-2.5 py-1 text-slate-300 font-outfit shadow-sm">Esc</kbd>
              </div>
            </div>

            <div className="mt-6 bg-slate-950/40 border border-white/5 rounded-xl p-3 text-center">
              <p className="text-[10px] text-slate-500 leading-relaxed font-semibold">
                SplitSync protects your friendships. Shortcuts help you keep it moving.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const App: React.FC = () => {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ToastProvider>
  );
};

export default App;
