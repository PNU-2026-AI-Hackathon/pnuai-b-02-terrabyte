import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';

import { SegmentedTabs } from './SegmentedTabs';

const meta = {
  title: 'components/SegmentedTabs',
  component: SegmentedTabs,
} satisfies Meta<typeof SegmentedTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AuthTabs: Story = {
  args: {
    value: 'login',
    options: [
      { key: 'login', label: '로그인' },
      { key: 'signup', label: '회원가입' },
    ],
    onChange: () => {},
  },
  render: () => {
    const [value, setValue] = useState<'login' | 'signup'>('login');
    return (
      <SegmentedTabs
        value={value}
        onChange={setValue}
        options={[
          { key: 'login', label: '로그인' },
          { key: 'signup', label: '회원가입' },
        ]}
      />
    );
  },
};

export const ChartRangeTabs: Story = {
  args: {
    value: '24h',
    options: [
      { key: '1h', label: '1시간' },
      { key: '24h', label: '24시간' },
      { key: '7d', label: '7일' },
      { key: '30d', label: '30일' },
    ],
    onChange: () => {},
  },
  render: () => {
    const [value, setValue] = useState<'1h' | '24h' | '7d' | '30d'>('24h');
    return (
      <SegmentedTabs
        value={value}
        onChange={setValue}
        options={[
          { key: '1h', label: '1시간' },
          { key: '24h', label: '24시간' },
          { key: '7d', label: '7일' },
          { key: '30d', label: '30일' },
        ]}
      />
    );
  },
};
