# 생육환경 점수 경계값 웹 검증

검증일: 2026-07-25
대상: `crop_score_profile` 활성 프로필 8개
경계 순서: `[zero_low, optimal_low, optimal_high, zero_high]`

## 판정 요약

기존 v1 값은 SQLite에 정상 저장돼 있었지만, 값 전체가 동일한 수준으로 검증된 것은 아니었다.

- 온도: 일부 작물은 대분류 기본값을 사용해 작물별 절대·최적 범위와 맞지 않았다.
- 상대습도: 대부분 `30/50/70/90`을 반복 사용했으며, 작물별 생육 비교시험 근거가 거의 없었다.
- PPFD: 권장 DLI를 기준 광주기로 나눈 값과 직접시험 값을 혼합했다. 일부 상한은 시험 범위 밖 외삽이었다.
- 따라서 v1은 이력 재현을 위해 보존하고, 재검증한 `*-general-v2` 8개를 추가해 활성화했다.

## 활성 v2 경계

### 대기온도 (°C)

| 작물 | v1 | 활성 v2 | 근거와 해석 |
| --- | --- | --- | --- |
| 바질 | 15/24/30/36 | **7/18/29/36** | FAO 절대·최적 범위에 `Nufar`의 29°C 최고 생육 처리점을 반영 |
| 페퍼민트 | 10/18/24/30 | **4/15/25/35** | FAO EcoCrop의 절대·최적 범위 |
| 방울토마토 | 12/18.5/26.5/32 | **7/18.5/26.5/35** | FAO 절대 범위와 온실 토마토 최적 범위 결합 |
| 대파 | 10/20/24/30 | **6/12/25/30** | FAO EcoCrop의 절대·최적 범위 |
| 아루굴라 | 10/20/24/30 | **8/15/25/29** | FAO EcoCrop의 절대·최적 범위 |
| 와사비 | 10/16/18/26 | **5/12/18/26** | 5°C 야간 생육 정체, 12–18°C 적온 및 고온 민감성 자료 결합 |
| 상추 | 10/20/24/30 | **5/12/24/30** | FAO 절대·최적 범위에 CEA의 24°C 고효율 처리 포함 |
| 고수 | 10/20/24/30 | **4/15/26/32** | FAO 범위와 표준 고수 생체중 최적 약 26°C 결과 결합 |

온도는 사다리꼴 네 경계와 자료 구조가 가장 잘 맞는다. 다만 FAO 범위는 특정 품종·생육단계의 실내 레시피가 아니라 일반 작물 적응 범위다.

### 상대습도 (%)

| 작물 | v1 | 활성 v2 | 근거 수준 |
| --- | --- | --- | --- |
| 바질 | 30/50/70/90 | **30/50/80/95** | CEA 일반 권장 50–80%; 85% 이상은 노균병 위험 구간 |
| 페퍼민트 | 30/50/70/90 | **30/50/80/95** | 직접 구배시험 없음; CEA 일반 범위 |
| 방울토마토 | 30/50/70/90 | **30/65/75/90** | 토마토 65–75% 권장, 장시간 85% 초과 시 착과 위험 |
| 대파 | 30/50/70/90 | **30/50/80/95** | 직접 구배시험 없음; CEA 일반 범위 |
| 아루굴라 | 30/50/70/90 | **30/50/80/95** | 시험 재배조건 60–80%와 CEA 일반 범위 |
| 와사비 | 40/60/75/95 | **40/60/80/95** | 직접 구배시험 없음; 68% 시험조건과 고습성 작물 특성 |
| 상추 | 30/50/70/90 | **30/60/75/90** | 70–75% VPD·CEA 연구와 90% 고습 tipburn 위험 |
| 고수 | 30/50/70/90 | **30/50/70/90** | 60% 시험조건은 있으나 직접 구배시험 없음 |

RH의 `zero_low`와 `zero_high`는 생존 한계가 아니다. 낮은 RH의 수분 스트레스와 포화에 가까운 RH의 병해·생리장해를 점수에 반영하기 위한 **제품 휴리스틱 앵커**다. 온도에 따라 같은 RH의 VPD가 달라지므로 향후에는 온도와 RH로 VPD를 계산하는 프로필이 더 타당하다.

### 식물광 PPFD (µmol·m⁻²·s⁻¹)

