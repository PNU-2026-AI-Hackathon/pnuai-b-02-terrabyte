import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
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
import { SectionHeader } from '../components/SectionHeader';
import { Surface } from '../components/Surface';
import { getCrops, selectDeviceCrop, type CropResponse } from '../crop/cropApi';
import {
  crops,
  factors,
} from '../data';
import { registerDevice } from '../device/deviceApi';

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
  scoreHeroSummary: { backgroundColor: palette.panelMuted, borderColor: palette.line, borderRadius: 14, borderWidth: 1, gap: 14, maxWidth: 430, padding: 26, width: '100%' },
  scoreHeroSummaryTitle: { color: palette.text, fontFamily: font, fontSize: 21, fontWeight: '900' },
  scoreHeroSummaryBody: { color: palette.secondary, fontFamily: font, fontSize: 15, fontWeight: '500', lineHeight: 25 },
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
  analysisGrid: { alignItems: 'stretch', flexDirection: 'column', gap: 24 },
  analysisScorePanel: { gap: 22, padding: 36 },
  analysisCrop: { color: palette.text, fontFamily: font, fontSize: 19, fontWeight: '900' },
  analysisDescription: { color: palette.secondary, fontFamily: font, fontSize: 16, lineHeight: 25 },
  factorPanel: { flex: 1, gap: 30, padding: 36 },
  factorList: { gap: 25 },
  factorRow: { alignItems: 'center', flexDirection: 'row', gap: 14 },
  factorCopy: { width: 104 },
  factorName: { color: palette.text, fontFamily: font, fontSize: 16, fontWeight: '800' },
  factorValue: { color: palette.muted, fontFamily: font, fontSize: 14, marginTop: 4 },
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
  reportSummaryBody: { color: palette.secondary, fontFamily: font, fontSize: 15, fontWeight: '500', lineHeight: 25 },
  shopRecommendationReason: { color: palette.secondary, fontFamily: font, fontSize: 13, fontWeight: '800' },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(21, 46, 35, 0.34)', flex: 1, justifyContent: 'center', padding: 22 },
  infoModal: { gap: 22, maxHeight: '84%', maxWidth: 580, padding: 28, width: '100%' },
  alertModal: { gap: 24, maxHeight: '84%', maxWidth: 680, padding: 30, width: '100%' },
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
}));
