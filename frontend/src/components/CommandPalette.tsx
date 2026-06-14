import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Search, Plus, Users,
  LayoutDashboard, CheckSquare, X, Hash,
  DollarSign, CreditCard, User
} from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { RelationshipModal } from './RelationshipModal';

interface CommandAction {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  keywords: string[];
  category: 'action' | 'navigate' | 'experience' | 'contribution' | 'member' | 'resolution';
  onExecute: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateGroup: () => void;
  onAddExpense: () => void;
  onRecordSettlement: () => void;
  onGoToDashboard: () => void;
  groups?: { id: string; name: string }[];
  onSelectGroup?: (groupId: string) => void;
}

const RECENT_ACTIONS_KEY = 'splitsync-recent-commands';

function getRecentActionIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_ACTIONS_KEY) || '[]');
  } catch {
    return [];
  }
}

function recordActionUsed(id: string) {
  const recent = getRecentActionIds().filter((r) => r !== id);
  recent.unshift(id);
  localStorage.setItem(RECENT_ACTIONS_KEY, JSON.stringify(recent.slice(0, 5)));
}

function fuzzyMatch(query: string, target: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.includes(q)) return true;
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onCreateGroup,
  onAddExpense,
  onRecordSettlement,
  onGoToDashboard,
  groups = [],
  onSelectGroup,
}) => {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Db search states
  const [localGroups, setLocalGroups] = useState<any[]>([]);
  const [dbContributions, setDbContributions] = useState<any[]>([]);
  const [dbMembers, setDbMembers] = useState<any[]>([]);
  const [dbResolutions, setDbResolutions] = useState<any[]>([]);

  // Relationship modal state
  const [relModalOpen, setRelModalOpen] = useState(false);
  const [relUserId, setRelUserId] = useState('');
  const [relUserName, setRelUserName] = useState('');

  // Load database entities for searching
  useEffect(() => {
    if (!isOpen || !user) return;

    const fetchSearchEntities = async () => {
      try {
        // Fetch all group IDs this user belongs to
        const { data: myMemberships } = await supabase
          .from('GroupMember')
          .select(`
            group_id,
            Group (
              id,
              name
            )
          `)
          .eq('user_id', user.id);

        const loadedGroups = (myMemberships || [])
          .map((m: any) => m.Group)
          .filter(Boolean);
        setLocalGroups(loadedGroups);

        const groupIds = loadedGroups.map((g: any) => g.id);
        if (groupIds.length === 0) return;

        // Fetch contributions (expenses)
        const { data: expenses } = await supabase
          .from('Expense')
          .select('id, title, amount, group_id, Group(name)')
          .in('group_id', groupIds);

        // Fetch group members (participants)
        const { data: members } = await supabase
          .from('GroupMember')
          .select('user_id, joined_at, User(name, email), group_id, Group(name)')
          .in('group_id', groupIds);

        // Fetch resolutions (settlements)
        const { data: settlements } = await supabase
          .from('Settlement')
          .select('id, amount, group_id, Group(name), payer:User!payer_id(name), receiver:User!receiver_id(name)')
          .in('group_id', groupIds);

        setDbContributions(expenses || []);
        setDbMembers(members || []);
        setDbResolutions(settlements || []);
      } catch (err) {
        console.error('Failed to load global search entities:', err);
      }
    };

    fetchSearchEntities();
  }, [isOpen, user]);

  const baseActions: CommandAction[] = [
    {
      id: 'create-group',
      label: 'Host Experience (Create Group)',
      description: 'Start a new shared experience group',
      icon: <Users className="w-4 h-4" />,
      keywords: ['new group', 'add group', 'create', 'host experience', 'template'],
      category: 'action',
      onExecute: () => { onCreateGroup(); onClose(); },
    },
    {
      id: 'add-expense',
      label: 'Log Contribution (Add Expense)',
      description: 'Record a new shareable item in an experience',
      icon: <Plus className="w-4 h-4" />,
      keywords: ['new expense', 'add bill', 'record expense', 'log contribution', 'pay'],
      category: 'action',
      onExecute: () => { onAddExpense(); onClose(); },
    },
    {
      id: 'record-settlement',
      label: 'Resolve Share (Record Settlement)',
      description: 'Clear an outstanding balance with UPI, Coffee, or Offset',
      icon: <CheckSquare className="w-4 h-4" />,
      keywords: ['settle', 'pay back', 'clear balance', 'resolve share', 'upi', 'coffee'],
      category: 'action',
      onExecute: () => { onRecordSettlement(); onClose(); },
    },
    {
      id: 'go-dashboard',
      label: 'Go to Dashboard',
      description: 'Return to your shared experience overview',
      icon: <LayoutDashboard className="w-4 h-4" />,
      keywords: ['home', 'dashboard', 'overview', 'back', 'experiences'],
      category: 'navigate',
      onExecute: () => { onGoToDashboard(); onClose(); },
    },
  ];

  const cleanGroupName = (name: string | null | undefined) => {
    if (!name) return '';
    return name
      .replace(/ \[vaulted\]$/, '')
      .replace(/ \[invite:[A-Z0-9]+\]$/, '')
      .replace(/ \[vaulted\]$/, '')
      .replace(/ (🏖|🏠|🎓|💍|🚗|📦)$/, '');
  };

  const activeGroups = localGroups.length > 0 ? localGroups : groups;

  // Map groups to experiences
  const experienceActions: CommandAction[] = activeGroups
    .filter((g) => !g.name.endsWith(' [vaulted]'))
    .map((g) => ({
      id: `group-${g.id}`,
      label: `${cleanGroupName(g.name)} (Experience)`,
      description: 'Open this active shared experience',
      icon: <Hash className="w-4 h-4" />,
      keywords: [g.name.toLowerCase(), 'group', 'experience'],
      category: 'experience' as const,
      onExecute: () => { onSelectGroup?.(g.id); onClose(); },
    }));

  // Map contributions (expenses)
  const contributionActions: CommandAction[] = dbContributions
    .filter((c) => !c.Group?.name?.endsWith(' [vaulted]'))
    .map((c) => ({
      id: `contribution-${c.id}`,
      label: c.title,
      description: `₹${c.amount} in ${cleanGroupName(c.Group?.name) || 'Experience'}`,
      icon: <DollarSign className="w-4 h-4 text-emerald-400" />,
      keywords: [c.title.toLowerCase(), 'contribution', 'expense', 'bill', c.amount.toString()],
      category: 'contribution' as const,
      onExecute: () => { onSelectGroup?.(c.group_id); onClose(); },
    }));

  // Map members (participants)
  const uniqueUsers = Array.from(new Set(dbMembers.map((m) => m.user_id)))
    .filter((id) => id !== user?.id)
    .map((id) => dbMembers.find((m) => m.user_id === id));

  const memberActions: CommandAction[] = uniqueUsers.map((m) => ({
    id: `member-${m.user_id}`,
    label: m.User?.name || 'Participant',
    description: `View Relationship Intel (${m.User?.email})`,
    icon: <User className="w-4 h-4 text-blue-400" />,
    keywords: [m.User?.name?.toLowerCase() || '', m.User?.email || '', 'member', 'relationship', 'friend'],
    category: 'member' as const,
    onExecute: () => {
      setRelUserId(m.user_id);
      setRelUserName(m.User?.name || 'Participant');
      setRelModalOpen(true);
    },
  }));

  // Map resolutions (settlements)
  const resolutionActions: CommandAction[] = dbResolutions
    .filter((r) => !r.Group?.name?.endsWith(' [vaulted]'))
    .map((r) => ({
      id: `resolution-${r.id}`,
      label: `${r.payer?.name || 'Someone'} → ${r.receiver?.name || 'Someone'}`,
      description: `₹${r.amount} Resolution in ${cleanGroupName(r.Group?.name) || 'Experience'}`,
      icon: <CreditCard className="w-4 h-4 text-amber-400" />,
      keywords: ['resolution', 'settlement', 'payment', r.amount.toString()],
      category: 'resolution' as const,
      onExecute: () => { onSelectGroup?.(r.group_id); onClose(); },
    }));

  const allActions = [
    ...baseActions,
    ...experienceActions,
    ...contributionActions,
    ...memberActions,
    ...resolutionActions,
  ];

  const filteredActions = query
    ? allActions.filter(
        (a) =>
          fuzzyMatch(query, a.label) ||
          fuzzyMatch(query, a.description || '') ||
          a.keywords.some((k) => fuzzyMatch(query, k))
      )
    : (() => {
        const recentIds = getRecentActionIds();
        const recent = recentIds
          .map((id) => allActions.find((a) => a.id === id))
          .filter(Boolean) as CommandAction[];
        const rest = allActions.filter((a) => !recentIds.includes(a.id));
        return [...recent, ...rest];
      })();

  const grouped = {
    recent: !query ? filteredActions.filter((a) => getRecentActionIds().includes(a.id)) : [],
    actions: filteredActions.filter(
      (a) => a.category === 'action' && (query || !getRecentActionIds().includes(a.id))
    ),
    navigate: filteredActions.filter(
      (a) => a.category === 'navigate' && (query || !getRecentActionIds().includes(a.id))
    ),
    experiences: filteredActions.filter(
      (a) => a.category === 'experience' && (query || !getRecentActionIds().includes(a.id))
    ),
    contributions: filteredActions.filter(
      (a) => a.category === 'contribution' && (query || !getRecentActionIds().includes(a.id))
    ),
    participants: filteredActions.filter(
      (a) => a.category === 'member' && (query || !getRecentActionIds().includes(a.id))
    ),
    resolutions: filteredActions.filter(
      (a) => a.category === 'resolution' && (query || !getRecentActionIds().includes(a.id))
    ),
  };

  const flatList = [
    ...grouped.recent,
    ...grouped.actions,
    ...grouped.navigate,
    ...grouped.experiences,
    ...grouped.contributions,
    ...grouped.participants,
    ...grouped.resolutions,
  ];

  const execute = useCallback(
    (action: CommandAction) => {
      recordActionUsed(action.id);
      action.onExecute();
    },
    []
  );

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, flatList.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (flatList[selectedIndex]) execute(flatList[selectedIndex]);
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, flatList, selectedIndex, execute, onClose]);

  // Section Label Helper Component
  const SectionLabel = ({ label }: { label: string }) => (
    <div className="px-3 py-1.5 text-[9px] font-bold text-slate-655 uppercase tracking-widest">
      {label}
    </div>
  );

  // Action Item Helper Component
  const ActionItem = ({
    action,
    globalIndex,
  }: {
    action: CommandAction;
    globalIndex: number;
  }) => {
    const isSelected = globalIndex === selectedIndex;
    const categoryColors = {
      action: 'text-primary',
      navigate: 'text-blue-400',
      experience: 'text-teal-400',
      contribution: 'text-emerald-400',
      member: 'text-blue-400',
      resolution: 'text-amber-405',
    };
    return (
      <button
        data-index={globalIndex}
        onClick={() => execute(action)}
        onMouseEnter={() => setSelectedIndex(globalIndex)}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-100 hover:cursor-pointer group border ${
          isSelected
            ? 'bg-white/8 border-white/10'
            : 'border-transparent hover:bg-white/4'
        }`}
      >
        <span
          className={`shrink-0 transition-colors duration-100 ${
            isSelected ? categoryColors[action.category] || 'text-slate-400' : 'text-slate-500'
          }`}
        >
          {action.icon}
        </span>
        <span className="flex-1 min-w-0">
          <span
            className={`block text-xs font-semibold truncate transition-colors duration-100 ${
              isSelected ? 'text-slate-100' : 'text-slate-300'
            }`}
          >
            {action.label}
          </span>
          {action.description && (
            <span className="block text-[10px] text-slate-600 truncate mt-0.5">
              {action.description}
            </span>
          )}
        </span>
        {isSelected && (
          <span className="shrink-0 text-[9px] font-bold text-slate-600 border border-white/10 rounded px-1.5 py-0.5 font-outfit">
            ↵
          </span>
        )}
      </button>
    );
  };

  let globalIdx = 0;

  return (
    <>
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md animate-fade-in"
            onClick={onClose}
            aria-hidden="true"
          />

          <div
            className="fixed top-[15%] left-1/2 -translate-x-1/2 z-[101] w-full max-w-[560px] px-4 animate-in fade-in zoom-in-95 duration-155"
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
          >
            <div className="rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
              style={{
                background: 'rgba(10, 14, 22, 0.97)',
                boxShadow: '0 25px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.06), 0 0 40px rgba(61,255,211,0.04)'
              }}
            >
              {/* Search Input */}
              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/6">
                <Search className="w-4 h-4 text-slate-500 shrink-0" />
                <input
                  ref={inputRef}
                  id="command-palette-input"
                  type="text"
                  placeholder="Search experiences, contributions, members, resolutions..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-slate-200 placeholder:text-slate-600 outline-none font-medium"
                  autoComplete="off"
                  spellCheck={false}
                />
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    className="shrink-0 text-slate-600 hover:text-slate-400 transition-colors hover:cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <kbd className="shrink-0 text-[9px] font-bold text-slate-600 border border-white/8 rounded px-1.5 py-0.5 hidden sm:inline font-outfit">
                  ESC
                </kbd>
              </div>

              {/* Results List */}
              <div
                ref={listRef}
                className="p-2 max-h-[360px] overflow-y-auto"
              >
                {flatList.length === 0 ? (
                  <div className="py-10 text-center text-slate-600 text-xs">
                    No experiences, contributions, or members found matching "{query}"
                  </div>
                ) : (
                  <>
                    {/* Recent */}
                    {grouped.recent.length > 0 && (
                      <div className="mb-1.5">
                        <SectionLabel label="Recent" />
                        {grouped.recent.map((action) => {
                          const idx = globalIdx++;
                          return <ActionItem key={action.id} action={action} globalIndex={idx} />;
                        })}
                      </div>
                    )}

                    {/* Actions */}
                    {grouped.actions.length > 0 && (
                      <div className="mb-1.5">
                        {!query && <SectionLabel label="Actions" />}
                        {grouped.actions.map((action) => {
                          const idx = globalIdx++;
                          return <ActionItem key={action.id} action={action} globalIndex={idx} />;
                        })}
                      </div>
                    )}

                    {/* Navigate */}
                    {grouped.navigate.length > 0 && (
                      <div className="mb-1.5">
                        {!query && <SectionLabel label="Navigate" />}
                        {grouped.navigate.map((action) => {
                          const idx = globalIdx++;
                          return <ActionItem key={action.id} action={action} globalIndex={idx} />;
                        })}
                      </div>
                    )}

                    {/* Experiences */}
                    {grouped.experiences.length > 0 && (
                      <div className="mb-1.5">
                        {!query && <SectionLabel label="Experiences (Groups)" />}
                        {grouped.experiences.map((action) => {
                          const idx = globalIdx++;
                          return <ActionItem key={action.id} action={action} globalIndex={idx} />;
                        })}
                      </div>
                    )}

                    {/* Contributions */}
                    {grouped.contributions.length > 0 && (
                      <div className="mb-1.5">
                        {!query && <SectionLabel label="Contributions (Expenses)" />}
                        {grouped.contributions.map((action) => {
                          const idx = globalIdx++;
                          return <ActionItem key={action.id} action={action} globalIndex={idx} />;
                        })}
                      </div>
                    )}

                    {/* Participants */}
                    {grouped.participants.length > 0 && (
                      <div className="mb-1.5">
                        {!query && <SectionLabel label="Participants (Members)" />}
                        {grouped.participants.map((action) => {
                          const idx = globalIdx++;
                          return <ActionItem key={action.id} action={action} globalIndex={idx} />;
                        })}
                      </div>
                    )}

                    {/* Resolutions */}
                    {grouped.resolutions.length > 0 && (
                      <div className="mb-1.5">
                        {!query && <SectionLabel label="Resolutions (Settlements)" />}
                        {grouped.resolutions.map((action) => {
                          const idx = globalIdx++;
                          return <ActionItem key={action.id} action={action} globalIndex={idx} />;
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-2.5 border-t border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3 text-[9px] text-slate-700">
                  <span className="flex items-center gap-1">
                    <kbd className="border border-white/8 rounded px-1 py-0.5">↑</kbd>
                    <kbd className="border border-white/8 rounded px-1 py-0.5">↓</kbd>
                    Navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="border border-white/8 rounded px-1 py-0.5">↵</kbd>
                    Select
                  </span>
                </div>
                <span className="text-[9px] text-slate-700 font-medium tracking-wide">SplitSync Platform</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Relationship Intelligence Overlay */}
      {user && (
        <RelationshipModal
          isOpen={relModalOpen}
          onClose={() => {
            setRelModalOpen(false);
            onClose(); // Close the command palette too
          }}
          currentUserId={user.id}
          otherUserId={relUserId}
          otherUserName={relUserName}
        />
      )}
    </>
  );
};
