import React from 'react';
import { ObservationResult, OBSERVATION_RESULTS } from '@/types/memberObservation.types';

interface ObservationBadgeProps {
  result: ObservationResult | null | undefined;
  size?: 'sm' | 'md';
}

const COLOR_MAP: Record<string, { bg: string; text: string; border: string }> = {
  acquis:     { bg: 'bg-green-100',  text: 'text-green-800',  border: 'border-green-300' },
  en_progres: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
  a_revoir:   { bg: 'bg-red-100',    text: 'text-red-800',    border: 'border-red-300' },
};

/**
 * Petit badge coloré affichant le résultat d'une observation.
 */
export function ObservationBadge({ result, size = 'sm' }: ObservationBadgeProps) {
  if (!result) return null;

  const meta = OBSERVATION_RESULTS.find(r => r.value === result);
  const colors = COLOR_MAP[result] ?? COLOR_MAP.acquis;
  const sizeClass = size === 'sm'
    ? 'text-xs px-1.5 py-0.5'
    : 'text-sm px-2 py-1';

  return (
    <span className={`inline-flex items-center rounded-full border font-medium
      ${colors.bg} ${colors.text} ${colors.border} ${sizeClass}`}>
      {meta?.label ?? result}
    </span>
  );
}
