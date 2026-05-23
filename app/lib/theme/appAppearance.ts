export type AppColorMode = 'classic' | 'grayscale' | 'high_contrast';

export const APP_COLOR_MODE_OPTIONS: Array<{ key: AppColorMode; label: string; helper: string }> = [
  { key: 'classic', label: 'Classic', helper: 'OMNIwx blue glass' },
  { key: 'grayscale', label: 'Gray Scale', helper: 'Neutral app chrome' },
  { key: 'high_contrast', label: 'High Contrast', helper: 'Brighter text and edges' },
];

export function appChrome(mode: AppColorMode) {
  switch (mode) {
    case 'grayscale':
      return {
        background: '#050608',
        card: 'rgba(18,18,20,0.86)',
        cardStrong: 'rgba(24,24,27,0.94)',
        border: 'rgba(255,255,255,0.16)',
        borderStrong: 'rgba(255,255,255,0.28)',
        blobA: 'rgba(220,220,225,0.10)',
        blobB: 'rgba(150,150,160,0.08)',
        pill: 'rgba(255,255,255,0.09)',
        pillActive: 'rgba(245,245,245,0.20)',
        primary: '#52525B',
        primaryBorder: 'rgba(255,255,255,0.34)',
        tabBar: 'rgba(14,14,18,0.98)',
        tabActiveBg: 'rgba(255,255,255,0.10)',
      };
    case 'high_contrast':
      return {
        background: '#000000',
        card: 'rgba(0,0,0,0.94)',
        cardStrong: 'rgba(0,0,0,0.98)',
        border: 'rgba(255,255,255,0.34)',
        borderStrong: 'rgba(255,255,255,0.58)',
        blobA: 'rgba(255,255,255,0.08)',
        blobB: 'rgba(96,165,250,0.12)',
        pill: 'rgba(255,255,255,0.12)',
        pillActive: 'rgba(37,99,235,0.72)',
        primary: '#1D4ED8',
        primaryBorder: 'rgba(255,255,255,0.62)',
        tabBar: 'rgba(0,0,0,0.99)',
        tabActiveBg: 'rgba(255,255,255,0.16)',
      };
    case 'classic':
    default:
      return {
        background: '#020617',
        card: 'rgba(11,18,32,0.78)',
        cardStrong: 'rgba(18,28,45,0.56)',
        border: 'rgba(255,255,255,0.10)',
        borderStrong: 'rgba(147,197,253,0.55)',
        blobA: 'rgba(80,200,255,0.16)',
        blobB: 'rgba(120,120,255,0.12)',
        pill: 'rgba(255,255,255,0.08)',
        pillActive: 'rgba(37,99,235,0.35)',
        primary: '#2563EB',
        primaryBorder: 'rgba(255,255,255,0.12)',
        tabBar: 'rgba(20,24,38,0.98)',
        tabActiveBg: 'rgba(255,255,255,0.06)',
      };
  }
}
