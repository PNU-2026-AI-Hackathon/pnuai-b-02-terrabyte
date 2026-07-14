import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, typography } from '../theme';

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
    backgroundColor: colors.glassSoft,
    borderColor: 'rgba(255,255,255,0.5)',
    borderRadius: radii.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    padding: 5,
  },
  tab: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  activeTab: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    shadowColor: '#1f3a2a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 2,
  },
  label: {
    color: '#5a7466',
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
  },
  activeLabel: {
    color: colors.textPrimary,
  },
});
