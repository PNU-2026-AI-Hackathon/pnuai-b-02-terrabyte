import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { font } from '../../appTheme/glass';
import { palette } from '../../appTheme/palette';
import { scaleTypography } from '../../appTheme/scaleTypography';
import { ActionButton } from '../../components/ActionButton';
import { SectionHeader } from '../../components/SectionHeader';
import { Surface } from '../../components/Surface';
import { shopProducts, type ShopCategory, type ShopProduct } from '../../data';
import { useDeviceEnvironment } from '../../shared/device-environment/DeviceEnvironmentProvider';
import { getRecommendedProductIds } from '../../shared/factorPresentation';

export function ShopScreen({ compact }: { compact: boolean }) {
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


const styles = StyleSheet.create(scaleTypography({
  pageBody: { gap: 30, maxWidth: 1320, width: '100%' },
  stack: { flexDirection: 'column' },
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
  cartModal: { gap: 20, maxHeight: '82%', maxWidth: 620, padding: 28, width: '100%' },
  modalHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 18, justifyContent: 'space-between' },
  modalHeaderCopy: { flex: 1, gap: 5 },
  modalEyebrow: { color: palette.greenDark, fontFamily: font, fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  modalTitle: { color: palette.text, fontFamily: font, fontSize: 32, fontWeight: '900', letterSpacing: -0.8, lineHeight: 41 },
  modalClose: { alignItems: 'center', borderColor: palette.line, borderRadius: 8, borderWidth: 1, justifyContent: 'center', minHeight: 36, paddingHorizontal: 12 },
  modalCloseText: { color: palette.secondary, fontFamily: font, fontSize: 14, fontWeight: '800' },
  modalDescription: { color: palette.secondary, fontFamily: font, fontSize: 17, fontWeight: '500', lineHeight: 28 },
  productInfoList: { borderColor: palette.line, borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  productInfoRow: { alignItems: 'center', borderBottomColor: palette.line, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 50, paddingHorizontal: 16 },
  productInfoLabel: { color: palette.muted, fontFamily: font, fontSize: 15, fontWeight: '700' },
  productInfoValue: { color: palette.text, fontFamily: font, fontSize: 16, fontWeight: '800' },
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
