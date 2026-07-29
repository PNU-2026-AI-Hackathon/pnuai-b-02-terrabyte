import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

export function GlassBackdrop() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={['#edf5ee', '#dcebe1', '#d8e9e8']}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.backdropOrb, styles.backdropOrbOne]} />
      <View style={[styles.backdropOrb, styles.backdropOrbTwo]} />
      <View style={[styles.backdropOrb, styles.backdropOrbThree]} />
      <View style={styles.backdropWash} />
    </View>
  );
}

const styles = StyleSheet.create({
  backdropOrb: { borderRadius: 9999, filter: 'blur(70px)', position: 'absolute' } as any,
  backdropOrbOne: { backgroundColor: 'rgba(88,186,127,0.34)', height: 500, left: -150, top: -170, width: 500 },
  backdropOrbTwo: { backgroundColor: 'rgba(82,161,173,0.25)', bottom: -220, height: 620, right: -180, width: 620 },
  backdropOrbThree: { backgroundColor: 'rgba(235,207,111,0.20)', height: 340, right: '28%', top: '32%', width: 340 },
  backdropWash: { backgroundColor: 'rgba(255,255,255,0.12)', bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
});
