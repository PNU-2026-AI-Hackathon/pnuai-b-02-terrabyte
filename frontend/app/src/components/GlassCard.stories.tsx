import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { Text, View } from 'react-native';

import { GlassCard } from './GlassCard';

const meta = {
  title: 'components/GlassCard',
  component: GlassCard,
  decorators: [
    (Story) => (
      <View style={{ backgroundColor: '#cfe3e0', padding: 32 }}>
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof GlassCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    style: { padding: 24, width: 320 },
    children: <Text>기본 카드 콘텐츠</Text>,
  },
};

export const Soft: Story = {
  args: {
    soft: true,
    style: { padding: 24, width: 320 },
    children: <Text>부드러운 그림자 카드</Text>,
  },
};
