import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { fn } from 'storybook/test';

import { ScoreScreen } from './ScoreScreen';

const meta = {
  title: 'screens/ScoreScreen',
  component: ScoreScreen,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof ScoreScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

function ScoreWithCrop({ isCompact }: { isCompact: boolean }) {
  const [selectedCrop, setSelectedCrop] = useState(0);
  return (
    <ScoreScreen
      isCompact={isCompact}
      selectedCrop={selectedCrop}
      setSelectedCrop={setSelectedCrop}
      onRealtime={fn()}
      onShop={fn()}
    />
  );
}

export const Desktop: Story = {
  args: {
    isCompact: false,
    selectedCrop: 0,
    setSelectedCrop: () => {},
    onRealtime: fn(),
    onShop: fn(),
  },
  render: () => <ScoreWithCrop isCompact={false} />,
};

export const Compact: Story = {
  args: {
    isCompact: true,
    selectedCrop: 0,
    setSelectedCrop: () => {},
    onRealtime: fn(),
    onShop: fn(),
  },
  render: () => <ScoreWithCrop isCompact={true} />,
};
