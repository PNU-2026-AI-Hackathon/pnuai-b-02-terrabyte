import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { font } from '../appTheme/glass';
import { palette } from '../appTheme/palette';
import { scaleTypography } from '../appTheme/scaleTypography';
import type { PotResponse } from '../device/deviceApi';
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

function PotSelector({ onSelect, pots, selectedPotId }: {
  onSelect: (potId: number) => void;
  pots: PotResponse[];
  selectedPotId?: number;
}) {
  if (pots.length === 0) return null;
  return (
    <View accessibilityLabel="화분 선택" style={styles.potSelector}>
      {pots.slice(0, 4).map((pot) => {
        const selected = pot.id === selectedPotId;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={pot.id}
            onPress={() => onSelect(pot.id)}
            style={[styles.potButton, selected && styles.potButtonSelected]}
          >
            <Text style={[styles.potButtonText, selected && styles.potButtonTextSelected]}>{pot.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ScreenLayout({ children, compact, onSelectPot, page, pots, selectedPotId }: {
  children: ReactNode;
  compact: boolean;
  onSelectPot: (potId: number) => void;
  page: Page;
  pots: PotResponse[];
  selectedPotId?: number;
}) {
  return (
    <View style={styles.workspace}>
      <Header compact={compact} page={page} />
      <ScrollView contentContainerStyle={[styles.workspaceScroll, compact && styles.workspaceScrollCompact]}>
        <PotSelector onSelect={onSelectPot} pots={pots} selectedPotId={selectedPotId} />
        {children}
      </ScrollView>
    </View>
  );
}

type AppTabNavigatorProps = {
  compact: boolean;
  cropName: string;
  onLogout: () => void;
  onSelectCrop: (cropCode: string) => Promise<void>;
  onSelectPot: (potId: number) => void;
  pots: PotResponse[];
  selectedCrop: number;
  selectedPotId?: number;
};

const appShellFill = { flex: 1 };

export function AppTabNavigator({ compact, cropName, onLogout, onSelectCrop, onSelectPot, pots, selectedCrop, selectedPotId }: AppTabNavigatorProps) {
  const navigationRef = useNavigationContainerRef<AppTabParamList>();
  const [page, setPage] = useState<Page>('dashboard');
  const [sidebarHidden, setSidebarHidden] = useState(false);

  const syncActivePage = () => {
    const routeName = navigationRef.current?.getCurrentRoute()?.name as keyof AppTabParamList | undefined;
    if (routeName) setPage(pageByRouteName[routeName]);
  };

  const goToPage = (nextPage: Page) => navigationRef.current?.navigate(routeNameByPage[nextPage]);

  return (
    <DeviceEnvironmentProvider potId={selectedPotId}>
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
                <ScreenLayout compact={compact} onSelectPot={onSelectPot} page="dashboard" pots={pots} selectedPotId={selectedPotId}>
                  <DashboardScreen compact={compact} onNavigate={goToPage} selectedCrop={selectedCrop} />
                </ScreenLayout>
              )}
            </Tab.Screen>
            <Tab.Screen name="Analysis">
              {() => (
                <ScreenLayout compact={compact} onSelectPot={onSelectPot} page="analysis" pots={pots} selectedPotId={selectedPotId}>
                  <AnalysisScreen compact={compact} onNavigate={goToPage} onSelectCrop={onSelectCrop} selectedCrop={selectedCrop} />
                </ScreenLayout>
              )}
            </Tab.Screen>
            <Tab.Screen name="Live">
              {() => (
                <ScreenLayout compact={compact} onSelectPot={onSelectPot} page="live" pots={pots} selectedPotId={selectedPotId}>
                  <LiveScreen compact={compact} />
                </ScreenLayout>
              )}
            </Tab.Screen>
            <Tab.Screen name="History">
              {() => (
                <ScreenLayout compact={compact} onSelectPot={onSelectPot} page="history" pots={pots} selectedPotId={selectedPotId}>
                  <HistoryScreen compact={compact} onNavigate={goToPage} />
                </ScreenLayout>
              )}
            </Tab.Screen>
            <Tab.Screen name="Guide">
              {() => (
                <ScreenLayout compact={compact} onSelectPot={onSelectPot} page="guide" pots={pots} selectedPotId={selectedPotId}>
                  <GuideScreen compact={compact} onNavigate={goToPage} />
                </ScreenLayout>
              )}
            </Tab.Screen>
            <Tab.Screen name="Shop">
              {() => (
                <ScreenLayout compact={compact} onSelectPot={onSelectPot} page="shop" pots={pots} selectedPotId={selectedPotId}>
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
  potSelector: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  potButton: {
    backgroundColor: palette.panelMuted,
    borderColor: palette.line,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  potButtonSelected: { backgroundColor: palette.greenSoft, borderColor: palette.green },
  potButtonText: { color: palette.secondary, fontFamily: font, fontSize: 13, fontWeight: '800' },
  potButtonTextSelected: { color: palette.greenDark },
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
