import { StyleSheet, Text, View } from 'react-native';

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

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  step: {
    backgroundColor: 'rgba(255,255,255,0.45)',
    borderColor: 'rgba(255,255,255,0.6)',
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  activeStep: {
    backgroundColor: 'rgba(63,174,111,0.9)',
    borderColor: 'rgba(63,174,111,0.9)',
  },
  stepText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '600',
  },
  activeText: {
    color: '#fff',
  },
});
