import React, { useEffect, useRef, useState } from 'react';

interface FlowNode {
  id: string;
  name: string;
  netBalance: number; // positive = owed, negative = owes
}

interface FlowEdge {
  from: string;
  to: string;
  amount: number;
  fromName: string;
  toName: string;
}

interface BalanceFlowMapProps {
  nodes: FlowNode[];
  edges: FlowEdge[];
  currentUserId?: string;
}

const AURORA_MINT = '#3DFFD3';
const NEO_CYAN = '#00D9FF';

/** Returns avatar initials bg/text colors deterministically */
function getNodeColors(name: string, isLight: boolean): { bg: string; border: string; text: string } {
  const darkPalettes = [
    { bg: 'rgba(61,255,211,0.12)', border: '#3DFFD3', text: '#3DFFD3' },
    { bg: 'rgba(0,217,255,0.12)', border: '#00D9FF', text: '#00D9FF' },
    { bg: 'rgba(139,92,246,0.15)', border: '#8B5CF6', text: '#A78BFA' },
    { bg: 'rgba(251,191,36,0.12)', border: '#FBBF24', text: '#FCD34D' },
    { bg: 'rgba(248,113,113,0.12)', border: '#F87171', text: '#FCA5A5' },
  ];

  const lightPalettes = [
    { bg: 'rgba(13,148,136,0.08)', border: '#0d9488', text: '#0f766e' },
    { bg: 'rgba(79,70,229,0.08)', border: '#4f46e5', text: '#3730a3' },
    { bg: 'rgba(139,92,246,0.08)', border: '#8b5cf6', text: '#5b21b6' },
    { bg: 'rgba(217,119,6,0.08)', border: '#d97706', text: '#9a3412' },
    { bg: 'rgba(225,29,72,0.08)', border: '#e11d48', text: '#9f1239' },
  ];

  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return isLight ? lightPalettes[sum % lightPalettes.length] : darkPalettes[sum % darkPalettes.length];
}

/** Arrange nodes in an ellipse */
function computeNodePositions(
  count: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number
): { x: number; y: number }[] {
  if (count === 0) return [];
  if (count === 1) return [{ x: cx, y: cy }];
  return Array.from({ length: count }, (_, i) => {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2;
    return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
  });
}

/** SVG curved arc from (x1,y1) to (x2,y2) with a slight bend */
function arcPath(
  x1: number, y1: number,
  x2: number, y2: number,
  bend = 0.3
): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  // Perpendicular offset for curve
  const cpx = mx - dy * bend;
  const cpy = my + dx * bend;
  return `M ${x1} ${y1} Q ${cpx} ${cpy} ${x2} ${y2}`;
}

/** Arrowhead marker id */
const ARROW_ID_MINT = 'arrow-mint';
const ARROW_ID_RED = 'arrow-red';

