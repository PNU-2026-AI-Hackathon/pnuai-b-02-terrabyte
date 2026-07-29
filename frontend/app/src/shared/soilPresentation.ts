// 토양 배지 추천 데이터셋의 자재명은 작물마다 표현이 조금씩 다르다
// (예: '원예용 상토' / '원예용 배양토' / '시판 원예용 상토' / '식용작물용 원예용 상토').
// 정확히 일치하는 문자열 딕셔너리 대신 키워드 포함 매칭으로 표현 차이에 안전하게 대응한다.
const MATERIAL_KEYWORD_PRODUCT_IDS: Array<{ keyword: string; productId: string }> = [
  { keyword: '상토', productId: 'herb-soil' },
  { keyword: '배양토', productId: 'herb-soil' },
  { keyword: '펄라이트', productId: 'perlite' },
  { keyword: '코코피트', productId: 'coco-peat' },
  { keyword: '버미큘라이트', productId: 'vermiculite' },
];

export function mapMaterialNameToProductId(name: string): string | undefined {
  return MATERIAL_KEYWORD_PRODUCT_IDS.find((entry) => name.includes(entry.keyword))?.productId;
}
