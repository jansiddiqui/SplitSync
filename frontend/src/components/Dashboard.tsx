import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../utils/supabase';
import { getGroupBalances } from '../utils/balances';
import { LogOut, Plus, Users, TrendingUp, TrendingDown, Mail, Check, X, ShieldAlert, ChevronRight, Activity, PieChart, Sparkles, Menu, Search, Archive, Share2, Lock } from 'lucide-react';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';
import { AnimatedNumber } from '../hooks/useCountUp';
import { DashboardStatsSkeleton, GroupCardSkeleton } from './Skeleton';
import { PresetIcon } from './PresetIcon';
import { useToast } from './Toast';

interface GroupSummary {
  id: string;
  name: string;
  createdBy: string;
  creatorName: string;
  createdAt: string;
  memberCount: number;
  role: string;
  personalBalance?: number;
  totalSpent?: number;
  outstanding?: number;
  settlementProgress?: number;
  settledMembersCount?: number;
}

interface PendingInvite {
  id: string;
  groupId: string;
  groupName: string;
  invitedBy: string;
  inviterEmail: string;
  createdAt: string;
}

interface BalanceSummary {
  owe: number;
  owed: number;
  net: number;
}

interface DashboardProps {
  onSelectGroup: (groupId: string) => void;
  onOpenCommandPalette?: () => void;
}

const getPresetInfo = (name: string) => {
  if (name.includes('🏖')) return { preset: 'travel' as const, name: 'Travel & Adventure', gradient: 'from-teal-900/60 to-emerald-950/60 border-teal-500/20 text-teal-400', bg: 'bg-teal-500/10' };
  if (name.includes('🏠')) return { preset: 'living' as const, name: 'Shared Living', gradient: 'from-indigo-900/60 to-purple-950/60 border-indigo-500/20 text-indigo-400', bg: 'bg-indigo-500/10' };
  if (name.includes('🎓')) return { preset: 'friends' as const, name: 'Social & Friends', gradient: 'from-pink-900/60 to-rose-950/60 border-pink-500/20 text-pink-400', bg: 'bg-pink-500/10' };
  if (name.includes('💍')) return { preset: 'event' as const, name: 'Event Planning', gradient: 'from-amber-900/60 to-orange-950/60 border-amber-500/20 text-amber-400', bg: 'bg-amber-500/10' };
  if (name.includes('🚗')) return { preset: 'roadtrip' as const, name: 'Road Trip & Commute', gradient: 'from-red-900/60 to-amber-950/60 border-red-500/20 text-red-400', bg: 'bg-red-500/10' };
  return { preset: 'custom' as const, name: 'Custom Experience', gradient: 'from-slate-900/60 to-slate-950/60 border-slate-500/20 text-slate-400', bg: 'bg-slate-500/10' };
};

const cleanGroupName = (name: string | null | undefined) => {
  if (!name) return '';
  return name
    .replace(/ \[vaulted\]$/, '')
    .replace(/ \[invite:[A-Z0-9]+\]$/, '')
    .replace(/ \[vaulted\]$/, '')
    .replace(/ (🏖|🏠|🎓|💍|🚗|📦)$/, '');
};

const generateInviteCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

