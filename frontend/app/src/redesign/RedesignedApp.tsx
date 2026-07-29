import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import {
  clearAccessToken,
  getMe,
  login,
  saveAccessToken,
  signup,
  type MeResponse,
} from '../auth/authApi';
import { palette } from '../appTheme/palette';
import { glassWebStyle, font } from '../appTheme/glass';
import { scaleTypography } from '../appTheme/scaleTypography';
import { ensureBrandFontLoaded } from '../appTheme/webFont';
import { ActionButton } from '../components/ActionButton';
import { BrandMark } from '../components/BrandMark';
import { LineChart } from '../components/LineChart';
import { SectionHeader } from '../components/SectionHeader';
import { SensorSummary } from '../components/SensorSummary';
import { Surface } from '../components/Surface';
import { SuitabilityFormulaModal } from '../components/SuitabilityFormulaModal';
import { getCrops, selectDeviceCrop, type CropResponse } from '../crop/cropApi';
import {
  altCrops,
  chartMetrics,
  crops,
  factors,
  latest,
  sensors,
  shopProducts,
  type ShopCategory,
  type ShopProduct,
} from '../data';
import { registerDevice } from '../device/deviceApi';
import { useDeviceEnvironment } from '../shared/device-environment/DeviceEnvironmentProvider';
import { useDisclosure } from '../shared/hooks/useDisclosure';
import {
  getFactorRecommendation,
  getGradeLabel,
  getIssueFactors,
  getRecommendedProductIds,
} from '../shared/factorPresentation';

ensureBrandFontLoaded();

export type Page = 'dashboard' | 'analysis' | 'live' | 'history' | 'guide' | 'shop';
export type FlowStage = 'auth' | 'device' | 'crop' | 'setup' | 'app';

const pageCopy: Record<Page, { title: string; description: string }> = {
  dashboard: { title: '공간 개요', description: '스마트팜 전환 적합도와 운영 중인 재배 환경을 확인하세요.' },
  analysis: { title: '공간 진단', description: '설치 전 공간 조건과 작물별 재배 가능성을 분석한 보고서입니다.' },
  live: { title: '환경 모니터링', description: '공간분석·토양분석 세트가 전송하는 최신 값을 확인하세요.' },
  history: { title: '진단 이력', description: '공간별 진단 결과와 환경 변화 기록을 비교하세요.' },
  guide: { title: '관리 가이드', description: '현재 환경과 재배 단계에 맞는 관리 작업을 확인하세요.' },
  shop: { title: '환경 개선 제품', description: '공간 진단 결과에 맞는 장비와 토양·배지를 확인하세요.' },
};

const navItems: Array<{ key: Page; label: string }> = [
  { key: 'dashboard', label: '공간 개요' },
  { key: 'analysis', label: '공간 진단' },
  { key: 'live', label: '환경 모니터링' },
  { key: 'history', label: '진단 이력' },
  { key: 'guide', label: '관리 가이드' },
  { key: 'shop', label: '제품 추천' },
];

type AreaUnit = 'SQUARE_METERS' | 'PYEONG';

const spaceTypeOptions = [
  { label: '건물 옥상', value: '건물 옥상' },
  { label: '실내 유휴공간', value: '실내 유휴공간' },
  { label: '지하 공간', value: '지하 공간' },
  { label: '공실', value: '공실' },
  { label: '베란다·테라스', value: '베란다·테라스' },
  { label: '기타', value: '기타' },
] as const;

const areaUnitOptions: Array<{ label: string; value: AreaUnit }> = [
  { label: 'm²', value: 'SQUARE_METERS' },
  { label: '평', value: 'PYEONG' },
];


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

