import { palette } from './palette';

export const controlTokens = {
  primary: {
    alignItems: 'center',
    backgroundColor: palette.green,
    borderColor: palette.green,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  secondary: {
    alignItems: 'center',
    backgroundColor: palette.greenSoft,
    borderColor: '#c9dfd1',
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  outline: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.24)',
    borderColor: palette.lineStrong,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  text: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  filter: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.24)',
    borderColor: palette.lineStrong,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
} as const;

export const controlTextTokens = {
  primary: { color: '#ffffff' },
  secondary: { color: palette.greenDark },
  outline: { color: palette.secondary },
  text: { color: palette.greenDark },
  filter: { color: palette.secondary },
} as const;
