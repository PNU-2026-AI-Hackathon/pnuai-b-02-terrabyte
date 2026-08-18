import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { controlTextTokens, controlTokens } from '../../appTheme/controls';
import { font } from '../../appTheme/glass';
import { palette } from '../../appTheme/palette';
import { scaleTypography } from '../../appTheme/scaleTypography';
import { typeScale } from '../../appTheme/typography';
import { ActionButton } from '../../components/ActionButton';
import { SectionHeader } from '../../components/SectionHeader';
import { Surface } from '../../components/Surface';
import { shopProducts, type ShopCategory, type ShopProduct } from '../../data';

type ProductCategory = 'all' | ShopCategory;

export function ShopScreen({ compact }: { compact: boolean }) {
  const [category, setCategory] = useState<ProductCategory>('all');
  const [recommendedOnly, setRecommendedOnly] = useState(false);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ShopProduct | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 9;
  const filteredProducts = useMemo(
    () => {
      const categoryProducts = category === 'all'
        ? shopProducts
        : shopProducts.filter((product) => product.category === category);
      return recommendedOnly
        ? categoryProducts.filter((product) => product.badge?.includes('추천'))
        : categoryProducts;
    },
    [category, recommendedOnly],
  );
  const pageCount = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const visibleProducts = filteredProducts.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const cartCount = Object.values(cart).reduce((sum, value) => sum + value, 0);
  const cartProducts = shopProducts.filter((product) => (cart[product.id] ?? 0) > 0);
  const cartTotal = cartProducts.reduce((sum, product) => sum + product.price * (cart[product.id] ?? 0), 0);
  const tabs: Array<{ key: ProductCategory; label: string }> = [
    { key: 'all', label: '전체' },
    { key: 'parts', label: '부품' },
    { key: 'soil', label: '흙과 배지' },
    { key: 'seeds', label: '씨앗' },
  ];

  const changeCategory = (nextCategory: ProductCategory) => {
    setCategory(nextCategory);
    setCurrentPage(1);
  };

  const toggleRecommended = () => {
    setRecommendedOnly((current) => !current);
    setCurrentPage(1);
  };

  const addToCart = (product: ShopProduct) => {
    setCart((current) => ({ ...current, [product.id]: (current[product.id] ?? 0) + 1 }));
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


const styles = StyleSheet.create(scaleTypography({
  pageBody: { gap: 30, maxWidth: 1320, width: '100%' },
  stack: { flexDirection: 'column' },
  shopToolbar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  shopToolbarCompact: { alignItems: 'flex-start', flexDirection: 'column', gap: 12 },
  shopFilters: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  shopToolbarActions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' },
  shopToolbarActionsCompact: { justifyContent: 'flex-start', width: '100%' },
  shopTabs: { backgroundColor: 'rgba(255,255,255,0.48)', borderColor: palette.lineStrong, borderRadius: 11, borderWidth: 1, flexDirection: 'row', gap: 3, padding: 5 },
  shopTab: { borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
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
}));
