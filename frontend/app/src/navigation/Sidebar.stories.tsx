import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { fn } from 'storybook/test';

import { Sidebar } from './Sidebar';

const meta = {
  title: 'navigation/Sidebar',
  component: Sidebar,
  args: {
    cropName: '방울토마토',
    onHide: fn(),
    onLogout: fn(),
    onNavigate: fn(),
    page: 'dashboard',
  },
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof Sidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  args: {
    compact: false,
  },
};

export const Compact: Story = {
  args: {
    compact: true,
  },
};
