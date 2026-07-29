import type { Meta, StoryObj } from '@storybook/react-native-web-vite';

import { StepIndicator } from './StepIndicator';

const meta = {
  title: 'components/StepIndicator',
  component: StepIndicator,
  argTypes: {
    current: {
      control: { type: 'radio' },
      options: [1, 2, 3],
    },
  },
} satisfies Meta<typeof StepIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Step1: Story = { args: { current: 1 } };
export const Step2: Story = { args: { current: 2 } };
export const Step3: Story = { args: { current: 3 } };
