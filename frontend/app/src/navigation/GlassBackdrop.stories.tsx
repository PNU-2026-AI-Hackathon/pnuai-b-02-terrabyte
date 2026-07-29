import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { View } from 'react-native';

import { GlassBackdrop } from './GlassBackdrop';

const meta = {
  title: 'navigation/GlassBackdrop',
  component: GlassBackdrop,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof GlassBackdrop>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <View style={{ height: '100vh' as unknown as number, position: 'relative' }}>
      <GlassBackdrop />
    </View>
  ),
};
