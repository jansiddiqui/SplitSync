import React from 'react';

interface SkeletonProps {
  className?: string;
  /** If true, renders a circle (for avatars) */
  circle?: boolean;
  /** Number of rows to repeat (for text skeletons) */
  rows?: number;
}

/**
 * Skeleton shimmer component. Replaces spinners with content-shaped placeholders.
 * Usage: <Skeleton className="h-4 w-32" /> or <Skeleton circle className="w-9 h-9" />
 */
export const Skeleton: React.FC<SkeletonProps> = ({ className = '', circle = false, rows }) => {
  if (rows && rows > 1) {
    return (
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className={`skeleton-shimmer ${circle ? 'rounded-full' : 'rounded-lg'} ${className}`}
            style={{ width: i === rows - 1 && rows > 1 ? '65%' : undefined }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`skeleton-shimmer ${circle ? 'rounded-full' : 'rounded-lg'} ${className}`}
    />
  );
};

/** Dashboard statistics skeleton — matches the 3-card layout */
export const DashboardStatsSkeleton: React.FC = () => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
    {[0, 1, 2].map((i) => (
      <div key={i} className="glass-card rounded-2xl p-6 border border-white/5">
        <div className="flex items-center gap-4">
          <Skeleton circle className="w-11 h-11" />
          <div className="flex-1">
            <Skeleton className="h-2.5 w-20 mb-3" />
            <Skeleton className="h-7 w-28" />
          </div>
        </div>
      </div>
    ))}
  </div>
);

/** Group card skeleton — matches the group grid card */
export const GroupCardSkeleton: React.FC = () => (
  <div className="glass-card rounded-2xl p-6 border border-white/5 h-44 flex flex-col justify-between">
    <div>
      <Skeleton className="h-5 w-36 mb-2" />
      <Skeleton className="h-3 w-24" />
    </div>
    <div className="border-t border-white/5 pt-4 flex justify-between items-center">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-3 w-12" />
    </div>
  </div>
);

/** Expense row skeleton */
export const ExpenseRowSkeleton: React.FC = () => (
  <div className="flex items-center gap-4 p-4 border-b border-white/5">
    <Skeleton circle className="w-9 h-9" />
    <div className="flex-1">
      <Skeleton className="h-3.5 w-32 mb-2" />
      <Skeleton className="h-2.5 w-20" />
    </div>
    <Skeleton className="h-5 w-16" />
  </div>
);

/** Balance row skeleton */
export const BalanceRowSkeleton: React.FC = () => (
  <div className="flex items-center justify-between p-4 border-b border-white/5">
    <div className="flex items-center gap-3">
      <Skeleton circle className="w-8 h-8" />
      <Skeleton className="h-3 w-24" />
    </div>
    <Skeleton className="h-5 w-20" />
  </div>
);