| 작물 | 기준 광주기 | v1 | 활성 v2 | 근거와 제한 |
| --- | ---: | --- | --- | --- |
| 바질 | 16 h | 0/260/500/750 | **0/260/600/1000** | DLI 15–25와 500–600 PPFD 최고 생체량 시험. 600 초과 감소 경사는 보수적 휴리스틱 |
| 페퍼민트 | 14 h | 0/150/200/300 | **0/150/200/250** | 150–200 적합, 250에서 광스트레스·황화 관찰 |
| 방울토마토 | 16 h | 0/347/521/800 | **0/300/521/800** | DLI 20–30 환산과 dwarf tomato 300 PPFD 최고 광이용효율 결합 |
| 대파 | 16 h | 0/208/347/600 | **0/208/347/600** | 직접 PPFD 구배시험 부족; 엽채류 DLI 휴리스틱 유지 |
| 아루굴라 | 16 h | 0/208/347/600 | **0/200/250/600** | 동일 DLI 비교에서 250 PPFD cap의 생체량·효율 우수 |
| 와사비 | 12 h | 0/120/140/250 | **0/90/140/250** | 90·140에서 높은 광합성, 140이 시험 최고 생체중; 140 초과는 미시험 |
| 상추 | 16 h | 0/208/295/500 | **0/200/295/500** | DLI 12–17 환산과 200 PPFD 고효율 CEA 시험 |
| 고수 | 16 h | 0/200/347/550 | **0/200/200/400** | 133·200·400 비교에서 200 PPFD·16 h 직접 권고 |

PPFD는 순간값만으로 하루 광환경을 완전히 평가할 수 없다. 위 값은 표의 기준 광주기와 광원이 유지된다는 조건에서만 사용한다. 특히 바질·토마토·대파·아루굴라·와사비·상추의 `zero_high`는 고사 임계값이 아니라 감점 경사의 끝점이다.

## 사용한 웹 근거

- [FAO EcoCrop 개요](https://www.fao.org/geospatial/data-and-tools/data-portals/ecocrop/)
- FAO EcoCrop: [바질](https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=1547), [페퍼민트](https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=2099), [토마토](https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=1379), [대파](https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=365), [아루굴라](https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=5794), [상추](https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=1313), [고수](https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=784)
- [Walters & Currey — 바질 온도 비교시험](https://journals.ashs.org/downloadpdf/view/journals/hortsci/54/11/article-p1915.pdf)
- [Beaman et al. — 바질 300–600 PPFD 비교시험](https://journals.ashs.org/view/journals/hortsci/44/1/article-p64.xml)
- [Nagase et al. — Mentha 20–250 PPFD 비교시험](https://doi.org/10.21273/HORTSCI18634-25)
- [Virginia Tech — CEA RH 50–80% 일반 권장과 VPD](https://www.pubs.ext.vt.edu/content/pubs_ext_vt_edu/en/SPES/spes-817-controlled-environment-agriculture-facilities-atmospheres.html)
- [토마토 제어환경 실험 지침](https://pmc.ncbi.nlm.nih.gov/articles/PMC4235429/)
- [토마토 200–700 PPFD 비교시험](https://pubmed.ncbi.nlm.nih.gov/36923121/)
- [대파 생육조건 종설](https://pmc.ncbi.nlm.nih.gov/articles/PMC8839942/)
- [로켓의 동적 PPFD 비교시험](https://doi.org/10.3389/fpls.2024.1447368)
- [와사비 환경제어 시험](https://www.jstage.jst.go.jp/article/ecb2005/43/3/43_3_181/_article)
- [와사비 35–140 PPFD 비교시험](https://www.mdpi.com/2311-7524/11/1/3)
- [상추 온도·광 상호작용 시험](https://www.frontiersin.org/journals/plant-science/articles/10.3389/fpls.2020.592171/full)
- [상추 VPD 변동 시험](https://pmc.ncbi.nlm.nih.gov/articles/PMC8049605/)
- [Virginia Tech — 작물별 DLI 권장 범위](https://www.pubs.ext.vt.edu/content/pubs_ext_vt_edu/en/SPES/spes-720/spes-720.html)
- [고수 온도 비교시험 초록](https://ashs.confex.com/ashs/2016/webprogramarchives/Paper24200.html)
- [고수 133·200·400 PPFD × 광주기 시험](https://www.mdpi.com/2311-7524/10/3/215)

## 남은 제한

1. 점수는 품종·생육단계·광질·CO₂·기류를 고정하지 않은 일반 휴리스틱이다.
2. 온도 자료의 일평균·주간·야간 기준이 다른데 현재 API는 순간 온도를 사용하므로, 향후 시간대별 프로필이 필요하다.
3. RH는 VPD로 교체하거나 최소한 온도와 결합해 평가하는 것이 바람직하다.
4. PPFD는 순간 스냅샷보다 DLI 기반 일간 점수를 별도로 두는 것이 바람직하다.
5. 직접시험 상한 밖의 `zero_high`는 현장 A/B 검증 전까지 피해·고사 임계값으로 표시하면 안 된다.
