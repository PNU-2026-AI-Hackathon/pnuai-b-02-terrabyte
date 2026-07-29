import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { fn } from 'storybook/test';

import { SetupFlow } from './SetupFlow';

const meta = {
  title: 'onboarding/SetupFlow',
  component: SetupFlow,
  args: {
    onBack: fn(),
    onCropSelected: fn(),
    onDeviceRegistered: fn(),
    onNext: fn(),
    selectedCropCode: 'TOMATO',
  },
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof SetupFlow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Device: Story = {
  args: {
    stage: 'device',
  },
};

export const Crop: Story = {
  args: {
    stage: 'crop',
  },
};

export const Setup: Story = {
  args: {
    deviceId: 1,
    stage: 'setup',
  },
};
