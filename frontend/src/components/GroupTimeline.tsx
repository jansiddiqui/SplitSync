import React, { useMemo } from 'react';
import { DollarSign, CheckCircle2, UserPlus, Flag, Camera, Sparkles } from 'lucide-react';

interface TimelineEvent {
  id: string;
  type: 'expense' | 'settlement' | 'member_join' | 'milestone' | 'moment';
  title: string;
  subtitle: string;
  amount?: number;
  amountColor?: 'green' | 'amber' | 'blue';
  timestamp: string; // ISO string
  isCurrentUser?: boolean;
}

interface GroupTimelineProps {
  events: TimelineEvent[];
  maxItems?: number;
}

const EVENT_ICONS = {
  expense: DollarSign,
  settlement: CheckCircle2,
  member_join: UserPlus,
  milestone: Flag,
  moment: Camera,
};

const EVENT_COLORS = {
  expense: {
    bg: 'rgba(251,191,36,0.1)',
    border: 'rgba(251,191,36,0.25)',
    icon: '#FCD34D',
  },
  settlement: {
    bg: 'rgba(52,211,153,0.1)',
    border: 'rgba(52,211,153,0.25)',
    icon: '#34D399',
  },
  member_join: {
    bg: 'rgba(99,102,241,0.1)',
    border: 'rgba(99,102,241,0.25)',
    icon: '#818CF8',
  },
  milestone: {
    bg: 'rgba(59,130,246,0.1)',
    border: 'rgba(59,130,246,0.25)',
    icon: '#60A5FA',
  },
  moment: {
    bg: 'rgba(236,72,153,0.1)',
    border: 'rgba(236,72,153,0.25)',
    icon: '#F472B6',
  },
};

const AMOUNT_COLORS = {
  green: 'text-emerald-400',
  amber: 'text-amber-400',
  blue: 'text-blue-400',
};

function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export const GroupTimeline: React.FC<GroupTimelineProps> = ({
  events,
  maxItems = 20,
}) => {
  const sorted = useMemo(
    () => [...events].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, maxItems),
    [events, maxItems]
  );

  if (sorted.length === 0) {
    return (
      <div className="py-10 text-center text-slate-600 text-xs">
        No activities or memories logged yet.
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div
        className="absolute left-[17px] top-0 bottom-0 w-[1px]"
        style={{ background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.07) 10%, rgba(255,255,255,0.07) 90%, transparent)' }}
      />

      <div className="space-y-0">
        {sorted.map((event, i) => {
          const Icon = EVENT_ICONS[event.type] || Sparkles;
          const colors = EVENT_COLORS[event.type] || EVENT_COLORS.expense;
          const delay = `${i * 60}ms`;

          return (
            <div
              key={event.id}
              className="relative flex items-start gap-4 py-3 pl-1 pr-2 rounded-xl hover:bg-white/3 transition-colors duration-150 group animate-slide-up"
              style={{
                animationDelay: delay,
              }}
            >
              {/* Icon node on the line */}
              <div
                className="shrink-0 w-[34px] h-[34px] rounded-xl flex items-center justify-center border relative z-10"
                style={{
                  background: colors.bg,
                  borderColor: colors.border,
                  boxShadow: `0 0 12px -4px ${colors.icon}40`,
                }}
              >
                <Icon className="w-3.5 h-3.5" style={{ color: colors.icon }} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={`text-xs font-semibold truncate leading-snug ${event.isCurrentUser ? 'text-slate-100' : 'text-slate-300'}`}>
                      {event.title}
                    </p>
                    <p className="text-[10px] text-slate-550 mt-0.5 truncate font-medium">
                      {event.subtitle}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {event.amount !== undefined && event.amount > 0 && (
                      <p className={`text-xs font-outfit font-semibold ${AMOUNT_COLORS[event.amountColor ?? 'amber']}`}>
                        ₹{event.amount.toFixed(2)}
                      </p>
                    )}
                    <p className="text-[9px] text-slate-700 font-medium mt-0.5">
                      {formatRelativeTime(event.timestamp)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
