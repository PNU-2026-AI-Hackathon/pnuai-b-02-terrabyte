import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { font } from '../appTheme/glass';
import { palette } from '../appTheme/palette';
import { scaleTypography } from '../appTheme/scaleTypography';
import { typeScale } from '../appTheme/typography';
import {
  clearAccessToken,
  getMe,
  login,
  saveAccessToken,
  signup,
  type MeResponse,
} from '../auth/authApi';
import { ActionButton } from '../components/ActionButton';
import { BrandMark } from '../components/BrandMark';
import { Surface } from '../components/Surface';

export function Login({ onAuthenticated }: { onAuthenticated: (me: MeResponse) => void }) {
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const changeMode = (nextMode: 'login' | 'signup') => {
    setMode(nextMode);
    setError(null);
  };

  const submit = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedNickname = nickname.trim();

    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setError('올바른 이메일을 입력해 주세요.');
      return;
    }
    if (!password) {
      setError('비밀번호를 입력해 주세요.');
      return;
    }
    if (mode === 'signup' && (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password))) {
      setError('비밀번호는 8자 이상이며 영문과 숫자를 포함해야 합니다.');
      return;
    }
    if (mode === 'signup' && (normalizedNickname.length < 2 || normalizedNickname.length > 20)) {
      setError('닉네임은 2자 이상 20자 이하로 입력해 주세요.');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const auth = mode === 'login'
        ? await login(normalizedEmail, password)
        : await signup(normalizedEmail, password, normalizedNickname);
      await saveAccessToken(auth.accessToken);
      const me = await getMe(auth.accessToken);
      onAuthenticated(me);
    } catch (requestError) {
      await clearAccessToken();
      setError(requestError instanceof Error ? requestError.message : '요청을 처리하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.loginPage}>
      <View style={[styles.loginFrame, compact && styles.loginFrameCompact]}>
        <View style={[styles.loginIntro, compact && styles.loginIntroCompact]}>
          <BrandMark />
          <Text style={[styles.loginTitle, compact && styles.loginTitleCompact]}>
            재배 환경을{compact ? ' ' : '\n'}한눈에 관리하세요.
          </Text>
          <Text style={[styles.loginDescription, compact && styles.centerText]}>
            센서 데이터와 작물별 환경 분석을 바탕으로 필요한 관리 항목을 빠르게 확인할 수 있습니다.
          </Text>
          {!compact ? (
            <View style={styles.loginFacts}>
              <View style={styles.loginFact}>
                <Text style={styles.loginFactValue}>8개</Text>
                <Text style={styles.loginFactLabel}>공간·토양 측정 지표</Text>
              </View>
              <View style={styles.loginFactDivider} />
              <View style={styles.loginFact}>
                <Text style={styles.loginFactValue}>24시간</Text>
                <Text style={styles.loginFactLabel}>연속 환경 분석</Text>
              </View>
            </View>
          ) : null}
        </View>

        <Surface style={styles.loginPanel}>
          <View style={styles.loginPanelHeader}>
            <View style={styles.authTabs}>
              <Pressable disabled={submitting} onPress={() => changeMode('login')} style={[styles.authTab, mode === 'login' && styles.authTabActive]}>
                <Text style={[styles.authTabText, mode === 'login' && styles.authTabTextActive]}>로그인</Text>
              </Pressable>
              <Pressable disabled={submitting} onPress={() => changeMode('signup')} style={[styles.authTab, mode === 'signup' && styles.authTabActive]}>
                <Text style={[styles.authTabText, mode === 'signup' && styles.authTabTextActive]}>회원가입</Text>
              </Pressable>
            </View>
            <Text style={styles.loginPanelTitle}>{mode === 'login' ? '다시 만나 반가워요' : '농장을 시작해 볼까요?'}</Text>
            <Text style={styles.loginPanelDescription}>
              {mode === 'login' ? '등록한 계정으로 서비스를 시작하세요.' : '계정을 만들고 첫 번째 재배 공간을 등록하세요.'}
            </Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>이메일</Text>
            <TextInput
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!submitting}
              onChangeText={setEmail}
              placeholder="name@example.com"
              placeholderTextColor={palette.muted}
              style={styles.input}
              value={email}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>비밀번호</Text>
            <TextInput
              editable={!submitting}
              onChangeText={setPassword}
              placeholder="비밀번호를 입력하세요"
              placeholderTextColor={palette.muted}
              secureTextEntry
              style={styles.input}
              value={password}
            />
          </View>
          {mode === 'signup' ? (
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>닉네임</Text>
              <TextInput
                editable={!submitting}
                onChangeText={setNickname}
                placeholder="사용할 이름을 입력하세요"
                placeholderTextColor={palette.muted}
                style={styles.input}
                value={nickname}
              />
            </View>
          ) : null}
          {error ? <Text accessibilityRole="alert" style={styles.authError}>{error}</Text> : null}
          <ActionButton
            disabled={submitting}
            label={submitting ? '처리 중…' : mode === 'login' ? '로그인' : '계정 만들기'}
            onPress={() => void submit()}
          />
        </Surface>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create(scaleTypography({
  loginPage: { alignItems: 'center', flexGrow: 1, justifyContent: 'center', padding: 32 },
  loginFrame: { alignItems: 'center', flexDirection: 'row', gap: 100, maxWidth: 980, width: '100%' },
  loginFrameCompact: { flexDirection: 'column', gap: 38 },
  loginIntro: { flex: 1, maxWidth: 460 },
  loginIntroCompact: { alignItems: 'center' },
  loginTitle: { ...typeScale.pageTitle, color: palette.text, fontFamily: font, marginTop: 24 },
  loginTitleCompact: { fontSize: 31, lineHeight: 42, textAlign: 'center' },
  loginDescription: { ...typeScale.body, color: palette.secondary, fontFamily: font, marginTop: 18, maxWidth: 460 },
  centerText: { textAlign: 'center' },
  loginFacts: { alignItems: 'center', flexDirection: 'row', gap: 28, marginTop: 38 },
  loginFact: { gap: 4 },
  loginFactValue: { ...typeScale.cardTitle, color: palette.text, fontFamily: font },
  loginFactLabel: { ...typeScale.caption, color: palette.muted, fontFamily: font },
  loginFactDivider: { backgroundColor: palette.lineStrong, height: 38, width: 1 },
  loginPanel: { gap: 20, maxWidth: 410, padding: 32, width: '100%' },
  loginPanelHeader: { gap: 6, marginBottom: 4 },
  authTabs: { backgroundColor: palette.panelMuted, borderColor: palette.line, borderRadius: 9, borderWidth: 1, flexDirection: 'row', marginBottom: 18, padding: 4 },
  authTab: { alignItems: 'center', borderRadius: 6, flex: 1, paddingVertical: 9 },
  authTabActive: { backgroundColor: palette.panel, shadowColor: '#203329', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6 },
  authTabText: { ...typeScale.label, color: palette.muted, fontFamily: font },
  authTabTextActive: { color: palette.greenDark, fontWeight: '700' },
  loginPanelTitle: { ...typeScale.sectionTitle, color: palette.text, fontFamily: font },
  loginPanelDescription: { ...typeScale.body, color: palette.secondary, fontFamily: font },
  authError: { ...typeScale.label, color: palette.red, fontFamily: font },
  field: { gap: 7 },
  fieldLabel: { ...typeScale.label, color: palette.secondary, fontFamily: font },
  input: { ...typeScale.body, backgroundColor: 'rgba(255,255,255,0.48)', borderColor: palette.lineStrong, borderRadius: 12, borderWidth: 1, color: palette.text, fontFamily: font, minHeight: 54, paddingHorizontal: 16 },
}));
