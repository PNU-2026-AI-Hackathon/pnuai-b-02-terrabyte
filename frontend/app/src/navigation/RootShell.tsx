import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { font } from '../appTheme/glass';
import { palette } from '../appTheme/palette';
import { scaleTypography } from '../appTheme/scaleTypography';
import { typeScale } from '../appTheme/typography';
import { ensureBrandFontLoaded } from '../appTheme/webFont';
import { clearAccessToken, getMe, loadAccessToken, type MeResponse } from '../auth/authApi';
import { BrandMark } from '../components/BrandMark';
import { selectPotCrop } from '../crop/cropApi';
import { crops } from '../data';
import { createPot, getDevice, type DeviceResponse, updatePot as updatePotRequest } from '../device/deviceApi';
import { Login } from '../onboarding/Login';
import { SetupFlow } from '../onboarding/SetupFlow';
import { getPot, getPots } from '../pot/potApi';
import { clearPaymentReturnUrl, readPaymentReturn } from '../payment/paymentReturn';
import { PaymentReturnScreen } from '../screens/payment/PaymentReturnScreen';
import { AppTabNavigator } from './AppTabNavigator';
import { GlassBackdrop } from './GlassBackdrop';
import type { FlowStage } from './types';

ensureBrandFontLoaded();

export default function RootShell() {
  const [flow, setFlow] = useState<FlowStage>('auth');
  const [restoringSession, setRestoringSession] = useState(true);
  const [selectedCropCode, setSelectedCropCode] = useState(crops[0].code);
  const [deviceId, setDeviceId] = useState<number | undefined>();
  const [device, setDevice] = useState<DeviceResponse | null>(null);
  const [selectedPotId, setSelectedPotId] = useState<number | undefined>();
  const [paymentReturn] = useState(readPaymentReturn);
  const [paymentReturnDismissed, setPaymentReturnDismissed] = useState(false);
  const { width } = useWindowDimensions();
  const compact = width < 900;
  const selectedCrop = Math.max(0, crops.findIndex((crop) => crop.code === selectedCropCode));

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const style = document.createElement('style');
    style.setAttribute('data-terrabyte-scrollbar', 'true');
    style.textContent = `
      *::-webkit-scrollbar {
        width: 11px;
        height: 11px;
      }
      *::-webkit-scrollbar-track {
        background: transparent !important;
        border: 1px solid transparent !important;
        border-radius: 999px;
      }
      *::-webkit-scrollbar-thumb {
        background: rgba(31, 102, 70, 0.32) !important;
        border: 2px solid rgba(255, 255, 255, 0.58) !important;
        border-radius: 999px;
        background-clip: padding-box;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.24), 0 1px 4px rgba(21, 46, 35, 0.08) !important;
      }
      *::-webkit-scrollbar-thumb:hover {
        background: rgba(31, 102, 70, 0.46) !important;
        background-clip: padding-box;
      }
      *::-webkit-scrollbar-corner {
        background: transparent;
      }
      * {
        scrollbar-color: rgba(31, 102, 70, 0.32) transparent !important;
        scrollbar-width: thin !important;
      }
    `;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  const applyAuthenticatedFlow = (me: MeResponse) => {
    setDeviceId(me.device?.id);
    setDevice(null);
    setSelectedPotId(undefined);
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
    if (!selectedPotId) throw new Error('작물을 선택할 화분 정보를 찾을 수 없습니다.');
    const selection = await selectPotCrop(selectedPotId, cropCode);
    setSelectedCropCode(selection.crop.code);
    setDevice((current) => current ? {
      ...current,
      pots: (current.pots ?? []).map((pot) => pot.id === selectedPotId ? { ...pot, cropCode: selection.crop.code } : pot),
    } : current);
  };

  const addPot = async (label: string, cropCode: string) => {
    if (!device?.id) throw new Error('화분을 추가할 공간을 찾을 수 없습니다.');
    const created = await createPot(device.id, { cropCode, label });
    const nextPot = { ...created, cropCode: created.cropCode ?? cropCode };
    setDevice((current) => current ? {
      ...current,
      pots: [...(current.pots ?? []), nextPot],
    } : current);
    setSelectedPotId(nextPot.id);
    setSelectedCropCode(nextPot.cropCode ?? crops[0].code);
  };

  const updatePot = async (potId: number, label: string, cropCode: string) => {
    const updated = await updatePotRequest(potId, { cropCode, label });
    const nextPot = { ...updated, cropCode: updated.cropCode ?? cropCode };
    setDevice((current) => current ? {
      ...current,
      pots: (current.pots ?? []).map((pot) => pot.id === potId ? nextPot : pot),
    } : current);
    if (potId === selectedPotId) setSelectedCropCode(nextPot.cropCode ?? crops[0].code);
  };

  const applyRegisteredDevice = (registered: DeviceResponse) => {
    const firstPot = (registered.pots ?? [])[0];
    setDeviceId(registered.id);
    setDevice(registered);
    setSelectedPotId(firstPot?.id);
    if (firstPot?.cropCode) setSelectedCropCode(firstPot.cropCode);
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

  useEffect(() => {
    if (!deviceId || device?.id === deviceId) return undefined;
    let active = true;
    void getDevice(deviceId)
      .then((nextDevice) => {
        if (!active) return;
        setDevice(nextDevice);
        setSelectedPotId((current) => (nextDevice.pots ?? []).some((pot) => pot.id === current)
          ? current
          : (nextDevice.pots ?? [])[0]?.id);
      })
      .catch(() => {
        // 기기 상세 재조회 실패는 각 화면의 데이터 상태에서 안전하게 표시한다.
      });
    return () => {
      active = false;
    };
  }, [deviceId, device?.id]);

  useEffect(() => {
    if (!device?.id) return undefined;
    let active = true;
    void getPots()
      .then((pots) => {
        if (!active) return;
        const devicePots = pots.filter((pot) => pot.deviceId === device.id);
        setDevice((current) => current?.id === device.id ? { ...current, pots: devicePots } : current);
        setSelectedPotId((current) => devicePots.some((pot) => pot.id === current)
          ? current
          : devicePots[0]?.id);
      })
      .catch(() => {
        // 목록 조회에 실패하면 기기 상세 응답에 포함된 화분 목록을 유지한다.
      });
    return () => {
      active = false;
    };
  }, [device?.id]);

  useEffect(() => {
    if (!selectedPotId) return undefined;
    let active = true;
    void getPot(selectedPotId)
      .then((pot) => {
        if (!active) return;
        setDevice((current) => {
          if (!current || pot.deviceId !== current.id) return current;
          const currentPots = current.pots ?? [];
          const exists = currentPots.some((currentPot) => currentPot.id === pot.id);
          return {
            ...current,
            pots: exists
              ? currentPots.map((currentPot) => currentPot.id === pot.id ? pot : currentPot)
              : [...currentPots, pot],
          };
        });
      })
      .catch(() => {
        // 상세 조회에 실패하면 목록에 있던 화분 정보를 유지한다.
      });
    return () => {
      active = false;
    };
  }, [selectedPotId]);

  useEffect(() => {
    const selectedPot = (device?.pots ?? []).find((pot) => pot.id === selectedPotId);
    setSelectedCropCode(selectedPot?.cropCode ?? crops[0].code);
  }, [device, selectedPotId]);

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

  if (paymentReturn && !paymentReturnDismissed) {
    return (
      <View style={styles.root}>
        <GlassBackdrop />
        <PaymentReturnScreen
          result={paymentReturn}
          onDone={() => {
            clearPaymentReturnUrl();
            setPaymentReturnDismissed(true);
          }}
        />
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
          selectedPotId={selectedPotId}
          onBack={() => setFlow(previousStage[flow])}
          onCropSelected={setSelectedCropCode}
          onDeviceRegistered={applyRegisteredDevice}
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
        device={device ?? undefined}
        initialPage={paymentReturn ? 'shop' : 'dashboard'}
        onCreatePot={addPot}
        onSelectPot={setSelectedPotId}
        onUpdatePot={updatePot}
        onLogout={() => {
          void clearAccessToken();
          setDeviceId(undefined);
          setDevice(null);
          setSelectedPotId(undefined);
          setSelectedCropCode(crops[0].code);
          setFlow('auth');
        }}
        onSelectCrop={changeSelectedCrop}
        pots={device?.pots ?? []}
        selectedCrop={selectedCrop}
        selectedPotId={selectedPotId}
      />
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create(scaleTypography({
  root: { backgroundColor: palette.background, flex: 1, minHeight: '100vh', overflow: 'hidden', position: 'relative' } as any,
  sessionLoading: { alignItems: 'center', gap: 18, justifyContent: 'center' },
  sessionLoadingText: { ...typeScale.bodyStrong, color: palette.secondary, fontFamily: font },
}));
