import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { GlassCard } from '../components/GlassCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { SegmentedTabs } from '../components/SegmentedTabs';
import { colors, radii, typography } from '../theme';

type LoginScreenProps = {
  authTab: 'login' | 'signup';
  setAuthTab: (tab: 'login' | 'signup') => void;
  onContinue: () => void;
};

const fullHeight = { minHeight: '100vh' } as any;
const inputWeb = { outlineStyle: 'none' } as any;

export function LoginScreen({ authTab, setAuthTab, onContinue }: LoginScreenProps) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const isSignup = authTab === 'signup';

  return (
    <ScrollView contentContainerStyle={[styles.screen, fullHeight]}>
      <View style={styles.brandHeader}>
        <LinearGradient
          colors={[colors.brandStart, colors.brandEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.logoTile}
        >
          <Text style={styles.logoText}>◍</Text>
        </LinearGradient>
        <Text style={styles.title}>스마트 재배 도우미</Text>
        <Text style={styles.subtitle}>내 화분의 환경을 측정하고, 딱 맞는 재배 조건을 찾아 드려요</Text>
      </View>

      <GlassCard style={styles.card}>
        <SegmentedTabs
          value={authTab}
          options={[
            { key: 'login', label: '로그인' },
            { key: 'signup', label: '회원가입' },
          ]}
          onChange={setAuthTab}
        />

        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>이메일</Text>
            <TextInput
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@example.com"
              placeholderTextColor="#8aa192"
              style={[styles.input, inputWeb]}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>비밀번호</Text>
            <View style={styles.passwordRow}>
              <TextInput
                autoCapitalize="none"
                placeholder="8자 이상, 영문+숫자"
                placeholderTextColor="#8aa192"
                secureTextEntry={!passwordVisible}
                style={[styles.input, styles.passwordInput, inputWeb]}
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => setPasswordVisible((visible) => !visible)}
                style={styles.revealButton}
              >
                <Text style={styles.revealText}>표시</Text>
              </Pressable>
            </View>
          </View>

          {isSignup ? (
            <>
              <View style={styles.field}>
                <Text style={styles.label}>비밀번호 확인</Text>
                <TextInput
                  autoCapitalize="none"
                  placeholder="비밀번호 재입력"
                  placeholderTextColor="#8aa192"
                  secureTextEntry
                  style={[styles.input, inputWeb]}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>닉네임</Text>
                <TextInput
                  placeholder="예: 초록집사"
                  placeholderTextColor="#8aa192"
                  style={[styles.input, inputWeb]}
                />
              </View>
            </>
          ) : null}

          <PrimaryButton label={isSignup ? '가입하기' : '로그인'} onPress={onContinue} style={styles.submit} />
        </View>
      </GlassCard>

      <Text style={styles.footer}>프로토타입 — 아무 값이나 입력하고 진행하세요</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    gap: 28,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  brandHeader: {
    alignItems: 'center',
    gap: 10,
  },
  logoTile: {
    alignItems: 'center',
    borderRadius: 20,
    height: 64,
    justifyContent: 'center',
    shadowColor: '#2b8f6e',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 32,
    width: 64,
  },
  logoText: {
    color: '#fff',
    fontFamily: typography.fontFamily,
    fontSize: 30,
    fontWeight: '800',
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
    fontSize: 26,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
    fontSize: 14,
    textAlign: 'center',
  },
  card: {
    maxWidth: 420,
    padding: 28,
    width: '100%',
  },
  form: {
    gap: 14,
    marginTop: 24,
  },
  field: {
    gap: 6,
  },
  label: {
    color: '#3c5546',
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderColor: 'rgba(255,255,255,0.8)',
    borderRadius: 12,
    borderWidth: 1,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
    fontSize: 15,
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  passwordRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: 8,
  },
  passwordInput: {
    flex: 1,
  },
  revealButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderColor: 'rgba(255,255,255,0.8)',
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  revealText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
    fontSize: 13,
  },
  submit: {
    marginTop: 6,
  },
  footer: {
    color: '#6b8274',
    fontFamily: typography.fontFamily,
    fontSize: 12,
    textAlign: 'center',
  },
});
