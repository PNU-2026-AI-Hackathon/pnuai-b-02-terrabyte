import type { Preview } from '@storybook/react-native-web-vite';
import { StyleSheet, View } from 'react-native';

const styles = StyleSheet.create({
  frame: {
    minHeight: '100vh' as unknown as number,
  },
});

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  decorators: [
    (Story) => (
      <View style={styles.frame}>
        <Story />
      </View>
    ),
  ],
};

export default preview;
