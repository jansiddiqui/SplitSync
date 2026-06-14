import React, { useEffect, useRef, useState } from 'react';

interface UseCountUpOptions {
  /** Target value to animate to */
  target: number;
  /** Duration in ms. Default 600 */
  duration?: number;
  /** Decimal places. Default 2 */
  decimals?: number;
  /** Delay before starting. Default 0 */
  delay?: number;
}

/**
 * Animates a number from its previous value to the new target value.
 * Uses requestAnimationFrame with an ease-out cubic curve.
 */
export function useCountUp({
  target,
  duration = 600,
  decimals = 2,
  delay = 0,
}: UseCountUpOptions): string {
  const [displayValue, setDisplayValue] = useState(target);
  const prevTarget = useRef(target);
  const rafRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (prevTarget.current === target) return;

    const from = prevTarget.current;
    const to = target;
    prevTarget.current = target;

    // Cancel any ongoing animation
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    const startAnimation = () => {
      const startTime = performance.now();

      const tick = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = from + (to - from) * eased;
        setDisplayValue(current);

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          setDisplayValue(to);
        }
      };

      rafRef.current = requestAnimationFrame(tick);
    };

    if (delay > 0) {
      timeoutRef.current = setTimeout(startAnimation, delay);
    } else {
      startAnimation();
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [target, duration, delay]);

  return displayValue.toFixed(decimals);
}

/**
 * Convenience component wrapper for animated number display
 */
interface AnimatedNumberProps {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
  delay?: number;
  className?: string;
}

export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  prefix = '',
  suffix = '',
  decimals = 2,
  duration = 600,
  delay = 0,
  className = '',
}) => {
  // Need React for JSX — imported via the hook file
  const animated = useCountUp({ target: value, duration, decimals, delay });
  return (
    <span className={className}>
      {prefix}{animated}{suffix}
    </span>
  );
};

