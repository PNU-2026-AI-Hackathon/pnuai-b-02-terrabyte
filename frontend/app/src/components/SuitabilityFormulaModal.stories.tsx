import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { fn } from 'storybook/test';

import { SuitabilityFormulaModal } from './SuitabilityFormulaModal';

const meta = {
  title: 'components/SuitabilityFormulaModal',
  component: SuitabilityFormulaModal,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    onClose: fn(),
    visible: true,
    scoreData: {
      deviceId: 1,
      cropCode: 'cherry_tomato',
      cropName: '방울토마토',
      total: 68,
      grade: 'NORMAL',
      measuredAt: '2026-07-14T10:30:00+09:00',
      formula: '100 × (T/100 × H/100 × L/100)^(1/3)',
      factors: [
        { key: 'temperature', label: '온도', unit: '℃', current: 24.5, optimalMin: 20, optimalMax: 26, status: 'OK', gap: 0, score: 92 },
        { key: 'humidity', label: '습도', unit: '%', current: 45, optimalMin: 60, optimalMax: 75, status: 'LOW', gap: 15, score: 58 },
        { key: 'plantLight', label: '광량', unit: 'μmol/m²/s', current: 180, optimalMin: 300, optimalMax: 400, status: 'LOW', gap: 120, score: 54 },
      ],
    },
  },
} satisfies Meta<typeof SuitabilityFormulaModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
