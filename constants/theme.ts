export const LightColors = {
  background: '#F8FAFC',
  surface: 'rgba(255, 255, 255, 0.72)',
  surfaceBorder: 'rgba(255, 255, 255, 0.4)',
  card: 'rgba(255, 255, 255, 0.55)',
  cardBorder: 'rgba(0, 0, 0, 0.06)',
  accent: '#00C49A',
  accentDark: '#00A67E',
  accentLight: '#33D4B0',
  accentGlow: 'rgba(0, 196, 154, 0.2)',
  danger: '#EF4444',
  dangerDark: '#DC2626',
  dangerGlow: 'rgba(239, 68, 68, 0.2)',
  white: '#FFFFFF',
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  overlay: 'rgba(15, 23, 42, 0.25)',
  statusActive: '#22C55E',
  statusConnecting: '#F59E0B',
  statusEnded: '#EF4444',
  glassBackground: 'rgba(255, 255, 255, 0.5)',
  glassBorder: 'rgba(255, 255, 255, 0.6)',
  glassShadow: 'rgba(0, 0, 0, 0.04)',
  brandSubtle: 'rgba(0, 196, 154, 0.08)',
};

export const DarkColors = {
  background: '#0F172A',
  surface: 'rgba(30, 41, 59, 0.72)',
  surfaceBorder: 'rgba(255, 255, 255, 0.08)',
  card: 'rgba(30, 41, 59, 0.55)',
  cardBorder: 'rgba(255, 255, 255, 0.06)',
  accent: '#00D4AA',
  accentDark: '#00B894',
  accentLight: '#00F5C4',
  accentGlow: 'rgba(0, 212, 170, 0.25)',
  danger: '#F87171',
  dangerDark: '#EF4444',
  dangerGlow: 'rgba(248, 113, 113, 0.25)',
  white: '#FFFFFF',
  textPrimary: '#F1F5F9',
  textSecondary: '#94A3B8',
  textMuted: '#475569',
  overlay: 'rgba(0, 0, 0, 0.5)',
  statusActive: '#34D399',
  statusConnecting: '#FBBF24',
  statusEnded: '#F87171',
  glassBackground: 'rgba(30, 41, 59, 0.5)',
  glassBorder: 'rgba(255, 255, 255, 0.1)',
  glassShadow: 'rgba(0, 0, 0, 0.3)',
  brandSubtle: 'rgba(0, 212, 170, 0.08)',
};

export type ThemeColors = typeof LightColors;

// Default export for backward-compat
export const Colors = DarkColors;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const FontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 28,
  xxl: 36,
  hero: 48,
};

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  full: 9999,
};
