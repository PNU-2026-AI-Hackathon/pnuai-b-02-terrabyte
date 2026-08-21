import { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { controlTextTokens, controlTokens } from '../../appTheme/controls';
import { font } from '../../appTheme/glass';
import { palette } from '../../appTheme/palette';
import { scaleTypography } from '../../appTheme/scaleTypography';
import { typeScale } from '../../appTheme/typography';
import { ActionButton } from '../../components/ActionButton';
import { SectionHeader } from '../../components/SectionHeader';
import { Surface } from '../../components/Surface';
import { addCartItem, getCart, removeCartItem, updateCartItem, type CartResponse } from '../../cart/cartApi';
import { createOrder } from '../../order/orderApi';
import { readyPayment } from '../../payment/paymentApi';
import { requestTossPayment } from '../../payment/tossPayment';
import { getShopProducts, type ShopCategory, type ShopProduct, type ShopSubCategory } from '../../shop/shopApi';

type ProductCategory = 'all' | ShopCategory;
type ProductSubCategory = 'all' | ShopSubCategory;

function formatPackage(product: ShopProduct) {
  if (product.packageQuantity == null || !product.packageUnit) return '정보 준비 중';
  return `${product.packageQuantity.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}${product.packageUnit}`;
}

function subCategoryLabel(subCategory: ProductSubCategory) {
  if (subCategory === 'SOIL') return '배양토';
  if (subCategory === 'MEDIA') return '배지';
  if (subCategory === 'NUTRIENT') return '영양제';
  return '전체';
}

function errorMessage(caught: unknown, fallback: string) {
  return caught instanceof Error ? caught.message : fallback;
}

const EMPTY_CART: CartResponse = { items: [], totalQuantity: 0, totalPrice: 0 };
const EMPTY_SHIPPING = {
  recipientName: '',
  recipientPhone: '',
  postalCode: '',
  address: '',
  addressDetail: '',
};

export function ShopScreen({
  compact,
  fetchProducts = getShopProducts,
  fetchCart = getCart,
}: {
  compact: boolean;
  fetchProducts?: typeof getShopProducts;
  fetchCart?: typeof getCart;
}) {
  const [category, setCategory] = useState<ProductCategory>('all');
  const [subCategory, setSubCategory] = useState<ProductSubCategory>('all');
  const [recommendedOnly, setRecommendedOnly] = useState(false);
  const [cart, setCart] = useState<CartResponse>(EMPTY_CART);
  const [cartLoading, setCartLoading] = useState(true);
  const [cartError, setCartError] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutAmount, setCheckoutAmount] = useState(0);
  const [pendingOrderId, setPendingOrderId] = useState<number | null>(null);
  const [shipping, setShipping] = useState(EMPTY_SHIPPING);
  const [selectedProduct, setSelectedProduct] = useState<ShopProduct | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 9;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void fetchProducts()
      .then((nextProducts) => { if (active) setProducts(nextProducts); })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : '상품 목록을 불러오지 못했습니다.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fetchProducts]);

  useEffect(() => {
    let active = true;
    setCartLoading(true);
    setCartError(null);
    void fetchCart()
      .then((nextCart) => { if (active) setCart(nextCart); })
      .catch((caught) => {
        if (active) setCartError(errorMessage(caught, '장바구니를 불러오지 못했습니다.'));
      })
      .finally(() => { if (active) setCartLoading(false); });
    return () => { active = false; };
  }, [fetchCart]);

  const filteredProducts = useMemo(
    () => {
      const categoryProducts = category === 'all'
        ? products
        : products.filter((product) => product.category === category);
      const subCategoryProducts = subCategory === 'all'
        ? categoryProducts
        : categoryProducts.filter((product) => product.subCategory === subCategory);
      return recommendedOnly
        ? subCategoryProducts.filter((product) => product.badge?.includes('추천'))
        : subCategoryProducts;
    },
    [category, products, recommendedOnly, subCategory],
  );
  const pageCount = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const visibleProducts = filteredProducts.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const cartQuantities = useMemo(
    () => new Map(cart.items.map((item) => [item.productId, item.quantity])),
    [cart.items],
  );
  const cartCount = cart.totalQuantity;
  const tabs: Array<{ key: ProductCategory; label: string }> = [
    { key: 'all', label: '전체' },
    { key: 'parts', label: '부품' },
    { key: 'soil', label: '흙과 배지' },
    { key: 'seeds', label: '씨앗' },
  ];

  const changeCategory = (nextCategory: ProductCategory) => {
    setCategory(nextCategory);
    setSubCategory('all');
    setCurrentPage(1);
  };

  const changeSubCategory = (nextSubCategory: ProductSubCategory) => {
    setSubCategory(nextSubCategory);
    setCurrentPage(1);
  };

  const toggleRecommended = () => {
    setRecommendedOnly((current) => !current);
    setCurrentPage(1);
  };

  const addToCart = async (product: ShopProduct) => {
    if (product.available === false) return;
    setCartLoading(true);
    setCartError(null);
    try {
      setCart(await addCartItem(product.id));
    } catch (caught) {
      setCartError(errorMessage(caught, '장바구니에 상품을 담지 못했습니다.'));
    } finally {
      setCartLoading(false);
    }
  };

  const changeCartQuantity = async (productId: string, quantity: number) => {
    setCartLoading(true);
    setCartError(null);
    try {
      setCart(quantity <= 0
        ? await removeCartItem(productId)
        : await updateCartItem(productId, quantity));
    } catch (caught) {
      setCartError(errorMessage(caught, '장바구니 수량을 변경하지 못했습니다.'));
    } finally {
      setCartLoading(false);
    }
  };

  const openCheckout = () => {
    if (cart.items.length === 0) return;
    setCartOpen(false);
    setCheckoutError(null);
    setCheckoutAmount(cart.totalPrice);
    setCheckoutOpen(true);
  };

  const startPayment = async () => {
    if (Platform.OS !== 'web') {
      setCheckoutError('현재 토스 테스트 결제는 웹에서만 지원합니다.');
      return;
    }
    if (!shipping.recipientName.trim()
        || !shipping.recipientPhone.trim()
        || !shipping.postalCode.trim()
        || !shipping.address.trim()) {
      setCheckoutError('받는 분, 연락처, 우편번호, 주소를 모두 입력해 주세요.');
      return;
    }

    setCheckoutLoading(true);
    setCheckoutError(null);
    try {
      let orderId = pendingOrderId;
      if (orderId == null) {
        const order = await createOrder({
          recipientName: shipping.recipientName.trim(),
          recipientPhone: shipping.recipientPhone.trim(),
          postalCode: shipping.postalCode.trim(),
          address: shipping.address.trim(),
          addressDetail: shipping.addressDetail.trim() || undefined,
        });
        orderId = order.id;
        setPendingOrderId(order.id);
        setCart(EMPTY_CART);
      }
      const ready = await readyPayment(orderId);
      await requestTossPayment(ready);
    } catch (caught) {
      setCheckoutError(errorMessage(caught, '결제창을 열지 못했습니다.'));
      setCheckoutLoading(false);
    }
  };

  return (
    <View style={styles.pageBody}>
      <View style={[styles.shopToolbar, compact && styles.shopToolbarCompact]}>
        <View style={styles.shopFilters}>
          <View style={styles.shopTabs}>
            {tabs.map((tab) => (
              <Pressable key={tab.key} onPress={() => changeCategory(tab.key)} style={[styles.shopTab, category === tab.key && styles.shopTabActive]}>
                <Text style={[styles.shopTabText, category === tab.key && styles.shopTabTextActive]}>{tab.label}</Text>
              </Pressable>
            ))}
          </View>
          {category === 'soil' ? (
            <View style={styles.subCategoryTabs}>
              {(['all', 'SOIL', 'MEDIA', 'NUTRIENT'] as ProductSubCategory[]).map((tab) => (
                <Pressable key={tab} onPress={() => changeSubCategory(tab)} style={[styles.subCategoryTab, subCategory === tab && styles.subCategoryTabActive]}>
                  <Text style={[styles.subCategoryTabText, subCategory === tab && styles.subCategoryTabTextActive]}>{subCategoryLabel(tab)}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
        <View style={[styles.shopToolbarActions, compact && styles.shopToolbarActionsCompact]}>
          <Pressable accessibilityRole="button" onPress={() => setCartOpen(true)} style={styles.cartButton}>
            <Text style={styles.cartCount}>장바구니 {cartCount}</Text>
          </Pressable>
        </View>
      </View>
      <Surface flat style={styles.productPanel}>
        <SectionHeader
          action={(
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="추천 제품 보기"
              accessibilityState={{ selected: recommendedOnly }}
              onPress={toggleRecommended}
              style={[styles.recommendationButton, recommendedOnly && styles.recommendationButtonActive]}
            >
              <Text style={[styles.recommendationButtonText, recommendedOnly && styles.recommendationButtonTextActive]}>추천 제품 보기</Text>
            </Pressable>
          )}
          title={recommendedOnly ? `${category === 'all' ? '' : `${tabs.find((tab) => tab.key === category)?.label} `}추천 제품` : category === 'all' ? '전체 제품' : tabs.find((tab) => tab.key === category)?.label ?? '제품'}
          description={recommendedOnly ? `추천 태그가 붙은 제품 ${filteredProducts.length}개` : `제품 ${filteredProducts.length}개 · ${currentPage} / ${pageCount} 페이지`}
        />
        <View style={[styles.productGrid, compact && styles.stack]}>
          {loading ? <Text style={styles.emptyProducts}>상품 목록을 불러오는 중입니다.</Text> : null}
          {error ? <Text accessibilityRole="alert" style={styles.emptyProducts}>{error}</Text> : null}
          {!loading && !error && !visibleProducts.length ? <Text style={styles.emptyProducts}>표시할 상품이 없습니다.</Text> : null}
          {!loading && !error && visibleProducts.map((product) => (
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
                    void addToCart(product);
                  }}
                  disabled={product.available === false || cartLoading}
                  style={styles.addButton}
                >
                  <Text style={styles.addButtonText}>{cartQuantities.get(product.id) ? `${cartQuantities.get(product.id)}개 담김` : '담기'}</Text>
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
                  {selectedProduct.subCategory ? <View style={styles.productInfoRow}><Text style={styles.productInfoLabel}>세부 분류</Text><Text style={styles.productInfoValue}>{subCategoryLabel(selectedProduct.subCategory)}</Text></View> : null}
                  <View style={styles.productInfoRow}><Text style={styles.productInfoLabel}>구성 / 규격</Text><Text style={styles.productInfoValue}>{formatPackage(selectedProduct)}</Text></View>
                  <View style={styles.productInfoRow}><Text style={styles.productInfoLabel}>배송 안내</Text><Text style={styles.productInfoValue}>결제 후 2~3일 이내 출고</Text></View>
                  <View style={styles.productInfoRow}><Text style={styles.productInfoLabel}>상품 상태</Text><Text style={styles.productInfoValue}>{selectedProduct.available === false ? '품절' : '구매 가능'}</Text></View>
                </View>
                <View style={styles.modalFooter}>
                  <Text style={styles.modalPrice}>{selectedProduct.price.toLocaleString('ko-KR')}원</Text>
                  <ActionButton disabled={selectedProduct.available === false || cartLoading} label={selectedProduct.available === false ? '품절' : '장바구니 담기'} onPress={() => { void addToCart(selectedProduct); }} />
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
                <Text style={styles.modalTitle}>장바구니</Text>
              </View>
              <Pressable onPress={() => setCartOpen(false)} style={styles.modalClose}>
                <Text style={styles.modalCloseText}>닫기</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.cartList}>
              {cartError ? <Text accessibilityRole="alert" style={styles.emptyCart}>{cartError}</Text> : null}
              {cartLoading && cart.items.length === 0 ? (
                <Text style={styles.emptyCart}>장바구니를 불러오는 중입니다.</Text>
              ) : null}
              {!cartLoading && !cartError && cart.items.length === 0 ? (
                <Text style={styles.emptyCart}>장바구니에 담긴 상품이 없습니다.</Text>
              ) : cart.items.map((item) => (
                <View key={item.productId} style={styles.cartItem}>
                  <View style={styles.cartItemCopy}>
                    <Text style={styles.cartItemName}>{item.name}</Text>
                    <Text style={styles.cartItemPrice}>{item.price.toLocaleString('ko-KR')}원</Text>
                  </View>
                  <View style={styles.quantityControl}>
                    <Pressable
                      disabled={cartLoading}
                      onPress={() => { void changeCartQuantity(item.productId, item.quantity - 1); }}
                      style={styles.quantityButton}
                    >
                      <Text style={styles.quantityButtonText}>−</Text>
                    </Pressable>
                    <Text style={styles.quantityValue}>{item.quantity}</Text>
                    <Pressable disabled={cartLoading} onPress={() => { void changeCartQuantity(item.productId, item.quantity + 1); }} style={styles.quantityButton}><Text style={styles.quantityButtonText}>+</Text></Pressable>
                  </View>
                </View>
              ))}
            </ScrollView>
            <View style={styles.cartTotalRow}>
              <Text style={styles.cartTotalLabel}>총 결제 금액</Text>
              <Text style={styles.cartTotalValue}>{cart.totalPrice.toLocaleString('ko-KR')}원</Text>
            </View>
            <ActionButton disabled={cartLoading || cart.items.length === 0} label="구매하기" onPress={openCheckout} />
          </Surface>
        </View>
      </Modal>

      <Modal animationType="fade" onRequestClose={() => setCheckoutOpen(false)} transparent visible={checkoutOpen}>
        <View style={styles.modalBackdrop}>
          <Surface style={styles.checkoutModal}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderCopy}>
                <Text style={styles.modalEyebrow}>주문 및 결제</Text>
                <Text style={styles.modalTitle}>배송 정보를 입력해 주세요</Text>
              </View>
              <Pressable disabled={checkoutLoading} onPress={() => setCheckoutOpen(false)} style={styles.modalClose}>
                <Text style={styles.modalCloseText}>닫기</Text>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.checkoutForm}>
              <View style={styles.fieldRow}>
                <View style={styles.fieldHalf}>
                  <Text style={styles.fieldLabel}>받는 분</Text>
                  <TextInput
                    autoComplete="name"
                    onChangeText={(recipientName) => setShipping((current) => ({ ...current, recipientName }))}
                    placeholder="홍길동"
                    placeholderTextColor={palette.muted}
                    style={styles.fieldInput}
                    value={shipping.recipientName}
                  />
                </View>
                <View style={styles.fieldHalf}>
                  <Text style={styles.fieldLabel}>연락처</Text>
                  <TextInput
                    autoComplete="tel"
                    keyboardType="phone-pad"
                    onChangeText={(recipientPhone) => setShipping((current) => ({ ...current, recipientPhone }))}
                    placeholder="010-1234-5678"
                    placeholderTextColor={palette.muted}
                    style={styles.fieldInput}
                    value={shipping.recipientPhone}
                  />
                </View>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>우편번호</Text>
                <TextInput
                  autoComplete="postal-code"
                  keyboardType="number-pad"
                  maxLength={10}
                  onChangeText={(postalCode) => setShipping((current) => ({ ...current, postalCode }))}
                  placeholder="46241"
                  placeholderTextColor={palette.muted}
                  style={[styles.fieldInput, styles.postalInput]}
                  value={shipping.postalCode}
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>주소</Text>
                <TextInput
                  autoComplete="street-address"
                  onChangeText={(address) => setShipping((current) => ({ ...current, address }))}
                  placeholder="도로명 주소"
                  placeholderTextColor={palette.muted}
                  style={styles.fieldInput}
                  value={shipping.address}
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>상세 주소</Text>
                <TextInput
                  onChangeText={(addressDetail) => setShipping((current) => ({ ...current, addressDetail }))}
                  placeholder="동·호수 등 선택 입력"
                  placeholderTextColor={palette.muted}
                  style={styles.fieldInput}
                  value={shipping.addressDetail}
                />
              </View>
              <View style={styles.paymentMethodBox}>
                <View style={styles.paymentMethodCopy}>
                  <Text style={styles.paymentMethodTitle}>토스페이먼츠 테스트 결제</Text>
                  <Text style={styles.paymentMethodDescription}>카드와 네이버페이 등 간편결제를 선택할 수 있으며 실제 금액은 결제되지 않습니다.</Text>
                </View>
                <Text style={styles.paymentMethodBadge}>TEST</Text>
              </View>
              {checkoutError ? <Text accessibilityRole="alert" style={styles.checkoutError}>{checkoutError}</Text> : null}
            </ScrollView>

            <View style={styles.checkoutFooter}>
              <View style={styles.checkoutTotalCopy}>
                <Text style={styles.cartTotalLabel}>최종 결제 금액</Text>
                <Text style={styles.cartTotalValue}>{checkoutAmount.toLocaleString('ko-KR')}원</Text>
              </View>
              <ActionButton
                disabled={checkoutLoading}
                label={checkoutLoading ? '결제창 여는 중…' : pendingOrderId ? '결제 다시 시도' : `${checkoutAmount.toLocaleString('ko-KR')}원 결제하기`}
                onPress={() => { void startPayment(); }}
              />
            </View>
          </Surface>
        </View>
      </Modal>
    </View>
  );
}


const styles = StyleSheet.create(scaleTypography({
  pageBody: { gap: 30, maxWidth: 1320, width: '100%' },
  stack: { flexDirection: 'column' },
  shopToolbar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  shopToolbarCompact: { alignItems: 'flex-start', flexDirection: 'column', gap: 12 },
  shopFilters: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  shopToolbarActions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' },
  shopToolbarActionsCompact: { justifyContent: 'flex-start', width: '100%' },
  shopTabs: { backgroundColor: 'rgba(255,255,255,0.48)', borderColor: palette.lineStrong, borderRadius: 11, borderWidth: 1, flexDirection: 'row', gap: 3, padding: 5 },
  subCategoryTabs: { backgroundColor: 'rgba(255,255,255,0.28)', borderColor: palette.line, borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 3, padding: 4 },
  shopTab: { borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  subCategoryTab: { borderRadius: 7, paddingHorizontal: 14, paddingVertical: 8 },
  subCategoryTabActive: { backgroundColor: palette.greenSoft },
  subCategoryTabText: { ...typeScale.label, color: palette.secondary, fontFamily: font },
  subCategoryTabTextActive: { color: palette.greenDark, fontWeight: '700' },
  shopTabActive: { backgroundColor: palette.green, shadowColor: '#1f6646', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.16, shadowRadius: 10 },
  shopTabText: { ...typeScale.label, color: palette.secondary, fontFamily: font },
  shopTabTextActive: { color: '#ffffff', fontWeight: '700' },
  recommendationButton: { ...controlTokens.outline, borderColor: palette.green, minHeight: 42, paddingHorizontal: 17 },
  recommendationButtonActive: { backgroundColor: palette.green },
  recommendationButtonText: { ...typeScale.button, ...controlTextTokens.outline, fontFamily: font },
  recommendationButtonTextActive: { color: '#ffffff' },
  cartButton: { ...controlTokens.secondary, minHeight: 42, paddingHorizontal: 17 },
  cartCount: { ...typeScale.button, ...controlTextTokens.secondary, fontFamily: font, fontWeight: '700' },
  productPanel: { gap: 34, padding: 36 },
  productGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  productCard: { backgroundColor: 'rgba(255,255,255,0.16)', borderColor: 'rgba(86,120,101,0.24)', borderRadius: 16, borderWidth: 1, flexBasis: '31%', flexGrow: 1, gap: 16, maxWidth: '32%', minHeight: 250, minWidth: 240, padding: 27 },
  productCardCompact: { flexBasis: 'auto', maxWidth: '100%', minWidth: 0, width: '100%' },
  productCardTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 24 },
  productCategoryText: { ...typeScale.label, color: palette.greenDark, fontFamily: font, letterSpacing: 0.5 },
  productName: { ...typeScale.cardTitle, color: palette.text, fontFamily: font, fontWeight: '600' },
  productBadge: { ...typeScale.label, backgroundColor: palette.greenSoft, borderRadius: 999, color: palette.greenDark, fontFamily: font, paddingHorizontal: 10, paddingVertical: 5 },
  productDescription: { ...typeScale.body, color: palette.secondary, flex: 1, fontFamily: font },
  productDivider: { backgroundColor: palette.lineStrong, height: 1 },
  productBottom: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  productPrice: { ...typeScale.cardTitle, color: palette.greenDark, fontFamily: font, letterSpacing: -0.3 },
  addButton: { ...controlTokens.primary, minHeight: 38, paddingHorizontal: 14, paddingVertical: 9 },
  addButtonText: { ...typeScale.button, ...controlTextTokens.primary, fontFamily: font },
  pagination: { alignItems: 'center', flexDirection: 'row', gap: 7, justifyContent: 'center', paddingTop: 4 },
  pageArrow: { ...controlTokens.outline, minHeight: 36, paddingHorizontal: 13 },
  pageDisabled: { opacity: 0.35 },
  pageArrowText: { ...typeScale.button, color: palette.secondary, fontFamily: font },
  pageNumber: { alignItems: 'center', borderRadius: 8, height: 36, justifyContent: 'center', width: 36 },
  pageNumberActive: { backgroundColor: palette.green },
  pageNumberText: { ...typeScale.label, color: palette.secondary, fontFamily: font },
  pageNumberTextActive: { color: '#ffffff' },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(21, 46, 35, 0.34)', flex: 1, justifyContent: 'center', padding: 22 },
  detailModal: { gap: 24, maxWidth: 560, padding: 28, width: '100%' },
  cartModal: { gap: 20, maxHeight: '82%', maxWidth: 620, padding: 28, width: '100%' },
  checkoutModal: { gap: 22, maxHeight: '92%', maxWidth: 680, padding: 30, width: '100%' },
  modalHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 18, justifyContent: 'space-between' },
  modalHeaderCopy: { flex: 1, gap: 5 },
  modalEyebrow: { ...typeScale.label, color: palette.greenDark, fontFamily: font, letterSpacing: 1 },
  modalTitle: { ...typeScale.dialogTitle, color: palette.text, fontFamily: font },
  modalClose: { alignItems: 'center', borderColor: palette.line, borderRadius: 8, borderWidth: 1, justifyContent: 'center', minHeight: 36, paddingHorizontal: 12 },
  modalCloseText: { ...typeScale.button, color: palette.secondary, fontFamily: font },
  modalDescription: { ...typeScale.body, color: palette.secondary, fontFamily: font },
  productInfoList: { borderColor: palette.line, borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  productInfoRow: { alignItems: 'center', borderBottomColor: palette.line, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 50, paddingHorizontal: 16 },
  productInfoLabel: { ...typeScale.label, color: palette.muted, fontFamily: font },
  productInfoValue: { ...typeScale.bodyStrong, color: palette.text, fontFamily: font },
  modalFooter: { alignItems: 'center', flexDirection: 'row', gap: 18, justifyContent: 'space-between' },
  modalPrice: { ...typeScale.cardTitle, color: palette.text, fontFamily: font },
  cartList: { maxHeight: 380 },
  emptyCart: { ...typeScale.body, color: palette.muted, paddingVertical: 46, textAlign: 'center' },
  emptyProducts: { ...typeScale.body, color: palette.muted, paddingVertical: 34, textAlign: 'center', width: '100%' },
  cartItem: { alignItems: 'center', borderBottomColor: palette.line, borderBottomWidth: 1, flexDirection: 'row', gap: 18, justifyContent: 'space-between', minHeight: 74, paddingVertical: 12 },
  cartItemCopy: { flex: 1, gap: 5 },
  cartItemName: { ...typeScale.cardTitle, color: palette.text, fontFamily: font, fontWeight: '600' },
  cartItemPrice: { ...typeScale.body, color: palette.secondary, fontFamily: font },
  quantityControl: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  quantityButton: { alignItems: 'center', backgroundColor: palette.panelMuted, borderColor: palette.line, borderRadius: 7, borderWidth: 1, height: 32, justifyContent: 'center', width: 32 },
  quantityButtonText: { color: palette.greenDark, fontFamily: font, fontSize: 16, fontWeight: '700' },
  quantityValue: { ...typeScale.label, color: palette.text, fontFamily: font, fontWeight: '700', minWidth: 24, textAlign: 'center' },
  cartTotalRow: { alignItems: 'center', borderTopColor: palette.lineStrong, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingTop: 18 },
  cartTotalLabel: { ...typeScale.label, color: palette.secondary, fontFamily: font },
  cartTotalValue: { ...typeScale.cardTitle, color: palette.text, fontFamily: font },
  checkoutForm: { gap: 16 },
  fieldRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  fieldHalf: { flex: 1, gap: 7, minWidth: 220 },
  fieldGroup: { gap: 7 },
  fieldLabel: { ...typeScale.label, color: palette.secondary, fontFamily: font },
  fieldInput: { ...typeScale.body, backgroundColor: 'rgba(255,255,255,0.5)', borderColor: palette.lineStrong, borderRadius: 10, borderWidth: 1, color: palette.text, fontFamily: font, minHeight: 48, outlineStyle: 'none', paddingHorizontal: 14, paddingVertical: 11 } as any,
  postalInput: { maxWidth: 220 },
  paymentMethodBox: { alignItems: 'center', backgroundColor: palette.greenSoft, borderColor: '#c9dfd1', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 14, justifyContent: 'space-between', padding: 16 },
  paymentMethodCopy: { flex: 1, gap: 4 },
  paymentMethodTitle: { ...typeScale.bodyStrong, color: palette.greenDark, fontFamily: font },
  paymentMethodDescription: { ...typeScale.body, color: palette.secondary, fontFamily: font },
  paymentMethodBadge: { ...typeScale.label, backgroundColor: palette.green, borderRadius: 999, color: '#ffffff', fontFamily: font, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5 },
  checkoutError: { ...typeScale.body, color: palette.red, fontFamily: font },
  checkoutFooter: { alignItems: 'center', borderTopColor: palette.lineStrong, borderTopWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 18, justifyContent: 'space-between', paddingTop: 18 },
  checkoutTotalCopy: { gap: 4 },
}));
