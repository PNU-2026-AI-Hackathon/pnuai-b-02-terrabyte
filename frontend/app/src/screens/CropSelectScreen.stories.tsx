import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { fn } from 'storybook/test';

import { CropSelectScreen } from './CropSelectScreen';

const meta = {
  title: 'screens/CropSelectScreen',
  component: CropSelectScreen,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof CropSelectScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    selectedCrop: 0,
    setSelectedCrop: () => {},
    onContinue: fn(),
  },
  render: () => {
    const [selectedCrop, setSelectedCrop] = useState(0);
    return (
      <CropSelectScreen selectedCrop={selectedCrop} setSelectedCrop={setSelectedCrop} onContinue={fn()} />
    );
  },
};
