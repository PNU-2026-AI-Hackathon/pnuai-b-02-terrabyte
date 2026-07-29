import type { Meta, StoryObj } from '@storybook/react-native-web-vite';

import { ShopScreen } from './ShopScreen';

const meta = {
  title: 'screens/ShopScreen',
  component: ShopScreen,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof ShopScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  args: {
    isCompact: false,
  },
};

export const Compact: Story = {
  args: {
    isCompact: true,
  },
};
