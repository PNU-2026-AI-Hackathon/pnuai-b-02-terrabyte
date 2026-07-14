import { useEffect, useRef } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '../components/GlassCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { StepIndicator } from '../components/StepIndicator';
import { colors, typography } from '../theme';

type DeviceSetupScreenProps = {
  connected: boolean;
  onContinue: () => void;
};

const fullHeight = { minHeight: '100vh' } as any;

const setupSteps = [
  '기기를 화분/재배 위치 바로 옆에 놓아 주세요',
  '전원을 연결하고 센서를 흙에 꽂아 주세요',
  '잠시 후 자동으로 측정이 시작돼요',
];

export function DeviceSetupScreen({ connected, onContinue }: DeviceSetupScreenProps) {
  const pulseOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (connected) {
      pulseOpacity.setValue(1);
      return undefined;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseOpacity, {
          duration: 600,
          toValue: 0.35,
          useNativeDriver: false,
        }),
        Animated.timing(pulseOpacity, {
          duration: 600,
          toValue: 1,
          useNativeDriver: false,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [connected, pulseOpacity]);

  return (
    <ScrollView contentContainerStyle={[styles.screen, fullHeight]}>
      <StepIndicator current={3} />
      <GlassCard style={styles.card}>
        <View>
          <Text style={styles.heading}>기기를 설치해 주세요</Text>
          <Text style={styles.subheading}>아래 순서대로 설치하면 측정이 자동으로 시작돼요.</Text>
        </View>

        <View style={styles.steps}>
          {setupSteps.map((step, index) => (
            <View key={step} style={styles.stepRow}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{index + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.status, connected ? styles.connectedStatus : styles.connectingStatus]}>
          <Animated.View
            style={[
              styles.statusDot,
              connected ? styles.connectedDot : styles.connectingDot,
              !connected && { opacity: pulseOpacity },
            ]}
          />
          <Text style={[styles.statusText, connected ? styles.connectedText : styles.connectingText]}>
            {connected ? '연결 완료! 첫 측정 데이터를 받았어요' : '기기 신호를 기다리는 중…'}
          </Text>
        </View>

        <PrimaryButton
          disabled={!connected}
          label="환경 점수 보러 가기"
          onPress={connected ? onContinue : undefined}
        />
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
    gap: 20,
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
    marginTop: 6,
  },
  steps: {
    gap: 12,
  },
  stepRow: {
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.45)',
    borderColor: 'rgba(255,255,255,0.6)',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    padding: 14,
  },
  stepNumber: {
    alignItems: 'center',
    backgroundColor: 'rgba(63,174,111,0.9)',
    borderRadius: 999,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  stepNumberText: {
    color: '#fff',
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '800',
  },
  stepText: {
    color: '#2c4436',
    flex: 1,
    fontFamily: typography.fontFamily,
    fontSize: 14,
    lineHeight: 22,
  },
  status: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
  },
  connectingStatus: {
    backgroundColor: 'rgba(255,244,214,0.6)',
    borderColor: 'rgba(230,200,120,0.5)',
  },
  connectedStatus: {
    backgroundColor: 'rgba(216,245,226,0.65)',
    borderColor: 'rgba(80,180,110,0.45)',
  },
  statusDot: {
    borderRadius: 999,
    height: 12,
    width: 12,
  },
  connectingDot: {
    backgroundColor: '#d9a13b',
  },
  connectedDot: {
    backgroundColor: colors.deviceOnline,
  },
  statusText: {
    flex: 1,
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
  },
  connectingText: {
    color: colors.warnText,
  },
  connectedText: {
    color: colors.okText,
  },
});
