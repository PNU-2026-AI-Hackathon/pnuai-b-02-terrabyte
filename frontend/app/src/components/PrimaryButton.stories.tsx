import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { fn } from 'storybook/test';

import { PrimaryButton } from './PrimaryButton';

const meta = {
  title: 'components/PrimaryButton',
  component: PrimaryButton,
  args: {
    onPress: fn(),
  },
} satisfies Meta<typeof PrimaryButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: '로그인',
  },
};

export const Disabled: Story = {
  args: {
    label: '처리 중…',
    disabled: true,
  },
};
