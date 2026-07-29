import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { font } from '../appTheme/glass';
import { palette } from '../appTheme/palette';
import { scaleTypography } from '../appTheme/scaleTypography';

type SectionHeaderProps = {
  action?: ReactNode;
  description?: string;
  title: string;
};

export function SectionHeader({ action, description, title }: SectionHeaderProps) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {description ? <Text style={styles.sectionDescription}>{description}</Text> : null}
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create(
  scaleTypography({
    sectionHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 16, justifyContent: 'space-between' },
    sectionHeaderCopy: { flex: 1, gap: 8, maxWidth: 900 },
    sectionTitle: { color: palette.text, fontFamily: font, fontSize: 26, fontWeight: '900', letterSpacing: -0.6, lineHeight: 34 },
    sectionDescription: {
      color: palette.muted,
      fontFamily: font,
      fontSize: 15,
      fontWeight: '500',
      lineHeight: 24,
      maxWidth: 780,
    },
  }),
);
