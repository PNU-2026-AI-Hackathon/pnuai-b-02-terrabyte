import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { fn } from 'storybook/test';

import { DashboardScreen } from './DashboardScreen';
import type { ChartRange } from '../data';

const meta = {
  title: 'screens/DashboardScreen',
  component: DashboardScreen,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    selectedCrop: 0,
    onRealtime: fn(),
    onScore: fn(),
  },
} satisfies Meta<typeof DashboardScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

function DashboardWithRange({ isCompact }: { isCompact: boolean }) {
  const [chartRange, setChartRange] = useState<ChartRange>('24h');
  return (
    <DashboardScreen
      chartRange={chartRange}
      setChartRange={setChartRange}
      isCompact={isCompact}
      selectedCrop={0}
      onRealtime={fn()}
      onScore={fn()}
    />
  );
}

export const Desktop: Story = {
  args: {
    chartRange: '24h',
    isCompact: false,
    setChartRange: () => {},
  },
  render: () => <DashboardWithRange isCompact={false} />,
};

export const Compact: Story = {
  args: {
    chartRange: '24h',
    isCompact: true,
    setChartRange: () => {},
  },
  render: () => <DashboardWithRange isCompact={true} />,
};
