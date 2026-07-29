import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { fn } from 'storybook/test';

import { HistoryScreen } from './HistoryScreen';

const meta = {
  title: 'screens/history/HistoryScreen',
  component: HistoryScreen,
  args: {
    compact: false,
    onNavigate: fn(),
  },
} satisfies Meta<typeof HistoryScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
