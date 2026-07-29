import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { fn } from 'storybook/test';

import { ActionButton } from './ActionButton';

const meta = {
  title: 'components/ActionButton',
  component: ActionButton,
  args: {
    onPress: fn(),
  },
} satisfies Meta<typeof ActionButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: '분석 보고서 보기',
  },
};

export const Quiet: Story = {
  args: {
    label: '실시간 센서 확인',
    quiet: true,
  },
};

export const Disabled: Story = {
  args: {
    label: '처리 중…',
    disabled: true,
  },
};