export const BalanceFlowMap: React.FC<BalanceFlowMapProps> = ({
  nodes,
  edges,
  currentUserId,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [ready, setReady] = useState(false);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    // Check initial state from DOM
    setIsLight(document.body.classList.contains('theme-light'));

    const handleThemeChange = (e: Event) => {
      const customTheme = (e as CustomEvent).detail?.theme;
      setIsLight(customTheme === 'aurora');
    };

    window.addEventListener('splitsync:themechange', handleThemeChange);

    // Delay to trigger CSS animations after mount
    const t = setTimeout(() => setReady(true), 50);
    return () => {
      clearTimeout(t);
      window.removeEventListener('splitsync:themechange', handleThemeChange);
    };
  }, []);

  const activeMint = isLight ? '#0d9488' : AURORA_MINT;
  const activeCyan = isLight ? '#4f46e5' : NEO_CYAN;

  const W = 480;
  const H = 300;
  const CX = W / 2;
  const CY = H / 2;
  const RX = Math.min(W * 0.36, 160);
  const RY = Math.min(H * 0.36, 100);

  const positions = computeNodePositions(nodes.length, CX, CY, RX, RY);
  const nodeById: Record<string, { pos: { x: number; y: number }; node: FlowNode }> = {};
  nodes.forEach((n, i) => {
    nodeById[n.id] = { pos: positions[i], node: n };
  });

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-600 text-xs">
        Add members to see the flow map
      </div>
    );
  }

  return (
    <div className="relative w-full" style={{ aspectRatio: `${W}/${H}` }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-full"
        style={{ overflow: 'visible' }}
      >
        {/* Defs: arrowheads + glow filter */}
        <defs>
          <marker
            id={ARROW_ID_MINT}
            markerWidth="8" markerHeight="8"
            refX="6" refY="3"
            orient="auto"
          >
            <path d="M0,0 L0,6 L8,3 z" fill={activeMint} opacity="0.8" />
          </marker>
          <marker
            id={ARROW_ID_RED}
            markerWidth="8" markerHeight="8"
            refX="6" refY="3"
            orient="auto"
          >
            <path d="M0,0 L0,6 L8,3 z" fill={activeCyan} opacity="0.8" />
          </marker>
          <filter id="glow-mint" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glow-node" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Flow Edges */}
        {edges.map((edge, idx) => {
          const fromPos = nodeById[edge.from]?.pos;
          const toPos = nodeById[edge.to]?.pos;
          if (!fromPos || !toPos) return null;

          const isUserInvolved =
            edge.from === currentUserId || edge.to === currentUserId;
          const color = isUserInvolved ? activeMint : activeCyan;
          const arrowId = isUserInvolved ? ARROW_ID_MINT : ARROW_ID_RED;
          const opacity = isUserInvolved ? 0.85 : 0.45;
          const strokeW = isUserInvolved ? 2 : 1.5;

          // Shorten line to not overlap node circles (r=22)
          const dx = toPos.x - fromPos.x;
          const dy = toPos.y - fromPos.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const OFFSET = 24;
          const sx = fromPos.x + (dx / len) * OFFSET;
          const sy = fromPos.y + (dy / len) * OFFSET;
          const ex = toPos.x - (dx / len) * OFFSET;
          const ey = toPos.y - (dy / len) * OFFSET;

          // Stagger animation delay per edge
          const delay = `${idx * 120}ms`;
          const pathLength = 200;

          return (
            <g key={`${edge.from}-${edge.to}`}>
              {/* Glow duplicate (thicker, blurred) */}
              <path
                d={arcPath(sx, sy, ex, ey, 0.22)}
                fill="none"
                stroke={color}
                strokeWidth={strokeW + 2}
                opacity={0.12}
                filter="url(#glow-mint)"
                strokeLinecap="round"
              />
              {/* Main flow line */}
              <path
                d={arcPath(sx, sy, ex, ey, 0.22)}
                fill="none"
                stroke={color}
                strokeWidth={strokeW}
                opacity={ready ? opacity : 0}
                strokeLinecap="round"
                markerEnd={`url(#${arrowId})`}
                style={{
                  strokeDasharray: pathLength,
                  strokeDashoffset: ready ? 0 : pathLength,
                  transition: `stroke-dashoffset 600ms cubic-bezier(0.16,1,0.3,1) ${delay}, opacity 300ms ease ${delay}`,
                }}
                onMouseEnter={() => {
                  const svgRect = svgRef.current?.getBoundingClientRect();
                  if (!svgRect) return;
                  setTooltip({
                    x: (fromPos.x + toPos.x) / 2,
                    y: (fromPos.y + toPos.y) / 2 - 20,
                    text: `${edge.fromName} → ${edge.toName}: ₹${edge.amount.toFixed(2)}`,
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
                className="cursor-default"
              />

              {/* Amount label mid-arc */}
              <text
                x={(fromPos.x + toPos.x) / 2 - (toPos.y - fromPos.y) * 0.18}
                y={(fromPos.y + toPos.y) / 2 + (toPos.x - fromPos.x) * 0.18}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="9"
                fontWeight="700"
                fill={color}
                stroke={isLight ? '#ffffff' : '#070B0F'}
                strokeWidth="2.5"
                paintOrder="stroke fill"
                strokeLinejoin="round"
                opacity={ready ? 0.95 : 0}
                style={{ transition: `opacity 400ms ease ${delay}`, fontFamily: 'Outfit, sans-serif' }}
              >
                ₹{edge.amount.toFixed(0)}
              </text>
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map((node, i) => {
          const pos = positions[i];
          if (!pos) return null;
          const colors = getNodeColors(node.name, isLight);
          const isSelf = node.id === currentUserId;
          const R = isSelf ? 26 : 22;
          const initials = node.name.substring(0, 2).toUpperCase();
          const delay = `${i * 80}ms`;
          const isPositive = node.netBalance > 0.01;
          const isNegative = node.netBalance < -0.01;
          const balanceColor = isPositive
            ? (isLight ? '#0f766e' : '#4ADE80')
            : isNegative
            ? (isLight ? '#be123c' : '#F87171')
            : (isLight ? '#475569' : '#94A3B8');

          return (
            <g
              key={node.id}
              style={{
                opacity: ready ? 1 : 0,
                transform: ready ? 'scale(1)' : 'scale(0.7)',
                transformOrigin: `${pos.x}px ${pos.y}px`,
                transition: `opacity 350ms ease ${delay}, transform 350ms cubic-bezier(0.16,1,0.3,1) ${delay}`,
              }}
            >
              {/* Node glow ring for self */}
              {isSelf && (
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={R + 6}
                  fill="none"
                  stroke={colors.border}
                  strokeWidth="1"
                  opacity="0.3"
                  filter="url(#glow-node)"
                />
              )}

              {/* Node circle */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={R}
                fill={colors.bg}
                stroke={isSelf ? colors.border : (isLight ? 'rgba(15,23,42,0.12)' : 'rgba(255,255,255,0.12)')}
                strokeWidth={isSelf ? 1.5 : 1}
              />

              {/* Initials */}
              <text
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={isSelf ? '10' : '9'}
                fontWeight="800"
                fill={isSelf ? colors.text : (isLight ? 'rgba(15,23,42,0.75)' : 'rgba(255,255,255,0.7)')}
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                {initials}
              </text>

              {/* Name label below node */}
              <text
                x={pos.x}
                y={pos.y + R + 12}
                textAnchor="middle"
                fontSize="8"
                fontWeight="600"
                fill={isLight ? 'rgba(15,23,42,0.6)' : 'rgba(255,255,255,0.45)'}
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                {isSelf ? 'You' : node.name.split(' ')[0]}
              </text>

              {/* Balance badge */}
              {Math.abs(node.netBalance) > 0.01 && (
                <text
                  x={pos.x}
                  y={pos.y + R + 23}
                  textAnchor="middle"
                  fontSize="7.5"
                  fontWeight="700"
                  fill={balanceColor}
                  style={{ fontFamily: 'Outfit, sans-serif' }}
                >
                  {isPositive ? '+' : ''}₹{Math.abs(node.netBalance).toFixed(0)}
                </text>
              )}
            </g>
          );
        })}

        {/* Tooltip */}
        {tooltip && (
          <g>
            <rect
              x={tooltip.x - 80}
              y={tooltip.y - 14}
              width={160}
              height={22}
              rx={6}
              fill={isLight ? 'rgba(255,255,255,0.98)' : 'rgba(7,11,15,0.95)'}
              stroke={isLight ? 'rgba(15,23,42,0.12)' : 'rgba(255,255,255,0.1)'}
              strokeWidth="1"
            />
            <text
              x={tooltip.x}
              y={tooltip.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="8.5"
              fill={isLight ? '#0f172a' : 'rgba(255,255,255,0.8)'}
              fontWeight="600"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              {tooltip.text}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
};
