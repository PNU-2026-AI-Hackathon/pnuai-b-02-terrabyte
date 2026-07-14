import type { PropsWithChildren } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';

import { colors, glassWebStyle, radii, shadows } from '../theme';

type GlassCardProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  soft?: boolean;
}>;

export function GlassCard({ children, style, soft = false }: GlassCardProps) {
  return (
    <View style={[styles.card, soft ? shadows.soft : shadows.card, glassWebStyle as any, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.glass,
    borderColor: colors.lineSoft,
    borderRadius: radii.card,
    borderWidth: 1,
  },
});
