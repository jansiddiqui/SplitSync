import React, { useId } from 'react';

interface LogoProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ className = 'w-8 h-8', ...props }) => {
  const uniqueId = useId().replace(/:/g, '-');
  const gradId = `logo-grad-${uniqueId}`;

  return (
    <div className={`relative flex items-center justify-center shrink-0 ${className} group`} {...props}>
      <svg viewBox="0 0 100 100" className="w-full h-full filter drop-shadow-[0_0_8px_rgba(99,102,241,0.3)] group-hover:drop-shadow-[0_0_16px_rgba(99,102,241,0.55)] transition-all duration-500" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--color-primary-main)" />
            <stop offset="50%" stopColor="var(--color-primary-light)" />
            <stop offset="100%" stopColor="var(--color-accent-main)" />
          </linearGradient>
        </defs>

        {/* Brand Gradient Squircle Background Plate */}
        <rect 
          x="4" 
          y="4" 
          width="92" 
          height="92" 
          rx="22" 
          fill={`url(#${gradId})`} 
          stroke="rgba(255, 255, 255, 0.2)"
          strokeWidth="1.5"
          className="transition-transform duration-500 origin-center group-hover:scale-[1.02]"
        />

        {/* Ambient Ring Background */}
        <circle 
          cx="50" 
          cy="50" 
          r="34" 
          stroke="#FFFFFF" 
          strokeWidth="1" 
          strokeOpacity="0.2"
          strokeDasharray="3 4" 
          className="animate-spin [animation-duration:45s] origin-center"
        />

        {/* Interlocking Monogram Swooshes in High-Contrast Solid White */}
        <g className="transition-transform duration-500 origin-center group-hover:scale-[1.04]">
          {/* Loop A (Split: Left-to-Right Swoosh) */}
          <path 
            d="M 32,35 C 32,24 48,18 60,28 C 72,38 72,54 50,50 C 28,46 24,62 40,72 C 52,82 72,76 72,65" 
            stroke="#FFFFFF" 
            strokeWidth="8" 
            strokeLinecap="round" 
            className="transition-all duration-500 origin-center"
          />

          {/* Loop B (Sync: Right-to-Left Swoosh) */}
          <path 
            d="M 72,65 C 72,76 52,82 40,72 C 28,62 32,46 50,50 C 72,54 76,38 62,28 C 48,18 32,24 32,35" 
            stroke="#FFFFFF" 
            strokeWidth="8" 
            strokeLinecap="round"
            opacity="0.9"
            className="transition-all duration-500 origin-center"
          />

          {/* Sleek arrowhead for loop A */}
          <path 
            d="M 74,57 L 72,65 L 64,63" 
            stroke="#FFFFFF" 
            strokeWidth="2.5" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
          />

          {/* Sleek arrowhead for loop B */}
          <path 
            d="M 30,43 L 32,35 L 40,37" 
            stroke="#FFFFFF" 
            strokeWidth="2.5" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
          />
        </g>

        {/* Core Connection Node */}
        <circle 
          cx="50" 
          cy="50" 
          r="4.5" 
          fill="#FFFFFF" 
          stroke={`url(#${gradId})`} 
          strokeWidth="2" 
          className="transition-all duration-300 origin-center group-hover:scale-110"
        />
      </svg>
    </div>
  );
};
