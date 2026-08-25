import { appFontFamily } from './fontFamily';
import { Platform } from 'react-native';

export const glassWebStyle = Platform.OS === 'web' ? {
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
} as any : {};

export const font = appFontFamily;
