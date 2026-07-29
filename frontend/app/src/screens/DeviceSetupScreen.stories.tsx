import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { fn } from 'storybook/test';

import { DeviceSetupScreen } from './DeviceSetupScreen';

const meta = {
  title: 'screens/DeviceSetupScreen',
  component: DeviceSetupScreen,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    onContinue: fn(),
  },
} satisfies Meta<typeof DeviceSetupScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Connecting: Story = {
  args: {
    connected: false,
  },
};

export const Connected: Story = {
  args: {
    connected: true,
  },
};
