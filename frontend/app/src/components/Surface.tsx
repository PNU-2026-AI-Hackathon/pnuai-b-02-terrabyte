import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';

import { glassWebStyle } from '../appTheme/glass';
import { palette } from '../appTheme/palette';

type SurfaceProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Surface({ children, style }: SurfaceProps) {
  return <View style={[styles.surface, glassWebStyle, style]}>{children}</View>;
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
});
