import React from 'react';
import { Plane, Home, Users, Star, Car, Package } from 'lucide-react';

export type PresetKey = 'travel' | 'living' | 'friends' | 'event' | 'roadtrip' | 'custom';

const PRESET_MAP: Record<PresetKey, { Icon: React.ElementType; color: string }> = {
  travel:   { Icon: Plane,    color: 'text-teal-400' },
  living:   { Icon: Home,     color: 'text-indigo-400' },
  friends:  { Icon: Users,    color: 'text-pink-400' },
  event:    { Icon: Star,     color: 'text-amber-400' },
  roadtrip: { Icon: Car,      color: 'text-red-400' },
  custom:   { Icon: Package,  color: 'text-slate-400' },
};

/** Detect preset from a raw group name string (emoji suffix stored in DB). */
export function detectPreset(name: string): PresetKey {
  if (name.includes('🏖')) return 'travel';
  if (name.includes('🏠')) return 'living';
  if (name.includes('🎓')) return 'friends';
  if (name.includes('💍')) return 'event';
  if (name.includes('🚗')) return 'roadtrip';
  return 'custom';
}

interface PresetIconProps {
  /** Direct preset key — use when you already know the preset id. */
  preset?: PresetKey;
  /** Raw group name string — auto-detects preset from embedded emoji suffix. */
  name?: string;
  className?: string;
}

/**
 * Renders the correct lucide-react SVG icon for a given experience preset.
 * Pass either `preset` (key) or `name` (raw group name string with emoji suffix).
 */
export const PresetIcon: React.FC<PresetIconProps> = ({
  preset,
  name,
  className = 'w-5 h-5',
}) => {
  const key: PresetKey = preset ?? (name ? detectPreset(name) : 'custom');
  const { Icon, color } = PRESET_MAP[key];
  return <Icon className={`${className} ${color} shrink-0`} />;
};
