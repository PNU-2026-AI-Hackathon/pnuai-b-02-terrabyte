import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { font } from '../appTheme/glass';
import { palette } from '../appTheme/palette';
import { scaleTypography } from '../appTheme/scaleTypography';
import { crops } from '../data';
import type { PotResponse } from '../device/deviceApi';
import { Surface } from '../components/Surface';

type PotManagerProps = {
  compact: boolean;
  pots: PotResponse[];
  selectedPotId?: number;
  onSelectPot: (potId: number) => void;
  onCreatePot: (label: string, cropCode: string) => Promise<void>;
};

function cropName(cropCode?: string) {
  return crops.find((crop) => crop.code === cropCode)?.name ?? '작물 미등록';
}

function cropEmoji(cropCode?: string) {
  return crops.find((crop) => crop.code === cropCode)?.emoji ?? '🪴';
}

export function PotManager({ compact, onCreatePot, onSelectPot, pots, selectedPotId }: PotManagerProps) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [cropCode, setCropCode] = useState(crops[0].code);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const openCreateModal = () => {
    setLabel(`화분 ${pots.length + 1}`);
    setCropCode(crops[0].code);
    setError('');
    setOpen(true);
  };

  const closeCreateModal = () => {
    if (!submitting) setOpen(false);
  };

  const submit = async () => {
    const normalizedLabel = label.trim();
    if (!normalizedLabel) {
      setError('화분 이름을 입력해 주세요.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await onCreatePot(normalizedLabel, cropCode);
      setOpen(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '화분을 추가하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <View accessibilityLabel="화분 관리" style={[styles.manager, compact && styles.managerCompact]}>
        <View style={styles.managerHeader}>
          <View style={styles.managerCopy}>
            <Text style={styles.managerTitle}>화분 관리</Text>
            <Text style={styles.managerDescription}>선택한 화분을 기준으로 모든 진단과 측정값을 확인합니다.</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="화분 추가"
            onPress={openCreateModal}
            style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
          >
            <Text style={styles.addButtonText}>+ 화분 추가</Text>
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.potList}>
          {pots.map((pot) => {
            const selected = pot.id === selectedPotId;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${pot.label}, ${cropName(pot.cropCode)}`}
                key={pot.id}
                onPress={() => onSelectPot(pot.id)}
                style={({ pressed }) => [styles.potCard, selected && styles.potCardSelected, pressed && styles.pressed]}
              >
                <View style={styles.potCardTopline}>
                  <Text style={styles.potEmoji}>{cropEmoji(pot.cropCode)}</Text>
                  {selected ? <Text style={styles.selectedMark}>선택됨</Text> : null}
                </View>
                <Text numberOfLines={1} style={[styles.potLabel, selected && styles.potLabelSelected]}>{pot.label}</Text>
                <Text style={styles.potCrop}>{cropName(pot.cropCode)}</Text>
                <Text style={styles.potStatus}>{pot.status === 'ONLINE' ? '센서 연결됨' : '센서 연결 대기'}</Text>
              </Pressable>
            );
          })}
          {pots.length === 0 ? <Text style={styles.emptyText}>등록된 화분이 없습니다.</Text> : null}
        </ScrollView>
      </View>

      <Modal animationType="fade" onRequestClose={closeCreateModal} transparent visible={open}>
        <View style={styles.modalBackdrop}>
          <Surface style={styles.modalSurface}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScrollContent}>
              <View style={styles.modalHeader}>
                <View style={styles.modalCopy}>
                  <Text style={styles.modalTitle}>화분 추가</Text>
                  <Text style={styles.modalDescription}>같은 공간 안에서 관리할 화분과 작물을 등록하세요.</Text>
                </View>
                <Pressable accessibilityRole="button" disabled={submitting} onPress={closeCreateModal} style={styles.closeButton}>
                  <Text style={styles.closeButtonText}>닫기</Text>
                </Pressable>
              </View>

              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>화분 이름</Text>
                <TextInput
                  autoFocus
                  maxLength={100}
                  onChangeText={setLabel}
                  placeholder="예: 창가 화분"
                  placeholderTextColor={palette.muted}
                  style={styles.textInput}
                  value={label}
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>재배 작물</Text>
                <View style={styles.cropList}>
                  {crops.map((crop) => {
                    const selected = crop.code === cropCode;
                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        key={crop.code}
                        onPress={() => setCropCode(crop.code)}
                        style={[styles.cropOption, selected && styles.cropOptionSelected]}
                      >
                        <Text style={styles.cropOptionEmoji}>{crop.emoji}</Text>
                        <Text style={[styles.cropOptionText, selected && styles.cropOptionTextSelected]}>{crop.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <View style={styles.modalActions}>
                <Pressable accessibilityRole="button" disabled={submitting} onPress={closeCreateModal} style={styles.cancelButton}>
                  <Text style={styles.cancelButtonText}>취소</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={submitting}
                  onPress={() => void submit()}
                  style={({ pressed }) => [styles.submitButton, submitting && styles.disabledButton, pressed && styles.pressed]}
                >
                  <Text style={styles.submitButtonText}>{submitting ? '추가 중…' : '화분 추가'}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </Surface>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create(scaleTypography({
  pressed: { opacity: 0.76 },
  manager: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.20)',
    borderColor: 'rgba(86,120,101,0.24)',
    borderRadius: 18,
    borderWidth: 1,
    gap: 16,
    marginBottom: 18,
    padding: 16,
  },
  managerCompact: { padding: 13 },
  managerHeader: { alignItems: 'center', flexDirection: 'row', gap: 16, justifyContent: 'space-between' },
  managerCopy: { flex: 1, gap: 3, minWidth: 0 },
  managerTitle: { color: palette.text, fontFamily: font, fontSize: 18, fontWeight: '900' },
  managerDescription: { color: palette.muted, fontFamily: font, fontSize: 13, fontWeight: '700' },
  addButton: { alignItems: 'center', borderColor: palette.green, borderRadius: 9, borderWidth: 1, minHeight: 36, justifyContent: 'center', paddingHorizontal: 13 },
  addButtonText: { color: palette.greenDark, fontFamily: font, fontSize: 13, fontWeight: '700' },
  potList: { flexDirection: 'row', gap: 10 },
  potCard: { backgroundColor: 'rgba(255,255,255,0.18)', borderColor: 'rgba(86,120,101,0.22)', borderRadius: 13, borderWidth: 1, gap: 4, minWidth: 174, padding: 13 },
  potCardSelected: { backgroundColor: palette.greenSoft, borderColor: palette.green, borderWidth: 1.5 },
  potCardTopline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  potEmoji: { fontSize: 19 },
  selectedMark: { color: palette.greenDark, fontFamily: font, fontSize: 11, fontWeight: '700' },
  potLabel: { color: palette.text, fontFamily: font, fontSize: 16, fontWeight: '700', marginTop: 4 },
  potLabelSelected: { color: palette.greenDark },
  potCrop: { color: palette.secondary, fontFamily: font, fontSize: 13, fontWeight: '700' },
  potStatus: { color: palette.muted, fontFamily: font, fontSize: 12, fontWeight: '700', marginTop: 4 },
  emptyText: { color: palette.muted, fontFamily: font, fontSize: 14, paddingVertical: 12 },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(21, 46, 35, 0.34)', flex: 1, justifyContent: 'center', padding: 22 },
  modalSurface: { maxHeight: '88%', maxWidth: 600, padding: 28, width: '100%' },
  modalScrollContent: { gap: 22, paddingBottom: 2 },
  modalHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 16, justifyContent: 'space-between' },
  modalCopy: { flex: 1, gap: 4 },
  modalTitle: { color: palette.text, fontFamily: font, fontSize: 28, fontWeight: '900' },
  modalDescription: { color: palette.secondary, fontFamily: font, fontSize: 14, fontWeight: '700', lineHeight: 22 },
  closeButton: { alignItems: 'center', borderColor: palette.line, borderRadius: 8, borderWidth: 1, minHeight: 36, justifyContent: 'center', paddingHorizontal: 12 },
  closeButtonText: { color: palette.secondary, fontFamily: font, fontSize: 13, fontWeight: '700' },
  formField: { gap: 9 },
  fieldLabel: { color: palette.secondary, fontFamily: font, fontSize: 14, fontWeight: '700' },
  textInput: { backgroundColor: 'rgba(255,255,255,0.32)', borderColor: palette.line, borderRadius: 10, borderWidth: 1, color: palette.text, fontFamily: font, fontSize: 16, minHeight: 46, paddingHorizontal: 13 },
  cropList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cropOption: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.20)', borderColor: palette.line, borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 6, minHeight: 40, paddingHorizontal: 11 },
  cropOptionSelected: { backgroundColor: palette.greenSoft, borderColor: palette.green },
  cropOptionEmoji: { fontSize: 16 },
  cropOptionText: { color: palette.secondary, fontFamily: font, fontSize: 13, fontWeight: '700' },
  cropOptionTextSelected: { color: palette.greenDark },
  errorText: { color: palette.red, fontFamily: font, fontSize: 13, fontWeight: '700' },
  modalActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  cancelButton: { alignItems: 'center', borderColor: palette.line, borderRadius: 9, borderWidth: 1, minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
  cancelButtonText: { color: palette.secondary, fontFamily: font, fontSize: 14, fontWeight: '700' },
  submitButton: { alignItems: 'center', backgroundColor: palette.green, borderRadius: 9, minHeight: 44, justifyContent: 'center', paddingHorizontal: 18 },
  disabledButton: { opacity: 0.55 },
  submitButtonText: { color: '#fff', fontFamily: font, fontSize: 14, fontWeight: '700' },
}));
