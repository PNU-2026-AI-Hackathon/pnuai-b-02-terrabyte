import { appFontFamily } from './appTheme/fontFamily';

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
  glass: '#fbfdfb',
  glassStrong: '#ffffff',
  glassSoft: '#eef5f0',
  lineSoft: '#dde8e0',
  pageStart: '#f7faf8',
  pageMid: '#f1f6f2',
  pageEnd: '#e9f2ec',
  deviceOnline: '#35b26b',
};

export const radii = {
  card: 18,
  control: 11,
  pill: 999,
};

export const shadows = {
  card: {
    shadowColor: '#1f3a2a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 3,
  },
  soft: {
    shadowColor: '#1f3a2a',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.045,
    shadowRadius: 16,
    elevation: 2,
  },
};

export const typography = {
  fontFamily: appFontFamily,
};

export const maxContentWidth = 1180;
export const compactBreakpoint = 760;

export const glassWebStyle = {
  boxShadow: '0 8px 28px rgba(31,58,42,0.07)',
} as const;
