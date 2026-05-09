import type { AviationHazardType, AviationProductType } from './types';

export const AVIATION_HAZARD_COLORS: Record<AviationHazardType, { fill: string; line: string; text: string }> = {
  ice: { fill: '#38bdf8', line: '#7dd3fc', text: '#e0f2fe' },
  turb: { fill: '#f59e0b', line: '#fbbf24', text: '#fef3c7' },
  llws: { fill: '#ec4899', line: '#f9a8d4', text: '#fce7f3' },
  ifr: { fill: '#94a3b8', line: '#e2e8f0', text: '#f8fafc' },
  mtnObscuration: { fill: '#8b5cf6', line: '#c4b5fd', text: '#ede9fe' },
  ts: { fill: '#ef4444', line: '#fb7185', text: '#fee2e2' },
  obs: { fill: '#22c55e', line: '#bbf7d0', text: '#f0fdf4' },
  unknown: { fill: '#64748b', line: '#cbd5e1', text: '#f8fafc' },
};

export const AVIATION_PRODUCT_LINE_COLORS: Record<AviationProductType, string> = {
  gairmet: '#7dd3fc',
  sigmet: '#f87171',
  convectiveSigmet: '#fb923c',
  cwa: '#fde68a',
  pirep: '#bae6fd',
  metar: '#bbf7d0',
  other: '#e5e7eb',
};

export function aviationFillColorExpression() {
  return [
    'match',
    ['get', 'hazardType'],
    'ice',
    AVIATION_HAZARD_COLORS.ice.fill,
    'turb',
    AVIATION_HAZARD_COLORS.turb.fill,
    'llws',
    AVIATION_HAZARD_COLORS.llws.fill,
    'ifr',
    AVIATION_HAZARD_COLORS.ifr.fill,
    'mtnObscuration',
    AVIATION_HAZARD_COLORS.mtnObscuration.fill,
    'ts',
    AVIATION_HAZARD_COLORS.ts.fill,
    AVIATION_HAZARD_COLORS.unknown.fill,
  ];
}

export function aviationLineColorExpression() {
  return [
    'match',
    ['get', 'productType'],
    'gairmet',
    AVIATION_PRODUCT_LINE_COLORS.gairmet,
    'sigmet',
    AVIATION_PRODUCT_LINE_COLORS.sigmet,
    'convectiveSigmet',
    AVIATION_PRODUCT_LINE_COLORS.convectiveSigmet,
    'cwa',
    AVIATION_PRODUCT_LINE_COLORS.cwa,
    AVIATION_PRODUCT_LINE_COLORS.other,
  ];
}
