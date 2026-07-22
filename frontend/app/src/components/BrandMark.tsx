import { StyleSheet, View } from 'react-native';

import { colors } from '../theme';

type BrandMarkProps = {
  compact?: boolean;
};

export function BrandMark({ compact = false }: BrandMarkProps) {
  return (
    <View style={[styles.mark, compact && styles.markCompact]}>
      <View style={[styles.stroke, styles.strokeOne, compact && styles.strokeCompact]} />
      <View style={[styles.stroke, styles.strokeTwo, compact && styles.strokeCompact]} />
      <View style={[styles.stroke, styles.strokeThree, compact && styles.strokeCompact]} />
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    height: 32,
    position: 'relative',
    width: 38,
  },
  markCompact: {
    height: 25,
    width: 30,
  },
  stroke: {
    backgroundColor: colors.accentGreen,
    borderRadius: 999,
    height: 7,
    position: 'absolute',
    transform: [{ rotate: '-48deg' }],
    width: 25,
  },
  strokeCompact: {
    height: 6,
    width: 20,
  },
  strokeOne: {
    left: -2,
    top: 11,
  },
  strokeTwo: {
    left: 9,
    top: 5,
  },
  strokeThree: {
    left: 20,
    top: 11,
  },
});
