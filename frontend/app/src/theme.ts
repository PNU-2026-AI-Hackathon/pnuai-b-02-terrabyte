export const colors = {
  textPrimary: '#1c2b22',
  textSecondary: '#4a6355',
  textMuted: '#7d947f',
  brandStart: '#3fae6f',
  brandEnd: '#2b8f8a',
  accentGreen: '#3fae6f',
  warnAmber: '#e0b23a',
  warnText: '#a4571f',
  okText: '#1f6b42',
  glass: 'rgba(255,255,255,0.5)',
  glassStrong: 'rgba(255,255,255,0.65)',
  glassSoft: 'rgba(255,255,255,0.4)',
  lineSoft: 'rgba(255,255,255,0.65)',
  pageStart: '#e8f2e6',
  pageMid: '#d7e8dc',
  pageEnd: '#cfe3e0',
  deviceOnline: '#35b26b',
};

export const radii = {
  card: 24,
  control: 14,
  pill: 999,
};

export const shadows = {
  card: {
    shadowColor: '#1f3a2a',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.14,
    shadowRadius: 48,
    elevation: 8,
  },
  soft: {
    shadowColor: '#1f3a2a',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 36,
    elevation: 5,
  },
};

export const typography = {
  fontFamily: '"Pretendard Variable", Pretendard, "Noto Sans KR", sans-serif',
};

export const maxContentWidth = 1080;
export const compactBreakpoint = 760;

export const glassWebStyle = {
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  boxShadow: '0 16px 48px rgba(31,58,42,0.14)',
} as const;
