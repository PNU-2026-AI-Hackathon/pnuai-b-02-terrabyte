import { Pressable, StyleSheet, Text } from 'react-native';

import { controlTextTokens, controlTokens } from '../appTheme/controls';
import { font } from '../appTheme/glass';
import { scaleTypography } from '../appTheme/scaleTypography';
import { typeScale } from '../appTheme/typography';

type ActionButtonProps = {
  disabled?: boolean;
  label: string;
  onPress: () => void;
  quiet?: boolean;
};

export function ActionButton({ disabled = false, label, onPress, quiet = false }: ActionButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        quiet && styles.quietButton,
        disabled && styles.disabledButton,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.actionButtonText, quiet && styles.quietButtonText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create(
  scaleTypography({
    actionButton: {
      ...controlTokens.primary,
      alignSelf: 'flex-end',
      minWidth: 154,
      paddingHorizontal: 24,
    },
    quietButton: { ...controlTokens.secondary },
    disabledButton: { opacity: 0.5 },
    pressed: { opacity: 0.78 },
    actionButtonText: { ...typeScale.button, ...controlTextTokens.primary, fontFamily: font },
    quietButtonText: { ...controlTextTokens.secondary },
  }),
);
