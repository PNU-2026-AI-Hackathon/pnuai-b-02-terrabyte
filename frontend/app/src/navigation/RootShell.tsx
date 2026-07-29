import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { font } from '../appTheme/glass';
import { palette } from '../appTheme/palette';
import { scaleTypography } from '../appTheme/scaleTypography';
import { ensureBrandFontLoaded } from '../appTheme/webFont';
import { clearAccessToken, getMe, loadAccessToken, type MeResponse } from '../auth/authApi';
import { BrandMark } from '../components/BrandMark';
import { selectDeviceCrop } from '../crop/cropApi';
import { crops } from '../data';
import { Login } from '../onboarding/Login';
import { SetupFlow } from '../onboarding/SetupFlow';
import { AppTabNavigator } from './AppTabNavigator';
import { GlassBackdrop } from './GlassBackdrop';
import type { FlowStage } from './types';

ensureBrandFontLoaded();

export default function RootShell() {
  const [flow, setFlow] = useState<FlowStage>('auth');
  const [restoringSession, setRestoringSession] = useState(true);
  const [selectedCropCode, setSelectedCropCode] = useState(crops[0].code);
  const [deviceId, setDeviceId] = useState<number | undefined>();
  const { width } = useWindowDimensions();
  const compact = width < 900;
  const selectedCrop = Math.max(0, crops.findIndex((crop) => crop.code === selectedCropCode));

  const applyAuthenticatedFlow = (me: MeResponse) => {
    setDeviceId(me.device?.id);
    if (me.device?.cropCode) setSelectedCropCode(me.device.cropCode);
    if (!me.hasDevice) {
      setFlow('device');
    } else if (!me.hasCrop) {
      setFlow('crop');
    } else {
      setFlow('app');
    }
  };

  const changeSelectedCrop = async (cropCode: string) => {
    if (!deviceId) throw new Error('작물을 선택할 기기 정보를 찾을 수 없습니다.');
    const selection = await selectDeviceCrop(deviceId, cropCode);
    setSelectedCropCode(selection.crop.code);
  };

  useEffect(() => {
    let active = true;
    const restoreSession = async () => {
      try {
        const accessToken = await loadAccessToken();
        if (!accessToken) return;
        const me = await getMe(accessToken);
        if (active) applyAuthenticatedFlow(me);
      } catch {
        await clearAccessToken();
      } finally {
        if (active) setRestoringSession(false);
      }
    };
    void restoreSession();
    return () => {
      active = false;
    };
  }, []);

  if (restoringSession) {
    return (
      <View style={[styles.root, styles.sessionLoading]}>
        <GlassBackdrop />
        <BrandMark />
        <Text style={styles.sessionLoadingText}>로그인 상태를 확인하고 있어요…</Text>
        <StatusBar style="dark" />
      </View>
    );
  }

  if (flow === 'auth') {
    return (
      <View style={styles.root}>
        <GlassBackdrop />
        <Login onAuthenticated={applyAuthenticatedFlow} />
        <StatusBar style="dark" />
      </View>
    );
  }

  if (flow !== 'app') {
    const previousStage: Record<Exclude<FlowStage, 'auth' | 'app'>, FlowStage> = {
      device: 'auth',
      crop: 'device',
      setup: 'crop',
    };
    const nextStage: Record<Exclude<FlowStage, 'auth' | 'app'>, FlowStage> = {
      device: 'crop',
      crop: 'setup',
      setup: 'app',
    };
    return (
      <View style={styles.root}>
        <GlassBackdrop />
        <SetupFlow
          deviceId={deviceId}
          onBack={() => setFlow(previousStage[flow])}
          onCropSelected={setSelectedCropCode}
          onDeviceRegistered={setDeviceId}
          onNext={() => setFlow(nextStage[flow])}
          selectedCropCode={selectedCropCode}
          stage={flow}
        />
        <StatusBar style="dark" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <GlassBackdrop />
      <AppTabNavigator
        compact={compact}
        cropName={(crops[selectedCrop] ?? crops[0]).name}
        deviceId={deviceId}
        onLogout={() => {
          void clearAccessToken();
          setDeviceId(undefined);
          setSelectedCropCode(crops[0].code);
          setFlow('auth');
        }}
        onSelectCrop={changeSelectedCrop}
        selectedCrop={selectedCrop}
      />
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create(scaleTypography({
  root: { backgroundColor: palette.background, flex: 1, minHeight: '100vh', overflow: 'hidden', position: 'relative' } as any,
  sessionLoading: { alignItems: 'center', gap: 18, justifyContent: 'center' },
  sessionLoadingText: { color: palette.secondary, fontFamily: font, fontSize: 16, fontWeight: '700' },
}));
