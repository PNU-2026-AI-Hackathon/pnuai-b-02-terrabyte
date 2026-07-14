import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { GlassCard } from '../components/GlassCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { StepIndicator } from '../components/StepIndicator';
import { crops } from '../data';
import { colors, typography } from '../theme';

type CropSelectScreenProps = {
  selectedCrop: number;
  setSelectedCrop: (index: number) => void;
  onContinue: () => void;
};

const fullHeight = { minHeight: '100vh' } as any;
const inputWeb = { outlineStyle: 'none' } as any;

export function CropSelectScreen({ selectedCrop, setSelectedCrop, onContinue }: CropSelectScreenProps) {
  const selectedCropName = crops[selectedCrop]?.name ?? crops[0].name;

  return (
    <ScrollView contentContainerStyle={[styles.screen, fullHeight]}>
      <StepIndicator current={2} />
      <GlassCard style={styles.card}>
        <View>
          <Text style={styles.heading}>어떤 작물을 키우시나요?</Text>
          <Text style={styles.subheading}>선택한 작물 기준으로 환경 점수를 계산해요.</Text>
        </View>

        <TextInput
          placeholder="작물 이름 검색 (예: 토마토)"
          placeholderTextColor="#8aa192"
          style={[styles.input, inputWeb]}
        />

        <ScrollView style={styles.cropScroll} contentContainerStyle={styles.cropList}>
          {crops.map((crop, index) => {
            const selected = selectedCrop === index;
            return (
              <Pressable
                accessibilityRole="button"
                key={crop.name}
                onPress={() => setSelectedCrop(index)}
                style={[styles.cropItem, selected && styles.selectedCropItem]}
              >
                <View style={styles.cropEmoji}>
                  <Text style={styles.cropEmojiText}>{crop.emoji}</Text>
                </View>
                <View style={styles.cropCopy}>
                  <Text style={styles.cropName}>{crop.name}</Text>
                  <Text style={styles.cropDesc}>{crop.desc}</Text>
                </View>
                {selected ? <Text style={styles.check}>✓</Text> : null}
              </Pressable>
            );
          })}
        </ScrollView>

        <PrimaryButton label={`'${selectedCropName}' 작물로 시작하기`} onPress={onContinue} />
      </GlassCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    gap: 24,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  card: {
    gap: 18,
    maxWidth: 480,
    padding: 32,
    width: '100%',
  },
  heading: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
    fontSize: 22,
    fontWeight: '800',
  },
  subheading: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
    fontSize: 14,
    marginTop: 6,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderColor: 'rgba(255,255,255,0.8)',
    borderRadius: 14,
    borderWidth: 1,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  cropScroll: {
    maxHeight: 260,
  },
  cropList: {
    gap: 8,
  },
  cropItem: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderColor: 'rgba(255,255,255,0.6)',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  selectedCropItem: {
    backgroundColor: 'rgba(214,244,224,0.6)',
    borderColor: 'rgba(63,174,111,0.7)',
  },
  cropEmoji: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: 12,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  cropEmojiText: {
    fontSize: 20,
  },
  cropCopy: {
    flex: 1,
    gap: 3,
  },
  cropName: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
    fontSize: 15,
    fontWeight: '700',
  },
  cropDesc: {
    color: '#5a7466',
    fontFamily: typography.fontFamily,
    fontSize: 12,
  },
  check: {
    color: '#2b8f6e',
    fontFamily: typography.fontFamily,
    fontSize: 16,
    fontWeight: '800',
  },
});
