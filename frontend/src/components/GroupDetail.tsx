import React, { useEffect, useState } from 'react';
import { supabase, checkIsLegacySchema } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { ArrowLeft, UserPlus, Plus, Trash2, DollarSign, Calendar, CreditCard, Users, ShieldAlert, RefreshCw, Check, ArrowRight, Copy, Sparkles, TrendingUp, Heart, Info, Lock, Unlock, Share2, Camera, Flag, X } from 'lucide-react';
import { ExpenseModal } from './ExpenseModal';
import { SettlementModal } from './SettlementModal';
import { CSVImportModal } from './CSVImportModal';
import { ExplainersModal } from './Explainers';
import { ExpenseChat } from './ExpenseChat';
import { ThemeToggle } from './ThemeToggle';
import { ExpenseRowSkeleton } from './Skeleton';
import { BalanceFlowMap } from './BalanceFlowMap';
import { GroupTimeline } from './GroupTimeline';
import { useToast } from './Toast';
import { RelationshipModal } from './RelationshipModal';
import { PresetIcon } from './PresetIcon';

interface UserInfo {
  id: string;
  name: string;
  email: string;
}

interface GroupMember {
  id: string;
  userId: string;
  role: string;
  joinedAt: string;
  leftAt?: string | null;
  user: UserInfo;
}

interface ExpenseSplit {
  id: string;
  userId: string;
  amount: string;
  percentage: string | null;
  shareCount: string | null;
  splitType: string;
}

interface Expense {
  id: string;
  title: string;
  description: string | null;
  amount: string;
  paidBy: string;
  createdAt: string;
  currencyCode?: string;
  exchangeRate?: string;
  splits: ExpenseSplit[];
}

interface Settlement {
  id: string;
  amount: string;
  payerId: string;
  receiverId: string;
  createdAt: string;
  currencyCode?: string;
  exchangeRate?: string;
}

interface GroupDetails {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
  creator: UserInfo;
  baseCurrency: string;
}

interface SimplifiedTransaction {
  from: string;
  to: string;
  amount: number;
  fromName: string;
  toName: string;
}

interface GroupBalances {
  netBalances: { [userId: string]: number };
  simplifiedTransactions: SimplifiedTransaction[];
  totalSpent: number;
  outstanding: number;
}

interface GroupDetailProps {
  groupId: string;
  onBack: () => void;
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

const parseDescriptionAndHistory = (desc: string | null) => {
  if (!desc) return { cleanDescription: '', history: [] };
  const historyMatch = desc.match(/\n\[history:(.*)\]$/);
  if (historyMatch) {
    try {
      const history = JSON.parse(historyMatch[1]);
      const cleanDescription = desc.replace(/\n\[history:.*\]$/, '');
      return { cleanDescription, history };
    } catch (e) {
      // fallback
    }
  }
  return { cleanDescription: desc, history: [] };
};

const parseTrashDescription = (desc: string | null) => {
  if (!desc) return null;
  const match = desc.match(/\[trash:(.*)\]$/);
  if (match) {
    try {
      return JSON.parse(match[1]);
    } catch (e) {}
  }
  return null;
};

const calculateLocalBalances = (
  memberList: GroupMember[],
  expenseList: Expense[],
  settlementList: Settlement[]
): GroupBalances => {
  const memberNameMap: { [userId: string]: string } = {};
  const netBalances: { [userId: string]: number } = {};

  memberList.forEach((m) => {
    memberNameMap[m.userId] = m.user.name;
    netBalances[m.userId] = 0;
  });

  let totalSpent = 0;

  expenseList.forEach((exp) => {
    const payerId = exp.paidBy;
    const rawAmt = parseFloat(exp.amount) || 0;
    const rate = parseFloat(exp.exchangeRate || '1.0') || 1.0;
    const expAmt = parseFloat((rawAmt * rate).toFixed(2));
    totalSpent += expAmt;

    if (netBalances[payerId] !== undefined) {
      netBalances[payerId] += expAmt;
    }

    const splits = exp.splits || [];
    splits.forEach((split) => {
      const splitUserId = split.userId;
      const rawSplitAmt = parseFloat(split.amount) || 0;
      const splitAmt = parseFloat((rawSplitAmt * rate).toFixed(2));
      if (netBalances[splitUserId] !== undefined) {
        netBalances[splitUserId] -= splitAmt;
      }
    });
  });

  settlementList.forEach((set) => {
    const payerId = set.payerId;
    const receiverId = set.receiverId;
    const rawAmt = parseFloat(set.amount) || 0;
    const rate = parseFloat(set.exchangeRate || '1.0') || 1.0;
    const setAmt = parseFloat((rawAmt * rate).toFixed(2));

    if (netBalances[payerId] !== undefined) {
      netBalances[payerId] += setAmt;
    }
    if (netBalances[receiverId] !== undefined) {
      netBalances[receiverId] -= setAmt;
    }
  });

  Object.keys(netBalances).forEach((id) => {
    netBalances[id] = parseFloat(netBalances[id].toFixed(2));
  });

  let outstanding = 0;
  Object.keys(netBalances).forEach((id) => {
    if (netBalances[id] > 0) {
      outstanding += netBalances[id];
    }
  });

  const debtors = Object.keys(netBalances)
    .map((id) => ({ userId: id, balance: netBalances[id] }))
    .filter((u) => u.balance < -0.005)
    .sort((a, b) => a.balance - b.balance);

  const creditors = Object.keys(netBalances)
    .map((id) => ({ userId: id, balance: netBalances[id] }))
    .filter((u) => u.balance > 0.005)
    .sort((a, b) => b.balance - a.balance);

  const simplifiedTransactions: SimplifiedTransaction[] = [];
  let dIdx = 0;
  let cIdx = 0;

  const tempDebtors = debtors.map((d) => ({ ...d }));
  const tempCreditors = creditors.map((c) => ({ ...c }));

  while (dIdx < tempDebtors.length && cIdx < tempCreditors.length) {
    const debtor = tempDebtors[dIdx];
    const creditor = tempCreditors[cIdx];

    const debtLeft = Math.abs(debtor.balance);
    const creditLeft = creditor.balance;

    const amountToSettle = Math.min(debtLeft, creditLeft);
    if (amountToSettle > 0.005) {
      simplifiedTransactions.push({
        from: debtor.userId,
        to: creditor.userId,
        amount: parseFloat(amountToSettle.toFixed(2)),
        fromName: memberNameMap[debtor.userId] || 'Unknown',
        toName: memberNameMap[creditor.userId] || 'Unknown',
      });
    }

    debtor.balance += amountToSettle;
    creditor.balance -= amountToSettle;

    if (Math.abs(debtor.balance) < 0.005) {
      dIdx++;
    }
    if (Math.abs(creditor.balance) < 0.005) {
      cIdx++;
    }
  }

  return {
    netBalances,
    simplifiedTransactions,
    totalSpent: parseFloat(totalSpent.toFixed(2)),
    outstanding: parseFloat(outstanding.toFixed(2)),
  };
};

export const GroupDetail: React.FC<GroupDetailProps> = ({ groupId, onBack }) => {
  const { user } = useAuth();
  const toast = useToast();
  
  // Data State
  const [group, setGroup] = useState<GroupDetails | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [balances, setBalances] = useState<GroupBalances | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tabs: 'expenses' | 'balances' | 'settlements' | 'timeline' | 'insights'
  const [activeTab, setActiveTab] = useState<'expenses' | 'balances' | 'settlements' | 'timeline' | 'insights'>('expenses');

  // Invite member state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [friendsNetwork, setFriendsNetwork] = useState<UserInfo[]>([]);
  const [filteredFriends, setFilteredFriends] = useState<UserInfo[]>([]);
  const [showFriendsDropdown, setShowFriendsDropdown] = useState(false);

  // Unregistered members (imported via CSV, awaiting real signup)
  const [unregisteredMembers, setUnregisteredMembers] = useState<{
    id: string;
    display_name: string;
    placeholder_user_id: string | null;
    real_email: string | null;
    status: string;
    created_at: string;
  }[]>([]);

  // Modals state
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [showCSVImportModal, setShowCSVImportModal] = useState(false);
  const [showExplainersModal, setShowExplainersModal] = useState(false);
  const [activeExpenseChatId, setActiveExpenseChatId] = useState<string | null>(null);

  // Fairness Engine state
  const [expandedFairnessId, setExpandedFairnessId] = useState<string | null>(null);

  // Milestones & Moments state
  const [showMilestoneModal, setShowMilestoneModal] = useState(false);
  const [milestoneName, setMilestoneName] = useState('');
  const [milestoneType, setMilestoneType] = useState<'milestone' | 'moment'>('milestone');
  const [savingMilestone, setSavingMilestone] = useState(false);

  // Relationship Modal state
  const [relModalOpen, setRelModalOpen] = useState(false);
  const [relUserId, setRelUserId] = useState('');
  const [relUserName, setRelUserName] = useState('');

  // Spotify Wrapped state
  const [showWrappedModal, setShowWrappedModal] = useState(false);

  // Explain My Balance / Offline status / Inline Editing / Version History states
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastVisitTime, setLastVisitTime] = useState<string | null>(null);
  const [dismissedActivity, setDismissedActivity] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<'title' | 'description' | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  const fetchFriendsNetwork = async () => {
    if (!user) return;
    try {
      const { data: myGroups } = await supabase
        .from('GroupMember')
        .select('group_id')
        .eq('user_id', user.id);

      if (!myGroups || myGroups.length === 0) return;
      const groupIds = myGroups.map((g: any) => g.group_id);

      const { data: networkData } = await supabase
        .from('GroupMember')
        .select(`
          user_id,
          User (
            id,
            name,
            email
          )
        `)
        .in('group_id', groupIds);

      if (networkData) {
        const uniqueFriendsMap = new Map();
        networkData.forEach((m: any) => {
          const u = Array.isArray(m.User) ? m.User[0] : m.User;
          if (u && u.id !== user.id) {
            uniqueFriendsMap.set(u.id, {
              id: u.id,
              name: u.name,
              email: u.email,
            });
          }
        });
        setFriendsNetwork(Array.from(uniqueFriendsMap.values()));
      }
    } catch (err) {
      console.error('Error fetching friends network:', err);
    }
  };

