import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { colors } from '../theme';

export function Background() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={[colors.pageStart, colors.pageMid, colors.pageEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.topWash} />
    </View>
  );
}

const styles = StyleSheet.create({
  topWash: {
    backgroundColor: 'rgba(255,255,255,0.4)',
    height: 220,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
