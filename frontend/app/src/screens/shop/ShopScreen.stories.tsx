import type { Meta, StoryObj } from '@storybook/react-native-web-vite';

import type { EnvironmentScore, LatestMeasurements } from '../../measurement/measurementApi';
import { DeviceEnvironmentProvider } from '../../shared/device-environment/DeviceEnvironmentProvider';
import { ShopScreen } from './ShopScreen';

const mockScore: EnvironmentScore = {
  deviceId: 1,
  cropCode: 'TOMATO',
  cropName: '방울토마토',
  total: 68,
  grade: 'NORMAL',
  measuredAt: '2026-07-29T09:00:00+09:00',
  formula: 'mock formula',
  factors: [
    {
      key: 'plantLight',
      label: '조도',
      unit: 'PPFD',
      current: 80,
      optimalMin: 300,
      optimalMax: 600,
      status: 'LOW',
      gap: 220,
      score: 42,
    },
    {
      key: 'humidity',
      label: '습도',
      unit: '%',
      current: 46,
      optimalMin: 50,
      optimalMax: 70,
      status: 'LOW',
      gap: 4,
      score: 70,
    },
  ],
};

const mockMeasurements: LatestMeasurements = {
  deviceId: 1,
  hardwareDeviceId: 'TB-STORY-001',
  observedAt: '2026-07-29T09:00:00+09:00',
  sequence: 42,
  measurements: {
    soilMoisturePct: 34,
    soilMoistureRawAdc: 1840,
    airTemperatureC: 24.6,
    airHumidityPct: 46,
    plantLightPpfdUmolM2S: 80,
  },
  quality: {
    soilSensorValid: true,
    airSensorValid: true,
    lightSensorValid: true,
  },
};

const meta = {
  title: 'screens/shop/ShopScreen',
  component: ShopScreen,
  args: {
    compact: false,
  },
  render: (args) => (
    <DeviceEnvironmentProvider
      deviceId={1}
      fetchMeasurements={async () => mockMeasurements}
      fetchScore={async () => mockScore}
    >
      <ShopScreen {...args} />
    </DeviceEnvironmentProvider>
  ),
} satisfies Meta<typeof ShopScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
