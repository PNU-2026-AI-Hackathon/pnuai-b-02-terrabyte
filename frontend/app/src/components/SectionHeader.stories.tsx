import type { Meta, StoryObj } from '@storybook/react-native-web-vite';

import { SectionHeader } from './SectionHeader';

const meta = {
  title: 'components/SectionHeader',
  component: SectionHeader,
} satisfies Meta<typeof SectionHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: '환경 상태',
    description: '현재 측정값과 작물별 권장 범위 비교',
  },
};

export const TitleOnly: Story = {
  args: {
    title: '하드웨어 키트',
  },
};
