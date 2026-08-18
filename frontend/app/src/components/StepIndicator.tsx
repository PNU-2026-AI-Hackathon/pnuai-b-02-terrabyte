import { StyleSheet, Text, View } from 'react-native';

import { scaleTypography } from '../appTheme/scaleTypography';
import { colors, radii, typography } from '../theme';

type StepIndicatorProps = {
  current: 1 | 2 | 3;
};

const steps = ['기기 등록', '작물 선택', '기기 설치'];

export function StepIndicator({ current }: StepIndicatorProps) {
  return (
    <View style={styles.wrap}>
      {steps.map((step, index) => {
        const stepNumber = index + 1;
        const active = stepNumber === current;
        const complete = stepNumber < current;
        return (
          <View key={step} style={[styles.step, active && styles.activeStep]}>
            <Text style={[styles.stepText, active && styles.activeText]}>
              {complete ? '✓' : stepNumber} {step}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create(scaleTypography({
  wrap: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  step: {
    backgroundColor: colors.glassStrong,
    borderColor: colors.lineSoft,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  activeStep: {
    backgroundColor: colors.accentGreen,
    borderColor: colors.accentGreen,
  },
  stepText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
  },
  activeText: {
    color: '#fff',
  },
}));
