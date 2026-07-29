import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { Text, View } from 'react-native';

import { Background } from './Background';

const meta = {
  title: 'components/Background',
  component: Background,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof Background>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <View style={{ minHeight: '100vh' as unknown as number }}>
      <Background />
      <View style={{ padding: 24 }}>
        <Text>배경 위에 놓이는 콘텐츠 예시</Text>
      </View>
    </View>
  ),
};
