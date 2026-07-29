import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { fn } from 'storybook/test';

import { LoginScreen } from './LoginScreen';

const meta = {
  title: 'screens/LoginScreen',
  component: LoginScreen,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof LoginScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Login: Story = {
  args: {
    authTab: 'login',
    setAuthTab: () => {},
    onContinue: fn(),
  },
  render: () => {
    const [authTab, setAuthTab] = useState<'login' | 'signup'>('login');
    return <LoginScreen authTab={authTab} setAuthTab={setAuthTab} onContinue={fn()} />;
  },
};

export const Signup: Story = {
  args: {
    authTab: 'signup',
    setAuthTab: () => {},
    onContinue: fn(),
  },
  render: () => {
    const [authTab, setAuthTab] = useState<'login' | 'signup'>('signup');
    return <LoginScreen authTab={authTab} setAuthTab={setAuthTab} onContinue={fn()} />;
  },
};
