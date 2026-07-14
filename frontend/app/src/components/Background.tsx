import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { colors } from '../theme';

const blurStyle = (amount: number) =>
  ({
    filter: `blur(${amount}px)`,
  }) as any;

export function Background() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={[colors.pageStart, colors.pageMid, colors.pageEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.blob, styles.greenBlob, blurStyle(60)]} />
      <View style={[styles.blob, styles.tealBlob, blurStyle(70)]} />
      <View style={[styles.blob, styles.yellowBlob, blurStyle(60)]} />
    </View>
  );
}

const styles = StyleSheet.create({
  blob: {
    position: 'absolute',
    borderRadius: 9999,
  },
  greenBlob: {
    top: -180,
    left: -120,
    width: 560,
    height: 560,
    backgroundColor: 'rgba(120,200,150,0.38)',
  },
  tealBlob: {
    right: -100,
    bottom: -220,
    width: 640,
    height: 640,
    backgroundColor: 'rgba(110,190,210,0.32)',
  },
  yellowBlob: {
    top: '30%',
    right: '18%',
    width: 380,
    height: 380,
    backgroundColor: 'rgba(240,220,140,0.28)',
  },
});
