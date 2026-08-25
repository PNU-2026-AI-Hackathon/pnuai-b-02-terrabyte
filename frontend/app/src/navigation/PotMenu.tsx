import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { controlTextTokens, controlTokens } from '../appTheme/controls';
import { font } from '../appTheme/glass';
import { palette } from '../appTheme/palette';
import { scaleTypography } from '../appTheme/scaleTypography';
import { typeScale } from '../appTheme/typography';
import type { CropResponse } from '../crop/cropApi';
import { useCrops } from '../crop/useCrops';
import type { PotResponse } from '../device/deviceApi';
import { Surface } from '../components/Surface';

type PotMenuProps = {
  compact: boolean;
  pots: PotResponse[];
  selectedPotId?: number;
  onSelectPot: (potId: number) => void;
  onCreatePot: (label: string, cropCode: string) => Promise<void>;
  onUpdatePot: (potId: number, label: string, cropCode: string) => Promise<void>;
};

type FormMode = 'create' | 'edit' | null;

function cropName(crops: CropResponse[], cropCode?: string) {
  return crops.find((crop) => crop.code === cropCode)?.name ?? '작물 미등록';
}

export function PotMenu({ compact, onCreatePot, onSelectPot, onUpdatePot, pots, selectedPotId }: PotMenuProps) {
  const { crops } = useCrops();
  const [open, setOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [editingPotId, setEditingPotId] = useState<number>();
  const [label, setLabel] = useState('');
  const [cropCode, setCropCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const selectedPot = pots.find((pot) => pot.id === selectedPotId);

  const openMenu = () => {
    setOpen(true);
    setFormMode(null);
    setError('');
  };

  const closeMenu = () => {
    if (!submitting) {
      setOpen(false);
      setFormMode(null);
      setError('');
    }
  };

  const openCreateForm = () => {
    setEditingPotId(undefined);
    setLabel(`화분 ${pots.length + 1}`);
    setCropCode(crops[0]?.code ?? '');
    setError('');
    setFormMode('create');
  };

  const openEditForm = (pot: PotResponse) => {
    setEditingPotId(pot.id);
    setLabel(pot.label);
    setCropCode(pot.cropCode ?? crops[0]?.code ?? '');
    setError('');
    setFormMode('edit');
  };

  const submitForm = async () => {
    const normalizedLabel = label.trim();
    if (!normalizedLabel) {
      setError('화분 이름을 입력해 주세요.');
      return;
    }
    if (!cropCode) {
      setError('작물 목록을 불러온 뒤 선택해 주세요.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      if (formMode === 'create') {
        await onCreatePot(normalizedLabel, cropCode);
      } else if (formMode === 'edit' && editingPotId) {
        await onUpdatePot(editingPotId, normalizedLabel, cropCode);
      }
      setFormMode(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '화분 정보를 저장하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <View style={[styles.controls, compact && styles.controlsCompact]}>
        <Pressable
          accessibilityLabel={`현재 화분 ${selectedPot?.label ?? '화분 선택'}`}
          accessibilityRole="button"
          onPress={openMenu}
          style={({ pressed }) => [styles.potSelector, pressed && styles.pressed]}
        >
          <View style={styles.potSelectorCopy}>
            <Text numberOfLines={1} style={styles.potSelectorLabel}>{selectedPot?.label ?? '화분 선택'}</Text>
          </View>
          <Text style={styles.potSelectorChevron}>⌄</Text>
        </Pressable>
      </View>

      <Modal animationType="fade" onRequestClose={closeMenu} transparent visible={open}>
        <View style={styles.modalBackdrop}>
          <Surface style={styles.modalSurface}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScrollContent}>
              <View style={styles.modalHeader}>
                <View style={styles.modalCopy}>
                  <Text style={styles.modalTitle}>화분 관리</Text>
                  <Text style={styles.modalDescription}>화분을 선택하고 이름과 재배 작물을 관리하세요.</Text>
                </View>
                <Pressable accessibilityLabel="화분 관리 닫기" accessibilityRole="button" disabled={submitting} onPress={closeMenu} style={styles.closeButton}>
                  <Text style={styles.closeButtonText}>×</Text>
                </Pressable>
              </View>

              <View style={styles.listHeader}>
                <Text style={styles.listTitle}>등록된 화분</Text>
                <Pressable accessibilityRole="button" disabled={submitting} onPress={openCreateForm} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
                  <Text style={styles.addButtonText}>+ 화분 추가</Text>
                </Pressable>
              </View>

              <View style={styles.potList}>
                {pots.map((pot) => {
                  const selected = pot.id === selectedPotId;
                  return (
                    <View key={pot.id} style={[styles.potRow, selected && styles.potRowSelected]}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`${pot.label}, ${cropName(crops, pot.cropCode)}${selected ? ', 선택됨' : ''}`}
                        disabled={submitting}
                        onPress={() => {
                          onSelectPot(pot.id);
                          setOpen(false);
                        }}
                        style={({ pressed }) => [styles.potSelectArea, pressed && styles.pressed]}
                      >
                        <View style={styles.potRowCopy}>
                          <Text numberOfLines={1} style={[styles.potLabel, selected && styles.potLabelSelected]}>{pot.label}</Text>
                          <Text style={styles.potCrop}>{cropName(crops, pot.cropCode)}</Text>
                        </View>
                        {selected ? <Text style={styles.selectedMark}>현재</Text> : null}
                      </Pressable>
                      <Pressable
                        accessibilityLabel={`${pot.label} 수정`}
                        accessibilityRole="button"
                        disabled={submitting}
                        onPress={() => openEditForm(pot)}
                        style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
                      >
                        <Text style={styles.editButtonText}>수정</Text>
                      </Pressable>
                    </View>
                  );
                })}
                {pots.length === 0 ? <Text style={styles.emptyText}>등록된 화분이 없습니다.</Text> : null}
              </View>

              {formMode ? (
                <View style={styles.form}>
                  <View style={styles.formHeader}>
                    <Text style={styles.formTitle}>{formMode === 'create' ? '화분 추가' : '화분 정보 수정'}</Text>
                    <Pressable accessibilityRole="button" disabled={submitting} onPress={() => setFormMode(null)}>
                      <Text style={styles.formCancelText}>취소</Text>
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
                            style={({ pressed }) => [styles.cropOption, selected && styles.cropOptionSelected, pressed && styles.pressed]}
                          >
                            <Text style={[styles.cropOptionText, selected && styles.cropOptionTextSelected]}>{crop.name}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {error ? <Text style={styles.errorText}>{error}</Text> : null}

                  <Pressable
                    accessibilityRole="button"
                    disabled={submitting}
                    onPress={() => void submitForm()}
                    style={({ pressed }) => [styles.submitButton, submitting && styles.disabledButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.submitButtonText}>{submitting ? '저장 중…' : '저장'}</Text>
                  </Pressable>
                </View>
              ) : null}
            </ScrollView>
          </Surface>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create(scaleTypography({
  pressed: { opacity: 0.76 },
  controls: { alignItems: 'center', flexDirection: 'row', gap: 10, marginRight: 20 },
  controlsCompact: { marginRight: 0, maxWidth: '100%' },
  potSelector: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.34)', borderColor: palette.line, borderRadius: 13, borderWidth: 1, flexDirection: 'row', gap: 20, justifyContent: 'space-between', minHeight: 58, minWidth: 230, paddingHorizontal: 18 },
  potSelectorCopy: { flex: 1, gap: 1, minWidth: 0 },
  potSelectorLabel: { ...typeScale.cardTitle, color: palette.text, fontFamily: font, fontSize: 18, fontWeight: '700' },
  potSelectorChevron: { color: palette.secondary, fontFamily: font, fontSize: 24, fontWeight: '500', lineHeight: 23 },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(21, 46, 35, 0.34)', flex: 1, justifyContent: 'center', padding: 22 },
  modalSurface: { maxHeight: '88%', maxWidth: 580, padding: 28, width: '100%' },
  modalScrollContent: { gap: 20, paddingBottom: 2 },
  modalHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 16, justifyContent: 'space-between' },
  modalCopy: { flex: 1, gap: 4 },
  modalTitle: { ...typeScale.dialogTitle, color: palette.text, fontFamily: font },
  modalDescription: { ...typeScale.body, color: palette.secondary, fontFamily: font },
  closeButton: { alignItems: 'center', height: 36, justifyContent: 'center', width: 36 },
  closeButtonText: { color: palette.secondary, fontFamily: font, fontSize: 34, fontWeight: '500', lineHeight: 36 },
  listHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  listTitle: { ...typeScale.label, color: palette.secondary, fontFamily: font },
  addButton: { ...controlTokens.outline, minHeight: 38, paddingHorizontal: 13 },
  addButtonText: { ...typeScale.button, ...controlTextTokens.outline, fontFamily: font },
  potList: { backgroundColor: 'rgba(255,255,255,0.2)', borderColor: palette.line, borderRadius: 13, borderWidth: 1, overflow: 'hidden' },
  potRow: { alignItems: 'center', borderBottomColor: palette.line, borderBottomWidth: 1, flexDirection: 'row', gap: 8, minHeight: 76, paddingHorizontal: 12 },
  potRowSelected: { backgroundColor: palette.greenSoft },
  potSelectArea: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 11, minWidth: 0, paddingVertical: 11 },
  potRowCopy: { flex: 1, gap: 2, minWidth: 0 },
  potLabel: { ...typeScale.bodyStrong, color: palette.text, fontFamily: font },
  potLabelSelected: { color: palette.greenDark },
  potCrop: { ...typeScale.caption, color: palette.muted, fontFamily: font },
  selectedMark: { ...typeScale.caption, color: palette.greenDark, fontFamily: font },
  editButton: { alignItems: 'center', justifyContent: 'center', minHeight: 34, paddingHorizontal: 9 },
  editButtonText: { ...typeScale.button, color: palette.secondary, fontFamily: font },
  emptyText: { ...typeScale.body, color: palette.muted, padding: 16, textAlign: 'center' },
  form: { backgroundColor: 'rgba(255,255,255,0.24)', borderColor: palette.line, borderRadius: 13, borderWidth: 1, gap: 16, padding: 16 },
  formHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  formTitle: { ...typeScale.cardTitle, color: palette.text, fontFamily: font },
  formCancelText: { ...typeScale.button, color: palette.secondary, fontFamily: font },
  formField: { gap: 8 },
  fieldLabel: { ...typeScale.label, color: palette.secondary, fontFamily: font },
  textInput: { ...typeScale.body, backgroundColor: 'rgba(255,255,255,0.42)', borderColor: palette.line, borderRadius: 9, borderWidth: 1, color: palette.text, fontFamily: font, minHeight: 44, paddingHorizontal: 12 },
  cropList: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  cropOption: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.22)', borderColor: palette.line, borderRadius: 9, borderWidth: 1, flexDirection: 'row', gap: 5, minHeight: 36, paddingHorizontal: 9 },
  cropOptionSelected: { backgroundColor: palette.greenSoft, borderColor: palette.green },
  cropOptionText: { ...typeScale.caption, color: palette.secondary, fontFamily: font },
  cropOptionTextSelected: { color: palette.greenDark },
  errorText: { ...typeScale.label, color: palette.red, fontFamily: font },
  submitButton: { ...controlTokens.primary, minHeight: 44, paddingHorizontal: 18 },
  disabledButton: { opacity: 0.55 },
  submitButtonText: { ...typeScale.button, ...controlTextTokens.primary, fontFamily: font },
}));
