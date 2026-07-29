import type { Meta, StoryObj } from '@storybook/react-native-web-vite';

import { RealtimeScreen } from './RealtimeScreen';

const meta = {
  title: 'screens/RealtimeScreen',
  component: RealtimeScreen,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof RealtimeScreen>;

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
