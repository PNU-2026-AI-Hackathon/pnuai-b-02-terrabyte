import { Pressable, StyleSheet, Text } from 'react-native';

import { font } from '../appTheme/glass';
import { palette } from '../appTheme/palette';
import { scaleTypography } from '../appTheme/scaleTypography';

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
      alignItems: 'center',
      alignSelf: 'flex-end',
      backgroundColor: palette.green,
      borderRadius: 9,
      justifyContent: 'center',
      minHeight: 48,
      minWidth: 154,
      paddingHorizontal: 24,
    },
    quietButton: { backgroundColor: palette.greenSoft, borderColor: '#c9dfd1', borderWidth: 1 },
    disabledButton: { opacity: 0.5 },
    pressed: { opacity: 0.78 },
    actionButtonText: { color: '#ffffff', fontFamily: font, fontSize: 16, fontWeight: '800' },
    quietButtonText: { color: palette.greenDark },
  }),
);
