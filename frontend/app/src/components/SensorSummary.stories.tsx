import type { Meta, StoryObj } from '@storybook/react-native-web-vite';

import { SensorSummary } from './SensorSummary';

const meta = {
  title: 'components/SensorSummary',
  component: SensorSummary,
  args: {
    statusLabel: '정상 수신',
    sensors: [
      { label: '온·습도 센서', model: 'DHT22' },
      { label: '조도 센서', model: 'TSL2591' },
      { label: '토양 수분 센서', model: 'EF04027' },
      { label: '토양 온도 센서', model: 'DS18B20' },
    ],
  },
} satisfies Meta<typeof SensorSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
