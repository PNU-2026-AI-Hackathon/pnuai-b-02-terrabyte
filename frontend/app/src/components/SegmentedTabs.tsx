import { Pressable, StyleSheet, Text, View } from 'react-native';

import { controlTokens } from '../appTheme/controls';
import { font } from '../appTheme/glass';
import { palette } from '../appTheme/palette';
import { typeScale } from '../appTheme/typography';

type SegmentOption<T extends string> = {
  key: T;
  label: string;
};

type SegmentedTabsProps<T extends string> = {
  value: T;
  options: Array<SegmentOption<T>>;
  onChange: (value: T) => void;
};

export function SegmentedTabs<T extends string>({ value, options, onChange }: SegmentedTabsProps<T>) {
  return (
    <View style={styles.wrap}>
      {options.map((option) => {
        const active = option.key === value;
        return (
          <Pressable
            accessibilityRole="button"
            key={option.key}
            onPress={() => onChange(option.key)}
            style={[styles.tab, active && styles.activeTab]}
          >
            <Text style={[styles.label, active && styles.activeLabel]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: 'rgba(255,255,255,0.48)',
    borderColor: palette.lineStrong,
    borderRadius: 11,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    padding: 5,
  },
  tab: {
    ...controlTokens.filter,
    borderRadius: 10,
    flex: 1,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  activeTab: {
    backgroundColor: palette.greenSoft,
    shadowColor: '#1f3a2a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  label: {
    ...typeScale.label,
    color: palette.secondary,
    fontFamily: font,
  },
  activeLabel: {
    color: palette.greenDark,
  },
});
