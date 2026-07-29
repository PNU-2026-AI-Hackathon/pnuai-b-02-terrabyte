import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { font } from '../appTheme/glass';
import { palette } from '../appTheme/palette';
import { scaleTypography } from '../appTheme/scaleTypography';
import { AnalysisScreen } from '../screens/analysis/AnalysisScreen';
import { DashboardScreen } from '../screens/dashboard/DashboardScreen';
import { HistoryScreen } from '../screens/history/HistoryScreen';
import { GuideScreen } from '../screens/guide/GuideScreen';
import { LiveScreen } from '../screens/live/LiveScreen';
import { ShopScreen } from '../screens/shop/ShopScreen';
import { DeviceEnvironmentProvider } from '../shared/device-environment/DeviceEnvironmentProvider';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import type { AppTabParamList, Page } from './types';

const Tab = createBottomTabNavigator<AppTabParamList>();

const routeNameByPage: Record<Page, keyof AppTabParamList> = {
  dashboard: 'Dashboard',
  analysis: 'Analysis',
  live: 'Live',
  history: 'History',
  guide: 'Guide',
  shop: 'Shop',
};

const pageByRouteName: Record<keyof AppTabParamList, Page> = {
  Dashboard: 'dashboard',
  Analysis: 'analysis',
  Live: 'live',
  History: 'history',
  Guide: 'guide',
  Shop: 'shop',
};

function ScreenLayout({ children, compact, page }: { children: ReactNode; compact: boolean; page: Page }) {
  return (
    <View style={styles.workspace}>
      <Header compact={compact} page={page} />
      <ScrollView contentContainerStyle={[styles.workspaceScroll, compact && styles.workspaceScrollCompact]}>
        {children}
      </ScrollView>
    </View>
  );
}

type AppTabNavigatorProps = {
  compact: boolean;
  cropName: string;
  deviceId?: number;
  onLogout: () => void;
  onSelectCrop: (cropCode: string) => Promise<void>;
  selectedCrop: number;
};

const appShellFill = { flex: 1 };

export function AppTabNavigator({ compact, cropName, deviceId, onLogout, onSelectCrop, selectedCrop }: AppTabNavigatorProps) {
  const navigationRef = useNavigationContainerRef<AppTabParamList>();
  const [page, setPage] = useState<Page>('dashboard');
  const [sidebarHidden, setSidebarHidden] = useState(false);

  const syncActivePage = () => {
    const routeName = navigationRef.current?.getCurrentRoute()?.name as keyof AppTabParamList | undefined;
    if (routeName) setPage(pageByRouteName[routeName]);
  };

  const goToPage = (nextPage: Page) => navigationRef.current?.navigate(routeNameByPage[nextPage]);

  return (
    <DeviceEnvironmentProvider deviceId={deviceId}>
      <View style={[styles.appShell, compact && styles.appShellCompact, appShellFill]}>
        {!compact && sidebarHidden ? (
          <Pressable accessibilityLabel="사이드바 펼치기" accessibilityRole="button" onPress={() => setSidebarHidden(false)} style={styles.showSidebarButton}>
            <Text style={styles.showSidebarButtonText}>☰</Text>
          </Pressable>
        ) : (
          <Sidebar
            compact={compact}
            cropName={cropName}
            onHide={compact ? undefined : () => setSidebarHidden(true)}
            onLogout={onLogout}
            onNavigate={goToPage}
            page={page}
          />
        )}
        <NavigationContainer onReady={syncActivePage} onStateChange={syncActivePage} ref={navigationRef}>
          <Tab.Navigator screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
            <Tab.Screen name="Dashboard">
              {() => (
                <ScreenLayout compact={compact} page="dashboard">
                  <DashboardScreen compact={compact} onNavigate={goToPage} selectedCrop={selectedCrop} />
                </ScreenLayout>
              )}
            </Tab.Screen>
            <Tab.Screen name="Analysis">
              {() => (
                <ScreenLayout compact={compact} page="analysis">
                  <AnalysisScreen compact={compact} onNavigate={goToPage} onSelectCrop={onSelectCrop} selectedCrop={selectedCrop} />
                </ScreenLayout>
              )}
            </Tab.Screen>
            <Tab.Screen name="Live">
              {() => (
                <ScreenLayout compact={compact} page="live">
                  <LiveScreen compact={compact} />
                </ScreenLayout>
              )}
            </Tab.Screen>
            <Tab.Screen name="History">
              {() => (
                <ScreenLayout compact={compact} page="history">
                  <HistoryScreen compact={compact} onNavigate={goToPage} />
                </ScreenLayout>
              )}
            </Tab.Screen>
            <Tab.Screen name="Guide">
              {() => (
                <ScreenLayout compact={compact} page="guide">
                  <GuideScreen compact={compact} onNavigate={goToPage} />
                </ScreenLayout>
              )}
            </Tab.Screen>
            <Tab.Screen name="Shop">
              {() => (
                <ScreenLayout compact={compact} page="shop">
                  <ShopScreen compact={compact} />
                </ScreenLayout>
              )}
            </Tab.Screen>
          </Tab.Navigator>
        </NavigationContainer>
      </View>
    </DeviceEnvironmentProvider>
  );
}

const styles = StyleSheet.create(scaleTypography({
  appShell: { flexDirection: 'row' },
  appShellCompact: { flexDirection: 'column' },
  workspace: { flex: 1, minWidth: 0, zIndex: 1 },
  workspaceScroll: { alignItems: 'center', paddingBottom: 88, paddingHorizontal: 48 },
  workspaceScrollCompact: { paddingBottom: 56, paddingHorizontal: 20 },
  showSidebarButton: {
    alignItems: 'center',
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 8,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    left: 14,
    position: 'absolute',
    top: 38,
    width: 30,
    zIndex: 3,
  },
  showSidebarButtonText: { color: palette.secondary, fontFamily: font, fontSize: 17, fontWeight: '900' },
}));
