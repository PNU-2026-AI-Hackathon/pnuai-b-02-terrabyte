import type { Meta, StoryObj } from '@storybook/react-native-web-vite';

import { LineChart } from './LineChart';

const meta = {
  title: 'components/LineChart',
  component: LineChart,
} satisfies Meta<typeof LineChart>;

export default meta;
type Story = StoryObj<typeof meta>;

const wave = (seed: number, amplitude: number, center: number) =>
  Array.from({ length: 36 }, (_, index) => center + Math.sin(index * 0.42 + seed) * amplitude + Math.sin(index * 0.13) * 6);

export const MultiSeries: Story = {
  args: {
    axisLabels: ['00:00', '06:00', '12:00', '18:00', '현재'],
    series: [
      { label: '온도', color: '#d27d35', values: wave(1, 18, 88) },
      { label: '습도', color: '#438da5', values: wave(3, 25, 98) },
      { label: '조도', color: '#c99b32', values: wave(5, 34, 90) },
      { label: '토양수분', color: '#2b8058', values: wave(7, 16, 105) },
    ],
  },
};

export const Sparkline: Story = {
  args: {
    gridLines: 1,
    height: 72,
    showLegend: false,
    series: [{ color: '#d9822b', values: [24.1, 24.2, 24.1, 24.3, 24.4, 24.3, 24.5, 24.4, 24.6, 24.5, 24.4, 24.5] }],
  },
};
