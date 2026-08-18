import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { fn } from 'storybook/test';

import type { EnvironmentScore, LatestMeasurements } from '../../measurement/measurementApi';
import { DeviceEnvironmentProvider } from '../../shared/device-environment/DeviceEnvironmentProvider';
import type { SoilRecommendation } from '../../soil/soilApi';
import { GuideScreen } from './GuideScreen';

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
    soilTemperatureC: 21.4,
  },
  quality: {
    soilSensorValid: true,
    airSensorValid: true,
    lightSensorValid: true,
  },
};

const mockSoilRecommendation: SoilRecommendation = {
  deviceId: 1,
  cropCode: 'cherry_tomato',
  cropName: '방울토마토',
  targetCondition: 'NORMAL',
  profileId: 'cherry-tomato-normal-v1',
  materials: [
    { name: '원예용 상토', parts: 5, role: '수분·양분 보유, 뿌리 지지' },
    { name: '펄라이트', parts: 1, role: '배수·통기 보완, 배지 다짐 완화' },
  ],
  mixRatio: '5:1',
  mixRatioText: '원예용 상토 5 : 펄라이트 1',
  reason: '일정한 수분 공급을 유지하면서 배수와 통기성을 보완한다.',
  environmentSignals: [
    '관수 후 토양 수분이 상승함',
    '이후 수분이 점진적으로 감소함',
    '배수구에서 물이 정상적으로 빠짐',
  ],
  preChecks: [],
  cautions: [
    '상토에 펄라이트가 충분하면 추가량을 줄이거나 생략한다.',
    '받침에 고인 물은 제거한다.',
  ],
  assumptionNotice: [
    '작물의 일반 생육 특성과 현재 환경정보에 기반한 가정값입니다.',
    '배합비는 공식 표준이 아닌 서비스 내부 추론값입니다.',
  ],
};

const meta = {
  title: 'screens/guide/GuideScreen',
  component: GuideScreen,
  args: {
    compact: false,
    onNavigate: fn(),
  },
  render: (args) => (
    <DeviceEnvironmentProvider
      potId={1}
      fetchMeasurements={async () => mockMeasurements}
      fetchScore={async () => mockScore}
      fetchSoilRecommendation={async () => mockSoilRecommendation}
    >
      <GuideScreen {...args} />
    </DeviceEnvironmentProvider>
  ),
} satisfies Meta<typeof GuideScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithPreChecks: Story = {
  render: (args) => (
    <DeviceEnvironmentProvider
      potId={1}
      fetchMeasurements={async () => mockMeasurements}
      fetchScore={async () => mockScore}
      fetchSoilRecommendation={async () => ({
        ...mockSoilRecommendation,
        preChecks: ['상토에 포함된 펄라이트 양 확인', '배수구 개방 상태 확인', '받침에 고인 물 확인'],
      })}
    >
      <GuideScreen {...args} />
    </DeviceEnvironmentProvider>
  ),
};
