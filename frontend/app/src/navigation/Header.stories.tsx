import type { Meta, StoryObj } from '@storybook/react-native-web-vite';

import { Header } from './Header';

const meta = {
  title: 'navigation/Header',
  component: Header,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof Header>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Dashboard: Story = {
  args: {
    compact: false,
    page: 'dashboard',
  },
};

export const Shop: Story = {
  args: {
    compact: false,
    page: 'shop',
  },
};