export const Dashboard: React.FC<DashboardProps> = ({ onSelectGroup, onOpenCommandPalette }) => {
  const { user, logout } = useAuth();
  const toast = useToast();
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [summary, setSummary] = useState<BalanceSummary>({ owe: 0, owed: 0, net: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Vault toggle state
  const [showVault, setShowVault] = useState(false);

  // Experience creation state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<'travel' | 'living' | 'friends' | 'event' | 'roadtrip' | 'custom'>('custom');
  const [creating, setCreating] = useState(false);
  
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showFabMenu, setShowFabMenu] = useState(false);

  // Join experience state
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const presets = [
    { id: 'travel',   label: 'Travel',    gradient: 'from-teal-900/40 to-emerald-950/40 border-teal-500/20' },
    { id: 'living',   label: 'Living',    gradient: 'from-indigo-900/40 to-purple-950/40 border-indigo-500/20' },
    { id: 'friends',  label: 'Friends',   gradient: 'from-pink-900/40 to-rose-950/40 border-pink-500/20' },
    { id: 'event',    label: 'Event',     gradient: 'from-amber-900/40 to-orange-950/40 border-amber-500/20' },
    { id: 'roadtrip', label: 'Road Trip', gradient: 'from-red-900/40 to-amber-950/40 border-red-500/20' },
    { id: 'custom',   label: 'Custom',    gradient: 'from-slate-900/40 to-slate-950/40 border-slate-500/20' },
  ];

  // Listen for command palette actions
  useEffect(() => {
    const handler = (e: Event) => {
      const { action } = (e as CustomEvent).detail;
      if (action === 'create-group') setShowCreateModal(true);
    };
    window.addEventListener('splitsync:cmd', handler);
    return () => window.removeEventListener('splitsync:cmd', handler);
  }, []);

  const fetchData = async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);
      
      // 1. Fetch group memberships
      const { data: memberships, error: mErr } = await supabase
        .from('GroupMember')
        .select(`
          role,
          joined_at,
          group_id,
          Group (
            id,
            name,
            created_by,
            created_at,
            User (
              name
            )
          )
        `)
        .eq('user_id', user.id);

      if (mErr) throw new Error(mErr.message);

      // Fetch member counts
      const groupIds = (memberships || []).map((m: any) => m.group_id);
      let countsMap: { [groupId: string]: number } = {};

      if (groupIds.length > 0) {
        const { data: countsData, error: cErr } = await supabase
          .from('GroupMember')
          .select('group_id');
        
        if (!cErr && countsData) {
          countsData.forEach((row: any) => {
            countsMap[row.group_id] = (countsMap[row.group_id] || 0) + 1;
          });
        }
      }

      // Map group memberships
      const formattedGroups: GroupSummary[] = (memberships || [])
        .filter((m: any) => m.Group)
        .map((m: any) => ({
          id: m.Group.id,
          name: m.Group.name,
          createdBy: m.Group.created_by,
          creatorName: m.Group.User?.name || 'Unknown',
          createdAt: m.Group.created_at,
          memberCount: countsMap[m.Group.id] || 1,
          role: m.role,
        }));

      // 2. Fetch pending invites
      const { data: invitesData, error: iErr } = await supabase
        .from('GroupInvite')
        .select(`
          id,
          group_id,
          created_at,
          Group (
            name
          ),
          User (
            name,
            email
          )
        `)
        .eq('email', user.email.toLowerCase())
        .eq('status', 'pending');

      if (iErr) throw new Error(iErr.message);

      const formattedInvites: PendingInvite[] = (invitesData || [])
        .filter((i: any) => i.Group)
        .map((i: any) => ({
          id: i.id,
          groupId: i.group_id,
          groupName: cleanGroupName(i.Group.name),
          invitedBy: i.User?.name || 'Someone',
          inviterEmail: i.User?.email || '',
          createdAt: i.created_at,
        }));

      setInvites(formattedInvites);

      // 3. Compute dynamic balances
      let totalOwe = 0;
      let totalOwed = 0;
      const groupsWithBalances: GroupSummary[] = [];

      for (const g of formattedGroups) {
        try {
          const { netBalances, totalSpent, outstanding } = await getGroupBalances(g.id);
          const userBalance = netBalances[user.id] || 0;
          
          // Do not sum vaulted experience balances into dashboard totals
          if (!g.name.endsWith(' [vaulted]')) {
            if (userBalance > 0) {
              totalOwed += userBalance;
            } else if (userBalance < 0) {
              totalOwe += Math.abs(userBalance);
            }
          }

          let progress = 100;
          if (totalSpent > 0) {
            progress = Math.max(0, Math.min(100, Math.round(((totalSpent - outstanding) / totalSpent) * 100)));
          }

          let settledMembers = 0;
          Object.keys(netBalances).forEach((id) => {
            if (Math.abs(netBalances[id]) < 0.005) {
              settledMembers++;
            }
          });

          groupsWithBalances.push({
            ...g,
            personalBalance: userBalance,
            totalSpent,
            outstanding,
            settlementProgress: progress,
            settledMembersCount: settledMembers,
          });
        } catch (calcErr) {
          console.error(`Failed to calculate balance for group ${g.id}:`, calcErr);
          groupsWithBalances.push({
            ...g,
            personalBalance: 0,
            totalSpent: 0,
            outstanding: 0,
            settlementProgress: 100,
            settledMembersCount: g.memberCount,
          });
        }
      }

      setGroups(groupsWithBalances);

      setSummary({
        owe: parseFloat(totalOwe.toFixed(2)),
        owed: parseFloat(totalOwed.toFixed(2)),
        net: parseFloat((totalOwed - totalOwe).toFixed(2)),
      });

    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim() || !user) return;

    setCreating(true);
    try {
      const selectedPresetInfo = presets.find((p) => p.id === selectedPreset) || presets[presets.length - 1];
      const inviteCode = generateInviteCode();
      // Emoji suffix is stored in the DB name string as a preset marker — do not remove
      const PRESET_EMOJI_MARKER: Record<string, string> = { travel: '🏖', living: '🏠', friends: '🎓', event: '💍', roadtrip: '🚗', custom: '📦' };
      const finalName = `${newGroupName.trim()} ${PRESET_EMOJI_MARKER[selectedPresetInfo.id] ?? '📦'} [invite:${inviteCode}]`;

      const { data: newGroup, error: gErr } = await supabase
        .from('Group')
        .insert({
          name: finalName,
          created_by: user.id,
        })
        .select()
        .single();

      if (gErr) throw new Error(gErr.message);

      const { error: mErr } = await supabase
        .from('GroupMember')
        .insert({
          group_id: newGroup.id,
          user_id: user.id,
          role: 'creator',
        });

      if (mErr) throw new Error(mErr.message);

      setShowCreateModal(false);
      setNewGroupName('');
      onSelectGroup(newGroup.id);
    } catch (err: any) {
      alert(err.message || 'Error creating experience');
    } finally {
      setCreating(false);
    }
  };

  const handleJoinGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = inviteCode.trim().toUpperCase();
    if (!cleanCode || !user) return;

    setJoining(true);
    setJoinError(null);
    try {
      let query = supabase.from('Group').select('id, name');
      if (cleanCode.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        query = query.eq('id', cleanCode);
      } else {
        query = query.ilike('name', `%[invite:${cleanCode}]%`);
      }

      const { data: group, error: gErr } = await query.maybeSingle();

      if (gErr) throw new Error(gErr.message);
      if (!group) {
        throw new Error('Experience not found. Please double check the invite code.');
      }

      const groupId = group.id;

      const { data: member, error: mCheckErr } = await supabase
        .from('GroupMember')
        .select('id')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (mCheckErr) throw new Error(mCheckErr.message);
      if (member) {
        setShowJoinModal(false);
        setInviteCode('');
        onSelectGroup(groupId);
        return;
      }

      const { error: joinErr } = await supabase
        .from('GroupMember')
        .insert({
          group_id: groupId,
          user_id: user.id,
          role: 'member',
        });

      if (joinErr) throw new Error(joinErr.message);

      setShowJoinModal(false);
      setInviteCode('');
      onSelectGroup(cleanCode);
    } catch (err: any) {
      setJoinError(err.message || 'Failed to join experience.');
    } finally {
      setJoining(false);
    }
  };

  const handleInviteResponse = async (inviteId: string, groupId: string, response: 'accept' | 'reject') => {
    if (!user) return;
    try {
      if (response === 'accept') {
        const { error: mErr } = await supabase
          .from('GroupMember')
          .insert({
            group_id: groupId,
            user_id: user.id,
            role: 'member',
          });
        
        if (mErr) throw new Error(mErr.message);

        const { error: iErr } = await supabase
          .from('GroupInvite')
          .update({ status: 'accepted' })
          .eq('id', inviteId);

        if (iErr) throw new Error(iErr.message);
      } else {
        const { error: iErr } = await supabase
          .from('GroupInvite')
          .update({ status: 'rejected' })
          .eq('id', inviteId);

        if (iErr) throw new Error(iErr.message);
      }
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to respond to invite');
    }
  };

  // Filter groups into active and vaulted
  const activeExperiences = groups.filter((g) => !g.name.endsWith(' [vaulted]'));
  const vaultedExperiences = groups.filter((g) => g.name.endsWith(' [vaulted]'));
  const displayedExperiences = showVault ? vaultedExperiences : activeExperiences;

  if (loading && groups.length === 0) {
    return (
      <div className="min-h-screen flex flex-col lg:flex-row bg-transparent">
        <aside className="hidden lg:flex w-64 border-r border-white/5 bg-obsidian/50 shrink-0 p-6">
          <div className="w-full space-y-4 mt-2">
            <div className="flex items-center gap-2.5 mb-8">
              <div className="skeleton-shimmer w-8 h-8 rounded-xl" />
              <div className="skeleton-shimmer h-5 w-24 rounded-lg" />
            </div>
            {[1,2,3].map(i => <div key={i} className="skeleton-shimmer h-9 w-full rounded-xl" />)}
          </div>
        </aside>
        <main className="flex-1 p-6 md:p-8 lg:p-10 space-y-8">
          <div className="skeleton-shimmer h-7 w-48 rounded-lg" />
          <DashboardStatsSkeleton />
          <div className="space-y-4">
            <div className="skeleton-shimmer h-5 w-36 rounded-lg" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {[1,2].map(i => <GroupCardSkeleton key={i} />)}
            </div>
          </div>
        </main>
      </div>
    );
  }

  const getUserColor = (name: string) => {
    const colors = ['bg-blue-600/20 text-blue-400 border-blue-500/35', 'bg-indigo-600/20 text-indigo-400 border-indigo-500/35', 'bg-emerald-600/20 text-emerald-400 border-emerald-500/35', 'bg-purple-600/20 text-purple-400 border-purple-500/35'];
    let sum = 0;
    for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
    return colors[sum % colors.length];
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-transparent" id="dashboard-root">
      
      {/* Mobile Sticky Header */}
      <header className="lg:hidden w-full bg-obsidian/85 backdrop-blur-md border-b border-white/5 px-4 py-3 flex justify-between items-center sticky top-0 z-35 shrink-0">
        <div className="flex items-center gap-2">
          <Logo className="w-7 h-7" />
          <span className="text-sm font-extrabold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            SplitSync
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenCommandPalette}
            id="btn-cmd-palette-mobile"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/8 bg-white/4 text-slate-500 text-[10px] font-semibold hover:text-slate-350 hover:border-white/15 transition hover:cursor-pointer"
          >
            <Search className="w-3 h-3" />
            <span className="hidden sm:inline">Search</span>
          </button>
          <ThemeToggle compact className="shrink-0" />
          <button
            id="btn-mobile-menu-toggle"
            onClick={() => setShowMobileMenu(true)}
            className="p-1.5 text-slate-400 hover:text-slate-200 transition hover:cursor-pointer flex items-center justify-center"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {showMobileMenu && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div 
            onClick={() => setShowMobileMenu(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" 
          />
          <aside className="relative w-72 max-w-[80vw] bg-obsidian border-r border-white/10 h-full flex flex-col justify-between p-6 shadow-2xl animate-in slide-in-from-left duration-200 z-10">
            <div className="space-y-8">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Logo className="w-7 h-7" />
                  <span className="text-sm font-extrabold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">SplitSync</span>
                </div>
                <button 
                  id="btn-mobile-menu-close"
                  onClick={() => setShowMobileMenu(false)}
                  className="p-1 text-slate-400 hover:text-slate-200 transition hover:cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav className="space-y-1.5">
                <button 
                  onClick={() => setShowMobileMenu(false)}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-primary/10 text-primary text-xs font-bold transition border border-primary/20 shadow-[0_0_15px_-3px_var(--color-primary-glow)] text-left btn-magnetic"
                >
                  <PieChart className="w-4 h-4 text-primary" />
                  Overview
                </button>
                {invites.length > 0 && (
                  <button 
                    onClick={() => {
                      setShowMobileMenu(false);
                      document.getElementById('right-sidebar')?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="w-full flex justify-between items-center px-3.5 py-2.5 rounded-xl text-slate-400 hover:text-slate-200 text-xs font-semibold transition hover:bg-white/5 hover:cursor-pointer btn-magnetic"
                  >
                    <span className="flex items-center gap-3">
                      <Mail className="w-4 h-4 text-slate-450" />
                      Invitations
                    </span>
                    <span className="bg-primary/20 text-primary border border-primary/30 font-outfit font-semibold text-[9px] px-2 py-0.5 rounded-full">
                      {invites.length}
                    </span>
                  </button>
                )}
                <div className="pt-2">
                  <ThemeToggle className="w-full" />
                </div>
              </nav>
            </div>

            <div className="border-t border-white/5 pt-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg border flex items-center justify-center font-bold text-xs shrink-0 ${getUserColor(user?.name || '')}`}>
                  {user?.name?.substring(0, 2).toUpperCase()}
                </div>
                <div className="overflow-hidden">
                  <p className="text-xs font-bold text-slate-200 truncate">{user?.name}</p>
                  <p className="text-[10px] text-slate-500 truncate mt-0.5">{user?.email}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowMobileMenu(false);
                  if (navigator.share) {
                    navigator.share({
                      title: 'SplitSync',
                      text: "Settle group expenses dynamically and protect friendships with SplitSync!",
                      url: window.location.origin,
                    }).catch(() => {});
                  } else {
                    navigator.clipboard.writeText(window.location.origin);
                    alert("Platform link copied to clipboard! Share it with your friends.");
                  }
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-primary/10 to-accent/10 hover:from-primary/20 hover:to-accent/20 text-primary transition text-xs font-bold border border-primary/25 hover:cursor-pointer"
              >
                <Share2 className="w-4 h-4 text-primary" />
                Share SplitSync
              </button>
              <button
                id="nav-logout-mobile"
                onClick={() => {
                  setShowMobileMenu(false);
                  logout();
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/30 text-slate-300 transition text-xs font-bold border border-white/5 hover:cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                Logout Account
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* 1. Left Sidebar Navigation (Desktop) */}
      <aside className="hidden lg:flex w-64 border-r border-white/5 bg-obsidian/50 backdrop-blur-md shrink-0 flex-col justify-between p-6" id="dashboard-sidebar">
        <div className="space-y-8">
          <div className="flex items-center gap-2.5">
            <Logo className="w-8 h-8" />
            <div>
              <span className="text-lg font-extrabold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                SplitSync
              </span>
              <span className="block text-[8px] tracking-widest text-slate-500 font-bold uppercase">Experience Platform</span>
            </div>
          </div>

          <button
            id="btn-cmd-palette-desktop"
            onClick={onOpenCommandPalette}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-white/8 bg-white/3 text-slate-500 text-xs font-medium hover:text-slate-300 hover:border-white/15 hover:bg-white/5 transition hover:cursor-pointer"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="flex-1 text-left">Search (Ctrl+K)...</span>
            <kbd className="text-[9px] font-bold border border-white/10 rounded px-1.5 py-0.5 font-outfit">⌘K</kbd>
          </button>

          <nav className="space-y-1.5" id="nav-menu">
            <button className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-primary/10 text-primary text-xs font-bold transition border border-primary/20 shadow-[0_0_15px_-3px_var(--color-primary-glow)] text-left btn-magnetic">
              <PieChart className="w-4 h-4 text-primary" />
              Overview
            </button>
            {invites.length > 0 && (
              <button 
                onClick={() => document.getElementById('right-sidebar')?.scrollIntoView({ behavior: 'smooth' })}
                className="w-full flex justify-between items-center px-3.5 py-2.5 rounded-xl text-slate-400 hover:text-slate-200 text-xs font-semibold transition hover:bg-white/5 hover:cursor-pointer btn-magnetic"
              >
                <span className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-slate-450" />
                  Invitations
                </span>
                <span className="bg-primary/20 text-primary border border-primary/30 font-outfit font-semibold text-[9px] px-2 py-0.5 rounded-full">
                  {invites.length}
                </span>
              </button>
            )}
            <div className="pt-1">
              <ThemeToggle className="w-full" />
            </div>
          </nav>
        </div>

        <div className="border-t border-white/5 pt-6 mt-8 space-y-4">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl border flex items-center justify-center font-bold text-xs shrink-0 ${getUserColor(user?.name || '')}`}>
              {user?.name?.substring(0, 2).toUpperCase()}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-bold text-slate-200 truncate">{user?.name}</p>
              <p className="text-[10px] text-slate-500 truncate mt-0.5">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={() => {
              if (navigator.share) {
                navigator.share({
                  title: 'SplitSync',
                  text: "Settle group expenses dynamically and protect friendships with SplitSync!",
                  url: window.location.origin,
                }).catch(() => {});
              } else {
                navigator.clipboard.writeText(window.location.origin);
                toast.success('Platform link copied! Share SplitSync with your friends.');
              }
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-primary/10 to-accent/10 hover:from-primary/20 hover:to-accent/20 text-primary transition text-xs font-bold border border-primary/25 hover:cursor-pointer btn-magnetic"
          >
            <Share2 className="w-4 h-4 text-primary" />
            Share SplitSync
          </button>
          <button
            id="nav-logout"
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 transition text-xs font-bold border border-white/5 hover:cursor-pointer btn-magnetic"
          >
            <LogOut className="w-4 h-4" />
            Logout Account
          </button>
        </div>
      </aside>

      {/* 2. Primary Workspace (Center) */}
      <main className="flex-1 p-6 md:p-8 lg:p-10 space-y-8 overflow-y-auto" id="dashboard-main-content">
        
        <header className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-400" />
              Experience Workspace
            </h2>
            <p className="text-slate-500 text-xs mt-1">Track contributions, resolve shares, and preserve memories together</p>
          </div>
          {error && (
            <div className="bg-red-950/40 border border-red-500/30 text-red-200 rounded-xl px-4 py-2 text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-400" />
              <span>Sync Error</span>
              <button onClick={fetchData} className="text-red-400 hover:text-red-300 font-bold underline ml-1 hover:cursor-pointer">
                Retry
              </button>
            </div>
          )}
        </header>

        {/* Dynamic Balance Statistics */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6" id="dashboard-statistics">
          {loading ? (
            <DashboardStatsSkeleton />
          ) : (
            <>
              <div className="glass-card rounded-2xl p-6 border border-white/5 hover:border-white/10 transition-all duration-300 card-glow-green relative overflow-hidden group">
                <div className="absolute top-[-50%] right-[-20%] w-32 h-32 rounded-full bg-emerald-500/5 blur-[30px] group-hover:scale-110 transition duration-500" />
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Share to Receive</p>
                    <AnimatedNumber value={summary.owed} prefix="₹" className="text-2xl font-outfit font-semibold text-emerald-400 mt-1 block" />
                  </div>
                </div>
              </div>

              <div className="glass-card rounded-2xl p-6 border border-white/5 hover:border-white/10 transition-all duration-300 card-glow-red relative overflow-hidden group">
                <div className="absolute top-[-50%] right-[-20%] w-32 h-32 rounded-full bg-red-500/5 blur-[30px] group-hover:scale-110 transition duration-500" />
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-red-500/10 text-red-400 rounded-xl border border-red-500/20">
                    <TrendingDown className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Share to Resolve</p>
                    <AnimatedNumber value={summary.owe} prefix="₹" className="text-2xl font-outfit font-semibold text-red-400 mt-1 block" />
                  </div>
                </div>
              </div>

              <div className={`glass-card rounded-2xl p-6 border border-white/5 hover:border-white/10 transition-all duration-300 relative overflow-hidden group ${
                summary.net > 0 ? 'card-glow-green' : summary.net < 0 ? 'card-glow-red' : ''
              }`}>
                <div className="absolute top-[-50%] right-[-20%] w-32 h-32 rounded-full bg-blue-500/5 blur-[30px]" />
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl border ${
                    summary.net > 0
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : summary.net < 0
                        ? 'bg-red-500/10 text-red-400 border-red-500/20'
                        : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                  }`}>
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Net Balance</p>
                    <AnimatedNumber
                      value={summary.net}
                      prefix={summary.net >= 0 ? '+₹' : '-₹'}
                      decimals={2}
                      className={`text-2xl font-outfit font-semibold mt-1 block ${
                        summary.net > 0 ? 'text-emerald-400' : summary.net < 0 ? 'text-red-400' : 'text-slate-200'
                      }`}
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </section>

        {/* Tab Selector: Active vs Vaulted — sliding pill */}
        <div className="relative flex items-center p-1 rounded-2xl border border-white/8 bg-black/30 backdrop-blur-md gap-0 max-w-xs shrink-0 animate-fade-in">

          {/* Sliding pill */}
          <span
            aria-hidden
            className="absolute top-1 bottom-1 rounded-xl transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] pointer-events-none"
            style={{
              width: 'calc(50% - 4px)',
              left: !showVault ? '4px' : 'calc(50%)',
              background: !showVault
                ? 'linear-gradient(135deg, rgba(61,255,211,0.18), rgba(0,217,255,0.10))'
                : 'linear-gradient(135deg, rgba(168,85,247,0.18), rgba(139,92,246,0.10))',
              boxShadow: !showVault
                ? '0 0 16px -2px rgba(61,255,211,0.25), inset 0 1px 0 rgba(255,255,255,0.08)'
                : '0 0 16px -2px rgba(168,85,247,0.25), inset 0 1px 0 rgba(255,255,255,0.08)',
              border: !showVault
                ? '1px solid rgba(61,255,211,0.22)'
                : '1px solid rgba(168,85,247,0.28)',
            }}
          />

          {/* Active tab */}
          <button
            onClick={() => setShowVault(false)}
            aria-pressed={!showVault}
            className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold tracking-wide transition-all duration-200 hover:cursor-pointer select-none ${
              !showVault ? 'text-primary' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all duration-300 ${!showVault ? 'bg-primary shadow-[0_0_6px_rgba(61,255,211,0.8)]' : 'bg-slate-600'}`} />
            Active
          </button>

          {/* Memory Vault tab */}
          <button
            onClick={() => setShowVault(true)}
            aria-pressed={showVault}
            className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold tracking-wide transition-all duration-200 hover:cursor-pointer select-none ${
              showVault ? 'text-purple-300' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Lock className={`w-3 h-3 shrink-0 transition-all duration-300 ${showVault ? 'text-purple-400' : 'text-slate-600'}`} />
            Memory Vault
          </button>
        </div>


        {/* Experiences Deck */}
        <section className="space-y-5" id="dashboard-groups-section">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
            <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
              {showVault ? (
                <>
                  <Archive className="w-5 h-5 text-purple-400" />
                  Nostalgic Memories ({displayedExperiences.length})
                </>
              ) : (
                <>
                  <Users className="w-5 h-5 text-blue-400" />
                  Active Experiences ({displayedExperiences.length})
                </>
              )}
            </h3>
            {!showVault && (
              <div className="flex gap-2 w-full sm:w-auto">
                <button
                  id="btn-join-group-open"
                  onClick={() => setShowJoinModal(true)}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-primary transition text-xs font-extrabold border border-white/5 hover:cursor-pointer btn-magnetic"
                >
                  <Users className="w-3.5 h-3.5 text-primary" />
                  Join Experience
                </button>
                <button
                  id="btn-create-group-open"
                  onClick={() => setShowCreateModal(true)}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-primary to-accent hover:brightness-110 text-obsidian transition text-xs font-extrabold shadow-lg shadow-primary/20 hover:cursor-pointer btn-magnetic"
                >
                  <Plus className="w-3.5 h-3.5 text-obsidian" />
                  Host Experience
                </button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {[1,2].map(i => <GroupCardSkeleton key={i} />)}
            </div>
          ) : displayedExperiences.length === 0 ? (
            <div className="glass-card rounded-2xl p-12 text-center border border-dashed border-white/8" id="group-empty-state">
              <div className="w-14 h-14 rounded-2xl bg-white/4 border border-white/8 flex items-center justify-center mx-auto mb-4">
                {showVault ? <Archive className="w-6 h-6 text-slate-600" /> : <Users className="w-6 h-6 text-slate-600" />}
              </div>
              <p className="text-slate-300 text-sm font-semibold">
                {showVault ? 'No memories vaulted yet' : 'Your first experience is one idea away'}
              </p>
              <p className="text-slate-600 text-xs mt-2 max-w-xs mx-auto leading-relaxed">
                {showVault 
                  ? 'Once an active experience is 100% resolved, you can archive it to this Vault to preserve your timeline.'
                  : 'Goa Trip, Flatmates, road trip splits — build experiences and invite friends.'}
              </p>
              {!showVault && (
                <div className="flex justify-center gap-3 mt-5">
                  <button
                    onClick={() => setShowJoinModal(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-primary transition text-xs font-bold border border-white/5 hover:cursor-pointer btn-magnetic"
                  >
                    <Users className="w-3.5 h-3.5 text-primary" /> Join with Code
                  </button>
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary/10 hover:bg-primary/15 text-primary transition text-xs font-bold border border-primary/20 hover:cursor-pointer btn-magnetic"
                  >
                    <Plus className="w-3.5 h-3.5" /> Host an Experience
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-fade-in" id="groups-grid">
              {displayedExperiences.map((group) => {
                const preset = getPresetInfo(group.name);
                const displayName = cleanGroupName(group.name);
                
                return (
                  <div
                    key={group.id}
                    id={`card-group-${group.id}`}
                    onClick={() => onSelectGroup(group.id)}
                    className={`glass-card rounded-2xl border border-white/5 hover:border-primary/30 hover:bg-slate-900/10 transition-all duration-300 hover:cursor-pointer group flex flex-col min-h-[200px] h-auto relative overflow-hidden btn-magnetic shadow-lg ${
                      showVault ? 'opacity-85 filter grayscale-[20%] hover:grayscale-0' : ''
                    }`}
                  >
                    {/* Visual Preset Notion Cover Banner */}
                    <div className={`h-14 w-full bg-gradient-to-r ${preset.gradient} flex items-center justify-between px-5 border-b border-white/5 relative`}>
                      <div className="absolute inset-0 bg-black/10 backdrop-blur-[1px]" />
                      <span className="relative z-10"><PresetIcon preset={getPresetInfo(group.name).preset} className="w-5 h-5" /></span>
                      {showVault ? (
                        <span className="text-[8px] bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold px-2 py-0.5 rounded-full relative z-10 tracking-widest uppercase">
                          Vaulted Memory
                        </span>
                      ) : group.personalBalance === 0 ? (
                        <span className="text-[8px] bg-emerald-500/20 text-emerald-350 border border-emerald-500/30 font-bold px-2 py-0.5 rounded-full relative z-10 tracking-widest uppercase">
                          All Resolved
                        </span>
                      ) : null}
                    </div>

                    <div className="p-5 flex-1 flex flex-col justify-between">
                      <div className="space-y-1">
                        <div className="flex justify-between items-start gap-3">
                          <div className="overflow-hidden">
                            <h4 className="font-extrabold text-slate-100 group-hover:text-primary transition text-base md:text-lg truncate">
                              {displayName}
                            </h4>
                            <p className="text-slate-500 text-[10px] truncate">
                              Hosted by <span className="text-slate-400 font-semibold">{group.createdBy === user?.id ? 'You' : group.creatorName}</span>
                            </p>
                          </div>
                          
                          {/* Personal Balance Status */}
                          <div className="text-right shrink-0">
                            {group.personalBalance !== undefined && (
                              <>
                                {group.personalBalance > 0 ? (
                                  <div>
                                    <span className="text-[8px] font-bold text-emerald-500/75 uppercase tracking-wider block">You covered</span>
                                    <span className="font-outfit font-semibold text-emerald-450 text-sm">₹{group.personalBalance}</span>
                                  </div>
                                ) : group.personalBalance < 0 ? (
                                  <div>
                                    <span className="text-[8px] font-bold text-amber-500/75 uppercase tracking-wider block">Your share</span>
                                    <span className="font-outfit font-semibold text-amber-450 text-sm">₹{Math.abs(group.personalBalance)}</span>
                                  </div>
                                ) : (
                                  <div>
                                    <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider block text-right">Balance</span>
                                    <span className="font-outfit font-semibold text-slate-400 text-xs flex items-center justify-end gap-1 mt-0.5">
                                      <Check className="w-3 h-3 text-emerald-450" /> Clear
                                    </span>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Resolution Progress */}
                      <div className="space-y-1.5 my-3 relative z-10">
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="text-slate-500 font-medium">Resolution progress</span>
                          <span className="font-semibold text-slate-350">
                            {group.settledMembersCount} of {group.memberCount} cleared • {group.settlementProgress}%
                          </span>
                        </div>
                        <div className="w-full bg-white/4 rounded-full h-1.5 overflow-hidden border border-white/5">
                          <div 
                            className="bg-gradient-to-r from-primary to-accent h-full rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(61,255,211,0.2)]"
                            style={{ width: `${group.settlementProgress}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-3 border-t border-white/5 relative z-10">
                        <div className="flex items-center gap-1.5">
                          <div className="flex -space-x-1.5 overflow-hidden mr-1">
                            {Array.from({ length: Math.min(group.memberCount, 3) }).map((_, i) => (
                              <div key={i} className="w-5 h-5 rounded-full border border-obsidian bg-slate-800 flex items-center justify-center text-[7px] font-bold text-slate-400 shrink-0">
                                {i + 1}
                              </div>
                            ))}
                          </div>
                          <span className="text-slate-500 text-[10px] font-semibold">
                            {group.memberCount} friends
                          </span>
                        </div>
                        <span className="text-primary text-xs font-bold flex items-center gap-0.5 group-hover:translate-x-1 transition duration-200">
                          Open {showVault ? 'Memory' : 'Experience'} <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* 3. Right Sidebar (Activity & Invites) */}
      <aside className="w-full lg:w-72 border-t lg:border-t-0 lg:border-l border-white/5 bg-obsidian/50 backdrop-blur-md shrink-0 p-6 space-y-6" id="right-sidebar">
        <div className="space-y-5">
          <h3 className="text-sm font-bold text-slate-355 uppercase tracking-widest flex items-center gap-2">
            <Mail className="w-4 h-4 text-blue-400" />
            Experience Invites
          </h3>

          {invites.length === 0 ? (
            <div className="glass rounded-xl p-5 text-center text-slate-550 text-xs border border-white/[0.02] bg-slate-900/10">
              No pending invitations.
            </div>
          ) : (
            <div className="space-y-4">
              {invites.map((invite) => (
                <div 
                  key={invite.id} 
                  className="glass-card rounded-2xl p-4 border border-white/5 flex flex-col gap-3 relative overflow-hidden animate-fade-in card-glow-theme"
                >
                  <div>
                    <span className="text-[8px] font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full uppercase tracking-wider font-outfit">
                      Pending
                    </span>
                    <h4 className="font-bold text-slate-200 mt-2 text-sm truncate">{invite.groupName}</h4>
                    <p className="text-[10px] text-slate-500 mt-1 truncate">
                      Invited by <span className="text-slate-400 font-semibold">{invite.invitedBy}</span>
                    </p>
                  </div>
                  <div className="flex gap-2 w-full pt-1">
                    <button
                      id={`btn-invite-accept-${invite.id}`}
                      onClick={() => handleInviteResponse(invite.id, invite.groupId, 'accept')}
                      className="flex-1 py-2 rounded-lg bg-primary text-obsidian hover:brightness-110 transition text-[10px] font-extrabold flex items-center justify-center gap-1 hover:cursor-pointer btn-magnetic animate-pulse"
                    >
                      <Check className="w-3.5 h-3.5" /> Accept
                    </button>
                    <button
                      id={`btn-invite-decline-${invite.id}`}
                      onClick={() => handleInviteResponse(invite.id, invite.groupId, 'reject')}
                      className="flex-1 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 transition text-[10px] font-bold border border-white/5 flex items-center justify-center gap-1 hover:cursor-pointer btn-magnetic"
                    >
                      <X className="w-3.5 h-3.5" /> Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4 pt-6 border-t border-white/5">
          <h3 className="text-sm font-bold text-slate-355 uppercase tracking-widest flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400" />
            Activity Timeline
          </h3>
          <div className="space-y-3">
            <div className="flex gap-3 text-xs text-slate-500">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500/50 shrink-0 mt-1.5" />
              <p>Welcome to SplitSync! Settle outstanding shares and preserve memories fairly.</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Host Experience Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-lg rounded-2xl p-6 border border-white/10 shadow-2xl animate-in fade-in zoom-in-95 duration-200 card-glow-blue flex flex-col max-h-[90vh]">
            <h3 className="text-lg font-bold text-slate-100 mb-2">Host New Shared Experience</h3>
            <p className="text-xs text-slate-400 mb-5">Select a preset theme template to automatically style your experience card and covers.</p>
            <form onSubmit={handleCreateGroup} className="space-y-5 overflow-y-auto pr-1" id="form-create-group">
              
              {/* Preset Cards Selector */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase tracking-widest">
                  Theme Preset Template
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {presets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setSelectedPreset(preset.id as any)}
                      className={`p-3 rounded-xl border text-left transition-all duration-200 flex flex-col justify-between h-20 hover:cursor-pointer btn-magnetic bg-gradient-to-br ${
                        selectedPreset === preset.id
                          ? 'border-primary bg-primary/10 text-slate-100 shadow-[0_0_12px_rgba(61,255,211,0.15)]'
                          : 'border-white/5 bg-white/3 text-slate-400 hover:text-slate-200 hover:border-white/10'
                      }`}
                    >
                      <PresetIcon preset={preset.id as any} className="w-5 h-5" />
                      <span className="text-[10px] font-bold tracking-wide">{preset.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1.5 uppercase tracking-widest">
                  Experience Name
                </label>
                <input
                  id="input-new-group-name"
                  type="text"
                  placeholder="e.g. Goa Trip, Flatmates, Weekend Trek"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl glass-input text-xs font-semibold"
                  required
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  id="btn-create-group-cancel"
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewGroupName('');
                  }}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-350 text-xs font-bold border border-white/5 hover:cursor-pointer btn-magnetic"
                >
                  Cancel
                </button>
                <button
                  id="btn-create-group-submit"
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-primary to-accent hover:brightness-110 disabled:opacity-50 text-obsidian text-xs font-extrabold flex items-center gap-1 shadow-lg shadow-primary/20 hover:cursor-pointer btn-magnetic"
                >
                  {creating ? (
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  ) : (
                    'Host Experience'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Join Experience Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-md rounded-2xl p-6 border border-white/10 shadow-2xl animate-in fade-in zoom-in-95 duration-200 card-glow-blue">
            <h3 className="text-lg font-bold text-slate-100 mb-2">Join Experience</h3>
            <p className="text-xs text-slate-400 mb-4">Enter the experience invite code shared by your friend to join the workspace.</p>
            <form onSubmit={handleJoinGroup} className="space-y-4" id="form-join-group">
              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1.5 uppercase tracking-widest">
                  Invite Code / Experience ID
                </label>
                <input
                  id="input-group-invite-code"
                  type="text"
                  placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl glass-input text-xs font-mono font-semibold"
                  required
                  autoFocus
                />
              </div>

              {joinError && (
                <div className="text-xs font-semibold text-red-400 bg-red-950/20 border border-red-500/30 rounded-xl p-3">
                  {joinError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  id="btn-join-group-cancel"
                  type="button"
                  onClick={() => {
                    setShowJoinModal(false);
                    setInviteCode('');
                    setJoinError(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-350 text-xs font-bold border border-white/5 hover:cursor-pointer btn-magnetic"
                >
                  Cancel
                </button>
                <button
                  id="btn-join-group-submit"
                  type="submit"
                  disabled={joining}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-primary to-accent hover:brightness-110 disabled:opacity-50 text-obsidian text-xs font-extrabold flex items-center gap-1 shadow-lg shadow-primary/20 hover:cursor-pointer btn-magnetic"
                >
                  {joining ? (
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  ) : (
                    'Join Experience'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating Action Button (FAB) */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3">
        {showFabMenu && (
          <div className="flex flex-col items-end gap-2 mb-1 animate-in fade-in slide-in-from-bottom-5 duration-200">
            <button
              onClick={() => {
                setShowFabMenu(false);
                setShowJoinModal(true);
              }}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 border border-white/10 text-slate-200 text-xs font-semibold shadow-xl hover:text-primary hover:border-primary/25 transition btn-magnetic"
            >
              <Users className="w-3.5 h-3.5 text-primary" />
              Join Experience
            </button>
            
            <button
              onClick={() => {
                setShowFabMenu(false);
                setShowCreateModal(true);
              }}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 border border-white/10 text-slate-200 text-xs font-semibold shadow-xl hover:text-primary hover:border-primary/25 transition btn-magnetic"
            >
              <Users className="w-3.5 h-3.5 text-primary" />
              Host Experience
            </button>
          </div>
        )}
        
        <button
          onClick={() => setShowFabMenu(!showFabMenu)}
          className={`w-12 h-12 rounded-full bg-gradient-to-r from-primary to-accent text-obsidian flex items-center justify-center shadow-xl shadow-primary/25 hover:shadow-primary/40 transition-transform duration-300 hover:cursor-pointer btn-magnetic ${
            showFabMenu ? 'rotate-45' : ''
          }`}
        >
          <Plus className="w-6 h-6 stroke-[3]" />
        </button>
      </div>
    </div>
  );
};
