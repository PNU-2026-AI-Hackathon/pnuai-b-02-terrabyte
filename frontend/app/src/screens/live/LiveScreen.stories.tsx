import type { Meta, StoryObj } from '@storybook/react-native-web-vite';

import type { EnvironmentScore, LatestMeasurements, MeasurementSeries } from '../../measurement/measurementApi';
import { DeviceEnvironmentProvider } from '../../shared/device-environment/DeviceEnvironmentProvider';
import { LiveScreen } from './LiveScreen';

const mockScore: EnvironmentScore = {
  deviceId: 1,
  cropCode: 'TOMATO',
  cropName: '방울토마토',
  total: 86,
  grade: 'GOOD',
  measuredAt: '2026-07-29T09:00:00+09:00',
  formula: 'mock formula',
  factors: [
    {
      key: 'temperature',
      label: '온도',
      unit: '°C',
      current: 24.6,
      optimalMin: 20,
      optimalMax: 28,
      status: 'OK',
      gap: 0,
      score: 92,
    },
    {
      key: 'humidity',
      label: '습도',
      unit: '%',
      current: 61,
      optimalMin: 50,
      optimalMax: 70,
      status: 'OK',
      gap: 0,
      score: 88,
    },
    {
      key: 'plantLight',
      label: '조도',
      unit: 'PPFD',
      current: 420,
      optimalMin: 300,
      optimalMax: 600,
      status: 'OK',
      gap: 0,
      score: 78,
    },
  ],
};

const mockMeasurements: LatestMeasurements = {
  deviceId: 1,
  hardwareDeviceId: 'TB-STORY-001',
  observedAt: '2026-07-29T09:00:00+09:00',
  sequence: 42,
  measurements: {
    soilMoisturePct: 56,
    soilMoistureRawAdc: 1840,
    airTemperatureC: 24.6,
    airHumidityPct: 61,
    plantLightPpfdUmolM2S: 420,
    soilTemperatureC: 21.4,
  },
  quality: {
    soilSensorValid: true,
    airSensorValid: true,
    lightSensorValid: true,
  },
};

const mockSeries: MeasurementSeries = {
  deviceId: 1,
  metric: 'soil_temperature_c',
  unit: '℃',
  range: '1h',
  points: Array.from({ length: 24 }, (_, index) => ({
    time: new Date(Date.UTC(2026, 6, 29, 0, index * 3)).toISOString(),
    value: 21.4 + Math.sin(index / 4) * 0.8,
  })),
};

const meta = {
  title: 'screens/live/LiveScreen',
  component: LiveScreen,
  args: {
    compact: false,
  },
  render: (args) => (
    <DeviceEnvironmentProvider
      potId={1}
      fetchMeasurements={async () => mockMeasurements}
      fetchScore={async () => mockScore}
      fetchSeries={async (_potId, _metric, range) => ({ ...mockSeries, range })}
    >
      <LiveScreen {...args} />
    </DeviceEnvironmentProvider>
  ),
} satisfies Meta<typeof LiveScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
