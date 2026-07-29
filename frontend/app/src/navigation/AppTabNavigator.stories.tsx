import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { fn } from 'storybook/test';

import { AppTabNavigator } from './AppTabNavigator';

const meta = {
  title: 'navigation/AppTabNavigator',
  component: AppTabNavigator,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    compact: false,
    cropName: '방울토마토',
    selectedCrop: 0,
    onLogout: fn(),
    onSelectCrop: fn(),
  },
} satisfies Meta<typeof AppTabNavigator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const Compact: Story = {
  args: {
    compact: true,
  },
};
