import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';

import { glassWebStyle } from '../appTheme/glass';
import { palette } from '../appTheme/palette';

type SurfaceProps = {
  children: ReactNode;
  flat?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Surface({ children, flat = false, style }: SurfaceProps) {
  return <View style={[styles.surface, glassWebStyle, flat && styles.flatSurface, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  surface: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 22,
    borderWidth: 1,
    shadowColor: '#203329',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.11,
    shadowRadius: 36,
  },
  flatSurface: {
    backgroundColor: 'rgba(255,255,255,0.24)',
    borderColor: 'rgba(86,120,101,0.24)',
    borderRadius: 20,
    borderWidth: 1,
    elevation: 0,
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
  },
});
