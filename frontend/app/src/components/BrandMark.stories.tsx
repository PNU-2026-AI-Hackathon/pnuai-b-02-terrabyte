import type { Meta, StoryObj } from '@storybook/react-native-web-vite';

import { BrandMark } from './BrandMark';

const meta = {
  title: 'components/BrandMark',
  component: BrandMark,
} satisfies Meta<typeof BrandMark>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const Compact: Story = {
  args: {
    compact: true,
  },
};
