import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '../components/GlassCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { StepIndicator } from '../components/StepIndicator';
import { colors, typography } from '../theme';

type DeviceRegisterScreenProps = {
  onContinue: () => void;
};

const fullHeight = { minHeight: '100vh' } as any;
const dashedBackground = {
  backgroundImage:
    'repeating-linear-gradient(45deg, rgba(255,255,255,0.4), rgba(255,255,255,0.4) 10px, rgba(255,255,255,0.15) 10px, rgba(255,255,255,0.15) 20px)',
} as any;

export function DeviceRegisterScreen({ onContinue }: DeviceRegisterScreenProps) {
  return (
    <ScrollView contentContainerStyle={[styles.screen, fullHeight]}>
      <StepIndicator current={1} />
      <GlassCard style={styles.card}>
        <View>
          <Text style={styles.heading}>기기를 등록해 주세요</Text>
          <Text style={styles.subheading}>기기 밑면 스티커의 숫자 6자리를 입력하세요.</Text>
        </View>

        <View style={[styles.placeholder, dashedBackground]}>
          <Text style={styles.placeholderText}>[ 코드 위치 안내 이미지 — 기기 밑면 스티커 ]</Text>
        </View>

        <View style={styles.otpRow}>
          {'483920'.split('').map((digit, index) => (
            <View key={`${digit}-${index}`} style={styles.otpBox}>
              <Text style={styles.otpText}>{digit}</Text>
            </View>
          ))}
        </View>

        <PrimaryButton label="등록하기" onPress={onContinue} />
      </GlassCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    gap: 24,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  card: {
    gap: 22,
    maxWidth: 480,
    padding: 32,
    width: '100%',
  },
  heading: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
    fontSize: 22,
    fontWeight: '800',
  },
  subheading: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 6,
  },
  placeholder: {
    alignItems: 'center',
    borderColor: 'rgba(90,120,100,0.5)',
    borderRadius: 16,
    borderStyle: 'dashed',
    borderWidth: 1,
    height: 130,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  placeholderText: {
    color: '#5a7466',
    fontFamily: 'monospace',
    fontSize: 12,
    textAlign: 'center',
  },
  otpRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  otpBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderColor: 'rgba(255,255,255,0.8)',
    borderRadius: 14,
    borderWidth: 1,
    height: 62,
    justifyContent: 'center',
    width: 52,
  },
  otpText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
    fontSize: 26,
    fontWeight: '800',
  },
});
