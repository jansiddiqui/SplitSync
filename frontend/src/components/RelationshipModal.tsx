import React, { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { X, Heart, Users, Award } from 'lucide-react';
import { getGroupBalances } from '../utils/balances';
import { PresetIcon, type PresetKey } from './PresetIcon';

interface RelationshipModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId: string;
  otherUserId: string;
  otherUserName: string;
}

export const RelationshipModal: React.FC<RelationshipModalProps> = ({
  isOpen,
  onClose,
  currentUserId,
  otherUserId,
  otherUserName,
}) => {
  const [loading, setLoading] = useState(true);
  const [sharedExperiencesCount, setSharedExperiencesCount] = useState(0);
  const [totalTrackedAmount, setTotalTrackedAmount] = useState(0);
  const [resolutionPercentage, setResolutionPercentage] = useState(100);
  const [trustLevel, setTrustLevel] = useState<'Trusted Collaborator' | 'Verified Participant' | 'Reliable Resolver'>('Verified Participant');
  const [sharedGroups, setSharedGroups] = useState<any[]>([]);

  useEffect(() => {
    if (!isOpen || !otherUserId) return;

    const fetchRelationshipIntel = async () => {
      try {
        setLoading(true);

        // 1. Find all memberships for current user
        const { data: myMemberships } = await supabase
          .from('GroupMember')
          .select('group_id')
          .eq('user_id', currentUserId);

        // 2. Find all memberships for other user
        const { data: otherMemberships } = await supabase
          .from('GroupMember')
          .select('group_id')
          .eq('user_id', otherUserId);

        const myGroupIds = new Set((myMemberships || []).map((m: any) => m.group_id));
        const sharedGroupIds = (otherMemberships || [])
          .map((m: any) => m.group_id)
          .filter((id: string) => myGroupIds.has(id));

        setSharedExperiencesCount(sharedGroupIds.length);

        if (sharedGroupIds.length === 0) {
          setTotalTrackedAmount(0);
          setResolutionPercentage(100);
          setTrustLevel('Verified Participant');
          setSharedGroups([]);
          setLoading(false);
          return;
        }

        // 3. Query all contributions and resolutions in shared groups to calculate mutual volume
        let mutualVolumeSum = 0;
        let totalUnresolved = 0;

        for (const groupId of sharedGroupIds) {
          const balances = await getGroupBalances(groupId).catch(() => null);
          if (balances) {
            mutualVolumeSum += balances.totalSpent;
            const relevantTx = balances.simplifiedTransactions.filter(
              (tx) =>
                (tx.from === currentUserId && tx.to === otherUserId) ||
                (tx.from === otherUserId && tx.to === currentUserId)
            );
            relevantTx.forEach((tx) => {
              totalUnresolved += tx.amount;
            });
          }
        }

        setTotalTrackedAmount(mutualVolumeSum);

        const resolvedPct =
          mutualVolumeSum > 0
            ? Math.max(0, Math.min(100, Math.round(((mutualVolumeSum - totalUnresolved) / mutualVolumeSum) * 100)))
            : 100;

        setResolutionPercentage(resolvedPct);

        if (sharedGroupIds.length >= 5 && resolvedPct > 90) {
          setTrustLevel('Trusted Collaborator');
        } else if (resolvedPct > 75) {
          setTrustLevel('Reliable Resolver');
        } else {
          setTrustLevel('Verified Participant');
        }

        // 4. Fetch shared group names
        const { data: sharedGroupsData } = await supabase
          .from('Group')
          .select('id, name, created_at')
          .in('id', sharedGroupIds);

        if (sharedGroupsData) {
          setSharedGroups(
            sharedGroupsData.map((g: any) => {
              const cleanName = g.name
                .replace(/ \[vaulted\]$/, '')
                .replace(/ \[invite:[A-Z0-9]+\]$/, '')
                .replace(/ \[vaulted\]$/, '')
                .replace(/ (🏖|🏠|🎓|💍|🚗|📦)$/, '');
              const isVaulted = g.name.endsWith(' [vaulted]');

              let iconKey: PresetKey = 'custom';
              let typeName = 'Custom';
              if (g.name.includes('🏖')) { iconKey = 'travel'; typeName = 'Travel'; }
              else if (g.name.includes('🏠')) { iconKey = 'living'; typeName = 'Living'; }
              else if (g.name.includes('🎓')) { iconKey = 'friends'; typeName = 'Friends'; }
              else if (g.name.includes('💍')) { iconKey = 'event'; typeName = 'Event'; }
              else if (g.name.includes('🚗')) { iconKey = 'roadtrip'; typeName = 'Road Trip'; }

              const date = new Date(g.created_at);
              const dateFormatted = date.toLocaleString('default', { month: 'short', year: 'numeric' });

              return {
                id: g.id,
                name: cleanName,
                iconKey,
                typeName,
                dateFormatted,
                isActive: !isVaulted,
              };
            })
          );
        }
      } catch (err) {
        console.error('Failed to load relationship details:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchRelationshipIntel();
  }, [isOpen, currentUserId, otherUserId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="glass-card w-full max-w-md rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 card-glow-theme flex flex-col relative p-6">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-200 transition hover:cursor-pointer rounded-lg bg-white/3 border border-white/5"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Content */}
        {loading ? (
          <div className="space-y-5 py-4">
            <div className="flex items-center gap-3">
              <div className="skeleton-shimmer w-10 h-10 rounded-xl" />
              <div className="space-y-2">
                <div className="skeleton-shimmer h-4 w-32 rounded-lg" />
                <div className="skeleton-shimmer h-3 w-24 rounded-lg" />
              </div>
            </div>
            <div className="h-0.5 bg-white/5 my-4" />
            <div className="space-y-3">
              <div className="skeleton-shimmer h-8 w-full rounded-xl" />
              <div className="skeleton-shimmer h-8 w-full rounded-xl" />
              <div className="skeleton-shimmer h-8 w-full rounded-xl" />
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Header / Relational Status */}
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-primary/20 to-accent/20 border border-primary/30 flex items-center justify-center text-primary shrink-0">
                <Users className="w-6 h-6" />
              </div>
              <div className="overflow-hidden">
                <h3 className="text-base font-extrabold text-slate-200 flex items-center gap-1.5 truncate">
                  Relationship Intelligence
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  You ↔ <span className="font-bold text-slate-300">{otherUserName}</span>
                </p>
              </div>
            </div>

            <hr className="border-white/5" />

            {/* Mature Trust Title Badge */}
            <div className="flex flex-col items-center justify-center bg-slate-950/40 border border-white/5 rounded-2xl p-4 text-center">
              <span className="p-2 bg-primary/10 text-primary border border-primary/20 rounded-full mb-2 flex items-center justify-center">
                <Award className="w-5 h-5" />
              </span>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Trust Profile</span>
              <h4 className="text-base font-black text-slate-100 mt-1 font-sans">{trustLevel}</h4>
            </div>

            {/* Stats Breakdown */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white/3 border border-white/5 rounded-xl p-2.5 text-center">
                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Experiences</span>
                <span className="font-bold text-slate-200 font-outfit text-sm block mt-1">{sharedExperiencesCount}</span>
              </div>

              <div className="bg-white/3 border border-white/5 rounded-xl p-2.5 text-center">
                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Tracked Volume</span>
                <span className="font-bold text-slate-200 font-outfit text-xs block mt-1.5 truncate">₹{totalTrackedAmount.toLocaleString()}</span>
              </div>

              <div className="bg-white/3 border border-white/5 rounded-xl p-2.5 text-center">
                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Resolution</span>
                <span className="font-bold text-emerald-400 font-outfit text-sm block mt-1">{resolutionPercentage}%</span>
              </div>
            </div>

            {/* Shared Experiences Timeline */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Shared Experience Timeline</span>
              <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                {sharedGroups.length === 0 ? (
                  <p className="text-slate-500 text-[10px] italic">No shared experiences logged.</p>
                ) : (
                  sharedGroups.map((g) => (
                    <div key={g.id} className="flex justify-between items-center bg-white/2 border border-white/5 rounded-xl px-3 py-2 text-xs">
                      <span className="text-slate-300 font-bold flex items-center gap-1.5 truncate max-w-44">
                        <PresetIcon preset={g.iconKey} className="w-3.5 h-3.5" />
                        <span className="truncate">{g.name}</span>
                      </span>
                      <span className="text-[9px] font-bold font-outfit text-slate-500 shrink-0">
                        {g.isActive ? 'Active' : g.dateFormatted}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Friendship protection statement */}
            <div className="bg-primary/5 border border-primary/10 rounded-xl p-3 text-center flex items-center justify-center gap-2">
              <Heart className="w-3.5 h-3.5 text-primary shrink-0 animate-pulse" />
              <p className="text-[9px] text-slate-400 font-semibold leading-relaxed">
                Friendship is above numbers. SplitSync just keeps it fair.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

