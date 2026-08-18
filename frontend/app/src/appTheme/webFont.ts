import { Platform } from 'react-native';

const FALLBACK_FONT_URL = 'https://cdn.jsdelivr.net/gh/sunn-us/SUIT/fonts/variable/woff2/SUIT-Variable.css';

export function ensureBrandFontLoaded() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  if (document.querySelector(`link[href="${FALLBACK_FONT_URL}"]`)) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = FALLBACK_FONT_URL;
  document.head.appendChild(link);
}