function SelectField<T extends string>({
  disabled = false,
  onChange,
  options,
  placeholder,
  style,
  value,
}: {
  disabled?: boolean;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ label: string; value: T }>;
  placeholder: string;
  style?: any;
  value: T | '';
}) {
  const [open, setOpen] = useState(false);
  const selectedLabel = options.find((option) => option.value === value)?.label;

  return (
    <View style={[styles.selectContainer, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled, expanded: open }}
        disabled={disabled}
        onPress={() => setOpen((current) => !current)}
        style={[styles.input, styles.selectTrigger, disabled && styles.disabledButton]}
      >
        <Text style={[styles.selectValue, !selectedLabel && styles.selectPlaceholder]}>
          {selectedLabel ?? placeholder}
        </Text>
        <Text style={styles.selectArrow}>{open ? '▴' : '▾'}</Text>
      </Pressable>
      {open ? (
        <View style={styles.selectMenu}>
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                style={[styles.selectOption, selected && styles.selectOptionSelected]}
              >
                <Text style={[styles.selectOptionText, selected && styles.selectOptionTextSelected]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function convertToSquareMeters(value: number, unit: AreaUnit) {
  const squareMeters = unit === 'PYEONG' ? value * 3.305785 : value;
  return Math.round(squareMeters * 100) / 100;
}

export function Login({ onAuthenticated }: { onAuthenticated: (me: MeResponse) => void }) {
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const changeMode = (nextMode: 'login' | 'signup') => {
    setMode(nextMode);
    setError(null);
  };

  const submit = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedNickname = nickname.trim();

    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setError('올바른 이메일을 입력해 주세요.');
      return;
    }
    if (!password) {
      setError('비밀번호를 입력해 주세요.');
      return;
    }
    if (mode === 'signup' && (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password))) {
      setError('비밀번호는 8자 이상이며 영문과 숫자를 포함해야 합니다.');
      return;
    }
    if (mode === 'signup' && (normalizedNickname.length < 2 || normalizedNickname.length > 20)) {
      setError('닉네임은 2자 이상 20자 이하로 입력해 주세요.');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const auth = mode === 'login'
        ? await login(normalizedEmail, password)
        : await signup(normalizedEmail, password, normalizedNickname);
      await saveAccessToken(auth.accessToken);
      const me = await getMe(auth.accessToken);
      onAuthenticated(me);
    } catch (requestError) {
      await clearAccessToken();
      setError(requestError instanceof Error ? requestError.message : '요청을 처리하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.loginPage}>
      <View style={[styles.loginFrame, compact && styles.loginFrameCompact]}>
        <View style={[styles.loginIntro, compact && styles.loginIntroCompact]}>
          <BrandMark />
          <Text style={styles.loginKicker}>TERRABYTE SMART FARM</Text>
          <Text style={[styles.loginTitle, compact && styles.loginTitleCompact]}>
            재배 환경을{compact ? ' ' : '\n'}한눈에 관리하세요.
          </Text>
          <Text style={[styles.loginDescription, compact && styles.centerText]}>
            센서 데이터와 작물별 환경 분석을 바탕으로 필요한 관리 항목을 빠르게 확인할 수 있습니다.
          </Text>
          {!compact ? (
            <View style={styles.loginFacts}>
              <View style={styles.loginFact}>
                <Text style={styles.loginFactValue}>8개</Text>
                <Text style={styles.loginFactLabel}>공간·토양 측정 지표</Text>
              </View>
              <View style={styles.loginFactDivider} />
              <View style={styles.loginFact}>
                <Text style={styles.loginFactValue}>24시간</Text>
                <Text style={styles.loginFactLabel}>연속 환경 분석</Text>
              </View>
            </View>
          ) : null}
        </View>

        <Surface style={styles.loginPanel}>
          <View style={styles.loginPanelHeader}>
            <View style={styles.authTabs}>
              <Pressable disabled={submitting} onPress={() => changeMode('login')} style={[styles.authTab, mode === 'login' && styles.authTabActive]}>
                <Text style={[styles.authTabText, mode === 'login' && styles.authTabTextActive]}>로그인</Text>
              </Pressable>
              <Pressable disabled={submitting} onPress={() => changeMode('signup')} style={[styles.authTab, mode === 'signup' && styles.authTabActive]}>
                <Text style={[styles.authTabText, mode === 'signup' && styles.authTabTextActive]}>회원가입</Text>
              </Pressable>
            </View>
            <Text style={styles.loginPanelTitle}>{mode === 'login' ? '다시 만나 반가워요' : '농장을 시작해 볼까요?'}</Text>
            <Text style={styles.loginPanelDescription}>
              {mode === 'login' ? '등록한 계정으로 서비스를 시작하세요.' : '계정을 만들고 첫 번째 재배 공간을 등록하세요.'}
            </Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>이메일</Text>
            <TextInput
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!submitting}
              onChangeText={setEmail}
              placeholder="name@example.com"
              placeholderTextColor={palette.muted}
              style={styles.input}
              value={email}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>비밀번호</Text>
            <TextInput
              editable={!submitting}
              onChangeText={setPassword}
              placeholder="비밀번호를 입력하세요"
              placeholderTextColor={palette.muted}
              secureTextEntry
              style={styles.input}
              value={password}
            />
          </View>
          {mode === 'signup' ? (
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>닉네임</Text>
              <TextInput
                editable={!submitting}
                onChangeText={setNickname}
                placeholder="사용할 이름을 입력하세요"
                placeholderTextColor={palette.muted}
                style={styles.input}
                value={nickname}
              />
            </View>
          ) : null}
          {error ? <Text accessibilityRole="alert" style={styles.authError}>{error}</Text> : null}
          <ActionButton
            disabled={submitting}
            label={submitting ? '처리 중…' : mode === 'login' ? '로그인' : '계정 만들기'}
            onPress={() => void submit()}
          />
        </Surface>
      </View>
    </ScrollView>
  );
}

export function SetupFlow({
  deviceId,
  onBack,
  onCropSelected,
  onDeviceRegistered,
  onNext,
  selectedCropCode,
  stage,
}: {
  deviceId?: number;
  onBack: () => void;
  onCropSelected: (cropCode: string) => void;
  onDeviceRegistered: (deviceId: number) => void;
  onNext: () => void;
  selectedCropCode: string;
  stage: Exclude<FlowStage, 'auth' | 'app'>;
}) {
  const { width } = useWindowDimensions();
  const compact = width < 780;
  const [connected, setConnected] = useState(false);
  const [serialCode, setSerialCode] = useState('');
  const [spaceName, setSpaceName] = useState('');
  const [spaceType, setSpaceType] = useState<(typeof spaceTypeOptions)[number]['value'] | ''>('');
  const [areaSquareMeters, setAreaSquareMeters] = useState('');
  const [areaUnit, setAreaUnit] = useState<AreaUnit>('SQUARE_METERS');
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [registeringDevice, setRegisteringDevice] = useState(false);
  const [availableCrops, setAvailableCrops] = useState<CropResponse[]>([]);
  const [cropQuery, setCropQuery] = useState('');
  const [cropError, setCropError] = useState<string | null>(null);
  const [cropLoading, setCropLoading] = useState(false);
  const [selectingCrop, setSelectingCrop] = useState(false);
  const codeInputRef = useRef<TextInput>(null);
  const step = stage === 'device' ? 1 : stage === 'crop' ? 2 : 3;
  const enteredArea = Number(areaSquareMeters);
  const parsedAreaSquareMeters = convertToSquareMeters(enteredArea, areaUnit);
  const canRegisterDevice = serialCode.length === 6
    && spaceName.trim().length > 0
    && spaceType.trim().length > 0
    && Number.isFinite(enteredArea)
    && Number.isFinite(parsedAreaSquareMeters)
    && parsedAreaSquareMeters > 0;

  const updateSerialCode = (value: string) => {
    setSerialCode(value.replace(/\D/g, '').slice(0, 6));
    setDeviceError(null);
  };

  const submitDevice = async () => {
    if (serialCode.length !== 6) {
      setDeviceError('기기 코드 숫자 6자리를 입력해 주세요.');
      codeInputRef.current?.focus();
      return;
    }
    const parsedArea = convertToSquareMeters(Number(areaSquareMeters), areaUnit);
    if (!spaceName.trim()) {
      setDeviceError('공간 이름을 입력해 주세요.');
      return;
    }
    if (!spaceType.trim()) {
      setDeviceError('공간 유형을 입력해 주세요.');
      return;
    }
    if (!Number.isFinite(parsedArea) || parsedArea <= 0) {
      setDeviceError('공간 면적은 0보다 큰 숫자로 입력해 주세요.');
      return;
    }

    setDeviceError(null);
    setRegisteringDevice(true);
    try {
      const registered = await registerDevice({
        serialCode,
        spaceName: spaceName.trim(),
        spaceType: spaceType.trim(),
        areaSquareMeters: parsedArea,
      });
      onDeviceRegistered(registered.id);
      onNext();
    } catch (requestError) {
      setDeviceError(requestError instanceof Error ? requestError.message : '기기를 등록하지 못했습니다.');
    } finally {
      setRegisteringDevice(false);
    }
  };

  useEffect(() => {
    if (stage !== 'setup') {
      setConnected(false);
      return undefined;
    }
    const timer = setTimeout(() => setConnected(true), 1800);
    return () => clearTimeout(timer);
  }, [stage]);

  useEffect(() => {
    if (stage !== 'crop') return undefined;
    let active = true;
    setCropLoading(true);
    setCropError(null);
    const timer = setTimeout(() => {
      void getCrops(cropQuery)
        .then((nextCrops) => {
          if (active) setAvailableCrops(nextCrops);
        })
        .catch((error) => {
          if (active) setCropError(error instanceof Error ? error.message : '작물 목록을 불러오지 못했습니다.');
        })
        .finally(() => {
          if (active) setCropLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [cropQuery, stage]);

  const submitCrop = async () => {
    if (!deviceId) {
      setCropError('작물을 선택할 기기 정보를 찾을 수 없습니다.');
      return;
    }
    setCropError(null);
    setSelectingCrop(true);
    try {
      const selection = await selectDeviceCrop(deviceId, selectedCropCode);
      onCropSelected(selection.crop.code);
      onNext();
    } catch (error) {
      setCropError(error instanceof Error ? error.message : '작물을 선택하지 못했습니다.');
    } finally {
      setSelectingCrop(false);
    }
  };

  const copy = {
    device: { kicker: 'STEP 01', title: '진단할 공간을 등록하세요', description: '공간 기본 정보와 공간분석 세트의 등록 번호를 입력하세요.' },
    crop: { kicker: 'STEP 02', title: '검토할 작물을 선택하세요', description: '선택한 작물을 기준으로 공간 적합도와 필요한 개선 조건을 분석합니다.' },
    setup: { kicker: 'STEP 03', title: '분석 키트를 설치하세요', description: '공간분석 세트와 토양분석 세트를 연결하면 진단과 모니터링이 시작됩니다.' },
  }[stage];

  return (
    <ScrollView contentContainerStyle={styles.setupPage}>
      <View style={styles.setupTopbar}>
        <View style={styles.setupBrand}>
          <BrandMark compact />
          <Text style={styles.setupBrandName}>TerraByte</Text>
        </View>
        <View style={styles.setupProgress}>
          {[1, 2, 3].map((item) => (
            <View key={item} style={[styles.setupProgressBar, item <= step && styles.setupProgressBarActive]} />
          ))}
        </View>
        <Text style={styles.setupStepText}>{step} / 3</Text>
      </View>

      <View style={[styles.setupFrame, compact && styles.setupFrameCompact]}>
        <View style={styles.setupIntro}>
          <Text style={styles.setupKicker}>{copy.kicker}</Text>
          <Text style={styles.setupTitle}>{copy.title}</Text>
          <Text style={styles.setupDescription}>{copy.description}</Text>
          <Pressable onPress={onBack} style={styles.setupBackButton}>
            <Text style={styles.setupBackText}>이전 단계</Text>
          </Pressable>
        </View>

        <Surface style={styles.setupPanel}>
          {stage === 'device' ? (
            <View style={styles.deviceSetupContent}>
              <View style={styles.setupFieldGrid}>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>공간 이름</Text>
                  <TextInput
                    editable={!registeringDevice}
                    maxLength={100}
                    onChangeText={(value) => { setSpaceName(value); setDeviceError(null); }}
                    placeholder="예: 부산 도심 옥상 A"
                    placeholderTextColor={palette.muted}
                    style={styles.input}
                    value={spaceName}
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>공간 유형</Text>
                  <SelectField
                    disabled={registeringDevice}
                    onChange={(value) => { setSpaceType(value); setDeviceError(null); }}
                    options={spaceTypeOptions}
                    placeholder="공간 유형을 선택하세요"
                    value={spaceType}
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>공간 면적</Text>
                  <View style={styles.areaInputRow}>
                    <TextInput
                      editable={!registeringDevice}
                      inputMode="decimal"
                      keyboardType="decimal-pad"
                      onChangeText={(value) => {
                        setAreaSquareMeters(value.replace(/[^0-9.]/g, ''));
                        setDeviceError(null);
                      }}
                      placeholder="예: 42"
                      placeholderTextColor={palette.muted}
                      style={[styles.input, styles.areaValueInput]}
                      value={areaSquareMeters}
                    />
                    <SelectField
                      disabled={registeringDevice}
                      onChange={(value) => { setAreaUnit(value); setDeviceError(null); }}
                      options={areaUnitOptions}
                      placeholder="단위"
                      style={styles.areaUnitSelect}
                      value={areaUnit}
                    />
                  </View>
                  {areaUnit === 'PYEONG' && enteredArea > 0 ? (
                    <Text style={styles.areaConversionText}>
                      {enteredArea}평 = {parsedAreaSquareMeters}m²로 저장됩니다.
                    </Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.registrationGuide}>
                <Text style={styles.registrationGuideTitle}>공간분석 세트 등록 번호</Text>
                <Text style={styles.registrationGuideBody}>키트 하단 라벨에 표시된 숫자 여섯 자리를 입력하면 이 공간과 측정 데이터가 연결됩니다.</Text>
                <Text style={styles.registrationTestCode}>개발 테스트 코드: 123456</Text>
              </View>
              <Pressable
                accessibilityLabel="6자리 기기 코드 입력"
                accessibilityRole="button"
                onPress={() => codeInputRef.current?.focus()}
                style={styles.codeInputContainer}
              >
                <TextInput
                  autoFocus
                  caretHidden
                  editable={!registeringDevice}
                  inputMode="numeric"
                  keyboardType="number-pad"
                  maxLength={6}
                  onChangeText={updateSerialCode}
                  ref={codeInputRef}
                  style={styles.hiddenCodeInput}
                  value={serialCode}
                />
                <View pointerEvents="none" style={styles.codeInputRow}>
                  {Array.from({ length: 6 }, (_, index) => (
                    <View
                      key={index}
                      style={[
                        styles.codeCell,
                        index === serialCode.length && serialCode.length < 6 && styles.codeCellActive,
                      ]}
                    >
                      <Text style={styles.codeDigit}>{serialCode[index] ?? ''}</Text>
                    </View>
                  ))}
                </View>
              </Pressable>
              {deviceError ? <Text accessibilityRole="alert" style={styles.authError}>{deviceError}</Text> : null}
              <ActionButton
                disabled={registeringDevice || !canRegisterDevice}
                label={registeringDevice ? '등록 중…' : '공간 등록 완료'}
                onPress={() => void submitDevice()}
              />
            </View>
          ) : null}

          {stage === 'crop' ? (
            <View style={styles.cropSetupContent}>
              <TextInput
                editable={!selectingCrop}
                onChangeText={setCropQuery}
                placeholder="작물 이름 검색"
                placeholderTextColor={palette.muted}
                style={styles.input}
                value={cropQuery}
              />
              <View style={styles.cropChoiceGrid}>
                {availableCrops.map((crop) => {
                  const selected = selectedCropCode === crop.code;
                  return (
                    <Pressable
                      disabled={selectingCrop}
                      key={crop.code}
                      onPress={() => onCropSelected(crop.code)}
                      style={[styles.cropChoice, selected && styles.cropChoiceSelected]}
                    >
                      <View style={styles.cropChoiceCopy}>
                        <Text style={styles.cropChoiceName}>{crop.name}</Text>
                        <Text style={styles.cropChoiceDescription}>{crop.description}</Text>
                      </View>
                      <View style={[styles.cropRadio, selected && styles.cropRadioSelected]} />
                    </Pressable>
                  );
                })}
              </View>
              {cropLoading ? <Text style={styles.cropChoiceDescription}>작물 목록을 불러오는 중…</Text> : null}
              {!cropLoading && !cropError && availableCrops.length === 0 ? (
                <Text style={styles.cropChoiceDescription}>검색 결과가 없습니다.</Text>
              ) : null}
              {cropError ? <Text accessibilityRole="alert" style={styles.authError}>{cropError}</Text> : null}
              <ActionButton
                disabled={selectingCrop || cropLoading || !selectedCropCode}
                label={selectingCrop ? '선택 저장 중…' : `${crops.find((crop) => crop.code === selectedCropCode)?.name ?? '작물'} 선택`}
                onPress={() => void submitCrop()}
              />
            </View>
          ) : null}

          {stage === 'setup' ? (
            <View style={styles.deviceSetupContent}>
              <View style={styles.installSteps}>
                {[
                  '공간분석 세트를 후보 공간 중앙의 그늘지지 않는 위치에 놓아 주세요.',
                  '토양분석 세트를 재배 베드에 설치하고 수분·온도 센서를 흙에 꽂아 주세요.',
                  '두 키트의 전원을 연결하고 센서 표시등이 켜지는지 확인하세요.',
                ].map((item, index) => (
                  <View key={item} style={styles.installStep}>
                    <Text style={styles.installStepNumber}>{String(index + 1).padStart(2, '0')}</Text>
                    <Text style={styles.installStepText}>{item}</Text>
                  </View>
                ))}
              </View>
              <View style={[styles.connectionPanel, connected && styles.connectionPanelReady]}>
                <View style={[styles.connectionDot, connected && styles.connectionDotReady]} />
                <View>
                  <Text style={styles.connectionTitle}>{connected ? '기기 연결 완료' : '기기 신호를 기다리는 중'}</Text>
                  <Text style={styles.connectionDescription}>{connected ? '첫 번째 환경 데이터를 받았습니다.' : '연결에는 잠시 시간이 걸릴 수 있습니다.'}</Text>
                </View>
              </View>
              <ActionButton label="공간 진단 시작하기" onPress={onNext} />
            </View>
          ) : null}
        </Surface>
      </View>
    </ScrollView>
  );
}

export function Sidebar({ compact, cropName, onLogout, onNavigate, page }: {
  compact: boolean;
  cropName: string;
  onLogout: () => void;
  onNavigate: (page: Page) => void;
  page: Page;
}) {
  const [farmInfoOpen, setFarmInfoOpen] = useState(false);

  if (compact) {
    return (
      <View style={[styles.mobileNav, glassWebStyle]}>
        <Text style={styles.mobileBrandName}>TerraByte</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mobileNavItems}>
          {navItems.map((item) => (
            <Pressable key={item.key} onPress={() => onNavigate(item.key)} style={styles.mobileNavItem}>
              <Text style={[styles.mobileNavText, page === item.key && styles.mobileNavTextActive]}>{item.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  }

  return (
    <>
    <View style={[styles.sidebar, glassWebStyle]}>
      <View style={styles.brandRow}>
        <Text style={styles.brandName}>TerraByte</Text>
      </View>

      <Text style={styles.navCaption}>메뉴</Text>
      <View style={styles.navList}>
        {navItems.map((item) => {
          const active = item.key === page;
          return (
            <Pressable
              accessibilityRole="button"
              key={item.key}
              onPress={() => onNavigate(item.key)}
              style={[styles.navItem, active && styles.navItemActive]}
            >
              <Text style={[styles.navItemText, active && styles.navItemTextActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.sidebarBottom}>
        <Pressable accessibilityRole="button" onPress={() => setFarmInfoOpen(true)} style={({ pressed }) => [styles.devicePanel, pressed && styles.pressed]}>
          <View style={styles.deviceStatusRow}>
            <View style={styles.onlineDot} />
            <Text style={styles.deviceStatus}>정상 연결</Text>
          </View>
          <Text style={styles.deviceTitle}>내 스마트팜</Text>
          <Text style={styles.deviceDetail}>마지막 수신 방금 전</Text>
          <Text style={styles.devicePanelAction}>스마트팜 정보 보기</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onLogout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>로그아웃</Text>
        </Pressable>
      </View>
    </View>
    <Modal animationType="fade" onRequestClose={() => setFarmInfoOpen(false)} transparent visible={farmInfoOpen}>
      <View style={styles.modalBackdrop}>
        <Surface style={styles.infoModal}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderCopy}>
              <Text style={styles.modalEyebrow}>SMART FARM</Text>
              <Text style={styles.modalTitle}>내 스마트팜</Text>
            </View>
            <Pressable onPress={() => setFarmInfoOpen(false)} style={styles.modalClose}>
              <Text style={styles.modalCloseText}>닫기</Text>
            </Pressable>
          </View>
          <View style={styles.farmStatusSummary}>
            <View style={styles.onlineDot} />
            <View style={styles.farmStatusCopy}>
              <Text style={styles.farmStatusTitle}>모든 장치가 정상 작동 중입니다</Text>
              <Text style={styles.farmStatusBody}>등록된 센서에서 환경 데이터를 정상적으로 받고 있어요.</Text>
            </View>
          </View>
          <View style={styles.productInfoList}>
            <View style={styles.productInfoRow}><Text style={styles.productInfoLabel}>농장 이름</Text><Text style={styles.productInfoValue}>내 스마트팜</Text></View>
            <View style={styles.productInfoRow}><Text style={styles.productInfoLabel}>재배 작물</Text><Text style={styles.productInfoValue}>{cropName}</Text></View>
            <View style={styles.productInfoRow}><Text style={styles.productInfoLabel}>등록 기기</Text><Text style={styles.productInfoValue}>TerraByte Hub 01</Text></View>
            <View style={styles.productInfoRow}><Text style={styles.productInfoLabel}>연결 센서</Text><Text style={styles.productInfoValue}>7개</Text></View>
            <View style={styles.productInfoRow}><Text style={styles.productInfoLabel}>마지막 동기화</Text><Text style={styles.productInfoValue}>방금 전</Text></View>
          </View>
        </Surface>
      </View>
    </Modal>
    </>
  );
}

export function Header({ compact, page }: { compact: boolean; page: Page }) {
  const copy = pageCopy[page];
  const [alertsOpen, setAlertsOpen] = useState(false);
  return (
    <>
      <View style={[styles.header, compact && styles.headerCompact]}>
        <View style={styles.headerCopy}>
          <Text style={styles.pageTitle}>{copy.title}</Text>
          <Text style={styles.pageDescription}>{copy.description}</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable accessibilityRole="button" onPress={() => setAlertsOpen(true)} style={styles.headerAlertButton}>
            <Text style={styles.headerAlertLabel}>이상 환경 알림</Text>
            <Text style={styles.headerAlertCount}>2</Text>
          </Pressable>
          <View style={styles.headerDevice}>
            <View style={styles.onlineDot} />
            <Text style={styles.headerDeviceText}>기기 온라인</Text>
          </View>
        </View>
      </View>
      <Modal animationType="fade" onRequestClose={() => setAlertsOpen(false)} transparent visible={alertsOpen}>
        <View style={styles.modalBackdrop}>
          <Surface style={styles.alertModal}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderCopy}>
                <Text style={styles.modalEyebrow}>REAL-TIME ALERT</Text>
                <Text style={styles.modalTitle}>이상 환경 알림</Text>
                <Text style={styles.modalDescription}>권장 범위를 벗어난 환경이 2건 감지되었습니다.</Text>
              </View>
              <Pressable onPress={() => setAlertsOpen(false)} style={styles.modalClose}><Text style={styles.modalCloseText}>닫기</Text></Pressable>
            </View>
            <View style={styles.alertList}>
              <View style={styles.alertItemCritical}>
                <View style={styles.alertItemHeader}><Text style={styles.alertSeverityCritical}>주의</Text><Text style={styles.alertTime}>10분 전</Text></View>
                <Text style={styles.alertTitle}>조도가 권장 범위보다 낮습니다</Text>
                <Text style={styles.alertBody}>현재 8,000lux로 권장 하한 15,000lux보다 낮습니다. 생장등 상태와 설치 거리를 확인하세요.</Text>
              </View>
              <View style={styles.alertItemWarn}>
                <View style={styles.alertItemHeader}><Text style={styles.alertSeverityWarn}>확인 필요</Text><Text style={styles.alertTime}>24분 전</Text></View>
                <Text style={styles.alertTitle}>습도 하락이 지속되고 있습니다</Text>
                <Text style={styles.alertBody}>현재 습도는 45%이며 최근 30분 동안 5% 감소했습니다. 관수 후 환기 시간을 조정하세요.</Text>
              </View>
            </View>
            <Text style={styles.alertPolicy}>알림 기준: 권장 범위 이탈이 10분 이상 지속되면 사용자에게 안내합니다.</Text>
          </Surface>
        </View>
      </Modal>
    </>
  );
}

function makeWavePoints(seed: number, amplitude: number, center: number): number[] {
  return Array.from(
    { length: 36 },
    (_, index) => center + Math.sin(index * 0.42 + seed) * amplitude + Math.sin(index * 0.13) * 6,
  );
}

const extendedMetricSensors: Array<[label: string, model: string]> = [
  ['토양 온도', 'DS18B20'],
  ['CO₂', 'SCD40'],
  ['미세먼지', 'PMS5003'],
  ['소음', 'SEN0232'],
];

export function Dashboard({
  compact,
  onNavigate,
  selectedCrop,
}: {
  compact: boolean;
  onNavigate: (page: Page) => void;
  selectedCrop: number;
}) {
  const currentCrop = crops[selectedCrop] ?? crops[0];
  const [chartRange, setChartRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h');
  const { score: scoreData, measurements: latestData } = useDeviceEnvironment();
  const formulaDisclosure = useDisclosure();

  const factorDetail = (key: string) => {
    const factor = scoreData?.factors.find((item) => item.key === key);
    return factor
      ? `적정 범위 ${factor.optimalMin.toLocaleString('ko-KR')}~${factor.optimalMax.toLocaleString('ko-KR')}${factor.unit} · ${factor.score}점`
      : '점수 데이터를 기다리는 중';
  };
  const stats = [
    { label: '온도', value: latestData ? `${latestData.measurements.airTemperatureC}℃` : '--', detail: factorDetail('temperature') },
    { label: '습도', value: latestData ? `${latestData.measurements.airHumidityPct}%` : '--', detail: factorDetail('humidity') },
    { label: '광량', value: latestData ? `${latestData.measurements.plantLightPpfdUmolM2S.toLocaleString('ko-KR')} PPFD` : '--', detail: factorDetail('plantLight') },
    { label: '토양수분', value: latestData ? `${latestData.measurements.soilMoisturePct}%` : '--', detail: '종합 적합도 산식에서는 제외' },
  ];
  const displayFactors = scoreData?.factors ?? factors.slice(0, 3);
  const issueFactors = getIssueFactors(scoreData?.factors ?? []);
  const gradeText = getGradeLabel(scoreData?.grade);
  const extendedStats = extendedMetricSensors.map(([label, model]) => {
    const metric = latest.find((item) => item.label === label);
    return { label, value: metric?.value ?? '--', detail: `${model} · 정상` };
  });

  return (
    <View style={styles.pageBody}>
      <Surface style={styles.spaceIdentityPanel}>
        <View style={[styles.spaceIdentityTop, compact && styles.stack]}>
          <View style={styles.spaceIdentityCopy}>
            <Text style={styles.reportLabel}>REGISTERED SPACE</Text>
            <Text style={styles.spaceIdentityTitle}>부산 도심 옥상 A</Text>
            <Text style={styles.spaceIdentityMeta}>옥상 · 42m² · 남동향 · 공간분석 세트 1대 · 토양분석 세트 1대</Text>
          </View>
          <View style={styles.spaceOperatingBadge}><View style={styles.onlineDot} /><Text style={styles.spaceOperatingText}>재배환경 모니터링 중</Text></View>
        </View>
        <View style={[styles.serviceFlow, compact && styles.stack]}>
          <View style={styles.serviceFlowStep}><Text style={styles.serviceFlowNumber}>01</Text><Text style={styles.serviceFlowLabel}>공간 등록</Text><Text style={styles.serviceFlowState}>완료</Text></View>
          <View style={styles.serviceFlowLine} />
          <View style={styles.serviceFlowStep}><Text style={styles.serviceFlowNumber}>02</Text><Text style={styles.serviceFlowLabel}>공간 진단</Text><Text style={styles.serviceFlowState}>완료</Text></View>
          <View style={styles.serviceFlowLine} />
          <View style={styles.serviceFlowStepActive}><Text style={styles.serviceFlowNumberActive}>03</Text><Text style={styles.serviceFlowLabel}>환경 모니터링</Text><Text style={styles.serviceFlowStateActive}>운영 중</Text></View>
        </View>
      </Surface>

      <Surface style={[styles.scoreHero, compact && styles.scoreHeroCompact]}>
        <View style={styles.scoreHeroCopy}>
          <Text style={styles.scoreHeroEyebrow}>스마트팜 전환 적합도</Text>
          <View style={styles.scoreHeroValueRow}>
            <Text style={styles.scoreHeroValue}>{scoreData?.total ?? '--'}</Text>
            <Text style={styles.scoreHeroUnit}>/ 100</Text>
          </View>
          <Text style={styles.scoreHeroGrade}>{gradeText} · {scoreData?.cropName ?? currentCrop.name} 재배 기준</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={formulaDisclosure.show}
          style={({ pressed }) => [styles.formulaLink, styles.formulaLinkTop, pressed && styles.pressed]}
        >
          <Text style={styles.formulaLinkText}>적합도 계산식</Text>
          <Text style={styles.formulaLinkArrow}>→</Text>
        </Pressable>
      </Surface>

      <SuitabilityFormulaModal onClose={formulaDisclosure.hide} scoreData={scoreData} visible={formulaDisclosure.open} />

      <Surface style={styles.dashboardAlertPanel}>
        <View style={[styles.dashboardAlertHeader, compact && styles.stack]}>
          <View style={styles.dashboardAlertCopy}>
            <Text style={styles.dashboardAlertEyebrow}>현재 확인이 필요한 항목</Text>
            <Text style={styles.dashboardAlertTitle}>확인 필요한 환경 {issueFactors.length}건</Text>
          </View>
          <ActionButton label="분석 보고서 보기" onPress={() => onNavigate('analysis')} quiet />
        </View>
        <View style={[styles.dashboardAlertRows, compact && styles.stack]}>
          {issueFactors.length ? issueFactors.map((factor) => (
            <View key={factor.key} style={styles.dashboardAlertItem}>
              <Text style={styles.dashboardAlertItemLabel}>{factor.label} {factor.status === 'LOW' ? '부족' : '초과'}</Text>
              <Text style={styles.dashboardAlertItemValue}>{factor.current.toLocaleString('ko-KR')}{factor.unit}</Text>
              <Text style={styles.dashboardAlertItemBody}>적정 범위와 {factor.gap.toLocaleString('ko-KR')}{factor.unit} 차이 · 축 점수 {factor.score}점</Text>
            </View>
          )) : <Text style={styles.dashboardAlertItemBody}>현재 세 지표가 모두 적정 범위입니다.</Text>}
        </View>
      </Surface>

      <View style={[styles.metricChartGrid, compact && styles.stack]}>
        <Surface style={[styles.metricsColumn, compact && styles.fullWidth]}>
          {stats.map((item, index) => (
            <View key={item.label} style={[styles.statCardVertical, index < stats.length - 1 && styles.statCardDivider]}>
              <View>
                <Text style={styles.statLabel}>{item.label}</Text>
                <Text style={styles.statDetail}>{item.detail}</Text>
              </View>
              <Text style={styles.statValue}>{item.value}</Text>
            </View>
          ))}
        </Surface>
        <Surface style={styles.chartPanel}>
          <SectionHeader
            action={(
              <View style={styles.rangeControl}>
                {(['1h', '24h', '7d', '30d'] as const).map((range) => (
                  <Pressable key={range} onPress={() => setChartRange(range)} style={[styles.rangeButton, chartRange === range && styles.rangeButtonActive]}>
                    <Text style={[styles.rangeButtonText, chartRange === range && styles.rangeButtonTextActive]}>{range}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            title="환경 변화"
            description={`최근 ${chartRange === '1h' ? '1시간' : chartRange === '24h' ? '24시간' : chartRange === '7d' ? '7일' : '30일'} 센서 측정 추이`}
          />
          <LineChart
            axisLabels={['00:00', '06:00', '12:00', '18:00', '현재']}
            height={180}
            series={chartMetrics.map((metric) => ({
              label: metric.label,
              color: metric.color,
              values: makeWavePoints(metric.seed, metric.amp, metric.mid),
            }))}
          />
        </Surface>
      </View>

      <Surface style={styles.extendedMetricsPanel}>
        <SectionHeader title="확장 환경 지표" description="공간분석·토양분석 세트에서 함께 수집하는 운영 지표입니다." />
        <View style={[styles.extendedMetricsGrid, compact && styles.stack]}>
          {extendedStats.map((item) => (
            <View key={item.label} style={styles.extendedMetricItem}>
              <Text style={styles.extendedMetricLabel}>{item.label}</Text>
              <Text style={styles.extendedMetricValue}>{item.value}</Text>
              <Text style={styles.extendedMetricDetail}>{item.detail}</Text>
            </View>
          ))}
        </View>
      </Surface>

      <View style={[styles.dashboardBottomGrid, compact && styles.stack]}>
        <Surface style={styles.tablePanel}>
          <SectionHeader title="환경 상태" description="현재 측정값과 작물별 권장 범위 비교" />
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, styles.tableName]}>항목</Text>
            <Text style={styles.tableHeaderText}>현재 값</Text>
            <Text style={styles.tableHeaderText}>권장 범위</Text>
            <Text style={styles.tableHeaderText}>상태</Text>
          </View>
          {displayFactors.map((factor) => (
            <View key={factor.label} style={styles.tableRow}>
              <Text style={[styles.tableCellStrong, styles.tableName]}>{factor.label}</Text>
              <Text style={styles.tableCell}>{factor.current.toLocaleString('ko-KR')}{factor.unit}</Text>
              <Text style={styles.tableCell}>{factor.optimalMin.toLocaleString('ko-KR')}~{factor.optimalMax.toLocaleString('ko-KR')}{factor.unit}</Text>
              <View style={[styles.statusBadge, factor.status !== 'OK' && styles.statusBadgeWarn]}>
                <Text style={[styles.statusBadgeText, factor.status !== 'OK' && styles.statusBadgeTextWarn]}>
                  {factor.status === 'OK' ? '적정' : '확인 필요'}
                </Text>
              </View>
            </View>
          ))}
        </Surface>

        <Surface style={[styles.deviceStatusPanel, compact && styles.fullWidth]}>
          <SectionHeader title="하드웨어 키트" description="공간분석 세트 + 토양분석 세트" />
          <SensorSummary sensors={sensors} statusLabel="정상 수신" />
        </Surface>
      </View>
    </View>
  );
}

export function Analysis({ compact, onNavigate, onSelectCrop, selectedCrop }: {
  compact: boolean;
  onNavigate: (page: Page) => void;
  onSelectCrop: (cropCode: string) => Promise<void>;
  selectedCrop: number;
}) {
  const currentCrop = crops[selectedCrop] ?? crops[0];
  const { score: analysisScore, measurements: analysisLatest, error: analysisLoadError, refetch } = useDeviceEnvironment();
  const analysisError = analysisLoadError?.message ?? null;
  const formulaDisclosure = useDisclosure();
  const [cropSelectionError, setCropSelectionError] = useState<string | null>(null);
  const [selectingCropCode, setSelectingCropCode] = useState<string | null>(null);

  const selectRecommendedCrop = async (index: number) => {
    const crop = crops[index];
    if (!crop || crop.code === currentCrop.code) return;
    setCropSelectionError(null);
    setSelectingCropCode(crop.code);
    try {
      await onSelectCrop(crop.code);
      await refetch();
    } catch (error) {
      setCropSelectionError(error instanceof Error ? error.message : '작물 선택을 변경하지 못했습니다.');
    } finally {
      setSelectingCropCode(null);
    }
  };

  const scoreFactorReports = analysisScore?.factors.map((factor) => ({
    label: factor.label,
    unit: factor.unit,
    avg24h: factor.current,
    axisMax: Math.max(factor.current, factor.optimalMax * 1.25, 1),
    status: factor.status,
    finding: factor.status === 'OK'
      ? `현재 ${factor.current.toLocaleString('ko-KR')}${factor.unit}로 적정 범위 안에 있으며 축 점수는 ${factor.score}점입니다.`
      : `현재값이 적정 범위에서 ${factor.gap.toLocaleString('ko-KR')}${factor.unit} ${factor.status === 'LOW' ? '부족' : '초과'}하며 축 점수는 ${factor.score}점입니다.`,
    recommendation: getFactorRecommendation(factor.key),
  })) ?? [];
  const soilMoistureReport = analysisLatest ? [{
    label: '토양수분',
    unit: '%',
    avg24h: analysisLatest.measurements.soilMoisturePct,
    axisMax: 100,
    status: 'REFERENCE',
    finding: `현재 토양수분은 ${analysisLatest.measurements.soilMoisturePct}%입니다. 이 값은 모니터링용이며 종합 적합도에는 포함되지 않습니다.`,
    recommendation: '작물과 배지에 맞는 관수 기준이 확정되면 별도 관수 판단에 활용하세요.',
  }] : [];
  const factorReports = [...scoreFactorReports, ...soilMoistureReport];
  const issueFactors = getIssueFactors(analysisScore?.factors ?? []);
  const measuredAtText = analysisScore
    ? new Date(analysisScore.measuredAt).toLocaleString('ko-KR')
    : '데이터 수신 대기 중';
  const cropReports = altCrops.map((crop) => ({
    index: crop.setsCropIndex,
    name: crop.name,
    score: crop.expectedScore,
    reason: crop.reason,
    caution: crop.caution,
  }));

  return (
    <View style={styles.pageBody}>
      <Surface style={styles.reportCover}>
        <View style={[styles.reportCoverTop, compact && styles.stack]}>
          <View style={styles.reportCoverCopy}>
            <Text style={styles.reportLabel}>ENVIRONMENT REPORT · REALTIME</Text>
            <Text style={styles.reportTitle}>부산 도심 옥상 A 공간 진단 보고서</Text>
            <Text style={styles.reportLead}>{analysisScore?.cropName ?? currentCrop.name} 재배 기준으로 InfluxDB 최신 측정값과 환경 적합도를 분석했습니다.</Text>
          </View>
          <View style={styles.reportMeta}>
            <Text style={styles.reportMetaLabel}>분석 기준</Text>
            <Text style={styles.reportMetaValue}>{measuredAtText}</Text>
            <Text style={styles.reportMetaLabel}>데이터 상태</Text>
            <Text style={styles.reportMetaValue}>{analysisError ?? (analysisLatest ? 'InfluxDB 수신 정상' : '수신 대기 중')}</Text>
          </View>
        </View>
        <View style={[styles.reportSummaryGrid, compact && styles.stack]}>
          <View style={styles.reportScoreBlock}>
            <Text style={styles.reportSummaryLabel}>종합 적합도</Text>
            <View style={styles.bigScoreRow}><Text style={styles.bigScore}>{analysisScore?.total ?? '--'}</Text><Text style={styles.bigScoreUnit}>/ 100</Text></View>
            <Text style={styles.reportAssessment}>{getGradeLabel(analysisScore?.grade)}</Text>
          </View>
          <View style={[styles.reportSummaryBlock, styles.reportSummaryBlockWithFormula]}>
            <Text style={styles.reportSummaryLabel}>핵심 진단</Text>
            <Text style={styles.reportSummaryTitle}>{issueFactors.length ? `${issueFactors.map((factor) => factor.label).join('·')} 환경을 확인하세요` : '온도·습도·광량이 모두 적정합니다'}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={formulaDisclosure.show}
              style={({ pressed }) => [styles.formulaLink, styles.formulaLinkBottom, pressed && styles.pressed]}
            >
              <Text style={styles.formulaLinkText}>적합도 계산식</Text>
              <Text style={styles.formulaLinkArrow}>→</Text>
            </Pressable>
          </View>
          <View style={styles.reportSummaryBlock}>
            <Text style={styles.reportSummaryLabel}>관리 우선순위</Text>
            {issueFactors.length ? issueFactors.map((factor, index) => (
              <Text key={factor.key} style={styles.reportPriority}>{index + 1}. {factor.label} {factor.status === 'LOW' ? '보완' : '완화'}</Text>
            )) : <Text style={styles.reportPriority}>현재 환경 설정 유지</Text>}
            <Text style={styles.reportPriority}>{issueFactors.length + 1}. 토양수분 모니터링</Text>
          </View>
        </View>
        <ActionButton label="실시간 센서 확인" onPress={() => onNavigate('live')} quiet />
      </Surface>

      <SuitabilityFormulaModal
        onClose={formulaDisclosure.hide}
        scoreData={analysisScore}
        visible={formulaDisclosure.open}
      />

      <Surface style={styles.reportSection}>
        <View style={styles.reportSectionHeading}>
          <Text style={styles.reportSectionNumber}>01</Text>
          <SectionHeader title="지표별 상세 진단" description="측정값, 권장 범위, 관찰 결과와 권장 조치를 함께 정리했습니다." />
        </View>
        <View style={styles.reportFactorList}>
          {factorReports.map((factor) => {
            const width = Math.max(8, Math.min(100, (factor.avg24h / factor.axisMax) * 100));
            return (
              <View key={factor.label} style={styles.reportFactorRow}>
                <View style={styles.reportFactorHeader}>
                  <View>
                    <Text style={styles.reportFactorName}>{factor.label}</Text>
                    <Text style={styles.reportFactorValue}>{factor.avg24h.toLocaleString('ko-KR')}{factor.unit}</Text>
                  </View>
                  <Text style={[styles.reportStatus, factor.status !== 'OK' && factor.status !== 'REFERENCE' && styles.reportStatusWarn]}>{factor.status === 'OK' ? '안정' : factor.status === 'REFERENCE' ? '참고 지표' : '보완 필요'}</Text>
                </View>
                <View style={styles.factorTrack}><View style={[styles.factorFill, factor.status !== 'OK' && styles.factorFillWarn, { width: `${width}%` } as any]} /></View>
                <View style={[styles.reportFindingGrid, compact && styles.stack]}>
                  <View style={styles.reportFindingBlock}><Text style={styles.reportFindingLabel}>분석 결과</Text><Text style={styles.reportFindingText}>{factor.finding}</Text></View>
                  <View style={styles.reportFindingBlock}><Text style={styles.reportFindingLabel}>권장 조치</Text><Text style={styles.reportFindingText}>{factor.recommendation}</Text></View>
                </View>
              </View>
            );
          })}
        </View>
      </Surface>

      <Surface style={styles.reportSection}>
        <View style={styles.reportSectionHeading}>
          <Text style={styles.reportSectionNumber}>02</Text>
          <SectionHeader title="우선순위 개선 계획" description="효과와 실행 난이도를 기준으로 바로 적용할 작업부터 배치했습니다." />
        </View>
        <View style={styles.reportPlanList}>
          {[
            { number: '01', tag: '오늘 실행', title: '생장등 보조 운전 설정', body: '오후 16:00부터 20:00까지 4시간 운전하세요. 잎 끝과 조명 사이 거리는 약 30cm를 유지합니다.', effect: '조도 안정화 · 예상 +11점' },
            { number: '02', tag: '3일 관찰', title: '오후 습도 하락 구간 완화', body: '관수 직후 환기 시작 시간을 10분 늦추고 물받이 트레이를 배치해 50~60% 범위를 유지하세요.', effect: '습도 안정화 · 예상 +4점' },
            { number: '03', tag: '현재 유지', title: '토양수분 기준 관수 유지', body: '고정 시간 관수 대신 센서값 31% 이하를 기준으로 물을 주세요. 과습 위험을 줄일 수 있습니다.', effect: '뿌리 스트레스 예방' },
          ].map((plan) => (
            <View key={plan.number} style={[styles.reportPlanRow, compact && styles.stack]}>
              <Text style={styles.reportPlanNumber}>{plan.number}</Text>
              <View style={styles.reportPlanCopy}>
                <Text style={styles.reportPlanTag}>{plan.tag}</Text>
                <Text style={styles.reportPlanTitle}>{plan.title}</Text>
                <Text style={styles.reportPlanBody}>{plan.body}</Text>
              </View>
              <Text style={styles.reportPlanEffect}>{plan.effect}</Text>
            </View>
          ))}
        </View>
        <ActionButton label="필요한 제품 확인" onPress={() => onNavigate('shop')} />
      </Surface>

      <Surface style={styles.reportSection}>
        <View style={styles.reportSectionHeading}>
          <Text style={styles.reportSectionNumber}>03</Text>
          <SectionHeader title="7일 관리 일정" description="권장 조치를 적용한 뒤 확인해야 할 항목입니다." />
        </View>
        <View style={styles.reportSchedule}>
          {[
            ['오늘', '조명 설정', '생장등 위치와 4시간 운전 예약을 설정합니다.'],
            ['1일 후', '센서 확인', '오후 평균 조도와 최저 습도가 개선됐는지 비교합니다.'],
            ['3일 후', '잎 상태 관찰', '잎 말림, 변색, 줄기 웃자람 여부를 기록합니다.'],
            ['7일 후', '재분석', '환경 적합도를 다시 계산하고 관수 및 조명 시간을 조정합니다.'],
          ].map(([day, title, body]) => (
            <View key={day} style={styles.reportScheduleRow}>
              <Text style={styles.reportScheduleDay}>{day}</Text>
              <View style={styles.reportScheduleCopy}><Text style={styles.reportScheduleTitle}>{title}</Text><Text style={styles.reportScheduleBody}>{body}</Text></View>
            </View>
          ))}
        </View>
      </Surface>

      <Surface style={styles.reportSection}>
        <View style={styles.reportSectionHeading}>
          <Text style={styles.reportSectionNumber}>04</Text>
          <SectionHeader title="재배 작물 비교" description="현재 환경을 기준으로 작물별 적합도와 관리 유의사항을 비교했습니다." />
        </View>
        <View style={styles.reportCropList}>
          {cropReports.map((crop) => (
            <Pressable
              disabled={selectingCropCode !== null}
              key={crop.name}
              onPress={() => void selectRecommendedCrop(crop.index)}
              style={[styles.reportCropRow, compact && styles.stack, selectedCrop === crop.index && styles.reportCropRowSelected]}
            >
              <View style={styles.reportCropScore}><Text style={styles.reportCropScoreValue}>{crop.score}</Text><Text style={styles.reportCropScoreUnit}>점</Text></View>
              <View style={styles.reportCropCopy}>
                <Text style={styles.reportCropName}>{crop.name}{selectedCrop === crop.index ? ' · 현재 분석 기준' : ''}</Text>
                <Text style={styles.reportCropReason}>{crop.reason}</Text>
                <Text style={styles.reportCropCaution}>{crop.caution}</Text>
              </View>
              <Text style={styles.reportCropAction}>
                {selectingCropCode === crops[crop.index]?.code ? '변경 중…' : '분석 기준으로 선택'}
              </Text>
            </Pressable>
          ))}
          {cropSelectionError ? <Text accessibilityRole="alert" style={styles.authError}>{cropSelectionError}</Text> : null}
        </View>
      </Surface>

      <Surface style={styles.reportSection}>
        <View style={styles.reportSectionHeading}>
          <Text style={styles.reportSectionNumber}>05</Text>
          <SectionHeader title="토양 및 배지 추천" description="토양분석 세트의 수분·온도 측정값과 선택한 작물의 뿌리 특성을 반영했습니다." />
        </View>
        <View style={[styles.soilSummaryGrid, compact && styles.stack]}>
          <View style={styles.soilSummaryItem}><Text style={styles.soilSummaryLabel}>토양수분</Text><Text style={styles.soilSummaryValue}>36%</Text><Text style={styles.soilSummaryState}>적정</Text></View>
          <View style={styles.soilSummaryItem}><Text style={styles.soilSummaryLabel}>토양 온도</Text><Text style={styles.soilSummaryValue}>22.8℃</Text><Text style={styles.soilSummaryState}>적정</Text></View>
          <View style={styles.soilSummaryItem}><Text style={styles.soilSummaryLabel}>배수 상태</Text><Text style={styles.soilSummaryValue}>72점</Text><Text style={styles.soilSummaryStateWarn}>보완 권장</Text></View>
        </View>
        <View style={styles.soilRecommendationList}>
          {[
            { label: '1순위', title: '실내 허브용 배양토 + 펄라이트', ratio: '권장 배합 2 : 1', body: '현재 수분을 유지하면서 통기성과 배수성을 높이는 구성입니다. 바질과 페퍼민트의 뿌리 과습을 예방하기 좋습니다.', note: '분갈이 시 화분 하단에 배수층 2cm 확보' },
            { label: '2순위', title: '코코피트 + 펄라이트 + 상토', ratio: '권장 배합 1 : 1 : 2', body: '가볍고 수분 분포가 고른 배지입니다. 자동 관수 키트를 함께 사용할 때 수분 편차를 줄일 수 있습니다.', note: '초기 2주간 토양수분 32~40% 유지' },
            { label: '유지 관리', title: '기존 흙 배수성 보완', ratio: '펄라이트 20% 추가', body: '전체 분갈이가 어렵다면 표토를 걷어내고 펄라이트를 혼합해 배수성을 단계적으로 개선하세요.', note: '혼합 후 첫 관수량은 평소의 70% 적용' },
          ].map((soilItem) => (
            <View key={soilItem.title} style={styles.soilRecommendationRow}>
              <View style={styles.soilRecommendationLabelWrap}><Text style={styles.soilRecommendationLabel}>{soilItem.label}</Text></View>
              <View style={styles.soilRecommendationCopy}>
                <Text style={styles.soilRecommendationTitle}>{soilItem.title}</Text>
                <Text style={styles.soilRecommendationRatio}>{soilItem.ratio}</Text>
                <Text style={styles.soilRecommendationBody}>{soilItem.body}</Text>
                <Text style={styles.soilRecommendationNote}>{soilItem.note}</Text>
              </View>
            </View>
          ))}
        </View>
        <ActionButton label="추천 흙과 배지 보기" onPress={() => onNavigate('shop')} />
      </Surface>

      <Surface style={[styles.reportOutcome, compact && styles.stack]}>
        <View style={styles.reportOutcomeCopy}>
          <Text style={styles.reportLabel}>EXPECTED OUTCOME</Text>
          <Text style={styles.reportOutcomeTitle}>권장 조치 적용 시 예상 변화</Text>
          <Text style={styles.reportOutcomeBody}>생장등과 습도 관리안을 함께 적용한 뒤 7일간 현재 관수 기준을 유지하는 조건입니다.</Text>
        </View>
        <View style={[styles.reportOutcomeNumbers, compact && styles.stack]}>
          <View style={styles.reportOutcomeNumber}><Text style={styles.reportOutcomeLabel}>현재 환경점수</Text><Text style={styles.reportOutcomeValue}>68</Text></View>
          <View style={styles.reportOutcomeNumber}><Text style={styles.reportOutcomeLabel}>7일 후 예상</Text><Text style={styles.reportOutcomeValueStrong}>83</Text></View>
          <View style={styles.reportOutcomeNumber}><Text style={styles.reportOutcomeLabel}>개선 폭</Text><Text style={styles.reportOutcomeValueStrong}>+15</Text></View>
        </View>
      </Surface>
    </View>
  );
}

export function Shop({ compact }: { compact: boolean }) {
  const { score } = useDeviceEnvironment();
  const [category, setCategory] = useState<'all' | ShopCategory>('all');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ShopProduct | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 9;
  const filteredProducts = useMemo(
    () => category === 'all' ? shopProducts : shopProducts.filter((product) => product.category === category),
    [category],
  );
  const pageCount = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const visibleProducts = filteredProducts.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const cartCount = Object.values(cart).reduce((sum, value) => sum + value, 0);
  const cartProducts = shopProducts.filter((product) => (cart[product.id] ?? 0) > 0);
  const cartTotal = cartProducts.reduce((sum, product) => sum + product.price * (cart[product.id] ?? 0), 0);
  const recommendedProducts = getRecommendedProductIds(score?.factors ?? [])
    .map((id) => shopProducts.find((product) => product.id === id))
    .filter((product): product is ShopProduct => Boolean(product));
  const tabs: Array<{ key: 'all' | ShopCategory; label: string }> = [
    { key: 'all', label: '전체' },
    { key: 'parts', label: '부품' },
    { key: 'soil', label: '흙과 배지' },
    { key: 'seeds', label: '씨앗' },
  ];

  const changeCategory = (nextCategory: 'all' | ShopCategory) => {
    setCategory(nextCategory);
    setCurrentPage(1);
  };

  const addToCart = (product: ShopProduct) => {
    setCart((current) => ({ ...current, [product.id]: (current[product.id] ?? 0) + 1 }));
  };

  return (
    <View style={styles.pageBody}>
      <Surface style={styles.shopRecommendationPanel}>
        <SectionHeader title="현재 공간 맞춤 추천" description="공간 진단에서 확인된 조도, 습도와 배수 개선 항목을 기준으로 추천합니다." />
        <View style={[styles.shopRecommendationGrid, compact && styles.stack]}>
          {recommendedProducts.map((product, index) => (
            <Pressable key={product.id} onPress={() => setSelectedProduct(product)} style={styles.shopRecommendationCard}>
              <View style={styles.shopRecommendationTop}>
                <Text style={styles.shopRecommendationRank}>{index + 1}순위</Text>
              </View>
              <Text style={styles.shopRecommendationName}>{product.name}</Text>
              <Text style={styles.shopRecommendationDescription}>{product.desc}</Text>
              <View style={styles.shopRecommendationBottom}>
                <Text style={styles.shopRecommendationPrice}>{product.price.toLocaleString('ko-KR')}원</Text>
                <Pressable
                  onPress={(event) => {
                    event.stopPropagation?.();
                    addToCart(product);
                  }}
                  style={styles.addButton}
                >
                  <Text style={styles.addButtonText}>담기</Text>
                </Pressable>
              </View>
            </Pressable>
          ))}
        </View>
      </Surface>

      <View style={[styles.shopToolbar, compact && styles.shopToolbarCompact]}>
        <View style={styles.shopTabs}>
          {tabs.map((tab) => (
            <Pressable key={tab.key} onPress={() => changeCategory(tab.key)} style={[styles.shopTab, category === tab.key && styles.shopTabActive]}>
              <Text style={[styles.shopTabText, category === tab.key && styles.shopTabTextActive]}>{tab.label}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable accessibilityRole="button" onPress={() => setCartOpen(true)} style={styles.cartButton}>
          <Text style={styles.cartCount}>장바구니 {cartCount}</Text>
        </Pressable>
      </View>
      <Surface style={styles.productPanel}>
        <SectionHeader title="전체 제품" description={`전체 ${filteredProducts.length}개 · ${currentPage} / ${pageCount} 페이지`} />
        <View style={[styles.productGrid, compact && styles.stack]}>
          {visibleProducts.map((product) => (
            <Pressable key={product.id} onPress={() => setSelectedProduct(product)} style={[styles.productCard, compact && styles.productCardCompact]}>
              <View style={styles.productCardTop}>
                <Text style={styles.productCategoryText}>{product.category === 'parts' ? '부품' : product.category === 'soil' ? '흙과 배지' : '씨앗'}</Text>
                {product.badge ? <Text style={styles.productBadge}>{product.badge}</Text> : null}
              </View>
              <Text style={styles.productName}>{product.name}</Text>
              <Text style={styles.productDescription}>{product.desc}</Text>
              <View style={styles.productDivider} />
              <View style={styles.productBottom}>
                <Text style={styles.productPrice}>{product.price.toLocaleString('ko-KR')}원</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={(event) => {
                    event.stopPropagation?.();
                    addToCart(product);
                  }}
                  style={styles.addButton}
                >
                  <Text style={styles.addButtonText}>{cart[product.id] ? `${cart[product.id]}개 담김` : '담기'}</Text>
                </Pressable>
              </View>
            </Pressable>
          ))}
        </View>
        <View style={styles.pagination}>
          <Pressable disabled={currentPage === 1} onPress={() => setCurrentPage((page) => Math.max(1, page - 1))} style={[styles.pageArrow, currentPage === 1 && styles.pageDisabled]}>
            <Text style={styles.pageArrowText}>이전</Text>
          </Pressable>
          {Array.from({ length: pageCount }, (_, index) => index + 1).map((page) => (
            <Pressable key={page} onPress={() => setCurrentPage(page)} style={[styles.pageNumber, currentPage === page && styles.pageNumberActive]}>
              <Text style={[styles.pageNumberText, currentPage === page && styles.pageNumberTextActive]}>{page}</Text>
            </Pressable>
          ))}
          <Pressable disabled={currentPage === pageCount} onPress={() => setCurrentPage((page) => Math.min(pageCount, page + 1))} style={[styles.pageArrow, currentPage === pageCount && styles.pageDisabled]}>
            <Text style={styles.pageArrowText}>다음</Text>
          </Pressable>
        </View>
      </Surface>

      <Modal animationType="fade" onRequestClose={() => setSelectedProduct(null)} transparent visible={selectedProduct !== null}>
        <View style={styles.modalBackdrop}>
          <Surface style={styles.detailModal}>
            {selectedProduct ? (
              <>
                <View style={styles.modalHeader}>
                  <View style={styles.modalHeaderCopy}>
                    <Text style={styles.modalEyebrow}>상품 상세 정보</Text>
                    <Text style={styles.modalTitle}>{selectedProduct.name}</Text>
                  </View>
                  <Pressable onPress={() => setSelectedProduct(null)} style={styles.modalClose}>
                    <Text style={styles.modalCloseText}>닫기</Text>
                  </Pressable>
                </View>
                <Text style={styles.modalDescription}>{selectedProduct.desc}</Text>
                <View style={styles.productInfoList}>
                  <View style={styles.productInfoRow}><Text style={styles.productInfoLabel}>카테고리</Text><Text style={styles.productInfoValue}>{selectedProduct.category === 'parts' ? '부품' : selectedProduct.category === 'soil' ? '흙과 배지' : '씨앗'}</Text></View>
                  <View style={styles.productInfoRow}><Text style={styles.productInfoLabel}>배송 안내</Text><Text style={styles.productInfoValue}>결제 후 2~3일 이내 출고</Text></View>
                  <View style={styles.productInfoRow}><Text style={styles.productInfoLabel}>상품 상태</Text><Text style={styles.productInfoValue}>구매 가능</Text></View>
                </View>
                <View style={styles.modalFooter}>
                  <Text style={styles.modalPrice}>{selectedProduct.price.toLocaleString('ko-KR')}원</Text>
                  <ActionButton label="장바구니 담기" onPress={() => addToCart(selectedProduct)} />
                </View>
              </>
            ) : null}
          </Surface>
        </View>
      </Modal>

      <Modal animationType="fade" onRequestClose={() => setCartOpen(false)} transparent visible={cartOpen}>
        <View style={styles.modalBackdrop}>
          <Surface style={styles.cartModal}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderCopy}>
                <Text style={styles.modalEyebrow}>CART</Text>
                <Text style={styles.modalTitle}>장바구니</Text>
              </View>
              <Pressable onPress={() => setCartOpen(false)} style={styles.modalClose}>
                <Text style={styles.modalCloseText}>닫기</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.cartList}>
              {cartProducts.length === 0 ? (
                <Text style={styles.emptyCart}>장바구니에 담긴 상품이 없습니다.</Text>
              ) : cartProducts.map((product) => (
                <View key={product.id} style={styles.cartItem}>
                  <View style={styles.cartItemCopy}>
                    <Text style={styles.cartItemName}>{product.name}</Text>
                    <Text style={styles.cartItemPrice}>{product.price.toLocaleString('ko-KR')}원</Text>
                  </View>
                  <View style={styles.quantityControl}>
                    <Pressable
                      onPress={() => setCart((current) => ({
                        ...current,
                        [product.id]: Math.max(0, (current[product.id] ?? 0) - 1),
                      }))}
                      style={styles.quantityButton}
                    >
                      <Text style={styles.quantityButtonText}>−</Text>
                    </Pressable>
                    <Text style={styles.quantityValue}>{cart[product.id]}</Text>
                    <Pressable onPress={() => addToCart(product)} style={styles.quantityButton}><Text style={styles.quantityButtonText}>+</Text></Pressable>
                  </View>
                </View>
              ))}
            </ScrollView>
            <View style={styles.cartTotalRow}>
              <Text style={styles.cartTotalLabel}>총 결제 금액</Text>
              <Text style={styles.cartTotalValue}>{cartTotal.toLocaleString('ko-KR')}원</Text>
            </View>
            <ActionButton label="구매하기" onPress={() => setCartOpen(false)} />
          </Surface>
        </View>
      </Modal>
    </View>
  );
}

export const styles = StyleSheet.create(scaleTypography({
  root: { backgroundColor: palette.background, flex: 1, minHeight: '100vh', overflow: 'hidden', position: 'relative' } as any,
  backdropOrb: { borderRadius: 9999, filter: 'blur(70px)', position: 'absolute' } as any,
  backdropOrbOne: { backgroundColor: 'rgba(88,186,127,0.34)', height: 500, left: -150, top: -170, width: 500 },
  backdropOrbTwo: { backgroundColor: 'rgba(82,161,173,0.25)', bottom: -220, height: 620, right: -180, width: 620 },
  backdropOrbThree: { backgroundColor: 'rgba(235,207,111,0.20)', height: 340, right: '28%', top: '32%', width: 340 },
  backdropWash: { backgroundColor: 'rgba(255,255,255,0.12)', bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  pressed: { opacity: 0.78 },
  disabledButton: { opacity: 0.5 },
  sessionLoading: { alignItems: 'center', gap: 18, justifyContent: 'center' },
  sessionLoadingText: { color: palette.secondary, fontFamily: font, fontSize: 16, fontWeight: '700' },
  loginPage: { alignItems: 'center', flexGrow: 1, justifyContent: 'center', padding: 32 },
  loginFrame: { alignItems: 'center', flexDirection: 'row', gap: 100, maxWidth: 980, width: '100%' },
  loginFrameCompact: { flexDirection: 'column', gap: 38 },
  loginIntro: { flex: 1, maxWidth: 460 },
  loginIntroCompact: { alignItems: 'center' },
  loginKicker: { color: palette.green, fontFamily: font, fontSize: 15, fontWeight: '800', letterSpacing: 1.5, marginTop: 30 },
  loginTitle: { color: palette.text, fontFamily: font, fontSize: 42, fontWeight: '900', letterSpacing: -1.5, lineHeight: 56, marginTop: 10 },
  loginTitleCompact: { fontSize: 31, lineHeight: 42, textAlign: 'center' },
  loginDescription: { color: palette.secondary, fontFamily: font, fontSize: 18, lineHeight: 30, marginTop: 18, maxWidth: 460 },
  centerText: { textAlign: 'center' },
  loginFacts: { alignItems: 'center', flexDirection: 'row', gap: 28, marginTop: 38 },
  loginFact: { gap: 4 },
  loginFactValue: { color: palette.text, fontFamily: font, fontSize: 18, fontWeight: '800' },
  loginFactLabel: { color: palette.muted, fontFamily: font, fontSize: 15 },
  loginFactDivider: { backgroundColor: palette.lineStrong, height: 38, width: 1 },
  loginPanel: { gap: 20, maxWidth: 410, padding: 32, width: '100%' },
  loginPanelHeader: { gap: 6, marginBottom: 4 },
  authTabs: { backgroundColor: palette.panelMuted, borderColor: palette.line, borderRadius: 9, borderWidth: 1, flexDirection: 'row', marginBottom: 18, padding: 4 },
  authTab: { alignItems: 'center', borderRadius: 6, flex: 1, paddingVertical: 9 },
  authTabActive: { backgroundColor: palette.panel, shadowColor: '#203329', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6 },
  authTabText: { color: palette.muted, fontFamily: font, fontSize: 15, fontWeight: '700' },
  authTabTextActive: { color: palette.greenDark, fontWeight: '900' },
  loginPanelTitle: { color: palette.text, fontFamily: font, fontSize: 24, fontWeight: '900' },
  loginPanelDescription: { color: palette.secondary, fontFamily: font, fontSize: 16, lineHeight: 25 },
  authError: { color: palette.red, fontFamily: font, fontSize: 14, fontWeight: '700', lineHeight: 21 },
  field: { gap: 7 },
  fieldLabel: { color: palette.secondary, fontFamily: font, fontSize: 16, fontWeight: '700' },
  input: { backgroundColor: 'rgba(255,255,255,0.48)', borderColor: palette.lineStrong, borderRadius: 12, borderWidth: 1, color: palette.text, fontFamily: font, fontSize: 17, minHeight: 54, outlineStyle: 'none', paddingHorizontal: 16 } as any,
  selectContainer: { position: 'relative' },
  selectTrigger: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  selectValue: { color: palette.text, flex: 1, fontFamily: font, fontSize: 17 },
  selectPlaceholder: { color: palette.muted },
  selectArrow: { color: palette.greenDark, fontFamily: font, fontSize: 14, marginLeft: 10 },
  selectMenu: { backgroundColor: '#f4f8f5', borderColor: palette.lineStrong, borderRadius: 12, borderWidth: 1, marginTop: 4, overflow: 'hidden' },
  selectOption: { borderBottomColor: palette.line, borderBottomWidth: 1, paddingHorizontal: 16, paddingVertical: 13 },
  selectOptionSelected: { backgroundColor: palette.greenSoft },
  selectOptionText: { color: palette.secondary, fontFamily: font, fontSize: 15, fontWeight: '700' },
  selectOptionTextSelected: { color: palette.greenDark, fontWeight: '900' },
  areaInputRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 10 },
  areaValueInput: { flex: 1 },
  areaUnitSelect: { width: 110 },
  areaConversionText: { color: palette.greenDark, fontFamily: font, fontSize: 13, fontWeight: '700' },
  signupLink: { alignItems: 'center', paddingVertical: 4 },
  signupText: { color: palette.secondary, fontFamily: font, fontSize: 15, fontWeight: '600' },
  setupPage: { alignItems: 'center', flexGrow: 1, paddingBottom: 48, paddingHorizontal: 32 },
  setupTopbar: { alignItems: 'center', flexDirection: 'row', maxWidth: 1080, paddingVertical: 24, width: '100%' },
  setupBrand: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 9 },
  setupBrandName: { color: palette.text, fontFamily: font, fontSize: 19, fontWeight: '900' },
  setupProgress: { flexDirection: 'row', gap: 6, maxWidth: 260, width: '35%' },
  setupProgressBar: { backgroundColor: palette.line, borderRadius: 999, flex: 1, height: 4 },
  setupProgressBarActive: { backgroundColor: palette.green },
  setupStepText: { color: palette.muted, flex: 1, fontFamily: font, fontSize: 14, fontWeight: '700', textAlign: 'right' },
  setupFrame: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 70, justifyContent: 'center', maxWidth: 980, width: '100%' },
  setupFrameCompact: { flexDirection: 'column', gap: 28 },
  setupIntro: { flex: 1, gap: 13, maxWidth: 370 },
  setupKicker: { color: palette.green, fontFamily: font, fontSize: 14, fontWeight: '900', letterSpacing: 1.3 },
  setupTitle: { color: palette.text, fontFamily: font, fontSize: 40, fontWeight: '900', letterSpacing: -1.2, lineHeight: 51 },
  setupDescription: { color: palette.secondary, fontFamily: font, fontSize: 18, lineHeight: 29 },
  setupBackButton: { alignSelf: 'flex-start', borderBottomColor: palette.lineStrong, borderBottomWidth: 1, marginTop: 12, paddingBottom: 3 },
  setupBackText: { color: palette.secondary, fontFamily: font, fontSize: 15, fontWeight: '700' },
  setupPanel: { flex: 1.2, maxWidth: 540, padding: 28, width: '100%' },
  deviceSetupContent: { gap: 22 },
  setupFieldGrid: { gap: 13 },
  registrationGuide: { backgroundColor: palette.greenSoft, borderRadius: 9, gap: 7, padding: 18 },
  registrationGuideTitle: { color: palette.greenDark, fontFamily: font, fontSize: 17, fontWeight: '900' },
  registrationGuideBody: { color: palette.secondary, fontFamily: font, fontSize: 15, lineHeight: 24 },
  registrationTestCode: { color: palette.greenDark, fontFamily: font, fontSize: 14, fontWeight: '900', marginTop: 4 },
  codeInputRow: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  codeInputContainer: { position: 'relative' },
  hiddenCodeInput: { height: 1, opacity: 0, position: 'absolute', width: 1 },
  codeCell: { alignItems: 'center', backgroundColor: palette.panelMuted, borderColor: palette.line, borderRadius: 8, borderWidth: 1, flex: 1, height: 58, justifyContent: 'center', maxWidth: 56 },
  codeCellActive: { borderColor: palette.green, borderWidth: 2 },
  codeDigit: { color: palette.text, fontFamily: font, fontSize: 23, fontWeight: '900' },
  cropSetupContent: { gap: 18 },
  cropChoiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, maxHeight: 380, overflow: 'scroll' } as any,
  cropChoice: { alignItems: 'center', backgroundColor: palette.panelMuted, borderColor: palette.line, borderRadius: 9, borderWidth: 1, flexBasis: '47%', flexDirection: 'row', flexGrow: 1, gap: 10, minWidth: 210, padding: 14 },
  cropChoiceSelected: { backgroundColor: palette.greenSoft, borderColor: '#b8d7c3' },
  cropChoiceCopy: { flex: 1, gap: 3 },
  cropChoiceName: { color: palette.text, fontFamily: font, fontSize: 17, fontWeight: '900' },
  cropChoiceDescription: { color: palette.muted, fontFamily: font, fontSize: 14, lineHeight: 21 },
  cropRadio: { borderColor: palette.lineStrong, borderRadius: 999, borderWidth: 1, height: 13, width: 13 },
  cropRadioSelected: { backgroundColor: palette.green, borderColor: palette.green, borderWidth: 4 },
  installSteps: { gap: 10 },
  installStep: { alignItems: 'center', borderBottomColor: palette.line, borderBottomWidth: 1, flexDirection: 'row', gap: 14, paddingBottom: 12 },
  installStepNumber: { color: palette.green, fontFamily: font, fontSize: 14, fontWeight: '900' },
  installStepText: { color: palette.text, flex: 1, fontFamily: font, fontSize: 16, lineHeight: 25 },
  connectionPanel: { alignItems: 'center', backgroundColor: palette.amberSoft, borderRadius: 9, flexDirection: 'row', gap: 11, padding: 15 },
  connectionPanelReady: { backgroundColor: palette.greenSoft },
  connectionDot: { backgroundColor: palette.amber, borderRadius: 999, height: 9, width: 9 },
  connectionDotReady: { backgroundColor: palette.green },
  connectionTitle: { color: palette.text, fontFamily: font, fontSize: 16, fontWeight: '900' },
  connectionDescription: { color: palette.secondary, fontFamily: font, fontSize: 14, marginTop: 4 },
  appShell: { flexDirection: 'row' },
  appShellCompact: { flexDirection: 'column' },
  sidebar: { backgroundColor: 'rgba(255,255,255,0.44)', borderColor: palette.line, borderRightWidth: 1, paddingBottom: 30, paddingHorizontal: 22, paddingTop: 38, width: 240, zIndex: 2 },
  brandRow: { alignItems: 'center', flexDirection: 'row', paddingHorizontal: 10 },
  brandName: { color: palette.text, fontFamily: font, fontSize: 24, fontWeight: '900', letterSpacing: -0.6 },
  navCaption: { color: palette.muted, fontFamily: font, fontSize: 14, fontWeight: '900', letterSpacing: 0.3, marginBottom: 16, marginTop: 54, paddingHorizontal: 13 },
  navList: { gap: 8 },
  navItem: { borderLeftColor: 'transparent', borderLeftWidth: 3, borderRadius: 9, justifyContent: 'center', minHeight: 48, paddingHorizontal: 15 },
  navItemActive: { backgroundColor: palette.greenSoft, borderLeftColor: palette.green },
  navItemText: { color: palette.secondary, fontFamily: font, fontSize: 15, fontWeight: '700' },
  navItemTextActive: { color: palette.greenDark, fontWeight: '800' },
  sidebarBottom: { gap: 10, marginTop: 'auto' },
  devicePanel: { backgroundColor: palette.panelMuted, borderColor: palette.line, borderRadius: 10, borderWidth: 1, padding: 14 },
  deviceStatusRow: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  onlineDot: { backgroundColor: '#3aad70', borderRadius: 999, height: 7, width: 7 },
  deviceStatus: { color: palette.greenDark, fontFamily: font, fontSize: 14, fontWeight: '700' },
  deviceTitle: { color: palette.text, fontFamily: font, fontSize: 19, fontWeight: '800', marginTop: 12 },
  deviceDetail: { color: palette.muted, fontFamily: font, fontSize: 14, marginTop: 5 },
  devicePanelAction: { color: palette.greenDark, fontFamily: font, fontSize: 14, fontWeight: '800', marginTop: 16 },
  logoutButton: { alignItems: 'center', borderColor: palette.line, borderRadius: 8, borderWidth: 1, paddingVertical: 10 },
  logoutText: { color: palette.secondary, fontFamily: font, fontSize: 14, fontWeight: '700' },
  mobileNav: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.48)', borderBottomColor: palette.line, borderBottomWidth: 1, flexDirection: 'row', gap: 20, minHeight: 68, paddingHorizontal: 22, zIndex: 2 },
  mobileBrandName: { color: palette.text, fontFamily: font, fontSize: 18, fontWeight: '900' },
  mobileNavItems: { alignItems: 'center', gap: 18 },
  mobileNavItem: { paddingVertical: 12 },
  mobileNavText: { color: palette.muted, fontFamily: font, fontSize: 15, fontWeight: '700' },
  mobileNavTextActive: { color: palette.greenDark },
  workspace: { flex: 1, minWidth: 0, zIndex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 30, paddingBottom: 24, paddingHorizontal: 48, paddingTop: 40 },
  headerCompact: { alignItems: 'flex-start', flexDirection: 'column', paddingHorizontal: 20, paddingTop: 24 },
  headerCopy: { flex: 1, gap: 8, maxWidth: 820 },
  pageTitle: { color: palette.text, fontFamily: font, fontSize: 35, fontWeight: '900', letterSpacing: -1, lineHeight: 43 },
  pageDescription: { color: palette.secondary, fontFamily: font, fontSize: 15, fontWeight: '500', lineHeight: 25 },
  headerActions: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  headerAlertButton: { alignItems: 'center', backgroundColor: palette.amberSoft, borderColor: 'rgba(201,139,47,0.28)', borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 9, minHeight: 42, paddingHorizontal: 14 },
  headerAlertLabel: { color: '#8b5d1d', fontFamily: font, fontSize: 15, fontWeight: '900' },
  headerAlertCount: { alignItems: 'center', backgroundColor: palette.amber, borderRadius: 999, color: '#ffffff', fontFamily: font, fontSize: 15, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 4, textAlign: 'center' },
  headerDevice: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  headerDeviceText: { color: palette.secondary, fontFamily: font, fontSize: 15, fontWeight: '700' },
  workspaceScroll: { alignItems: 'center', paddingBottom: 88, paddingHorizontal: 48 },
  workspaceScrollCompact: { paddingBottom: 56, paddingHorizontal: 20 },
  pageBody: { gap: 30, maxWidth: 1320, width: '100%' },
  stack: { flexDirection: 'column' },
  fullWidth: { flexBasis: 'auto', width: '100%' },
  spaceIdentityPanel: { gap: 28, padding: 36 },
  spaceIdentityTop: { alignItems: 'flex-start', flexDirection: 'row', gap: 32, justifyContent: 'space-between' },
  spaceIdentityCopy: { flex: 1, gap: 7 },
  spaceIdentityTitle: { color: palette.text, fontFamily: font, fontSize: 25, fontWeight: '900', letterSpacing: -0.6 },
  spaceIdentityMeta: { color: palette.secondary, fontFamily: font, fontSize: 15, fontWeight: '500', lineHeight: 25, maxWidth: 820 },
  spaceOperatingBadge: { alignItems: 'center', backgroundColor: palette.greenSoft, borderColor: '#c9dfd1', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 8, paddingHorizontal: 15, paddingVertical: 9 },
  spaceOperatingText: { color: palette.greenDark, fontFamily: font, fontSize: 15, fontWeight: '900' },
  serviceFlow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  serviceFlowStep: { backgroundColor: palette.panelMuted, borderColor: palette.lineStrong, borderRadius: 12, borderWidth: 1, flex: 1, gap: 4, padding: 18 },
  serviceFlowStepActive: { backgroundColor: palette.greenSoft, borderColor: '#b8d7c3', borderRadius: 12, borderWidth: 1, flex: 1, gap: 4, padding: 18 },
  serviceFlowLine: { backgroundColor: '#b8d7c3', height: 1, width: 30 },
  serviceFlowNumber: { color: palette.muted, fontFamily: font, fontSize: 14, fontWeight: '900' },
  serviceFlowNumberActive: { color: palette.greenDark, fontFamily: font, fontSize: 14, fontWeight: '900' },
  serviceFlowLabel: { color: palette.text, fontFamily: font, fontSize: 17, fontWeight: '900' },
  serviceFlowState: { color: palette.secondary, fontFamily: font, fontSize: 14, fontWeight: '700' },
  serviceFlowStateActive: { color: palette.greenDark, fontFamily: font, fontSize: 14, fontWeight: '900' },
  scoreHero: { alignItems: 'center', flexDirection: 'row', gap: 44, justifyContent: 'space-between', padding: 38, position: 'relative' },
  scoreHeroCompact: { alignItems: 'flex-start', flexDirection: 'column' },
  scoreHeroCopy: { flex: 1, gap: 12 },
  scoreHeroEyebrow: { color: palette.greenDark, fontFamily: font, fontSize: 17, fontWeight: '900', letterSpacing: 0.5 },
  scoreHeroValueRow: { alignItems: 'flex-end', flexDirection: 'row', gap: 7 },
  scoreHeroValue: { color: palette.text, fontFamily: font, fontSize: 62, fontWeight: '900', letterSpacing: -2.2, lineHeight: 70 },
  scoreHeroUnit: { color: palette.muted, fontFamily: font, fontSize: 16, marginBottom: 11 },
  scoreHeroGrade: { color: palette.secondary, fontFamily: font, fontSize: 18, fontWeight: '700', lineHeight: 27 },
  formulaLink: { alignItems: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingVertical: 10 },
  formulaLinkTop: { position: 'absolute', right: 28, top: 22 },
  formulaLinkBottom: { bottom: 16, position: 'absolute', right: 16 },
  formulaLinkText: { color: palette.greenDark, fontFamily: font, fontSize: 16, fontWeight: '500' },
  formulaLinkArrow: { color: palette.green, fontFamily: font, fontSize: 20, fontWeight: '500' },
  scoreHeroSummary: { backgroundColor: palette.panelMuted, borderColor: palette.line, borderRadius: 14, borderWidth: 1, gap: 14, maxWidth: 430, padding: 26, width: '100%' },
  scoreHeroSummaryTitle: { color: palette.text, fontFamily: font, fontSize: 21, fontWeight: '900' },
  scoreHeroSummaryBody: { color: palette.secondary, fontFamily: font, fontSize: 15, fontWeight: '500', lineHeight: 25 },
  dashboardAlertPanel: { backgroundColor: 'rgba(251,241,223,0.70)', borderColor: 'rgba(201,139,47,0.24)', gap: 24, padding: 30 },
  dashboardAlertHeader: { alignItems: 'center', flexDirection: 'row', gap: 24, justifyContent: 'space-between' },
  dashboardAlertCopy: { flex: 1, gap: 5 },
  dashboardAlertEyebrow: { color: '#8b5d1d', fontFamily: font, fontSize: 15, fontWeight: '900' },
  dashboardAlertTitle: { color: palette.text, fontFamily: font, fontSize: 26, fontWeight: '900' },
  dashboardAlertRows: { flexDirection: 'row', gap: 14 },
  dashboardAlertItem: { backgroundColor: 'rgba(255,255,255,0.46)', borderColor: 'rgba(201,139,47,0.18)', borderRadius: 12, borderWidth: 1, flex: 1, gap: 5, padding: 18 },
  dashboardAlertItemLabel: { color: '#8b5d1d', fontFamily: font, fontSize: 15, fontWeight: '900' },
  dashboardAlertItemValue: { color: palette.text, fontFamily: font, fontSize: 30, fontWeight: '900' },
  dashboardAlertItemBody: { color: palette.secondary, fontFamily: font, fontSize: 16, fontWeight: '500', lineHeight: 25 },
  metricChartGrid: { alignItems: 'stretch', flexDirection: 'row', gap: 24 },
  metricsColumn: { overflow: 'hidden', paddingHorizontal: 30, width: 330 },
  statCardVertical: { gap: 12, justifyContent: 'center', minHeight: 142, paddingVertical: 24 },
  statCardDivider: { borderBottomColor: palette.lineStrong, borderBottomWidth: 1 },
  statLabel: { color: palette.secondary, fontFamily: font, fontSize: 18, fontWeight: '800' },
  statValue: { color: palette.text, fontFamily: font, fontSize: 38, fontWeight: '900', letterSpacing: -0.8 },
  statDetail: { color: palette.muted, fontFamily: font, fontSize: 16, fontWeight: '500', lineHeight: 25 },
  chartPanel: { flex: 1, gap: 32, padding: 34 },
  extendedMetricsPanel: { gap: 26, padding: 34 },
  extendedMetricsGrid: { flexDirection: 'row', gap: 14 },
  extendedMetricItem: { backgroundColor: palette.panelMuted, borderColor: palette.lineStrong, borderRadius: 12, borderWidth: 1, flex: 1, gap: 6, padding: 20 },
  extendedMetricLabel: { color: palette.secondary, fontFamily: font, fontSize: 17, fontWeight: '800' },
  extendedMetricValue: { color: palette.text, fontFamily: font, fontSize: 31, fontWeight: '900' },
  extendedMetricDetail: { color: palette.muted, fontFamily: font, fontSize: 15, fontWeight: '500', lineHeight: 24 },
  rangeControl: { backgroundColor: palette.panelMuted, borderColor: palette.line, borderRadius: 7, borderWidth: 1, flexDirection: 'row', padding: 3 },
  rangeButton: { borderRadius: 5, paddingHorizontal: 9, paddingVertical: 6 },
  rangeButtonActive: { backgroundColor: palette.panel },
  rangeButtonText: { color: palette.muted, fontFamily: font, fontSize: 14, fontWeight: '700' },
  rangeButtonTextActive: { color: palette.greenDark, fontWeight: '900' },
  summaryPanel: { flexBasis: 260, flexGrow: 0, gap: 18, padding: 23 },
  summaryEyebrow: { color: palette.green, fontFamily: font, fontSize: 14, fontWeight: '900', letterSpacing: 1.2 },
  summaryCrop: { color: palette.text, fontFamily: font, fontSize: 22, fontWeight: '900' },
  summaryDescription: { color: palette.secondary, fontFamily: font, fontSize: 16, lineHeight: 25 },
  scoreRow: { alignItems: 'center', flexDirection: 'row', gap: 13, marginTop: 4 },
  scoreRing: { alignItems: 'center', borderColor: palette.amber, borderRadius: 999, borderWidth: 5, height: 58, justifyContent: 'center', width: 58 },
  scoreNumber: { color: palette.text, fontFamily: font, fontSize: 19, fontWeight: '900' },
  scoreLabel: { color: palette.muted, fontFamily: font, fontSize: 14 },
  scoreGrade: { color: palette.text, fontFamily: font, fontSize: 15, fontWeight: '800', marginTop: 3 },
  summaryDivider: { backgroundColor: palette.line, height: 1 },
  summaryNotice: { color: palette.secondary, fontFamily: font, fontSize: 16, lineHeight: 25 },
  dashboardBottomGrid: { alignItems: 'stretch', flexDirection: 'row', gap: 24 },
  tablePanel: { flex: 1, padding: 34 },
  tableHeader: { borderBottomColor: palette.lineStrong, borderBottomWidth: 1, flexDirection: 'row', marginTop: 24, paddingBottom: 14 },
  tableHeaderText: { color: palette.muted, flex: 1, fontFamily: font, fontSize: 15, fontWeight: '700' },
  tableName: { flex: 1.2 },
  tableRow: { alignItems: 'center', borderBottomColor: palette.line, borderBottomWidth: 1, flexDirection: 'row', minHeight: 68 },
  tableCell: { color: palette.secondary, flex: 1, fontFamily: font, fontSize: 17 },
  tableCellStrong: { color: palette.text, flex: 1, fontFamily: font, fontSize: 17, fontWeight: '800' },
  statusBadge: { alignItems: 'center', backgroundColor: palette.greenSoft, borderRadius: 999, flex: 1, maxWidth: 104, paddingHorizontal: 8, paddingVertical: 7 },
  statusBadgeWarn: { backgroundColor: palette.amberSoft },
  statusBadgeText: { color: palette.greenDark, fontFamily: font, fontSize: 15, fontWeight: '800' },
  statusBadgeTextWarn: { color: palette.amber },
  deviceStatusPanel: { flexBasis: 380, flexGrow: 0, gap: 26, padding: 32 },
  analysisGrid: { alignItems: 'stretch', flexDirection: 'column', gap: 24 },
  analysisScorePanel: { gap: 22, padding: 36 },
  bigScoreRow: { alignItems: 'flex-end', flexDirection: 'row', gap: 5 },
  bigScore: { color: palette.text, fontFamily: font, fontSize: 66, fontWeight: '900', letterSpacing: -2 },
  bigScoreUnit: { color: palette.muted, fontFamily: font, fontSize: 15, marginBottom: 12 },
  analysisCrop: { color: palette.text, fontFamily: font, fontSize: 19, fontWeight: '900' },
  analysisDescription: { color: palette.secondary, fontFamily: font, fontSize: 16, lineHeight: 25 },
  factorPanel: { flex: 1, gap: 30, padding: 36 },
  factorList: { gap: 25 },
  factorRow: { alignItems: 'center', flexDirection: 'row', gap: 14 },
  factorCopy: { width: 104 },
  factorName: { color: palette.text, fontFamily: font, fontSize: 16, fontWeight: '800' },
  factorValue: { color: palette.muted, fontFamily: font, fontSize: 14, marginTop: 4 },
  factorTrack: { backgroundColor: palette.greenSoft, borderRadius: 999, flex: 1, height: 7, overflow: 'hidden' },
  factorFill: { backgroundColor: palette.green, borderRadius: 999, height: '100%' },
  factorFillWarn: { backgroundColor: palette.amber },
  factorState: { color: palette.greenDark, fontFamily: font, fontSize: 14, fontWeight: '800', textAlign: 'right', width: 78 },
  factorStateWarn: { color: palette.amber },
  recommendationPanel: { gap: 28, padding: 36 },
  cropRecommendationGrid: { flexDirection: 'column', gap: 18 },
  cropRecommendation: { backgroundColor: palette.panelMuted, borderColor: palette.line, borderRadius: 12, borderWidth: 1, gap: 12, padding: 28, width: '100%' },
  cropRecommendationSelected: { backgroundColor: palette.greenSoft, borderColor: '#b8d7c3' },
  cropRecommendationName: { color: palette.text, fontFamily: font, fontSize: 19, fontWeight: '900' },
  cropRecommendationDescription: { color: palette.secondary, fontFamily: font, fontSize: 16, lineHeight: 25 },
  cropRecommendationScore: { color: palette.greenDark, fontFamily: font, fontSize: 16, fontWeight: '800', marginTop: 6 },
  actionGrid: { alignItems: 'stretch', flexDirection: 'column', gap: 24 },
  actionPanel: { gap: 18, padding: 36, width: '100%' },
  actionPanelTitle: { color: palette.text, fontFamily: font, fontSize: 21, fontWeight: '900' },
  actionPanelBody: { color: palette.secondary, fontFamily: font, fontSize: 16, lineHeight: 26 },
  actionImpact: { color: palette.greenDark, fontFamily: font, fontSize: 17, fontWeight: '800' },
  actionMeta: { color: palette.muted, fontFamily: font, fontSize: 15, fontWeight: '700' },
  reportCover: { gap: 38, padding: 46 },
  reportCoverTop: { alignItems: 'flex-start', flexDirection: 'row', gap: 42, justifyContent: 'space-between' },
  reportCoverCopy: { flex: 1, gap: 10 },
  reportLabel: { color: palette.greenDark, fontFamily: font, fontSize: 15, fontWeight: '900', letterSpacing: 1.2 },
  reportTitle: { color: palette.text, fontFamily: font, fontSize: 34, fontWeight: '900', letterSpacing: -0.9, lineHeight: 44 },
  reportLead: { color: palette.secondary, fontFamily: font, fontSize: 16, fontWeight: '500', lineHeight: 27, maxWidth: 760 },
  reportMeta: { borderLeftColor: palette.lineStrong, borderLeftWidth: 1, gap: 5, minWidth: 220, paddingLeft: 24 },
  reportMetaLabel: { color: palette.muted, fontFamily: font, fontSize: 14, fontWeight: '800', marginTop: 7 },
  reportMetaValue: { color: palette.text, fontFamily: font, fontSize: 17, fontWeight: '800' },
  reportSummaryGrid: { alignItems: 'stretch', flexDirection: 'row', gap: 14 },
  reportScoreBlock: { backgroundColor: palette.greenSoft, borderColor: '#c9dfd1', borderRadius: 14, borderWidth: 1, gap: 8, justifyContent: 'center', minWidth: 240, padding: 26 },
  reportSummaryBlock: { backgroundColor: palette.panelMuted, borderColor: palette.line, borderRadius: 14, borderWidth: 1, flex: 1, gap: 9, padding: 26 },
  reportSummaryBlockWithFormula: { paddingBottom: 68, position: 'relative' },
  reportSummaryLabel: { color: palette.muted, fontFamily: font, fontSize: 15, fontWeight: '900', letterSpacing: 0.5 },
  reportAssessment: { color: palette.greenDark, fontFamily: font, fontSize: 18, fontWeight: '900' },
  reportSummaryTitle: { color: palette.text, fontFamily: font, fontSize: 21, fontWeight: '900', lineHeight: 29 },
  reportSummaryBody: { color: palette.secondary, fontFamily: font, fontSize: 15, fontWeight: '500', lineHeight: 25 },
  reportPriority: { color: palette.text, fontFamily: font, fontSize: 15, fontWeight: '800', lineHeight: 24 },
  reportSection: { gap: 36, padding: 46 },
  reportSectionHeading: { alignItems: 'flex-start', flexDirection: 'row', gap: 18 },
  reportSectionNumber: { color: palette.green, fontFamily: font, fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  reportFactorList: { gap: 16 },
  reportFactorRow: { backgroundColor: palette.panelMuted, borderColor: palette.lineStrong, borderRadius: 14, borderWidth: 1, gap: 22, padding: 30 },
  reportFactorHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  reportFactorName: { color: palette.text, fontFamily: font, fontSize: 21, fontWeight: '900' },
  reportFactorValue: { color: palette.secondary, fontFamily: font, fontSize: 16, fontWeight: '800', marginTop: 5 },
  reportStatus: { backgroundColor: palette.greenSoft, borderRadius: 999, color: palette.greenDark, fontFamily: font, fontSize: 14, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 13, paddingVertical: 8 },
  reportStatusWarn: { backgroundColor: palette.amberSoft, color: palette.amber },
  reportFindingGrid: { flexDirection: 'row', gap: 28 },
  reportFindingBlock: { flex: 1, gap: 8, maxWidth: 560 },
  reportFindingLabel: { color: palette.greenDark, fontFamily: font, fontSize: 15, fontWeight: '900' },
  reportFindingText: { color: palette.secondary, fontFamily: font, fontSize: 15, fontWeight: '500', lineHeight: 26 },
  reportPlanList: { borderColor: palette.lineStrong, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  reportPlanRow: { alignItems: 'center', backgroundColor: palette.panelMuted, borderBottomColor: palette.lineStrong, borderBottomWidth: 1, flexDirection: 'row', gap: 28, minHeight: 148, padding: 30 },
  reportPlanNumber: { color: palette.green, fontFamily: font, fontSize: 20, fontWeight: '900', width: 38 },
  reportPlanCopy: { flex: 1, gap: 8, maxWidth: 820 },
  reportPlanTag: { color: palette.greenDark, fontFamily: font, fontSize: 14, fontWeight: '900' },
  reportPlanTitle: { color: palette.text, fontFamily: font, fontSize: 21, fontWeight: '900' },
  reportPlanBody: { color: palette.secondary, fontFamily: font, fontSize: 15, fontWeight: '500', lineHeight: 26 },
  reportPlanEffect: { color: palette.greenDark, fontFamily: font, fontSize: 16, fontWeight: '900', maxWidth: 210, textAlign: 'right' },
  reportSchedule: { borderLeftColor: '#b8d7c3', borderLeftWidth: 2, gap: 4, marginLeft: 10 },
  reportScheduleRow: { flexDirection: 'row', gap: 24, minHeight: 84, paddingBottom: 16, paddingLeft: 24, paddingTop: 4 },
  reportScheduleDay: { color: palette.greenDark, fontFamily: font, fontSize: 16, fontWeight: '900', width: 86 },
  reportScheduleCopy: { flex: 1, gap: 5 },
  reportScheduleTitle: { color: palette.text, fontFamily: font, fontSize: 20, fontWeight: '900' },
  reportScheduleBody: { color: palette.secondary, fontFamily: font, fontSize: 15, fontWeight: '500', lineHeight: 26, maxWidth: 850 },
  reportCropList: { gap: 14 },
  reportCropRow: { alignItems: 'center', backgroundColor: palette.panelMuted, borderColor: palette.lineStrong, borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 22, padding: 24 },
  reportCropRowSelected: { backgroundColor: palette.greenSoft, borderColor: '#a9cfb8' },
  reportCropScore: { alignItems: 'flex-end', flexDirection: 'row', minWidth: 64 },
  reportCropScoreValue: { color: palette.greenDark, fontFamily: font, fontSize: 28, fontWeight: '900' },
  reportCropScoreUnit: { color: palette.muted, fontFamily: font, fontSize: 14, marginBottom: 6 },
  reportCropCopy: { flex: 1, gap: 8, maxWidth: 880 },
  reportCropName: { color: palette.text, fontFamily: font, fontSize: 21, fontWeight: '900' },
  reportCropReason: { color: palette.secondary, fontFamily: font, fontSize: 15, fontWeight: '500', lineHeight: 26 },
  reportCropCaution: { color: palette.muted, fontFamily: font, fontSize: 14, fontWeight: '500', lineHeight: 23 },
  reportCropAction: { color: palette.greenDark, fontFamily: font, fontSize: 15, fontWeight: '900', textAlign: 'right' },
  soilSummaryGrid: { flexDirection: 'row', gap: 14 },
  soilSummaryItem: { backgroundColor: palette.panelMuted, borderColor: palette.lineStrong, borderRadius: 12, borderWidth: 1, flex: 1, gap: 8, padding: 26 },
  soilSummaryLabel: { color: palette.secondary, fontFamily: font, fontSize: 14, fontWeight: '800' },
  soilSummaryValue: { color: palette.text, fontFamily: font, fontSize: 28, fontWeight: '900' },
  soilSummaryState: { color: palette.greenDark, fontFamily: font, fontSize: 14, fontWeight: '900' },
  soilSummaryStateWarn: { color: palette.amber, fontFamily: font, fontSize: 14, fontWeight: '900' },
  soilRecommendationList: { borderColor: palette.lineStrong, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  soilRecommendationRow: { alignItems: 'flex-start', backgroundColor: palette.panelMuted, borderBottomColor: palette.lineStrong, borderBottomWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 30, minHeight: 190, padding: 34 },
  soilRecommendationLabelWrap: { minWidth: 92, paddingTop: 3 },
  soilRecommendationLabel: { color: palette.greenDark, fontFamily: font, fontSize: 14, fontWeight: '900' },
  soilRecommendationCopy: { flex: 1, gap: 9, maxWidth: 980 },
  soilRecommendationTitle: { color: palette.text, fontFamily: font, fontSize: 21, fontWeight: '900', letterSpacing: -0.3, lineHeight: 29 },
  soilRecommendationRatio: { color: palette.greenDark, fontFamily: font, fontSize: 15, fontWeight: '900', lineHeight: 23 },
  soilRecommendationBody: { color: palette.secondary, fontFamily: font, fontSize: 15, fontWeight: '500', lineHeight: 26, maxWidth: 900 },
  soilRecommendationNote: { color: palette.muted, fontFamily: font, fontSize: 14, fontWeight: '700', lineHeight: 22 },
  reportOutcome: { alignItems: 'center', flexDirection: 'row', gap: 36, justifyContent: 'space-between', padding: 42 },
  reportOutcomeCopy: { flex: 1, gap: 8 },
  reportOutcomeTitle: { color: palette.text, fontFamily: font, fontSize: 28, fontWeight: '900' },
  reportOutcomeBody: { color: palette.secondary, fontFamily: font, fontSize: 17, fontWeight: '500', lineHeight: 28, maxWidth: 620 },
  reportOutcomeNumbers: { flexDirection: 'row', gap: 12 },
  reportOutcomeNumber: { backgroundColor: palette.panelMuted, borderColor: palette.lineStrong, borderRadius: 12, borderWidth: 1, gap: 5, minWidth: 120, padding: 18 },
  reportOutcomeLabel: { color: palette.muted, fontFamily: font, fontSize: 14, fontWeight: '800' },
  reportOutcomeValue: { color: palette.text, fontFamily: font, fontSize: 28, fontWeight: '900' },
  reportOutcomeValueStrong: { color: palette.greenDark, fontFamily: font, fontSize: 28, fontWeight: '900' },
  shopToolbar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  shopToolbarCompact: { alignItems: 'flex-start', flexDirection: 'column', gap: 12 },
  shopTabs: { backgroundColor: 'rgba(255,255,255,0.48)', borderColor: palette.lineStrong, borderRadius: 11, borderWidth: 1, flexDirection: 'row', gap: 3, padding: 5 },
  shopTab: { borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  shopTabActive: { backgroundColor: palette.green, shadowColor: '#1f6646', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.16, shadowRadius: 10 },
  shopTabText: { color: palette.secondary, fontFamily: font, fontSize: 17, fontWeight: '800' },
  shopTabTextActive: { color: '#ffffff', fontWeight: '900' },
  cartButton: { alignItems: 'center', backgroundColor: palette.panelMuted, borderColor: palette.line, borderRadius: 9, borderWidth: 1, justifyContent: 'center', minHeight: 42, paddingHorizontal: 17 },
  cartCount: { color: palette.secondary, fontFamily: font, fontSize: 16, fontWeight: '800' },
  shopRecommendationPanel: { gap: 28, padding: 34 },
  shopRecommendationGrid: { flexDirection: 'row', gap: 16 },
  shopRecommendationCard: { backgroundColor: palette.greenSoft, borderColor: '#c2dccb', borderRadius: 14, borderWidth: 1, flex: 1, gap: 10, minHeight: 220, padding: 24 },
  shopRecommendationTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  shopRecommendationRank: { color: palette.greenDark, fontFamily: font, fontSize: 14, fontWeight: '900' },
  shopRecommendationReason: { color: palette.secondary, fontFamily: font, fontSize: 13, fontWeight: '800' },
  shopRecommendationName: { color: palette.text, fontFamily: font, fontSize: 22, fontWeight: '900', lineHeight: 30 },
  shopRecommendationDescription: { color: palette.secondary, flex: 1, fontFamily: font, fontSize: 15, fontWeight: '500', lineHeight: 24 },
  shopRecommendationBottom: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  shopRecommendationPrice: { color: palette.greenDark, fontFamily: font, fontSize: 21, fontWeight: '900' },
  productPanel: { gap: 34, padding: 36 },
  productGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 20 },
  productCard: { backgroundColor: 'rgba(255,255,255,0.48)', borderColor: palette.lineStrong, borderRadius: 15, borderWidth: 1, flexBasis: '31%', flexGrow: 1, gap: 16, maxWidth: '32%', minHeight: 250, minWidth: 240, padding: 27, shadowColor: '#203329', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.06, shadowRadius: 18 },
  productCardCompact: { flexBasis: 'auto', maxWidth: '100%', minWidth: 0, width: '100%' },
  productCardTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 24 },
  productCategoryText: { color: palette.greenDark, fontFamily: font, fontSize: 15, fontWeight: '900', letterSpacing: 0.5 },
  productName: { color: palette.text, fontFamily: font, fontSize: 21, fontWeight: '900', lineHeight: 29 },
  productBadge: { backgroundColor: palette.greenSoft, borderRadius: 999, color: palette.greenDark, fontFamily: font, fontSize: 14, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 5 },
  productDescription: { color: palette.secondary, flex: 1, fontFamily: font, fontSize: 15, fontWeight: '500', lineHeight: 25 },
  productDivider: { backgroundColor: palette.lineStrong, height: 1 },
  productBottom: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  productPrice: { color: palette.greenDark, fontFamily: font, fontSize: 21, fontWeight: '900', letterSpacing: -0.3 },
  addButton: { backgroundColor: palette.green, borderRadius: 7, paddingHorizontal: 14, paddingVertical: 9 },
  addButtonText: { color: '#ffffff', fontFamily: font, fontSize: 15, fontWeight: '800' },
  pagination: { alignItems: 'center', flexDirection: 'row', gap: 7, justifyContent: 'center', paddingTop: 4 },
  pageArrow: { alignItems: 'center', borderColor: palette.line, borderRadius: 8, borderWidth: 1, justifyContent: 'center', minHeight: 36, paddingHorizontal: 13 },
  pageDisabled: { opacity: 0.35 },
  pageArrowText: { color: palette.secondary, fontFamily: font, fontSize: 14, fontWeight: '800' },
  pageNumber: { alignItems: 'center', borderRadius: 8, height: 36, justifyContent: 'center', width: 36 },
  pageNumberActive: { backgroundColor: palette.green },
  pageNumberText: { color: palette.secondary, fontFamily: font, fontSize: 15, fontWeight: '800' },
  pageNumberTextActive: { color: '#ffffff' },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(21, 46, 35, 0.34)', flex: 1, justifyContent: 'center', padding: 22 },
  detailModal: { gap: 24, maxWidth: 560, padding: 28, width: '100%' },
  infoModal: { gap: 22, maxHeight: '84%', maxWidth: 580, padding: 28, width: '100%' },
  alertModal: { gap: 24, maxHeight: '84%', maxWidth: 680, padding: 30, width: '100%' },
  cartModal: { gap: 20, maxHeight: '82%', maxWidth: 620, padding: 28, width: '100%' },
  modalHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 18, justifyContent: 'space-between' },
  modalHeaderCopy: { flex: 1, gap: 5 },
  modalEyebrow: { color: palette.greenDark, fontFamily: font, fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  modalTitle: { color: palette.text, fontFamily: font, fontSize: 32, fontWeight: '900', letterSpacing: -0.8, lineHeight: 41 },
  modalClose: { alignItems: 'center', borderColor: palette.line, borderRadius: 8, borderWidth: 1, justifyContent: 'center', minHeight: 36, paddingHorizontal: 12 },
  modalCloseText: { color: palette.secondary, fontFamily: font, fontSize: 14, fontWeight: '800' },
  modalDescription: { color: palette.secondary, fontFamily: font, fontSize: 17, fontWeight: '500', lineHeight: 28 },
  alertList: { gap: 12 },
  alertItemCritical: { backgroundColor: 'rgba(196,94,85,0.10)', borderColor: 'rgba(196,94,85,0.24)', borderRadius: 12, borderWidth: 1, gap: 8, padding: 20 },
  alertItemWarn: { backgroundColor: palette.amberSoft, borderColor: 'rgba(201,139,47,0.24)', borderRadius: 12, borderWidth: 1, gap: 8, padding: 20 },
  alertItemHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  alertSeverityCritical: { color: palette.red, fontFamily: font, fontSize: 15, fontWeight: '900' },
  alertSeverityWarn: { color: palette.amber, fontFamily: font, fontSize: 15, fontWeight: '900' },
  alertTime: { color: palette.muted, fontFamily: font, fontSize: 14, fontWeight: '700' },
  alertTitle: { color: palette.text, fontFamily: font, fontSize: 22, fontWeight: '900' },
  alertBody: { color: palette.secondary, fontFamily: font, fontSize: 17, fontWeight: '500', lineHeight: 28 },
  alertPolicy: { color: palette.muted, fontFamily: font, fontSize: 14, lineHeight: 22 },
  productInfoList: { borderColor: palette.line, borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  productInfoRow: { alignItems: 'center', borderBottomColor: palette.line, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 50, paddingHorizontal: 16 },
  productInfoLabel: { color: palette.muted, fontFamily: font, fontSize: 15, fontWeight: '700' },
  productInfoValue: { color: palette.text, fontFamily: font, fontSize: 16, fontWeight: '800' },
  farmStatusSummary: { alignItems: 'flex-start', backgroundColor: palette.greenSoft, borderColor: '#c9dfd1', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 12, padding: 17 },
  farmStatusCopy: { flex: 1, gap: 4 },
  farmStatusTitle: { color: palette.greenDark, fontFamily: font, fontSize: 18, fontWeight: '900' },
  farmStatusBody: { color: palette.secondary, fontFamily: font, fontSize: 16, fontWeight: '500', lineHeight: 25 },
  modalFooter: { alignItems: 'center', flexDirection: 'row', gap: 18, justifyContent: 'space-between' },
  modalPrice: { color: palette.text, fontFamily: font, fontSize: 24, fontWeight: '900' },
  cartList: { maxHeight: 380 },
  emptyCart: { color: palette.muted, fontFamily: font, fontSize: 17, paddingVertical: 46, textAlign: 'center' },
  cartItem: { alignItems: 'center', borderBottomColor: palette.line, borderBottomWidth: 1, flexDirection: 'row', gap: 18, justifyContent: 'space-between', minHeight: 74, paddingVertical: 12 },
  cartItemCopy: { flex: 1, gap: 5 },
  cartItemName: { color: palette.text, fontFamily: font, fontSize: 18, fontWeight: '900' },
  cartItemPrice: { color: palette.secondary, fontFamily: font, fontSize: 15 },
  quantityControl: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  quantityButton: { alignItems: 'center', backgroundColor: palette.panelMuted, borderColor: palette.line, borderRadius: 7, borderWidth: 1, height: 32, justifyContent: 'center', width: 32 },
  quantityButtonText: { color: palette.greenDark, fontFamily: font, fontSize: 16, fontWeight: '900' },
  quantityValue: { color: palette.text, fontFamily: font, fontSize: 16, fontWeight: '900', minWidth: 24, textAlign: 'center' },
  cartTotalRow: { alignItems: 'center', borderTopColor: palette.lineStrong, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingTop: 18 },
  cartTotalLabel: { color: palette.secondary, fontFamily: font, fontSize: 17, fontWeight: '800' },
  cartTotalValue: { color: palette.text, fontFamily: font, fontSize: 22, fontWeight: '900' },
}));
