import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Background } from './src/components/Background';
import { CropSelectScreen } from './src/screens/CropSelectScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { DeviceRegisterScreen } from './src/screens/DeviceRegisterScreen';
import { DeviceSetupScreen } from './src/screens/DeviceSetupScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { ScoreScreen } from './src/screens/ScoreScreen';
import { ShopScreen } from './src/screens/ShopScreen';
import { type ChartRange } from './src/data';
import { colors, compactBreakpoint, glassWebStyle, maxContentWidth, typography } from './src/theme';

const PRETENDARD_CSS_URL =
  'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css';

if (
  Platform.OS === 'web' &&
  typeof document !== 'undefined' &&
  !document.querySelector(`link[href="${PRETENDARD_CSS_URL}"]`)
) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = PRETENDARD_CSS_URL;
  document.head.appendChild(link);
}

type Screen = 'login' | 'device' | 'crop' | 'setup' | 'score' | 'dashboard' | 'shop';
type AuthTab = 'login' | 'signup';

function scrollToTop() {
  if (typeof globalThis !== 'undefined' && typeof (globalThis as any).scrollTo === 'function') {
    (globalThis as any).scrollTo(0, 0);
  }
}

type AppBarProps = {
  isCompact: boolean;
  screen: Screen;
  goTo: (screen: Screen) => void;
};

function AppBar({ isCompact, screen, goTo }: AppBarProps) {
  const scoreActive = screen === 'score';
  const dashboardActive = screen === 'dashboard';
  const shopActive = screen === 'shop';

  return (
    <View style={styles.appBarWrap}>
      <View style={[styles.appBar, glassWebStyle as any, isCompact && styles.appBarCompact]}>
        <View style={styles.appBrand}>
          <LinearGradient
            colors={[colors.brandStart, colors.brandEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.appLogo}
          >
            <Text style={styles.appLogoText}>◍</Text>
          </LinearGradient>
          <Text style={styles.appName}>스마트 재배 도우미</Text>
        </View>

        <View style={[styles.appTabs, isCompact && styles.appTabsCompact]}>
          <Pressable
            accessibilityRole="button"
            onPress={() => goTo('score')}
            style={[styles.appTab, scoreActive && styles.activeAppTab]}
          >
            <Text style={[styles.appTabText, scoreActive && styles.activeAppTabText]}>환경 점수</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => goTo('dashboard')}
            style={[styles.appTab, dashboardActive && styles.activeAppTab]}
          >
            <Text style={[styles.appTabText, dashboardActive && styles.activeAppTabText]}>대시보드</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => goTo('shop')}
            style={[styles.appTab, shopActive && styles.activeAppTab]}
          >
            <Text style={[styles.appTabText, shopActive && styles.activeAppTabText]}>구매</Text>
          </Pressable>
        </View>

        <View style={styles.appRight}>
          <View style={styles.onlineIndicator}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineLabel}>기기 온라인</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => goTo('login')} style={styles.logoutButton}>
            <Text style={styles.logoutText}>로그아웃</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('login');
  const [authTab, setAuthTab] = useState<AuthTab>('login');
  const [selectedCrop, setSelectedCrop] = useState(0);
  const [connected, setConnected] = useState(false);
  const [chartRange, setChartRange] = useState<ChartRange>('24h');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { width } = useWindowDimensions();
  const isCompact = width < compactBreakpoint;

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const goTo = (nextScreen: Screen) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (nextScreen === 'setup') {
      setScreen('setup');
      setConnected(false);
      timerRef.current = setTimeout(() => {
        setConnected(true);
        timerRef.current = null;
      }, 2500);
    } else {
      setScreen(nextScreen);
    }

    scrollToTop();
  };

  return (
    <View style={[styles.root, styles.webRoot]}>
      <Background />
      <View style={styles.content}>
        {screen === 'score' || screen === 'dashboard' || screen === 'shop' ? (
          <AppBar goTo={goTo} isCompact={isCompact} screen={screen} />
        ) : null}

        {screen === 'login' ? (
          <LoginScreen authTab={authTab} onContinue={() => goTo('device')} setAuthTab={setAuthTab} />
        ) : null}
        {screen === 'device' ? <DeviceRegisterScreen onContinue={() => goTo('crop')} /> : null}
        {screen === 'crop' ? (
          <CropSelectScreen
            onContinue={() => goTo('setup')}
            selectedCrop={selectedCrop}
            setSelectedCrop={setSelectedCrop}
          />
        ) : null}
        {screen === 'setup' ? (
          <DeviceSetupScreen connected={connected} onContinue={() => goTo('score')} />
        ) : null}
        {screen === 'score' ? (
          <ScoreScreen
            isCompact={isCompact}
            onDashboard={() => goTo('dashboard')}
            onShop={() => goTo('shop')}
            selectedCrop={selectedCrop}
            setSelectedCrop={setSelectedCrop}
          />
        ) : null}
        {screen === 'dashboard' ? (
          <DashboardScreen
            chartRange={chartRange}
            isCompact={isCompact}
            onScore={() => goTo('score')}
            selectedCrop={selectedCrop}
            setChartRange={setChartRange}
          />
        ) : null}
        {screen === 'shop' ? <ShopScreen isCompact={isCompact} /> : null}
      </View>
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.pageMid,
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  webRoot: {
    minHeight: '100vh',
  } as any,
  content: {
    flex: 1,
    position: 'relative',
    zIndex: 1,
  },
  appBarWrap: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    position: 'sticky',
    top: 0,
    zIndex: 20,
  } as any,
  appBar: {
    alignItems: 'center',
    backgroundColor: colors.glass,
    borderColor: colors.lineSoft,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 20,
    maxWidth: maxContentWidth,
    paddingHorizontal: 20,
    paddingVertical: 12,
    shadowColor: '#1f3a2a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 32,
    width: '100%',
  },
  appBarCompact: {
    alignItems: 'flex-start',
    flexDirection: 'column',
  },
  appBrand: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  appLogo: {
    alignItems: 'center',
    borderRadius: 10,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  appLogoText: {
    color: '#fff',
    fontFamily: typography.fontFamily,
    fontSize: 15,
    fontWeight: '800',
  },
  appName: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
    fontSize: 17,
    fontWeight: '800',
  },
  appTabs: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
  },
  appTabsCompact: {
    flex: 0,
    width: '100%',
  },
  appTab: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  activeAppTab: {
    backgroundColor: 'rgba(63,174,111,0.9)',
  },
  appTabText: {
    color: '#3c5546',
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
  },
  activeAppTabText: {
    color: '#fff',
  },
  appRight: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  onlineIndicator: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  onlineDot: {
    backgroundColor: colors.deviceOnline,
    borderRadius: 999,
    height: 8,
    width: 8,
  },
  onlineLabel: {
    color: '#3c5546',
    fontFamily: typography.fontFamily,
    fontSize: 13,
  },
  logoutButton: {
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  logoutText: {
    color: '#3c5546',
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '600',
  },
});
