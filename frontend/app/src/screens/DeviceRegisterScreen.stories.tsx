import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { fn } from 'storybook/test';

import { DeviceRegisterScreen } from './DeviceRegisterScreen';

const meta = {
  title: 'screens/DeviceRegisterScreen',
  component: DeviceRegisterScreen,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    onContinue: fn(),
  },
} satisfies Meta<typeof DeviceRegisterScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