  const loadUnregisteredMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('UnregisteredMember')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false });

      if (error) {
        if (error.message?.includes('does not exist') || error.code === 'PGRST205') {
          setUnregisteredMembers([]);
        } else {
          console.warn('Failed to load unregistered members:', error);
        }
        return;
      }

      setUnregisteredMembers(data || []);
    } catch (err) {
      console.warn('Failed to load unregistered members:', err);
    }
  };

  const handleSendInviteToUnregistered = async (unreg: any) => {
    let email = unreg.real_email;
    if (!email) {
      const inputEmail = prompt(`Enter the email address for ${unreg.display_name} to send an invite:`);
      if (!inputEmail) return;
      const cleanEmail = inputEmail.trim().toLowerCase();
      if (!cleanEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        toast.error('Please enter a valid email address.');
        return;
      }
      email = cleanEmail;
    }

    try {
      if (unreg.placeholder_user_id) {
        const { error: userErr } = await supabase
          .from('User')
          .update({ email: email })
          .eq('id', unreg.placeholder_user_id);
        if (userErr) throw userErr;
      }

      const { error: unregErr } = await supabase
        .from('UnregisteredMember')
        .update({
          real_email: email,
          status: 'invited',
          invite_sent_at: new Date().toISOString(),
        })
        .eq('id', unreg.id);
      if (unregErr) throw unregErr;

      const inviteCode = group?.name?.match(/ \[invite:([A-Z0-9]+)\]/)?.[1] || groupId;
      const inviteLink = `${window.location.origin}?join=${inviteCode}`;

      await navigator.clipboard.writeText(inviteLink);

      toast.success(`Invite details saved for ${unreg.display_name}! Invite link copied to clipboard.`);
      loadGroupData();
    } catch (err: any) {
      console.error('Failed to send invite to unregistered member:', err);
      toast.error(err.message || 'Failed to send invite.');
    }
  };

  const loadGroupData = async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Fetch group details
      let groupData: any = null;
      const isLegacy = await checkIsLegacySchema();
      
      if (isLegacy) {
        const { data: gDataLegacy, error: gErrLegacy } = await supabase
          .from('Group')
          .select(`
            id,
            name,
            created_by,
            created_at,
            User (
              id,
              name,
              email
            )
          `)
          .eq('id', groupId)
          .maybeSingle();
        if (gErrLegacy) throw new Error(gErrLegacy.message);
        groupData = gDataLegacy ? { ...gDataLegacy, base_currency: 'INR' } : null;
      } else {
        const { data: gData, error: gErr } = await supabase
          .from('Group')
          .select(`
            id,
            name,
            created_by,
            created_at,
            base_currency,
            User (
              id,
              name,
              email
            )
          `)
          .eq('id', groupId)
          .maybeSingle();
        if (gErr) throw new Error(gErr.message);
        groupData = gData;
      }

      if (!groupData) {
        throw new Error('Experience not found.');
      }

      const creatorUser = Array.isArray(groupData.User) ? groupData.User[0] : groupData.User;
      
      let groupName = groupData.name;
      if (!groupName.includes(' [invite:')) {
        const generatedCode = generateInviteCode();
        let newName = '';
        if (groupName.endsWith(' [vaulted]')) {
          const raw = groupName.replace(' [vaulted]', '');
          newName = `${raw} [invite:${generatedCode}] [vaulted]`;
        } else {
          newName = `${groupName} [invite:${generatedCode}]`;
        }
        
        const { error: updErr } = await supabase
          .from('Group')
          .update({ name: newName })
          .eq('id', groupId);
          
        if (!updErr) {
          groupName = newName;
        }
      }

      const formattedGroup: GroupDetails = {
        id: groupData.id,
        name: groupName,
        createdBy: groupData.created_by,
        createdAt: groupData.created_at,
        baseCurrency: groupData.base_currency || 'INR',
        creator: {
          id: creatorUser?.id || '',
          name: creatorUser?.name || 'Unknown',
          email: creatorUser?.email || '',
        },
      };

      setGroup(formattedGroup);

      const cleanName = cleanGroupName(formattedGroup.name);
      document.title = `${cleanName} | SplitSync`;

      // 2. Fetch group members
      let membersData: any[] | null = null;
      if (isLegacy) {
        const { data: mDataLegacy, error: mErrLegacy } = await supabase
          .from('GroupMember')
          .select(`
            id,
            user_id,
            role,
            joined_at,
            User (
              id,
              name,
              email
            )
          `)
          .eq('group_id', groupId);
        if (mErrLegacy) throw new Error(mErrLegacy.message);
        membersData = (mDataLegacy || []).map((m: any) => ({ ...m, left_at: null }));
      } else {
        const { data: mData, error: mErr } = await supabase
          .from('GroupMember')
          .select(`
            id,
            user_id,
            role,
            joined_at,
            left_at,
            User (
              id,
              name,
              email
            )
          `)
          .eq('group_id', groupId);
        if (mErr) throw new Error(mErr.message);
        membersData = mData;
      }

      const formattedMembers: GroupMember[] = (membersData || []).map((m: any) => ({
        id: m.id,
        userId: m.user_id,
        role: m.role,
        joinedAt: m.joined_at,
        leftAt: m.left_at || null,
        user: {
          id: m.User?.id || '',
          name: m.User?.name || 'Unknown User',
          email: m.User?.email || '',
        },
      }));

      const isMember = formattedMembers.some((m) => m.userId === user?.id);
      if (!isMember) {
        throw new Error('Access denied. You are not a member of this experience.');
      }

      setMembers(formattedMembers);

      // 3. Fetch expenses and splits
      let expensesData: any[] | null = null;
      if (isLegacy) {
        const { data: eDataLegacy, error: eErrLegacy } = await supabase
          .from('Expense')
          .select(`
            id,
            title,
            description,
            amount,
            paid_by,
            created_at,
            ExpenseSplit (
              id,
              user_id,
              amount,
              percentage,
              share_count,
              split_type
            )
          `)
          .eq('group_id', groupId)
          .order('created_at', { ascending: false });
        if (eErrLegacy) throw new Error(eErrLegacy.message);
        expensesData = (eDataLegacy || []).map((exp: any) => ({
          ...exp,
          currency_code: 'INR',
          exchange_rate: 1.0,
        }));
      } else {
        const { data: eData, error: eErr } = await supabase
          .from('Expense')
          .select(`
            id,
            title,
            description,
            amount,
            paid_by,
            created_at,
            currency_code,
            exchange_rate,
            ExpenseSplit (
              id,
              user_id,
              amount,
              percentage,
              share_count,
              split_type
            )
          `)
          .eq('group_id', groupId)
          .order('created_at', { ascending: false });
        if (eErr) throw new Error(eErr.message);
        expensesData = eData;
      }

      const formattedExpenses: Expense[] = (expensesData || []).map((exp: any) => ({
        id: exp.id,
        title: exp.title,
        description: exp.description,
        amount: exp.amount,
        paidBy: exp.paid_by,
        createdAt: exp.created_at,
        currencyCode: exp.currency_code,
        exchangeRate: exp.exchange_rate,
        splits: (exp.ExpenseSplit || []).map((s: any) => ({
          id: s.id,
          userId: s.user_id,
          amount: s.amount,
          percentage: s.percentage,
          shareCount: s.share_count,
          splitType: s.split_type,
        })),
      }));

      // Fetch offline queue items
      const queueKey = `splitsync-offline-queue-${groupId}`;
      const offlineQueue = JSON.parse(localStorage.getItem(queueKey) || '[]');
      
      const offlineExpenses = offlineQueue
        .filter((item: any) => item.type === 'create-expense')
        .map((item: any) => item.payload);

      const combinedExpenses = [...offlineExpenses, ...formattedExpenses];
      setExpenses(combinedExpenses);

      // 4. Fetch settlements
      let settlementsData: any[] | null = null;
      if (isLegacy) {
        const { data: sDataLegacy, error: sErrLegacy } = await supabase
          .from('Settlement')
          .select('id, amount, payer_id, receiver_id, created_at')
          .eq('group_id', groupId)
          .order('created_at', { ascending: false });
        if (sErrLegacy) throw new Error(sErrLegacy.message);
        settlementsData = (sDataLegacy || []).map((s: any) => ({
          ...s,
          currency_code: 'INR',
          exchange_rate: 1.0,
        }));
      } else {
        const { data: sData, error: sErr } = await supabase
          .from('Settlement')
          .select('id, amount, payer_id, receiver_id, created_at, currency_code, exchange_rate')
          .eq('group_id', groupId)
          .order('created_at', { ascending: false });
        if (sErr) throw new Error(sErr.message);
        settlementsData = sData;
      }

      const formattedSettlements: Settlement[] = (settlementsData || []).map((s: any) => ({
        id: s.id,
        amount: s.amount,
        payerId: s.payer_id,
        receiverId: s.receiver_id,
        createdAt: s.created_at,
        currencyCode: s.currency_code,
        exchangeRate: s.exchange_rate,
      }));

      const offlineSettlements = offlineQueue
        .filter((item: any) => item.type === 'create-settlement')
        .map((item: any) => item.payload);

      const combinedSettlements = [...offlineSettlements, ...formattedSettlements];
      setSettlements(combinedSettlements);

      // Calculate balances locally using combined lists
      const calculated = calculateLocalBalances(formattedMembers, combinedExpenses, combinedSettlements);
      setBalances(calculated);

      // 6. Manage last visit
      const visitKey = `splitsync-last-visit-${groupId}`;
      const lastVisit = localStorage.getItem(visitKey);
      setLastVisitTime(lastVisit);
      localStorage.setItem(visitKey, new Date().toISOString());

      if (navigator.onLine) {
        // sync offline queue in the background
        syncOfflineQueue();
      }

      // 7. Fetch unregistered members
      await loadUnregisteredMembers();

    } catch (err: any) {
      setError(err.message || 'Failed to load experience details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGroupData();
  }, [groupId, user]);

  useEffect(() => {
    fetchFriendsNetwork();
  }, [user]);

  useEffect(() => {
    const query = inviteEmail.toLowerCase().trim();
    if (!query) {
      setFilteredFriends([]);
      return;
    }
    const filtered = friendsNetwork.filter(
      (f) =>
        f.name.toLowerCase().includes(query) ||
        f.email.toLowerCase().includes(query)
    );
    setFilteredFriends(filtered);
  }, [inviteEmail, friendsNetwork]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { action } = (e as CustomEvent).detail;
      if (action === 'add-expense') {
        setShowExpenseModal(true);
      } else if (action === 'record-settlement') {
        setShowSettlementModal(true);
      }
    };
    window.addEventListener('splitsync:cmd', handler);
    return () => window.removeEventListener('splitsync:cmd', handler);
  }, []);

  // Online/Offline tracking
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncOfflineQueue();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [groupId]);

  const syncOfflineQueue = async () => {
    if (!navigator.onLine) return;
    const queueKey = `splitsync-offline-queue-${groupId}`;
    const queue = JSON.parse(localStorage.getItem(queueKey) || '[]');
    if (queue.length === 0) return;

    localStorage.removeItem(queueKey);
    toast.info('Syncing offline updates...');
    let successCount = 0;

    for (const item of queue) {
      try {
        if (item.type === 'create-expense') {
          const { title, amount, paidBy, description, splits } = item.payload;
          const { data: newExp, error: eErr } = await supabase
            .from('Expense')
            .insert({
              group_id: groupId,
              title,
              amount: parseFloat(amount),
              paid_by: paidBy,
              description,
            })
            .select()
            .single();

          if (eErr) throw new Error(eErr.message);

          const { error: sErr } = await supabase
            .from('ExpenseSplit')
            .insert(
              splits.map((s: any) => ({
                expense_id: newExp.id,
                user_id: s.userId,
                amount: parseFloat(s.amount),
                percentage: s.percentage ? parseFloat(s.percentage) : null,
                share_count: s.shareCount ? parseFloat(s.shareCount) : null,
                split_type: s.splitType,
              }))
            );

          if (sErr) throw new Error(sErr.message);
        } else if (item.type === 'create-settlement') {
          const { payerId, receiverId, amount } = item.payload;
          const { error: sErr } = await supabase
            .from('Settlement')
            .insert({
              group_id: groupId,
              payer_id: payerId,
              receiver_id: receiverId,
              amount: parseFloat(amount),
            });

          if (sErr) throw new Error(sErr.message);
        }
        successCount++;
      } catch (err) {
        console.error('Failed to sync offline item:', err, item);
      }
    }

    if (successCount > 0) {
      toast.success(`Synced ${successCount} offline updates!`);
      loadGroupData();
    }
  };

  const handleSaveInlineEdit = async (expense: Expense, field: 'title' | 'description', newVal: string) => {
    if (!user) return;
    const value = newVal.trim();
    if (field === 'title' && !value) {
      toast.error('Title cannot be empty');
      return;
    }

    try {
      const parsed = parseDescriptionAndHistory(expense.description);
      const originalDesc = parsed.cleanDescription;
      const historyList = [...parsed.history];

      historyList.push({
        version: historyList.length + 1,
        timestamp: new Date().toISOString(),
        editedBy: user.id,
        editedByName: getMemberName(user.id),
        field: field,
        oldValue: field === 'title' ? expense.title : originalDesc,
        newValue: value,
      });

      const updatedDesc = field === 'description' ? value : originalDesc;
      const serializedDescription = historyList.length > 0 
        ? `${updatedDesc}\n[history:${JSON.stringify(historyList)}]`
        : updatedDesc;

      const updatePayload: any = {};
      if (field === 'title') {
        updatePayload.title = value;
      }
      updatePayload.description = serializedDescription;

      const { error } = await supabase
        .from('Expense')
        .update(updatePayload)
        .eq('id', expense.id);

      if (error) throw new Error(error.message);

      toast.success(`${field === 'title' ? 'Title' : 'Description'} updated!`);
      setEditingExpenseId(null);
      setEditingField(null);
      loadGroupData();
    } catch (err: any) {
      alert(err.message || 'Failed to update field');
    }
  };

  const handleDeleteExpense = async (expense: Expense) => {
    if (!user) return;
    if (!window.confirm(`Are you sure you want to move "${expense.title.replace(/ (🏖|🏠|🎓|💍|🚗|📦|🍔|✈️|🏨|🎟️|🛒)$/, '')}" to the Recently Deleted buffer?`)) return;

    try {
      const trashPayload = {
        title: expense.title,
        amount: expense.amount,
        paidBy: expense.paidBy,
        description: expense.description,
        splits: expense.splits.map((s) => ({
          userId: s.userId,
          amount: s.amount,
          percentage: s.percentage,
          shareCount: s.shareCount,
          splitType: s.splitType,
        })),
      };

      const trashDesc = `[trash:${JSON.stringify(trashPayload)}]`;

      const { error: eErr } = await supabase
        .from('Expense')
        .update({
          title: `${expense.title} [deleted:${new Date().toISOString()}]`,
          amount: 0,
          description: trashDesc,
        })
        .eq('id', expense.id);

      if (eErr) throw new Error(eErr.message);

      const { error: sErr } = await supabase
        .from('ExpenseSplit')
        .delete()
        .eq('expense_id', expense.id);

      if (sErr) throw new Error(sErr.message);

      toast.success('Contribution moved to Recently Deleted buffer!');
      loadGroupData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete contribution');
    }
  };

  const handleRestoreExpense = async (expenseId: string, trashData: any) => {
    try {
      const { error: eErr } = await supabase
        .from('Expense')
        .update({
          title: trashData.title,
          amount: parseFloat(trashData.amount),
          description: trashData.description || null,
        })
        .eq('id', expenseId);

      if (eErr) throw new Error(eErr.message);

      const splits = trashData.splits || [];
      const { error: sErr } = await supabase
        .from('ExpenseSplit')
        .insert(
          splits.map((s: any) => ({
            expense_id: expenseId,
            user_id: s.userId,
            amount: parseFloat(s.amount),
            percentage: s.percentage ? parseFloat(s.percentage) : null,
            share_count: s.shareCount ? parseFloat(s.shareCount) : null,
            split_type: s.splitType,
          }))
        );

      if (sErr) throw new Error(sErr.message);

      toast.success('Contribution restored successfully!');
      loadGroupData();
    } catch (err: any) {
      alert(err.message || 'Failed to restore contribution');
    }
  };

  const getMyBalanceBreakdown = () => {
    if (!user || !expenses || !settlements) return [];
    const breakdown: Array<{ title: string; subtitle: string; amount: number }> = [];

    expenses.forEach((exp) => {
      const amt = parseFloat(exp.amount) || 0;
      if (amt === 0) return;
      const isPayer = exp.paidBy === user.id;
      const userSplit = exp.splits.find((s) => s.userId === user.id);
      const userSplitAmt = userSplit ? parseFloat(userSplit.amount) || 0 : 0;

      const cleanTitle = exp.title.replace(/ (🏖|🏠|🎓|💍|🚗|📦|🍔|✈️|🏨|🎟️|🛒)$/, '');

      if (isPayer) {
        const netCredit = amt - userSplitAmt;
        if (netCredit > 0.005) {
          breakdown.push({
            title: cleanTitle,
            subtitle: `You covered ₹${amt.toFixed(0)}${userSplit ? ` (Minus your share ₹${userSplitAmt.toFixed(0)})` : ''}`,
            amount: netCredit,
          });
        }
      } else if (userSplitAmt > 0.005) {
        breakdown.push({
          title: cleanTitle,
          subtitle: `Your share (Covered by ${getMemberName(exp.paidBy)})`,
          amount: -userSplitAmt,
        });
      }
    });

    settlements.forEach((settle) => {
      const amt = parseFloat(settle.amount) || 0;
      if (amt === 0) return;
      const isPayer = settle.payerId === user.id;
      const isReceiver = settle.receiverId === user.id;

      if (isPayer) {
        breakdown.push({
          title: `Settled to ${getMemberName(settle.receiverId)}`,
          subtitle: 'Resolution transfer',
          amount: amt,
        });
      } else if (isReceiver) {
        breakdown.push({
          title: `Received from ${getMemberName(settle.payerId)}`,
          subtitle: 'Resolution transfer',
          amount: -amt,
        });
      }
    });

    return breakdown;
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !user) return;

    setInviting(true);
    setInviteSuccess(false);
    try {
      let cleanInput = inviteEmail.trim();
      let searchEmail = '';

      if (cleanInput.includes('@') && cleanInput.includes('.')) {
        searchEmail = cleanInput.toLowerCase();
      } else {
        const cleanSearchVal = cleanInput.startsWith('@') ? cleanInput.substring(1) : cleanInput;
        
        // Exact name check case-insensitively
        const { data: foundUser } = await supabase
          .from('User')
          .select('email, name')
          .ilike('name', cleanSearchVal)
          .maybeSingle();

        if (foundUser) {
          searchEmail = foundUser.email.toLowerCase();
        } else {
          throw new Error('No registered user found with that exact name or handle. Please invite using their email address.');
        }
      }

      const isAlreadyMember = members.some((m) => m.user.email.toLowerCase() === searchEmail);
      if (isAlreadyMember) {
        throw new Error('User is already a member of this experience.');
      }

      const { data: existingInvite } = await supabase
        .from('GroupInvite')
        .select('id, status')
        .eq('group_id', groupId)
        .eq('email', searchEmail)
        .maybeSingle();

      if (existingInvite) {
        if (existingInvite.status === 'pending') {
          throw new Error('An invitation is already pending for this email.');
        } else if (existingInvite.status === 'accepted') {
          throw new Error('User already accepted an invitation to this experience.');
        }

        const { error: uErr } = await supabase
          .from('GroupInvite')
          .update({ status: 'pending', invited_by: user.id })
          .eq('id', existingInvite.id);

        if (uErr) throw new Error(uErr.message);
      } else {
        const { error: iErr } = await supabase
          .from('GroupInvite')
          .insert({
            group_id: groupId,
            email: searchEmail,
            invited_by: user.id,
            status: 'pending',
          });

        if (iErr) throw new Error(iErr.message);
      }

      setInviteEmail('');
      setInviteSuccess(true);
      setTimeout(() => setInviteSuccess(false), 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to send invite');
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = async (memberUserId: string, memberName: string) => {
    if (!window.confirm(`Are you sure you want to remove ${memberName} from this experience?`)) return;

    try {
      if (balances) {
        const bal = balances.netBalances[memberUserId] || 0;
        if (Math.abs(bal) > 0.01) {
          throw new Error(`Cannot remove member. ${bal > 0 ? 'They are owed money' : 'They owe money'} (Balance: ₹${bal.toFixed(2)}). Settle all outstanding shares first!`);
        }
      }

      const { error } = await supabase
        .from('GroupMember')
        .update({ left_at: new Date().toISOString() })
        .eq('group_id', groupId)
        .eq('user_id', memberUserId);

      if (error) throw new Error(error.message);

      loadGroupData();
    } catch (err: any) {
      alert(err.message || 'Failed to remove member');
    }
  };

  const handleInviteAndMerge = async (member: GroupMember) => {
    try {
      // Generate invite link and copy directly to clipboard
      const inviteCode = group?.name?.match(/ \[invite:([A-Z0-9]+)\]/)?.[1] || groupId;
      const inviteLink = `${window.location.origin}?join=${inviteCode}`;

      await navigator.clipboard.writeText(inviteLink);

      toast.success(`Invite link for ${member.user.name} copied! Share it with them to join the group.`);
    } catch (err: any) {
      console.error('Failed to copy invite link:', err);
      toast.error('Could not copy invite link. Please try again.');
    }
  };

  const handleToggleVault = async () => {
    if (!group) return;
    try {
      const isCurrentlyVaulted = group.name.endsWith(' [vaulted]');
      const newName = isCurrentlyVaulted
        ? group.name.replace(' [vaulted]', '')
        : group.name + ' [vaulted]';

      const { error: uErr } = await supabase
        .from('Group')
        .update({ name: newName })
        .eq('id', groupId);

      if (uErr) throw new Error(uErr.message);
      
      toast.success(isCurrentlyVaulted ? 'Experience returned to Active Workspace!' : 'Experience archived to Memory Vault! 🔒');
      loadGroupData();
    } catch (err: any) {
      alert(err.message || 'Failed to archive experience.');
    }
  };

  const handleSaveMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!milestoneName.trim() || !user) return;

    setSavingMilestone(true);
    try {
      const finalTitle = milestoneType === 'moment' ? `📸 ${milestoneName.trim()}` : `🏁 Milestone: ${milestoneName.trim()}`;
      
      const { error: eErr } = await supabase
        .from('Expense')
        .insert({
          group_id: groupId,
          title: finalTitle,
          amount: 0,
          paid_by: user.id,
          description: `Timeline ${milestoneType === 'moment' ? 'Moment' : 'Milestone'}`,
        });

      if (eErr) throw new Error(eErr.message);

      setShowMilestoneModal(false);
      setMilestoneName('');
      toast.success(`${milestoneType === 'moment' ? 'Moment' : 'Milestone'} logged successfully!`);
      loadGroupData();
    } catch (err: any) {
      alert(err.message || 'Failed to log timeline memory.');
    } finally {
      setSavingMilestone(false);
    }
  };

  const getMemberName = (userId: string) => {
    const m = members.find((member) => member.userId === userId);
    return m ? m.user.name : 'Someone';
  };

  const getMemberColor = (name: string) => {
    const colors = ['bg-blue-500/20 text-blue-400 border-blue-500/20', 'bg-indigo-500/20 text-indigo-400 border-indigo-500/20', 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20', 'bg-purple-500/20 text-purple-400 border-purple-500/20'];
    let sum = 0;
    for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
    return colors[sum % colors.length];
  };

  if (loading && !group) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="skeleton-shimmer h-4 w-28 rounded-lg" />
        <div className="skeleton-shimmer h-9 w-56 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            {[1,2,3].map(i => <ExpenseRowSkeleton key={i} />)}
          </div>
          <div className="space-y-4">
            <div className="skeleton-shimmer h-40 w-full rounded-2xl" />
            <div className="skeleton-shimmer h-32 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center" id="group-error-root">
        <ShieldAlert className="w-12 h-12 text-red-400 mx-auto mb-4 animate-glow-pulse" />
        <h2 className="text-2xl font-bold text-slate-100">Failed to Load Experience</h2>
        <p className="text-slate-400 mt-2">{error || 'Experience details not found.'}</p>
        <div className="mt-6 flex justify-center gap-4">
          <button
            onClick={onBack}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-355 font-bold border border-white/5 transition flex items-center gap-1.5 hover:cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Workspace
          </button>
          <button
            onClick={loadGroupData}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition flex items-center gap-1.5 hover:cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      </div>
    );
  }

  const isCreator = group.createdBy === user?.id;
  const preset = getPresetInfo(group.name);
  const cleanName = cleanGroupName(group.name);
  const isVaulted = group.name.endsWith(' [vaulted]');

  // Filter out soft-deleted contributions
  const activeExpenses = expenses.filter(
    (e) => !e.title.includes('[deleted:') && !(e.description && e.description.includes('[trash:'))
  );

  // In financial contributions list, filter out milestones/moments (amount == 0) and soft-deleted items
  const financialExpenses = activeExpenses.filter((e) => parseFloat(e.amount) > 0);

  // Deleted items buffer (Soft-deleted)
  const deletedExpenses = expenses.filter(
    (e) => e.title.includes('[deleted:') || (e.description && e.description.includes('[trash:'))
  );

  // Experience Health State Calculation
  const totalSpent = balances ? balances.totalSpent : 0;
  const outstanding = balances ? balances.outstanding : 0;
  const settlementProgress = totalSpent > 0 
    ? Math.max(0, Math.min(100, Math.round(((totalSpent - outstanding) / totalSpent) * 100)))
    : 100;

  const healthState =
    settlementProgress > 75
      ? { label: 'Excellent Health', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', dot: 'bg-emerald-500' }
      : settlementProgress > 35
        ? { label: 'Stable Health', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', dot: 'bg-amber-500' }
        : { label: 'Attention Needed', color: 'text-red-450 bg-red-500/10 border-red-500/20', dot: 'bg-red-500' };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8" id="group-detail-root">
      
      {/* Back button row with theme toggle */}
      <div className="flex justify-between items-center mb-6">
        <button
          id="btn-group-back"
          onClick={onBack}
          className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition text-xs hover:cursor-pointer font-bold uppercase tracking-wider"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Overview
        </button>
        <ThemeToggle compact />
      </div>

      {/* Offline Status Warning Banner */}
      {!isOnline && (
        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-2xl p-4 text-xs font-semibold mb-6 flex items-center gap-2 animate-slide-down">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
          <span>Working Offline. Changes will sync automatically when network returns.</span>
        </div>
      )}

      {/* Recent Activity Since Last Visit Banner */}
      {lastVisitTime && !dismissedActivity && (() => {
        const recentExpenses = expenses.filter((e) => new Date(e.createdAt) > new Date(lastVisitTime));
        const recentSettlements = settlements.filter((s) => new Date(s.createdAt) > new Date(lastVisitTime));
        
        if (recentExpenses.length === 0 && recentSettlements.length === 0) return null;

        return (
          <div className="glass-card rounded-2xl p-4 border border-primary/20 bg-primary/5 text-xs text-slate-355 flex justify-between items-start animate-slide-down mb-6">
            <div className="space-y-1">
              <p className="font-extrabold text-slate-100 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
                Since your last visit:
              </p>
              <ul className="list-disc list-inside space-y-1 pl-1 mt-1 text-slate-300 font-medium font-sans">
                {recentExpenses.slice(0, 3).map((e) => {
                  const isMilestone = parseFloat(e.amount) === 0;
                  return (
                    <li key={e.id}>
                      {getMemberName(e.paidBy)} added {isMilestone ? 'a timeline memory' : `contribution "${e.title.replace(/ (🏖|🏠|🎓|💍|🚗|📦|🍔|✈️|🏨|🎟️|🛒)$/, '')}"`}
                    </li>
                  );
                })}
                {recentSettlements.slice(0, 2).map((s) => (
                  <li key={s.id}>
                    {getMemberName(s.payerId)} resolved share with {getMemberName(s.receiverId)}
                  </li>
                ))}
              </ul>
            </div>
            <button
              onClick={() => setDismissedActivity(true)}
              className="p-1 text-slate-400 hover:text-slate-200 transition hover:cursor-pointer rounded-lg hover:bg-white/5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })()}

      {/* Notion-Style Cover Header */}
      <header className={`w-full rounded-2xl bg-gradient-to-r ${preset.gradient} relative overflow-hidden mb-8 border border-white/10 shadow-xl flex flex-col justify-end min-h-[140px] p-6`}>
        <div className="absolute inset-0 bg-black/15 backdrop-blur-[1px] pointer-events-none" />
        
        {/* Status indicator badges */}
        <div className="relative sm:absolute top-0 sm:top-4 right-0 sm:right-4 z-10 mb-4 sm:mb-0 self-start sm:self-auto flex gap-2">
          {isVaulted ? (
            <span className="text-[8px] bg-purple-500/25 text-purple-300 border border-purple-500/35 font-bold px-3 py-1 rounded-full tracking-wider uppercase shadow-md flex items-center gap-1 select-none">
              <Lock className="w-3 h-3" /> Vaulted Memory
            </span>
          ) : (
            <span className="text-[8px] bg-primary/25 text-primary border border-primary/35 font-bold px-3 py-1 rounded-full tracking-wider uppercase shadow-md flex items-center gap-1 select-none font-outfit">
              Active Experience
            </span>
          )}
        </div>

        <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0 select-none backdrop-blur-sm">
              <PresetIcon preset={preset.preset} className="w-7 h-7" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-black text-slate-100 tracking-tight leading-none truncate pr-2">
                {cleanName}
              </h1>
              <p className="text-[9px] text-slate-400 font-bold tracking-widest mt-2 uppercase font-outfit">
                {preset.name} • Shared by {members.length} friends
              </p>
            </div>
          </div>

          {/* Action row in cover */}
          <div className="grid grid-cols-6 sm:flex sm:flex-wrap gap-2 w-full sm:w-auto shrink-0 z-10">
            <button
              onClick={() => setShowExpenseModal(true)}
              className="col-span-2 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-gradient-to-r from-primary to-accent hover:brightness-110 text-obsidian transition text-xs font-extrabold shadow-lg shadow-primary/20 hover:cursor-pointer btn-magnetic"
            >
              <Plus className="w-3.5 h-3.5 text-obsidian" /> Log<span className="hidden sm:inline"> Contribution</span>
            </button>
            <button
              onClick={() => setShowSettlementModal(true)}
              className="col-span-2 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-primary transition text-xs font-extrabold border border-white/5 hover:cursor-pointer btn-magnetic"
            >
              <CreditCard className="w-3.5 h-3.5 text-primary" /> Resolve<span className="hidden sm:inline"> Share</span>
            </button>
            <button
              onClick={() => setShowCSVImportModal(true)}
              className="col-span-2 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-emerald-400 border border-white/5 hover:cursor-pointer transition text-xs font-extrabold btn-magnetic"
            >
              <RefreshCw className="w-3.5 h-3.5 text-emerald-400" /> Import<span className="hidden sm:inline"> CSV</span>
            </button>
            <button
              onClick={() => setShowMilestoneModal(true)}
              className="col-span-3 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-slate-200 transition hover:cursor-pointer btn-magnetic text-xs font-extrabold"
              title="Log milestone or moment memory"
            >
              <Camera className="w-4 h-4 shrink-0 text-slate-200" />
              <span className="sm:hidden">Add Moment</span>
            </button>
            <button
              onClick={handleToggleVault}
              className={`col-span-3 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border transition hover:cursor-pointer btn-magnetic text-xs font-extrabold ${
                isVaulted
                  ? 'bg-purple-500/10 border-purple-500/20 text-purple-400 hover:bg-purple-500/20'
                  : 'bg-white/5 border-white/5 text-slate-400 hover:text-slate-200'
              }`}
              title={isVaulted ? 'Return Experience to active list' : 'Archive Experience to Memory Vault'}
            >
              {isVaulted ? (
                <>
                  <Unlock className="w-4 h-4 shrink-0" />
                  <span className="sm:hidden">Unvault</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4 shrink-0" />
                  <span className="sm:hidden">Vault</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
        
        {/* Left Columns (Content Workspace with Tabs) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Tabs menu — glassmorphic pills */}
          {(() => {
            return (
              <div className="relative flex items-center p-1 rounded-2xl border border-white/8 bg-black/30 backdrop-blur-md shrink-0 overflow-x-auto gap-1" id="tabs-navigation">
                <button
                  onClick={() => setActiveTab('expenses')}
                  aria-pressed={activeTab === 'expenses'}
                  className={`relative z-10 flex-grow min-w-max px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 flex items-center justify-center gap-1.5 hover:cursor-pointer select-none ${
                    activeTab === 'expenses'
                      ? 'text-primary bg-primary/10 border border-primary/20 shadow-[0_0_12px_rgba(61,255,211,0.12)]'
                      : 'text-slate-500 hover:text-slate-300 border border-transparent hover:bg-white/3'
                  }`}
                >
                  <DollarSign className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">Contributions (Expenses)</span>
                  <span className="sm:hidden">Contributions</span>
                </button>

                <button
                  onClick={() => setActiveTab('balances')}
                  aria-pressed={activeTab === 'balances'}
                  className={`relative z-10 flex-grow min-w-max px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 flex items-center justify-center gap-1.5 hover:cursor-pointer select-none ${
                    activeTab === 'balances'
                      ? 'text-primary bg-primary/10 border border-primary/20 shadow-[0_0_12px_rgba(61,255,211,0.12)]'
                      : 'text-slate-500 hover:text-slate-300 border border-transparent hover:bg-white/3'
                  }`}
                >
                  <Users className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">Outstanding Shares (Balances)</span>
                  <span className="sm:hidden">Balances</span>
                </button>

                <button
                  onClick={() => setActiveTab('timeline')}
                  aria-pressed={activeTab === 'timeline'}
                  className={`relative z-10 flex-grow min-w-max px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 flex items-center justify-center gap-1.5 hover:cursor-pointer select-none ${
                    activeTab === 'timeline'
                      ? 'text-primary bg-primary/10 border border-primary/20 shadow-[0_0_12px_rgba(61,255,211,0.12)]'
                      : 'text-slate-500 hover:text-slate-300 border border-transparent hover:bg-white/3'
                  }`}
                >
                  <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="2" fill="currentColor"/>
                    <path d="M8 2v2M8 12v2M2 8h2M12 8h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2" opacity="0.4"/>
                  </svg>
                  Timeline
                </button>

                <button
                  onClick={() => setActiveTab('settlements')}
                  aria-pressed={activeTab === 'settlements'}
                  className={`relative z-10 flex-grow min-w-max px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 flex items-center justify-center gap-1.5 hover:cursor-pointer select-none ${
                    activeTab === 'settlements'
                      ? 'text-primary bg-primary/10 border border-primary/20 shadow-[0_0_12px_rgba(61,255,211,0.12)]'
                      : 'text-slate-500 hover:text-slate-300 border border-transparent hover:bg-white/3'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">Resolutions (History)</span>
                  <span className="sm:hidden">Resolutions</span>
                </button>

                <button
                  onClick={() => setActiveTab('insights')}
                  aria-pressed={activeTab === 'insights'}
                  className={`relative z-10 flex-grow min-w-max px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 flex items-center justify-center gap-1.5 hover:cursor-pointer select-none ${
                    activeTab === 'insights'
                      ? 'text-primary bg-primary/10 border border-primary/20 shadow-[0_0_12px_rgba(61,255,211,0.12)]'
                      : 'text-slate-500 hover:text-slate-300 border border-transparent hover:bg-white/3'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">Wrapped Insights</span>
                  <span className="sm:hidden">Insights</span>
                </button>
              </div>
            );
          })()}

          {/* TAB 1: Contributions list */}
          {activeTab === 'expenses' && (
            <div className="space-y-4 animate-fade-in" id="panel-expenses">
              {financialExpenses.length === 0 ? (
                <div className="glass-card rounded-2xl p-12 text-center border border-dashed border-white/8">
                  <div className="w-14 h-14 rounded-2xl bg-white/4 border border-white/8 flex items-center justify-center mx-auto mb-4">
                    <DollarSign className="w-6 h-6 text-slate-600" />
                  </div>
                  <p className="text-slate-300 font-semibold text-sm font-sans">No financial contributions logged</p>
                  <p className="text-slate-600 text-xs mt-2 max-w-xs mx-auto leading-relaxed">
                    Log the first shared contribution and everyone's balance sheet updates.
                  </p>
                  <button
                    onClick={() => setShowExpenseModal(true)}
                    className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary/10 hover:bg-primary/15 text-primary transition text-xs font-bold border border-primary/20 hover:cursor-pointer btn-magnetic font-outfit"
                  >
                    <Plus className="w-3.5 h-3.5" /> Log First Contribution
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {financialExpenses.map((expense) => {
                    const isPayer = expense.paidBy === user?.id;
                    const userSplit = expense.splits.find((s) => s.userId === user?.id);
                    const owedVal = userSplit ? parseFloat(userSplit.amount) : 0;
                    const totalExpenseAmt = parseFloat(expense.amount);
                    const { cleanDescription, history } = parseDescriptionAndHistory(expense.description);

                    return (
                      <div
                        key={expense.id}
                        className="expense-row glass-card rounded-2xl p-5 border border-white/5 hover:border-primary/25 transition-all duration-300 relative overflow-hidden group"
                      >
                        <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
                          <div
                            onClick={() => setActiveExpenseChatId(expense.id)}
                            className="flex items-start gap-4 flex-1 min-w-0 hover:cursor-pointer"
                          >
                            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 ${getMemberColor(getMemberName(expense.paidBy))}`}>
                              {getMemberName(expense.paidBy).substring(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              {editingExpenseId === expense.id && editingField === 'title' ? (
                                <form
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    handleSaveInlineEdit(expense, 'title', editingValue);
                                  }}
                                  className="flex items-center gap-2 mt-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <input
                                    type="text"
                                    value={editingValue}
                                    onChange={(e) => setEditingValue(e.target.value)}
                                    className="px-2 py-1 bg-slate-900/90 border border-primary/30 rounded-lg text-xs font-semibold text-slate-100 max-w-sm flex-1 font-sans"
                                    autoFocus
                                    required
                                  />
                                  <button type="submit" className="p-1 text-emerald-400 hover:bg-white/5 rounded-lg">
                                    <Check className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingExpenseId(null);
                                      setEditingField(null);
                                    }}
                                    className="p-1 text-slate-400 hover:bg-white/5 rounded-lg"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </form>
                              ) : (
                                <h4
                                  onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    setEditingExpenseId(expense.id);
                                    setEditingField('title');
                                    setEditingValue(expense.title);
                                  }}
                                  className="font-extrabold text-slate-200 text-base leading-snug group-hover:text-primary transition truncate pr-8 cursor-text"
                                  title="Double click to edit title inline"
                                >
                                  {expense.title}
                                </h4>
                              )}

                              {editingExpenseId === expense.id && editingField === 'description' ? (
                                <form
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    handleSaveInlineEdit(expense, 'description', editingValue);
                                  }}
                                  className="flex items-center gap-2 mt-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <input
                                    type="text"
                                    value={editingValue}
                                    onChange={(e) => setEditingValue(e.target.value)}
                                    className="px-2 py-1 bg-slate-900/90 border border-primary/30 rounded-lg text-xs font-semibold text-slate-100 max-w-sm flex-1 font-sans"
                                    autoFocus
                                  />
                                  <button type="submit" className="p-1 text-emerald-400 hover:bg-white/5 rounded-lg">
                                    <Check className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingExpenseId(null);
                                      setEditingField(null);
                                    }}
                                    className="p-1 text-slate-400 hover:bg-white/5 rounded-lg"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </form>
                              ) : (
                                <p
                                  onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    setEditingExpenseId(expense.id);
                                    setEditingField('description');
                                    setEditingValue(cleanDescription || '');
                                  }}
                                  className="text-slate-500 text-xs mt-0.5 truncate pr-8 cursor-text"
                                  title="Double click to edit description inline"
                                >
                                  {cleanDescription || <span className="italic opacity-40">No description (Double click to add)</span>}
                                </p>
                              )}

                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-slate-550 text-[10px] font-bold">
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3.5 h-3.5" />
                                  {new Date(expense.createdAt).toLocaleDateString()}
                                </span>
                                <span>•</span>
                                <span>
                                  Sponsored by <span className="text-slate-400 font-bold">{isPayer ? 'you' : getMemberName(expense.paidBy)}</span>
                                </span>
                                {history.length > 0 && (
                                  <>
                                    <span>•</span>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setExpandedHistoryId(expandedHistoryId === expense.id ? null : expense.id);
                                      }}
                                      className="text-primary hover:underline font-bold"
                                    >
                                      Edited (v{history.length + 1})
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex sm:flex-col items-end justify-between w-full sm:w-auto border-t sm:border-t-0 border-white/5 pt-3.5 sm:pt-0 shrink-0">
                            <div>
                              <p className="text-slate-500 text-[9px] font-bold uppercase tracking-wider text-right">Total Amount</p>
                              <p className="text-base font-outfit font-semibold text-slate-200 mt-0.5">₹{totalExpenseAmt.toFixed(2)}</p>
                            </div>
                            <div className="sm:mt-2 text-right">
                              {isPayer ? (
                                <div>
                                  <p className="text-slate-500 text-[8px] font-bold uppercase tracking-wider">You Covered</p>
                                  <p className="text-emerald-400 text-xs font-outfit font-semibold mt-0.5">
                                    ₹{(totalExpenseAmt - owedVal).toFixed(2)}
                                  </p>
                                </div>
                              ) : (
                                <div>
                                  <p className="text-slate-500 text-[8px] font-bold uppercase tracking-wider">Your Share</p>
                                  <p className="text-amber-400 text-xs font-outfit font-semibold mt-0.5">
                                    {owedVal > 0 ? `₹${owedVal.toFixed(2)}` : '—'}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Inline Version History Display */}
                        {expandedHistoryId === expense.id && history.length > 0 && (
                          <div className="mt-3 bg-slate-950/40 border border-white/5 rounded-xl p-3.5 space-y-2 text-xs font-sans" onClick={(e) => e.stopPropagation()}>
                            <p className="font-extrabold text-slate-200">Version History</p>
                            <div className="space-y-2 pl-2 border-l border-white/10">
                              {history.map((h: any, idx: number) => (
                                <div key={idx} className="text-[11px] text-slate-400 leading-relaxed">
                                  <span className="font-bold text-slate-355">v{h.version}</span> -{' '}
                                  {new Date(h.timestamp).toLocaleDateString()} by{' '}
                                  <span className="text-slate-300 font-semibold">{h.editedByName}</span>:{' '}
                                  Changed <span className="italic font-mono text-primary">{h.field}</span> from "{h.oldValue}" to "{h.newValue}"
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Interactive Fairness Explainer Trigger */}
                        <div className="mt-3.5 pt-3 border-t border-white/[0.03] flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 text-[10px] font-bold text-slate-500">
                          <button
                            onClick={() => setExpandedFairnessId(expandedFairnessId === expense.id ? null : expense.id)}
                            className="flex items-center justify-center sm:justify-start gap-1.5 text-primary hover:text-primary-light transition hover:cursor-pointer p-1 rounded hover:bg-primary/5 border border-transparent hover:border-primary/10 w-full sm:w-auto text-center sm:text-left"
                          >
                            <Info className="w-3.5 h-3.5 text-primary shrink-0" />
                            <span>Why is my share ₹{owedVal.toFixed(0)}? (Fairness breakdown)</span>
                          </button>
 
                          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveExpenseChatId(expense.id);
                              }}
                              className="flex-1 sm:flex-initial px-2.5 py-1.5 rounded-lg bg-slate-800/90 border border-white/10 text-slate-450 hover:text-primary text-[10px] font-bold hover:cursor-pointer hover:border-primary/30 transition whitespace-nowrap text-center"
                            >
                              Discuss Chat
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteExpense(expense);
                              }}
                              className="flex-1 sm:flex-initial px-2.5 py-1.5 rounded-lg bg-red-950/20 border border-red-500/15 text-red-400 hover:bg-red-500 hover:text-white text-[10px] font-bold hover:cursor-pointer transition whitespace-nowrap text-center"
                            >
                              Delete
                            </button>
                          </div>
                        </div>

                        {/* Fairness Engine Explainer Bubble */}
                        {expandedFairnessId === expense.id && (() => {
                          const expSplitType = expense.splits[0]?.splitType || 'equal';
                          const totalShares = expense.splits.reduce((acc, s) => acc + (parseFloat(s.shareCount || '0') || 0), 0);
                          
                          return (
                            <div className="mt-3 bg-slate-950/70 border border-white/5 rounded-xl p-3.5 space-y-2.5 text-slate-400 text-xs leading-relaxed animate-slide-up">
                              <p className="font-extrabold text-slate-200 flex items-center gap-1.5">
                                <span className="text-xs">⚖️</span>
                                Fairness Engine Explainer
                              </p>
                              <p>
                                You are sharing in this contribution because <span className="text-slate-200 font-semibold">{getMemberName(expense.paidBy)}</span> sponsored a total of <span className="font-outfit font-semibold text-slate-100">₹{totalExpenseAmt.toFixed(2)}</span>.
                              </p>
                              
                              {expSplitType === 'equal' && (
                                <>
                                  <p>
                                    An <strong>Equal split</strong> was applied across {expense.splits.length} participants: {expense.splits.map(s => getMemberName(s.userId)).join(', ')}.
                                  </p>
                                  <p>
                                    Math: <span className="font-outfit text-primary font-bold">₹{totalExpenseAmt.toFixed(2)} / {expense.splits.length} = ₹{(totalExpenseAmt / expense.splits.length).toFixed(2)}</span> per participant share. No hidden marks.
                                  </p>
                                </>
                              )}

                              {expSplitType === 'unequal' && (
                                <>
                                  <p>
                                    A <strong>Custom Share split</strong> was applied across {expense.splits.length} participants:
                                  </p>
                                  <div className="pl-3.5 border-l border-white/10 space-y-1.5 text-slate-350">
                                    {expense.splits.map((s) => (
                                      <p key={s.id}>
                                        • {getMemberName(s.userId)} owes <span className="font-outfit font-bold text-slate-200">₹{parseFloat(s.amount).toFixed(2)}</span>
                                      </p>
                                    ))}
                                  </div>
                                  <p>
                                    Math: Your share is specified as <span className="font-outfit text-primary font-bold">₹{owedVal.toFixed(2)}</span> of the total <span className="font-outfit text-slate-200 font-bold">₹{totalExpenseAmt.toFixed(2)}</span>. No hidden marks.
                                  </p>
                                </>
                              )}

                              {expSplitType === 'percentage' && (
                                <>
                                  <p>
                                    A <strong>Percentage split</strong> was applied across {expense.splits.length} participants:
                                  </p>
                                  <div className="pl-3.5 border-l border-white/10 space-y-1.5 text-slate-350">
                                    {expense.splits.map((s) => (
                                      <p key={s.id}>
                                        • {getMemberName(s.userId)}: <span className="font-outfit font-bold text-slate-200">{s.percentage}%</span> (₹{parseFloat(s.amount).toFixed(2)})
                                      </p>
                                    ))}
                                  </div>
                                  <p>
                                    Math: <span className="font-outfit text-primary font-bold">₹{totalExpenseAmt.toFixed(2)} × {userSplit?.percentage}% = ₹{owedVal.toFixed(2)}</span>. No hidden marks.
                                  </p>
                                </>
                              )}

                              {expSplitType === 'share' && (
                                <>
                                  <p>
                                    A <strong>Portion split</strong> was applied across {expense.splits.length} participants:
                                  </p>
                                  <div className="pl-3.5 border-l border-white/10 space-y-1.5 text-slate-350">
                                    {expense.splits.map((s) => (
                                      <p key={s.id}>
                                        • {getMemberName(s.userId)}: <span className="font-outfit font-bold text-slate-200">{s.shareCount} portions</span> (₹{parseFloat(s.amount).toFixed(2)})
                                      </p>
                                    ))}
                                  </div>
                                  <p>
                                    Math: Total portions = <span className="font-outfit text-slate-200 font-bold">{totalShares}</span>. Your share = <span className="font-outfit text-primary font-bold">₹{totalExpenseAmt.toFixed(2)} × ({userSplit?.shareCount} / {totalShares}) = ₹{owedVal.toFixed(2)}</span>. No hidden marks.
                                  </p>
                                </>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Trash Buffer Section */}
              {deletedExpenses.length > 0 && (
                <div className="mt-8 pt-6 border-t border-white/5 space-y-4">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 font-outfit">
                    <Trash2 className="w-3.5 h-3.5 text-slate-500" />
                    Recently Deleted Buffer (7 Days)
                  </h4>
                  <div className="space-y-3">
                    {deletedExpenses.map((expense) => {
                      const trashData = parseTrashDescription(expense.description);
                      if (!trashData) return null;
                      
                      return (
                        <div key={expense.id} className="glass rounded-xl p-4 border border-red-500/10 bg-red-950/5 flex justify-between items-center text-xs font-sans">
                          <div>
                            <p className="font-bold text-slate-300">{trashData.title}</p>
                            <p className="text-[9px] text-slate-555 mt-0.5 font-semibold">
                              Original Amount: ₹{parseFloat(trashData.amount).toFixed(2)} • Paid by {getMemberName(trashData.paidBy)}
                            </p>
                          </div>
                          <button
                            onClick={() => handleRestoreExpense(expense.id, trashData)}
                            className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-[10px] font-bold hover:bg-emerald-500 hover:text-obsidian transition hover:cursor-pointer font-outfit"
                          >
                            Restore
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Shares visualizer */}
          {activeTab === 'balances' && balances && (
            <div className="space-y-6 animate-fade-in" id="panel-balances">
              {/* Ledger Balance Parity Check */}
              {(() => {
                const balanceSum = Object.values(balances.netBalances).reduce((sum, bal) => sum + bal, 0);
                const isParityVerified = Math.abs(balanceSum) < 0.01;
                return (
                  <div className="flex justify-between items-center bg-obsidian-card-bg border border-white/5 rounded-2xl p-4 shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                      </span>
                      <div className="text-left">
                        <h5 className="text-xs font-bold text-slate-200">Ledger Balance Parity</h5>
                        <p className="text-[10px] text-slate-400 font-semibold tracking-wide">
                          &Sigma; net balances = {balanceSum >= 0 ? '+' : ''}₹{balanceSum.toFixed(2)} (Target: &plusmn;₹0.00)
                        </p>
                      </div>
                    </div>
                    <div>
                      {isParityVerified ? (
                        <span className="text-[10px] font-bold text-emerald-400 border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1 rounded-lg">
                          Parity Integrity Verified
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-red-400 border border-red-500/20 bg-red-500/5 px-2.5 py-1 rounded-lg">
                          Parity Mismatch Detected
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}
              {balances.simplifiedTransactions.length === 0 ? (
                <div className="zero-balance-ceremony glass-card rounded-2xl p-10 text-center border border-primary/20 relative overflow-hidden">
                  <div className="relative w-16 h-16 mx-auto mb-5">
                    <div className="absolute inset-0 rounded-full border-2 border-primary/30 animate-ping" style={{ animationDuration: '2s' }} />
                    <div className="absolute inset-1 rounded-full border-2 border-primary/50" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7">
                        <path
                          className="checkmark-path"
                          d="M5 13l4 4L19 7"
                          stroke="#3DFFD3"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  </div>
                  <p className="text-xl font-bold text-slate-100 tracking-tight">All Shares Resolved.</p>
                  <p className="text-slate-500 text-xs mt-2 max-w-xs mx-auto leading-relaxed">
                    Every balance in <span className="text-slate-350 font-semibold">{cleanName}</span> is completely resolved. Excellent!
                  </p>
                  <div className="flex items-center justify-center gap-3 mt-6">
                    <button
                      onClick={() => setActiveTab('settlements')}
                      className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/8 text-slate-400 hover:text-slate-200 text-xs font-bold border border-white/8 transition hover:cursor-pointer btn-magnetic font-outfit"
                    >
                      View History
                    </button>
                    <button
                      onClick={() => setShowExpenseModal(true)}
                      className="px-4 py-2 rounded-xl bg-primary/10 hover:bg-primary/15 text-primary text-xs font-bold border border-primary/20 transition hover:cursor-pointer btn-magnetic font-outfit"
                    >
                      Log Contribution
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                  {/* Suggested Resolutions */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-outfit">Suggested Resolutions</h4>
                    <div className="space-y-3">
                      {balances.simplifiedTransactions.map((tx, idx) => (
                        <div
                          key={idx}
                          className="glass-card rounded-2xl p-5 border border-white/5 flex flex-col justify-between gap-4 relative overflow-hidden animate-slide-up hover:border-white/10 transition-all duration-300 card-glow-theme btn-magnetic"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div 
                                onClick={() => {
                                  setRelUserId(tx.from);
                                  setRelUserName(tx.fromName);
                                  setRelModalOpen(true);
                                }}
                                className={`w-8 h-8 rounded-lg border flex items-center justify-center font-bold text-[10px] hover:cursor-pointer hover:brightness-110 shrink-0 ${getMemberColor(tx.fromName)}`}
                              >
                                {tx.fromName.substring(0, 2).toUpperCase()}
                              </div>
                              <span className="text-xs font-bold text-slate-200 truncate max-w-20">{tx.fromName}</span>
                            </div>

                            <div className="flex flex-col items-center flex-1 px-1">
                              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">Outstanding Share</span>
                              <div className="w-full flex items-center gap-0.5 mt-1">
                                <div className="h-0.5 flex-1 bg-white/10" />
                                <ArrowRight className="w-3.5 h-3.5 text-primary shrink-0" />
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-200 truncate max-w-20">{tx.toName}</span>
                              <div 
                                onClick={() => {
                                  setRelUserId(tx.to);
                                  setRelUserName(tx.toName);
                                  setRelModalOpen(true);
                                }}
                                className={`w-8 h-8 rounded-lg border flex items-center justify-center font-bold text-[10px] hover:cursor-pointer hover:brightness-110 shrink-0 ${getMemberColor(tx.toName)}`}
                              >
                                {tx.toName.substring(0, 2).toUpperCase()}
                              </div>
                            </div>
                          </div>

                          <div className="text-[11px] text-slate-400 bg-white/[0.02] border border-white/5 rounded-xl px-3 py-2 text-center leading-relaxed">
                            {tx.from === user?.id ? (
                              <span>You and <span className="text-slate-200 font-semibold">{tx.toName}</span> have a <span className="text-amber-400 font-semibold font-outfit">₹{tx.amount.toFixed(2)}</span> outstanding share</span>
                            ) : tx.to === user?.id ? (
                              <span><span className="text-slate-200 font-semibold">{tx.fromName}</span> and you have a <span className="text-emerald-400 font-semibold font-outfit">₹{tx.amount.toFixed(2)}</span> outstanding share</span>
                            ) : (
                              <span><span className="text-slate-350">{tx.fromName}</span> and <span className="text-slate-350">{tx.toName}</span> have a <span className="font-outfit font-semibold">₹{tx.amount.toFixed(2)}</span> outstanding share</span>
                            )}
                          </div>

                          <div className="flex justify-between items-center pt-3 border-t border-white/5">
                            <span className="text-emerald-400 font-outfit font-semibold text-base">₹{tx.amount.toFixed(2)}</span>
                            {(tx.from === user?.id || tx.to === user?.id) && (
                              <button
                                onClick={() => setShowSettlementModal(true)}
                                className="px-3.5 py-2 bg-primary/10 hover:bg-primary text-primary hover:text-obsidian rounded-xl text-[9px] font-extrabold uppercase tracking-wider border border-primary/20 hover:cursor-pointer transition btn-magnetic font-outfit"
                              >
                                Resolve
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Explain My Balance Engine */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-outfit">Explain My Balance</h4>
                    <div className="glass-card rounded-2xl p-5 border border-white/5 space-y-4 shadow-lg">
                      <div className="flex justify-between items-center pb-3 border-b border-white/5">
                        <span className="text-xs font-bold text-slate-300">Your Share Breakdown</span>
                        {(() => {
                          const myBal = balances.netBalances[user?.id || ''] || 0;
                          return (
                            <span className={`font-outfit font-extrabold text-sm ${myBal > 0.005 ? 'text-emerald-400' : myBal < -0.005 ? 'text-red-400' : 'text-slate-400'}`}>
                              {myBal > 0.005 ? `+₹${myBal.toFixed(2)}` : myBal < -0.005 ? `-₹${Math.abs(myBal).toFixed(2)}` : 'Settle'}
                            </span>
                          );
                        })()}
                      </div>

                      <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                        {(() => {
                          const breakdown = getMyBalanceBreakdown();
                          if (breakdown.length === 0) {
                            return <p className="text-slate-500 text-xs italic">No transactions affecting your share yet.</p>;
                          }
                          return breakdown.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center text-xs py-1 border-b border-white/[0.02] last:border-b-0">
                              <div className="pr-4">
                                <p className="font-bold text-slate-350">{item.title}</p>
                                <p className="text-[9px] text-slate-555 mt-0.5">{item.subtitle}</p>
                              </div>
                              <span className={`font-outfit font-bold shrink-0 ${item.amount > 0 ? 'text-emerald-400' : 'text-red-450'}`}>
                                {item.amount > 0 ? `+₹${item.amount.toFixed(2)}` : `-₹${Math.abs(item.amount).toFixed(2)}`}
                              </span>
                            </div>
                          ));
                        })()}
                      </div>
                      <div className="pt-3 border-t border-white/5 flex justify-end shrink-0">
                        <button
                          onClick={() => setShowExplainersModal(true)}
                          className="text-xs text-primary hover:text-primary-light font-extrabold flex items-center gap-1 hover:cursor-pointer transition duration-150"
                        >
                          View Interactive Math Trace &rarr;
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Timeline tab (renders milestones + moments + contributions) */}
          {activeTab === 'timeline' && (
            <div className="space-y-2 animate-fade-in" id="panel-timeline">
              <GroupTimeline
                events={[
                  ...activeExpenses.map(exp => {
                    const isMilestone = parseFloat(exp.amount) === 0;
                    const isMoment = exp.title.startsWith('📸');
                    return {
                      id: `exp-${exp.id}`,
                      type: isMilestone ? (isMoment ? 'moment' as const : 'milestone' as const) : 'expense' as const,
                      title: exp.title,
                      subtitle: isMilestone 
                        ? `Logged by ${getMemberName(exp.paidBy)}` 
                        : `Sponsored by ${exp.paidBy === user?.id ? 'you' : getMemberName(exp.paidBy)} · ${exp.splits.length} split${exp.splits.length !== 1 ? 's' : ''}`,
                      amount: parseFloat(exp.amount),
                      amountColor: exp.paidBy === user?.id ? 'green' : 'amber' as 'green' | 'amber',
                      timestamp: exp.createdAt,
                      isCurrentUser: exp.paidBy === user?.id,
                    };
                  }),
                  ...settlements.map(s => ({
                    id: `settle-${s.id}`,
                    type: 'settlement' as const,
                    title: `${s.payerId === user?.id ? 'You' : getMemberName(s.payerId)} resolved with ${s.receiverId === user?.id ? 'you' : getMemberName(s.receiverId)}`,
                    subtitle: 'Resolution recorded',
                    amount: parseFloat(s.amount),
                    amountColor: 'blue' as 'blue',
                    timestamp: s.createdAt,
                    isCurrentUser: s.payerId === user?.id || s.receiverId === user?.id,
                  })),
                ]}
              />
            </div>
          )}

          {/* TAB 4: Resolutions History tab */}
          {activeTab === 'settlements' && (
            <div className="space-y-4 animate-fade-in" id="panel-settlements">
              {settlements.length === 0 ? (
                <div className="glass rounded-xl p-8 text-center text-slate-550 text-xs border border-white/[0.02] bg-slate-900/10">
                  No resolutions recorded yet in this experience.
                </div>
              ) : (
                <div className="space-y-3">
                  {settlements.map((settlement) => {
                    const isPayer = settlement.payerId === user?.id;
                    const isReceiver = settlement.receiverId === user?.id;

                    return (
                      <div
                        key={settlement.id}
                        className="glass rounded-xl p-4 border border-white/5 hover:border-white/10 transition flex justify-between items-center"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl">
                            <Check className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-200">
                              {isPayer ? 'You' : getMemberName(settlement.payerId)} resolved with{' '}
                              {isReceiver ? 'you' : getMemberName(settlement.receiverId)}
                            </p>
                            <p className="text-[10px] text-slate-500 mt-1 font-semibold">
                              {new Date(settlement.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <span className="text-emerald-400 font-outfit font-semibold text-sm">
                          ₹{parseFloat(settlement.amount).toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: Wrapped Insights tab */}
          {activeTab === 'insights' && (
            <div className="space-y-6 animate-fade-in" id="panel-insights">
              {(() => {
                const totalSpentNum = financialExpenses.reduce((acc, exp) => acc + (parseFloat(exp.amount) || 0), 0);
                
                // Top Spender Calculation
                const spenderMap: Record<string, number> = {};
                financialExpenses.forEach(exp => {
                  spenderMap[exp.paidBy] = (spenderMap[exp.paidBy] || 0) + (parseFloat(exp.amount) || 0);
                });
                let topSpenderId = '';
                let maxSpend = 0;
                Object.keys(spenderMap).forEach(id => {
                  if (spenderMap[id] > maxSpend) {
                    maxSpend = spenderMap[id];
                    topSpenderId = id;
                  }
                });
                const topSpenderName = members.find(m => m.userId === topSpenderId)?.user.name || 'No one';

                // Largest Single Expense
                let largestExpense: Expense | null = null;
                financialExpenses.forEach(exp => {
                  if (!largestExpense || (parseFloat(exp.amount) || 0) > (parseFloat(largestExpense.amount) || 0)) {
                    largestExpense = exp;
                  }
                });
                const largestExpensePayer = largestExpense
                  ? (members.find(m => m.userId === (largestExpense as Expense).paidBy)?.user.name || 'Someone')
                  : '';

                // Category Breakdowns via Title Emojis
                let travelSum = 0;
                let foodSum = 0;
                let lodgingSum = 0;
                let entSum = 0;
                let shopSum = 0;
                let otherSum = 0;

                financialExpenses.forEach(exp => {
                  const titleClean = exp.title.toLowerCase();
                  const amt = parseFloat(exp.amount) || 0;
                  if (titleClean.includes('✈️') || titleClean.includes('travel')) {
                    travelSum += amt;
                  } else if (titleClean.includes('🍔') || titleClean.includes('food')) {
                    foodSum += amt;
                  } else if (titleClean.includes('🏨') || titleClean.includes('stay')) {
                    lodgingSum += amt;
                  } else if (titleClean.includes('🚗') || titleClean.includes('transport')) {
                    travelSum += amt; // map transport to travel allocation
                  } else if (titleClean.includes('🎟️') || titleClean.includes('activities')) {
                    entSum += amt;
                  } else if (titleClean.includes('🛒') || titleClean.includes('shopping')) {
                    shopSum += amt;
                  } else {
                    otherSum += amt;
                  }
                });

                const categories = [
                  { name: 'Food & Dining 🍔', amount: foodSum, color: 'from-emerald-500 to-teal-400', pct: totalSpentNum > 0 ? (foodSum / totalSpentNum) * 100 : 0 },
                  { name: 'Travel & Transport ✈️', amount: travelSum, color: 'from-blue-500 to-indigo-400', pct: totalSpentNum > 0 ? (travelSum / totalSpentNum) * 100 : 0 },
                  { name: 'Lodging & Stay 🏨', amount: lodgingSum, color: 'from-amber-500 to-orange-400', pct: totalSpentNum > 0 ? (lodgingSum / totalSpentNum) * 100 : 0 },
                  { name: 'Activities & Entertainment 🎟️', amount: entSum, color: 'from-purple-500 to-pink-400', pct: totalSpentNum > 0 ? (entSum / totalSpentNum) * 100 : 0 },
                  { name: 'Shopping 🛒', amount: shopSum, color: 'from-pink-500 to-rose-400', pct: totalSpentNum > 0 ? (shopSum / totalSpentNum) * 100 : 0 },
                  { name: 'Other / Misc 📦', amount: otherSum, color: 'from-slate-500 to-slate-400', pct: totalSpentNum > 0 ? (otherSum / totalSpentNum) * 100 : 0 },
                ].sort((a, b) => b.amount - a.amount);

                if (financialExpenses.length === 0) {
                  return (
                    <div className="glass-card rounded-2xl p-12 text-center border border-dashed border-white/8">
                      <Sparkles className="w-8 h-8 text-slate-600 mx-auto mb-4 animate-pulse" />
                      <p className="text-slate-350 text-sm font-semibold">Workspace Analytics are warming up</p>
                      <p className="text-slate-550 text-xs mt-2 max-w-xs mx-auto leading-relaxed">
                        Log contribution shares to unlock category allocations and generate Spotify Wrapped-style relational story cards.
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-6">
                    {/* Wrapped Story Card Panel */}
                    <div className="glass-card rounded-2xl p-6 border border-white/5 relative overflow-hidden card-glow-theme">
                      <div className="absolute top-[-50%] right-[-20%] w-40 h-40 rounded-full bg-primary/5 blur-[40px] pointer-events-none" />
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
                          Experience Wrap Story
                        </h4>
                        <button
                          onClick={() => setShowWrappedModal(true)}
                          className="px-3 py-1.5 bg-primary/10 border border-primary/20 text-primary rounded-xl text-[10px] font-bold hover:bg-primary transition hover:cursor-pointer hover:text-obsidian flex items-center gap-1.5 btn-magnetic"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          <span>Generate Story Card</span>
                        </button>
                      </div>
                      <p className="text-sm font-medium text-slate-200 leading-relaxed font-sans">
                        This group has shared a total contribution budget of <span className="text-primary font-bold font-outfit">₹{totalSpentNum.toFixed(2)}</span>.
                        {' '}<span className="text-slate-100 font-bold">{topSpenderName}</span> has sponsored the most, covering <span className="text-primary font-bold font-outfit">₹{maxSpend.toFixed(2)}</span>.
                        {largestExpense && (
                          <>
                            {' '}The single largest log is "<span className="text-slate-100 font-bold">{(largestExpense as Expense).title}</span>" (<span className="text-primary font-bold font-outfit">₹{parseFloat((largestExpense as Expense).amount).toFixed(2)}</span>), covered by <span className="text-slate-100 font-bold">{largestExpensePayer}</span>.
                          </>
                        )}
                        {' '}So far, <span className="text-accent font-bold font-outfit">{settlementProgress}%</span> of outstanding shares have been resolved.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="glass-card rounded-2xl p-5 border border-white/5 flex items-center gap-4 relative overflow-hidden">
                        <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20 shrink-0">
                          <TrendingUp className="w-5 h-5" />
                        </div>
                        <div className="overflow-hidden">
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Top Sponsor</p>
                          <p className="text-sm font-bold text-slate-200 mt-1 truncate">{topSpenderName}</p>
                          <p className="text-xs text-slate-400 mt-0.5">Paid ₹{maxSpend.toFixed(0)}</p>
                        </div>
                      </div>

                      {largestExpense && (
                        <div className="glass-card rounded-2xl p-5 border border-white/5 flex items-center gap-4 relative overflow-hidden">
                          <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20 shrink-0">
                            <CreditCard className="w-5 h-5" />
                          </div>
                          <div className="overflow-hidden">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Largest Bill</p>
                            <p className="text-sm font-bold text-slate-200 mt-1 truncate">{(largestExpense as Expense).title}</p>
                            <p className="text-xs text-slate-400 mt-0.5">₹{parseFloat((largestExpense as Expense).amount).toFixed(0)} by {largestExpensePayer}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="glass-card rounded-2xl p-6 border border-white/5 space-y-5">
                      <h4 className="text-xs font-bold text-slate-200 uppercase tracking-widest flex items-center gap-2">
                        Category Allocation
                      </h4>

                      <div className="space-y-4">
                        {categories.map((cat, idx) => (
                          <div key={idx} className="space-y-1.5">
                            <div className="flex justify-between items-center text-xs">
                              <span className="font-semibold text-slate-355">{cat.name}</span>
                              <span className="font-outfit font-semibold text-slate-100 flex items-center gap-1.5">
                                <span>₹{cat.amount.toFixed(2)}</span>
                                <span className="text-[10px] text-slate-500">({cat.pct.toFixed(0)}%)</span>
                              </span>
                            </div>
                            <div className="w-full bg-white/4 rounded-full h-2 overflow-hidden border border-white/5">
                              <div
                                className={`bg-gradient-to-r ${cat.color} h-full rounded-full`}
                                style={{
                                  width: `${cat.pct}%`,
                                  transition: 'width 1s cubic-bezier(0.16,1,0.3,1) 0.1s'
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

        </div>

        {/* Right Column (Balances Sidebar, Health, and Members list) */}
        <div className="space-y-8">
          
          {/* Experience Health Card */}
          <div className="glass-card rounded-2xl p-5 border border-white/5 space-y-4 shadow-md">
            <h3 className="font-bold text-slate-200 text-xs uppercase tracking-widest flex items-center gap-2">
              <Heart className="w-4 h-4 text-rose-400 shrink-0" />
              Experience Health
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-2xl select-none">
                {settlementProgress > 75 ? '🟢' : settlementProgress > 35 ? '🟡' : '🟠'}
              </span>
              <div>
                <p className="text-xs font-bold text-slate-200">{healthState.label}</p>
                <p className="text-[9px] text-slate-500 font-bold mt-0.5 uppercase tracking-wide">Disputes: 0 Active</p>
              </div>
            </div>
            <div className="h-0.5 bg-white/5" />
            <div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-slate-500">
              <div>Contributions: <span className="text-slate-200 font-extrabold">{financialExpenses.length}</span></div>
              <div>Resolved Rate: <span className="text-primary font-extrabold">{settlementProgress}%</span></div>
            </div>
          </div>

          {/* Members Balances */}
          {balances && (
            <div className="glass-card rounded-2xl p-6 border border-white/5 space-y-5">
              <h3 className="font-bold text-slate-200 text-xs uppercase tracking-widest flex items-center gap-2">
                <Users className="w-4.5 h-4.5 text-blue-400" />
                Member Balances
              </h3>

              <div className="space-y-3">
                {members.map((member) => {
                  const bal = balances.netBalances[member.userId] || 0;
                  const isSelf = member.userId === user?.id;

                  return (
                    <div key={member.id} className="flex justify-between items-center text-xs">
                      <span className="text-slate-400 font-medium flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          bal > 0.005 ? 'bg-emerald-500' : bal < -0.005 ? 'bg-red-500' : 'bg-slate-700'
                        }`} />
                        {member.user.name} {isSelf && <span className="text-slate-600 font-bold">(You)</span>}
                      </span>
                      <span className={`font-outfit font-semibold ${
                        bal > 0.005 ? 'text-emerald-400' : bal < -0.005 ? 'text-red-400' : 'text-slate-650'
                      }`}>
                        {bal > 0.005 ? `+₹${bal.toFixed(2)}` : bal < -0.005 ? `-₹${Math.abs(bal).toFixed(2)}` : 'Settle'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Balance Flow Map */}
          {balances && members.length > 1 && (
            <div className="glass-card rounded-2xl p-5 border border-white/5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-200 text-xs uppercase tracking-widest flex items-center gap-2">
                  <svg className="w-4 h-4 text-primary" viewBox="0 0 16 16" fill="none">
                    <circle cx="3" cy="8" r="2" fill="currentColor" opacity="0.7"/>
                    <circle cx="13" cy="4" r="2" fill="currentColor"/>
                    <circle cx="13" cy="12" r="2" fill="currentColor" opacity="0.7"/>
                    <path d="M5 8h4M9 8l-1.5-2M9 8l-1.5 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                  Flow Map
                </h3>
                <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">Live</span>
              </div>
              <BalanceFlowMap
                nodes={members.map(m => ({
                  id: m.userId,
                  name: m.user.name,
                  netBalance: balances.netBalances[m.userId] || 0,
                }))}
                edges={balances.simplifiedTransactions.map(tx => ({
                  from: tx.from,
                  to: tx.to,
                  amount: tx.amount,
                  fromName: tx.fromName,
                  toName: tx.toName,
                }))}
                currentUserId={user?.id}
              />
            </div>
          )}

          {/* Members list */}
          <div className="glass-card rounded-2xl p-6 border border-white/5 space-y-5">
            <div className="flex justify-between items-center w-full gap-2">
              <h3 className="font-bold text-slate-200 text-xs uppercase tracking-widest flex items-center gap-2 mr-auto">
                <Users className="w-4.5 h-4.5 text-blue-400" />
                Friends ({members.length})
              </h3>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  id="btn-copy-group-id"
                  onClick={() => {
                    const inviteCode = group?.name?.match(/ \[invite:([A-Z0-9]+)\]/)?.[1] || groupId;
                    navigator.clipboard.writeText(inviteCode);
                    toast.success('Invite code copied to clipboard!');
                  }}
                  className="flex items-center gap-1 text-[10px] font-bold text-primary hover:text-primary-light transition hover:cursor-pointer p-1 rounded hover:bg-primary/5 border border-transparent hover:border-primary/10 font-outfit"
                  title={`Copy Invite Code (${group?.name?.match(/ \[invite:([A-Z0-9]+)\]/)?.[1] || groupId})`}
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Code</span>
                </button>
                <span className="text-slate-600 text-[10px]">•</span>
                <button
                  id="btn-copy-invite-link"
                  onClick={() => {
                    const inviteCode = group?.name?.match(/ \[invite:([A-Z0-9]+)\]/)?.[1] || groupId;
                    const inviteLink = `${window.location.origin}?join=${inviteCode}`;
                    navigator.clipboard.writeText(inviteLink);
                    toast.success('Invite link copied to clipboard!');
                  }}
                  className="flex items-center gap-1 text-[10px] font-bold text-accent hover:text-accent-light transition hover:cursor-pointer p-1 rounded hover:bg-accent/5 border border-transparent hover:border-accent/10 font-outfit"
                  title="Copy direct invite link for 1-click join"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Copy Link</span>
                </button>
              </div>
            </div>
            
            <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
              {members.map((member) => {
                const isImported = member.user.email?.endsWith('.import@splitsync.local') || member.user.email?.includes('@splitsync.local');
                return (
                  <div key={member.id} className="flex justify-between items-center">
                    <div className="flex items-center gap-2.5">
                      <div 
                        onClick={() => {
                          setRelUserId(member.userId);
                          setRelUserName(member.user.name);
                          setRelModalOpen(true);
                        }}
                        className={`w-7 h-7 rounded-lg border flex items-center justify-center font-bold text-[9px] hover:cursor-pointer hover:brightness-110 shrink-0 ${getMemberColor(member.user.name)}`}
                      >
                        {member.user.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p 
                          onClick={() => {
                            setRelUserId(member.userId);
                            setRelUserName(member.user.name);
                            setRelModalOpen(true);
                          }}
                          className="text-xs font-bold text-slate-200 hover:text-primary hover:cursor-pointer flex items-center gap-1.5"
                        >
                          <span className="truncate max-w-[100px] sm:max-w-[140px]" title={member.user.name}>{member.user.name}</span>
                          {isImported && (
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                              Imported
                            </span>
                          )}
                        </p>
                        <p className="text-[8px] text-slate-555 uppercase tracking-widest font-bold mt-0.5">
                          {member.leftAt ? `Left Group (${new Date(member.leftAt).toLocaleDateString()})` : member.role}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {isImported && (
                        <button
                          onClick={() => handleInviteAndMerge(member)}
                          className="flex items-center gap-1 px-2 py-1 text-amber-400 hover:text-amber-300 transition hover:cursor-pointer rounded-lg bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/15 hover:border-amber-500/30 text-[9px] font-bold"
                          title={`Copy invite link for ${member.user.name}`}
                        >
                          <UserPlus className="w-3 h-3 shrink-0" />
                          <span className="hidden sm:inline">Send Invite</span>
                        </button>
                      )}
                      {isCreator && member.userId !== user?.id && !member.leftAt && (
                        <button
                          id={`btn-member-remove-${member.userId}`}
                          onClick={() => handleRemoveMember(member.userId, member.user.name)}
                          className="p-1 text-slate-500 hover:text-red-405 transition hover:cursor-pointer"
                          title="Remove member"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pending CSV Invites */}
            {unregisteredMembers.length > 0 && (
              <div className="pt-4 border-t border-white/5 space-y-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                  <UserPlus className="w-3.5 h-3.5 text-amber-400" />
                  Pending CSV Invites
                </p>
                <div className="space-y-2.5 max-h-40 overflow-y-auto pr-1">
                  {unregisteredMembers.map((unreg) => (
                    <div key={unreg.id} className="flex justify-between items-center bg-white/2 rounded-lg p-2 border border-white/5">
                      <div>
                        <p className="text-xs font-bold text-slate-200">
                          {unreg.display_name}
                        </p>
                        {unreg.real_email ? (
                          <p className="text-[9px] text-slate-400 font-mono">
                            {unreg.real_email}
                          </p>
                        ) : (
                          <p className="text-[9px] text-amber-500/80 italic">
                            Awaiting email invite
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleSendInviteToUnregistered(unreg)}
                        className="flex items-center gap-1 px-2 py-1 text-amber-400 hover:text-amber-300 transition hover:cursor-pointer rounded-lg bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/15 hover:border-amber-500/30 text-[9px] font-bold"
                        title={`Send invite to ${unreg.display_name}`}
                      >
                        <UserPlus className="w-3 h-3 shrink-0" />
                        <span>{unreg.real_email ? 'Resend' : 'Invite'}</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Invite Form */}
            <form onSubmit={handleInvite} className="pt-4 border-t border-white/5 space-y-3 relative" id="form-invite-member">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Invite Friend</p>
              <div className="flex gap-2 relative">
                <div className="flex-1 relative">
                  <input
                    id="input-member-invite-email"
                    type="text"
                    placeholder="Name, email, or @username"
                    value={inviteEmail}
                    onChange={(e) => {
                      setInviteEmail(e.target.value);
                      setShowFriendsDropdown(true);
                    }}
                    onFocus={() => setShowFriendsDropdown(true)}
                    onBlur={() => setTimeout(() => setShowFriendsDropdown(false), 200)}
                    className="w-full px-3 py-2 rounded-xl glass-input text-xs font-semibold"
                    required
                  />
                  {showFriendsDropdown && filteredFriends.length > 0 && (
                    <div className="absolute left-0 right-0 bottom-full mb-1 bg-slate-950/90 border border-white/10 rounded-xl max-h-40 overflow-y-auto z-50 shadow-2xl backdrop-blur-md">
                      {filteredFriends.map((friend) => (
                        <div
                          key={friend.id}
                          onClick={() => {
                            setInviteEmail(friend.email);
                            setShowFriendsDropdown(false);
                          }}
                          className="px-3 py-2 text-xs text-slate-300 hover:text-slate-100 hover:bg-white/5 cursor-pointer flex justify-between items-center"
                        >
                          <div className="font-bold">{friend.name}</div>
                          <div className="text-[10px] text-slate-500">{friend.email}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  id="btn-member-invite-submit"
                  type="submit"
                  disabled={inviting}
                  className="px-3.5 py-2 bg-gradient-to-r from-primary to-accent hover:brightness-110 text-obsidian rounded-xl text-xs font-extrabold transition flex items-center justify-center gap-1 shrink-0 hover:cursor-pointer btn-magnetic font-outfit"
                >
                  {inviting ? (
                    <span className="w-3.5 h-3.5 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin"></span>
                  ) : (
                    <>
                      <UserPlus className="w-3.5 h-3.5 text-obsidian" /> Invite
                    </>
                  )}
                </button>
              </div>
              {inviteSuccess && (
                <p className="text-emerald-400 text-[9px] font-bold flex items-center gap-1 animate-fade-in">
                  <Check className="w-3 h-3" /> Invitation recorded successfully!
                </p>
              )}
            </form>
          </div>
        </div>

      </div>

      {/* Add Contribution Modal */}
      {showExpenseModal && (
        <ExpenseModal
          groupId={groupId}
          members={members.map((m) => ({
            id: m.userId,
            name: m.user.name,
            email: m.user.email,
            joinedAt: m.joinedAt,
            leftAt: m.leftAt,
          }))}
          expenses={expenses}
          onClose={(shouldRefresh) => {
            setShowExpenseModal(false);
            if (shouldRefresh) loadGroupData();
          }}
          baseCurrency={group?.baseCurrency || 'INR'}
        />
      )}

      {/* Mark Resolution Modal */}
      {showSettlementModal && (
        <SettlementModal
          groupId={groupId}
          members={members.map((m) => ({
            id: m.userId,
            name: m.user.name,
            email: m.user.email,
            joinedAt: m.joinedAt,
            leftAt: m.leftAt,
          }))}
          defaultDebts={balances?.simplifiedTransactions || []}
          onClose={(shouldRefresh) => {
            setShowSettlementModal(false);
            if (shouldRefresh) loadGroupData();
          }}
          baseCurrency={group?.baseCurrency || 'INR'}
        />
      )}

      {/* Import CSV Modal */}
      {showCSVImportModal && (
        <CSVImportModal
          groupId={groupId}
          members={members.map((m) => ({
            id: m.userId,
            name: m.user.name,
            email: m.user.email,
            joinedAt: m.joinedAt,
            leftAt: m.leftAt,
          }))}
          onClose={(shouldRefresh) => {
            setShowCSVImportModal(false);
            if (shouldRefresh) loadGroupData();
          }}
          baseCurrency={group?.baseCurrency || 'INR'}
        />
      )}

      {/* Explainers Modal */}
      {showExplainersModal && (
        <ExplainersModal
          onClose={() => setShowExplainersModal(false)}
          members={members.map((m) => ({
            id: m.userId,
            name: m.user.name,
            email: m.user.email,
            joinedAt: m.joinedAt,
            leftAt: m.leftAt,
          }))}
          expenses={expenses.map(e => ({
            id: e.id,
            title: e.title,
            amount: e.amount,
            paidBy: e.paidBy,
            createdAt: e.createdAt,
            currencyCode: e.currencyCode,
            exchangeRate: e.exchangeRate,
            splits: e.splits.map(s => ({
              userId: s.userId,
              amount: s.amount,
              splitType: s.splitType
            }))
          }))}
          settlements={settlements.map(s => ({
            id: s.id,
            amount: s.amount,
            payerId: s.payerId,
            receiverId: s.receiverId,
            createdAt: s.createdAt,
            currencyCode: s.currencyCode,
            exchangeRate: s.exchangeRate
          }))}
          baseCurrency={group?.baseCurrency || 'INR'}
        />
      )}

      {/* Contribution Chat Dialog */}
      {activeExpenseChatId && (
        <ExpenseChat
          expenseId={activeExpenseChatId}
          members={members.map((m) => m.user)}
          onClose={() => {
            setActiveExpenseChatId(null);
            loadGroupData();
          }}
        />
      )}

      {/* Log Milestone / Moment Modal */}
      {showMilestoneModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-md rounded-2xl p-6 border border-white/10 shadow-2xl animate-in fade-in zoom-in-95 duration-200 card-glow-theme">
            <h3 className="text-lg font-bold text-slate-100 mb-2 flex items-center gap-2">
              <Camera className="w-5 h-5 text-primary" />
              Log Timeline Memory
            </h3>
            <p className="text-xs text-slate-400 mb-4">Add non-financial milestones or moments to enrich your experience vault.</p>
            <form onSubmit={handleSaveMilestone} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase tracking-widest">Type</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setMilestoneType('milestone')}
                    className={`flex-1 py-2 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1 hover:cursor-pointer btn-magnetic ${
                      milestoneType === 'milestone'
                        ? 'bg-primary/10 border-primary text-primary shadow-[0_0_12px_rgba(61,255,211,0.15)]'
                        : 'bg-white/3 border-white/5 text-slate-400'
                    }`}
                  >
                    <Flag className="w-3.5 h-3.5" /> Milestone
                  </button>
                  <button
                    type="button"
                    onClick={() => setMilestoneType('moment')}
                    className={`flex-1 py-2 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1 hover:cursor-pointer btn-magnetic ${
                      milestoneType === 'moment'
                        ? 'bg-primary/10 border-primary text-primary shadow-[0_0_12px_rgba(61,255,211,0.15)]'
                        : 'bg-white/3 border-white/5 text-slate-400'
                    }`}
                  >
                    <Camera className="w-3.5 h-3.5" /> Moment / Photo
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1.5 uppercase tracking-widest">
                  Memory Description
                </label>
                <input
                  type="text"
                  placeholder={milestoneType === 'moment' ? 'e.g. Sunset at Baga Beach' : 'e.g. Flight tickets booked'}
                  value={milestoneName}
                  onChange={(e) => setMilestoneName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl glass-input text-xs font-semibold"
                  required
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowMilestoneModal(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-350 text-xs font-bold border border-white/5 hover:cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingMilestone}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-primary to-accent hover:brightness-110 disabled:opacity-50 text-obsidian text-xs font-extrabold flex items-center gap-1 shadow-lg shadow-primary/20 hover:cursor-pointer btn-magnetic font-outfit"
                >
                  {savingMilestone ? (
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  ) : (
                    'Log Memory'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Relationship Modal Dialog */}
      {user && (
        <RelationshipModal
          isOpen={relModalOpen}
          onClose={() => setRelModalOpen(false)}
          currentUserId={user.id}
          otherUserId={relUserId}
          otherUserName={relUserName}
        />
      )}

      {/* Spotify Wrapped Modal Card */}
      {showWrappedModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div 
            className="w-full max-w-sm rounded-3xl overflow-hidden border border-white/10 shadow-2xl relative flex flex-col p-6 text-center animate-in zoom-in-95 duration-200"
            style={{
              background: 'radial-gradient(circle at top, #0f2b30 0%, #03070b 100%)',
              boxShadow: '0 30px 100px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.08), 0 0 50px rgba(61,255,211,0.08)'
            }}
          >
            {/* Close */}
            <button
              onClick={() => setShowWrappedModal(false)}
              className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-250 transition bg-white/5 border border-white/5 rounded-full hover:cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Sparkles */}
            <div className="flex justify-center mb-6 mt-4 animate-bounce" style={{ animationDuration: '3s' }}>
              <div className="p-3.5 bg-primary/10 border border-primary/20 rounded-full text-primary">
                <Sparkles className="w-8 h-8 text-primary" />
              </div>
            </div>

            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block font-outfit">SplitSync Wrapped</span>
            <h3 className="text-2xl font-black text-slate-100 mt-1 font-sans truncate px-2">{cleanName}</h3>
            
            <hr className="border-white/5 my-5" />

            {/* Spotify Wrapped Card layout */}
            <div className="space-y-4 py-2">
              <div className="bg-slate-950/60 p-4 rounded-2xl border border-white/5 text-left flex flex-col gap-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-450 font-medium">Participants deck</span>
                  <span className="text-slate-200 font-bold font-outfit">{members.length} Friends</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-450 font-medium">Shared contributions</span>
                  <span className="text-slate-200 font-bold font-outfit">{financialExpenses.length} Logs</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-450 font-medium">Total volume tracked</span>
                  <span className="text-primary font-bold font-outfit text-sm">₹{totalSpent.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-450 font-medium">Disputes encountered</span>
                  <span className="text-emerald-450 font-bold font-outfit">0 Arguments ✓</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-450 font-medium">Resolution state</span>
                  <span className="text-emerald-450 font-bold font-outfit">{settlementProgress}% Resolved</span>
                </div>
              </div>
            </div>

            <p className="text-[10px] text-slate-400 italic px-4 mt-4 leading-relaxed font-semibold">
              "Shared experiences deserve more than spreadsheets."
            </p>

            {/* Mock Share deck */}
            <div className="grid grid-cols-2 gap-2 mt-6">
              <button
                onClick={() => {
                  toast.success('Spotify-style Story Card copied to clipboard!');
                  setShowWrappedModal(false);
                }}
                className="py-2.5 bg-gradient-to-r from-primary to-accent hover:brightness-110 text-obsidian rounded-xl text-xs font-extrabold transition hover:cursor-pointer btn-magnetic font-outfit"
              >
                Copy Wrap Image
              </button>
              <button
                onClick={() => {
                  toast.success('Ready to post! Shared link copied.');
                  setShowWrappedModal(false);
                }}
                className="py-2.5 bg-white/5 hover:bg-white/10 border border-white/5 text-slate-200 rounded-xl text-xs font-bold transition hover:cursor-pointer btn-magnetic font-outfit"
              >
                Share Story
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
