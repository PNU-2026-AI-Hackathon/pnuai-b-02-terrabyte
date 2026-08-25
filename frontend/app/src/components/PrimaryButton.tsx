import type { ReactNode } from 'react';
import type { GestureResponderEvent, StyleProp, TextStyle, ViewStyle } from 'react-native';
import { Pressable, StyleSheet, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { controlTokens } from '../appTheme/controls';
import { font } from '../appTheme/glass';
import { palette } from '../appTheme/palette';
import { typeScale } from '../appTheme/typography';

type PrimaryButtonProps = {
  label: string;
  onPress?: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  children?: ReactNode;
};

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  style,
  textStyle,
  children,
}: PrimaryButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pressable,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <LinearGradient
        colors={[palette.green, palette.greenDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        {children ?? <Text style={[styles.text, textStyle]}>{label}</Text>}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // 크기와 여백은 그라데이션이 전부 가진다. 이전에는 pressable 이
  // controlTokens.primary 의 backgroundColor 와 padding 을 함께 써서,
  // 그 패딩만큼 그라데이션이 안으로 밀리고 여백에 단색 초록이 드러났다.
  // 단색 테두리가 그라데이션을 감싸는 것처럼 보이던 원인이다.
  pressable: {
    borderRadius: controlTokens.primary.borderRadius,
    overflow: 'hidden',
    shadowColor: '#2b8f6e',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 2,
  },
  gradient: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: controlTokens.primary.minHeight,
    paddingHorizontal: controlTokens.primary.paddingHorizontal,
    paddingVertical: controlTokens.primary.paddingVertical,
  },
  text: {
    ...typeScale.button,
    color: '#fff',
    fontFamily: font,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.9,
  },
});
