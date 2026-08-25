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
import { cancelOrder, createOrder, getOrder, getOrders, type OrderDetail, type OrderStatus, type OrderSummary } from '../../order/orderApi';
import { cancelPayment, getOrderPayment, readyPayment } from '../../payment/paymentApi';
import { requestTossPayment } from '../../payment/tossPayment';
import { getShopProducts, type ShopCategory, type ShopProduct, type ShopSubCategory } from '../../shop/shopApi';

type ProductCategory = 'all' | ShopCategory | 'nutrient';
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

function categoryLabel(category: ProductCategory) {
  if (category === 'parts') return '부품';
  if (category === 'soil') return '흙과 배지';
  if (category === 'nutrient') return '영양제';
  if (category === 'seeds') return '씨앗';
  return '전체';
}

function productTagLabel(product: ShopProduct) {
  return product.subCategory ? subCategoryLabel(product.subCategory) : categoryLabel(product.category);
}

function productSalePrice(product: ShopProduct) {
  return product.salePrice ?? product.price;
}

function productDiscountRate(product: ShopProduct) {
  return product.discountRate ?? 0;
}

function productIsDiscounted(product: ShopProduct) {
  return product.discounted ?? productDiscountRate(product) > 0;
}

function errorMessage(caught: unknown, fallback: string) {
  return caught instanceof Error ? caught.message : fallback;
}

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: '결제 대기',
  PAID: '결제 완료',
  PREPARING: '상품 준비 중',
  SHIPPED: '배송 중',
  DELIVERED: '배송 완료',
  CANCELLED: '주문 취소',
};

function orderStatusLabel(status: OrderStatus) {
  return ORDER_STATUS_LABELS[status];
}

function formatOrderDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [orderDetailLoading, setOrderDetailLoading] = useState(false);
  const [orderActionLoading, setOrderActionLoading] = useState(false);
  const [paymentCancelOpen, setPaymentCancelOpen] = useState(false);
  const [paymentCancelReason, setPaymentCancelReason] = useState('');
  const [paymentCancelError, setPaymentCancelError] = useState<string | null>(null);
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
        : category === 'nutrient'
          ? products.filter((product) => product.category === 'soil' && product.subCategory === 'NUTRIENT')
          : products.filter((product) => product.category === category);
      const subCategoryProducts = subCategory === 'all'
        ? categoryProducts.filter((product) => category !== 'soil' || product.subCategory !== 'NUTRIENT')
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
  const cartHasUnavailableItems = cart.items.some(
    (item) => !item.available || item.quantity > item.stockQuantity,
  );
  const cartCount = cart.totalQuantity;
  const tabs: Array<{ key: ProductCategory; label: string }> = [
    { key: 'all', label: '전체' },
    { key: 'parts', label: '부품' },
    { key: 'soil', label: '흙과 배지' },
    { key: 'nutrient', label: '영양제' },
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

  const loadOrders = async () => {
    setOrdersLoading(true);
    setOrdersError(null);
    try {
      setOrders(await getOrders());
    } catch (caught) {
      setOrdersError(errorMessage(caught, '주문 내역을 불러오지 못했습니다.'));
    } finally {
      setOrdersLoading(false);
    }
  };

  const openOrders = () => {
    setSelectedOrder(null);
    setOrdersOpen(true);
    void loadOrders();
  };

  const openOrder = async (orderId: number) => {
    setSelectedOrder(null);
    setOrderDetailLoading(true);
    setOrdersError(null);
    try {
      setSelectedOrder(await getOrder(orderId));
    } catch (caught) {
      setOrdersError(errorMessage(caught, '주문 상세 정보를 불러오지 못했습니다.'));
    } finally {
      setOrderDetailLoading(false);
    }
  };

  const cancelSelectedOrder = async () => {
    if (!selectedOrder || selectedOrder.status !== 'PENDING') return;
    setOrderActionLoading(true);
    setOrdersError(null);
    try {
      const cancelled = await cancelOrder(selectedOrder.id);
      setSelectedOrder(cancelled);
      setOrders((current) => current.map((order) => order.id === cancelled.id ? cancelled : order));
    } catch (caught) {
      setOrdersError(errorMessage(caught, '주문을 취소하지 못했습니다.'));
    } finally {
      setOrderActionLoading(false);
    }
  };

  const openPaymentCancellation = () => {
    if (!selectedOrder || selectedOrder.status !== 'PAID') return;
    setPaymentCancelReason('단순 변심');
    setPaymentCancelError(null);
    setPaymentCancelOpen(true);
  };

  const cancelPaidOrder = async () => {
    if (!selectedOrder || selectedOrder.status !== 'PAID') return;
    const cancelReason = paymentCancelReason.trim();
    if (!cancelReason) {
      setPaymentCancelError('취소 사유를 입력해 주세요.');
      return;
    }

    setOrderActionLoading(true);
    setPaymentCancelError(null);
    try {
      const payment = await getOrderPayment(selectedOrder.id);
      await cancelPayment(payment.id, cancelReason);
      const cancelledOrder = await getOrder(selectedOrder.id);
      setSelectedOrder(cancelledOrder);
      setOrders((current) => current.map((order) => order.id === cancelledOrder.id ? cancelledOrder : order));
      setPaymentCancelOpen(false);
    } catch (caught) {
      setPaymentCancelError(errorMessage(caught, '결제를 취소하지 못했습니다.'));
    } finally {
      setOrderActionLoading(false);
    }
  };

  const openPendingOrderCheckout = (order: OrderDetail) => {
    if (order.status !== 'PENDING') return;
    setOrdersError(null);
    setCheckoutError(null);
    setPendingOrderId(order.id);
    setCheckoutAmount(order.totalPrice);
    setShipping({
      recipientName: order.recipientName,
      recipientPhone: order.recipientPhone,
      postalCode: order.postalCode,
      address: order.address,
      addressDetail: order.addressDetail ?? '',
    });
    setSelectedOrder(null);
    setOrdersOpen(false);
    setCheckoutOpen(true);
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
    if (cart.items.length === 0 || cartHasUnavailableItems) return;
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
              {(['all', 'SOIL', 'MEDIA'] as ProductSubCategory[]).map((tab) => (
                <Pressable key={tab} onPress={() => changeSubCategory(tab)} style={[styles.subCategoryTab, subCategory === tab && styles.subCategoryTabActive]}>
                  <Text style={[styles.subCategoryTabText, subCategory === tab && styles.subCategoryTabTextActive]}>{subCategoryLabel(tab)}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
        <View style={[styles.shopToolbarActions, compact && styles.shopToolbarActionsCompact]}>
          <Pressable accessibilityRole="button" onPress={openOrders} style={styles.cartButton}>
            <Text style={styles.toolbarButtonText}>주문 내역</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setCartOpen(true)} style={styles.cartButton}>
            <Text style={styles.toolbarButtonText}>장바구니</Text>
            <Text style={styles.cartCount}>{cartCount}</Text>
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
          title={recommendedOnly ? `${category === 'all' ? '' : `${categoryLabel(category)} `}추천 제품` : `${categoryLabel(category)} 제품`}
          description={recommendedOnly ? `추천 태그가 붙은 제품 ${filteredProducts.length}개` : `제품 ${filteredProducts.length}개 · ${currentPage} / ${pageCount} 페이지`}
        />
        <View style={[styles.productGrid, compact && styles.stack]}>
          {loading ? <Text style={styles.emptyProducts}>상품 목록을 불러오는 중입니다.</Text> : null}
          {error ? <Text accessibilityRole="alert" style={styles.emptyProducts}>{error}</Text> : null}
          {!loading && !error && !visibleProducts.length ? <Text style={styles.emptyProducts}>표시할 상품이 없습니다.</Text> : null}
          {!loading && !error && visibleProducts.map((product) => (
            <Pressable key={product.id} onPress={() => setSelectedProduct(product)} style={[styles.productCard, compact && styles.productCardCompact]}>
              <View style={styles.productCardTop}>
                <Text style={styles.productCategoryText}>{productTagLabel(product)}</Text>
                {product.badge ? <Text style={styles.productBadge}>{product.badge}</Text> : null}
              </View>
              <Text style={styles.productName}>{product.name}</Text>
              <Text style={styles.productDescription}>{product.desc}</Text>
              <View style={styles.productDivider} />
              <View style={styles.productBottom}>
                <View style={styles.priceBlock}>
                  {productIsDiscounted(product) ? (
                    <View style={styles.discountMeta}>
                      <Text style={styles.discountRate}>{productDiscountRate(product)}%</Text>
                      <Text style={styles.originalPrice}>{product.price.toLocaleString('ko-KR')}원</Text>
                    </View>
                  ) : null}
                  <Text style={[styles.productPrice, productIsDiscounted(product) && styles.discountedPrice]}>
                    {productSalePrice(product).toLocaleString('ko-KR')}원
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={(event) => {
                    event.stopPropagation?.();
                    void addToCart(product);
                  }}
                  disabled={product.available === false || cartLoading}
                  style={[
                    styles.addButton,
                    product.available === false
                      ? styles.addButtonSoldOut
                      : cartQuantities.get(product.id) ? styles.addButtonAdded : null,
                  ]}
                >
                  <Text style={[
                    styles.addButtonText,
                    product.available === false
                      ? styles.addButtonTextSoldOut
                      : cartQuantities.get(product.id) ? styles.addButtonTextAdded : null,
                  ]}>
                    {product.available === false
                      ? '품절'
                      : cartQuantities.get(product.id) ? `✓ ${cartQuantities.get(product.id)}개 담김` : '담기'}
                  </Text>
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
                <View style={[styles.detailHero, compact && styles.detailHeroCompact]}>
                  <View style={styles.detailTopBar}>
                    <View style={styles.detailTagRow}>
                      <Text style={styles.detailCategoryTag}>{categoryLabel(selectedProduct.category)}</Text>
                      {selectedProduct.badge ? <Text style={styles.detailBadge}>{selectedProduct.badge}</Text> : null}
                    </View>
                    <Pressable
                      accessibilityLabel="상품 상세 닫기"
                      accessibilityRole="button"
                      onPress={() => setSelectedProduct(null)}
                      style={styles.detailClose}
                    >
                      <Text style={styles.detailCloseText}>닫기</Text>
                    </Pressable>
                  </View>
                  <View style={styles.detailTitleGroup}>
                    <Text style={styles.detailEyebrow}>상품 상세</Text>
                    <Text style={styles.detailTitle}>{selectedProduct.name}</Text>
                    <Text style={styles.detailDescription}>{selectedProduct.desc}</Text>
                  </View>
                </View>
                <ScrollView
                  contentContainerStyle={styles.detailInfoScrollContent}
                  showsVerticalScrollIndicator={false}
                  style={styles.detailInfoScroll}
                >
                  <View style={[styles.detailInfoSection, compact && styles.detailInfoSectionCompact]}>
                    <Text style={styles.detailSectionTitle}>상품 정보</Text>
                    <View style={[styles.detailInfoGrid, compact && styles.detailInfoGridCompact]}>
                      <View style={[styles.detailInfoCard, compact && styles.detailInfoCardCompact]}>
                        <Text style={styles.detailInfoLabel}>카테고리</Text>
                        <Text style={styles.detailInfoValue}>{categoryLabel(selectedProduct.category)}</Text>
                      </View>
                      {selectedProduct.subCategory ? (
                        <View style={[styles.detailInfoCard, compact && styles.detailInfoCardCompact]}>
                          <Text style={styles.detailInfoLabel}>세부 분류</Text>
                          <Text style={styles.detailInfoValue}>{subCategoryLabel(selectedProduct.subCategory)}</Text>
                        </View>
                      ) : null}
                      <View style={[styles.detailInfoCard, compact && styles.detailInfoCardCompact]}>
                        <Text style={styles.detailInfoLabel}>구성 / 규격</Text>
                        <Text style={styles.detailInfoValue}>{formatPackage(selectedProduct)}</Text>
                      </View>
                      <View style={[styles.detailInfoCard, compact && styles.detailInfoCardCompact]}>
                        <Text style={styles.detailInfoLabel}>배송 안내</Text>
                        <Text style={styles.detailInfoValue}>결제 후 2~3일 이내 출고</Text>
                      </View>
                    </View>
                  </View>
                </ScrollView>
                <View style={[styles.detailPurchaseBar, compact && styles.detailPurchaseBarCompact]}>
                  <View style={styles.detailPriceBlock}>
                    <Text style={styles.detailPriceLabel}>판매가</Text>
                    {productIsDiscounted(selectedProduct) ? (
                      <View style={styles.discountMeta}>
                        <Text style={styles.discountRate}>{productDiscountRate(selectedProduct)}%</Text>
                        <Text style={styles.originalPrice}>{selectedProduct.price.toLocaleString('ko-KR')}원</Text>
                      </View>
                    ) : null}
                    <Text style={[styles.modalPrice, productIsDiscounted(selectedProduct) && styles.discountedPrice]}>
                      {productSalePrice(selectedProduct).toLocaleString('ko-KR')}원
                    </Text>
                  </View>
                  <ActionButton
                    disabled={selectedProduct.available === false || cartLoading}
                    label={selectedProduct.available === false
                      ? '품절'
                      : cartQuantities.get(selectedProduct.id)
                        ? `✓ ${cartQuantities.get(selectedProduct.id)}개 담김`
                        : '장바구니 담기'}
                    onPress={() => { void addToCart(selectedProduct); }}
                    quiet={Boolean(cartQuantities.get(selectedProduct.id))}
                  />
                </View>
              </>
            ) : null}
          </Surface>
        </View>
      </Modal>

      <Modal animationType="fade" onRequestClose={() => setOrdersOpen(false)} transparent visible={ordersOpen}>
        <View style={styles.modalBackdrop}>
          <Surface style={styles.ordersModal}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderCopy}>
                <Text style={styles.modalEyebrow}>구매 관리</Text>
                <Text style={styles.modalTitle}>{selectedOrder ? '주문 상세' : '주문 내역'}</Text>
              </View>
              <Pressable onPress={() => setOrdersOpen(false)} style={styles.modalClose}>
                <Text style={styles.modalCloseText}>닫기</Text>
              </Pressable>
            </View>

            {selectedOrder ? (
              <ScrollView contentContainerStyle={styles.orderDetailScroll}>
                <Pressable onPress={() => { setSelectedOrder(null); setOrdersError(null); }} style={styles.orderBackButton}>
                  <Text style={styles.orderBackButtonText}>← 주문 목록</Text>
                </Pressable>
                <View style={styles.orderDetailHeader}>
                  <View style={styles.orderDetailCopy}>
                    <Text style={styles.orderNumber}>{selectedOrder.orderNumber}</Text>
                    <Text style={styles.orderDate}>{formatOrderDate(selectedOrder.orderedAt)}</Text>
                  </View>
                  <Text style={[styles.orderStatus, selectedOrder.status === 'CANCELLED' && styles.orderStatusCancelled]}>
                    {orderStatusLabel(selectedOrder.status)}
                  </Text>
                </View>
                <View style={styles.orderItemList}>
                  {selectedOrder.items.map((item) => (
                    <View key={item.productId} style={styles.orderItem}>
                      <View style={styles.orderItemCopy}>
                        <Text style={styles.orderItemName}>{item.name}</Text>
                        {item.discountRate > 0 ? (
                          <View style={styles.discountMeta}>
                            <Text style={styles.discountRateSmall}>{item.discountRate}% 할인</Text>
                            <Text style={styles.originalPriceSmall}>{item.originalUnitPrice.toLocaleString('ko-KR')}원</Text>
                          </View>
                        ) : null}
                        <Text style={styles.orderItemQuantity}>{item.quantity}개 · {item.unitPrice.toLocaleString('ko-KR')}원</Text>
                      </View>
                      <Text style={styles.orderItemPrice}>{item.subtotal.toLocaleString('ko-KR')}원</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.orderInfoList}>
                  <View style={styles.orderInfoRow}><Text style={styles.orderInfoLabel}>받는 분</Text><Text style={styles.orderInfoValue}>{selectedOrder.recipientName}</Text></View>
                  <View style={styles.orderInfoRow}><Text style={styles.orderInfoLabel}>연락처</Text><Text style={styles.orderInfoValue}>{selectedOrder.recipientPhone}</Text></View>
                  <View style={styles.orderInfoRow}><Text style={styles.orderInfoLabel}>배송지</Text><Text style={styles.orderInfoValue}>{selectedOrder.address}{selectedOrder.addressDetail ? ` ${selectedOrder.addressDetail}` : ''}</Text></View>
                </View>
                <View style={styles.orderTotalRow}>
                  <Text style={styles.cartTotalLabel}>총 결제 금액</Text>
                  <Text style={styles.cartTotalValue}>{selectedOrder.totalPrice.toLocaleString('ko-KR')}원</Text>
                </View>
                {selectedOrder.status === 'PENDING' ? (
                  <View style={styles.orderActions}>
                    <ActionButton
                      disabled={orderActionLoading}
                      label="결제하기"
                      onPress={() => { openPendingOrderCheckout(selectedOrder); }}
                    />
                    <Pressable disabled={orderActionLoading} onPress={() => { void cancelSelectedOrder(); }} style={[styles.orderCancelButton, orderActionLoading && styles.pageDisabled]}>
                      <Text style={styles.orderCancelButtonText}>{orderActionLoading ? '취소 처리 중…' : '주문 취소'}</Text>
                    </Pressable>
                  </View>
                ) : null}
                {selectedOrder.status === 'PAID' ? (
                  <View style={styles.orderActions}>
                    <Pressable disabled={orderActionLoading} onPress={openPaymentCancellation} style={[styles.orderCancelButton, orderActionLoading && styles.pageDisabled]}>
                      <Text style={styles.orderCancelButtonText}>결제 취소</Text>
                    </Pressable>
                  </View>
                ) : null}
              </ScrollView>
            ) : (
              <ScrollView contentContainerStyle={styles.ordersList}>
                {ordersError ? <Text accessibilityRole="alert" style={styles.orderError}>{ordersError}</Text> : null}
                {ordersLoading || orderDetailLoading ? <Text style={styles.emptyCart}>주문 내역을 불러오는 중입니다.</Text> : null}
                {!ordersLoading && !orderDetailLoading && !ordersError && orders.length === 0 ? <Text style={styles.emptyCart}>아직 주문한 상품이 없습니다.</Text> : null}
                {!ordersLoading && !orderDetailLoading && !ordersError ? orders.map((order) => (
                  <Pressable key={order.id} disabled={orderDetailLoading} onPress={() => { void openOrder(order.id); }} style={styles.orderCard}>
                    <View style={styles.orderCardCopy}>
                      <Text style={styles.orderNumber}>{order.orderNumber}</Text>
                      <Text style={styles.orderDate}>{formatOrderDate(order.orderedAt)} · {order.totalQuantity}개</Text>
                    </View>
                    <View style={styles.orderCardMeta}>
                      <Text style={[styles.orderStatus, order.status === 'CANCELLED' && styles.orderStatusCancelled]}>{orderStatusLabel(order.status)}</Text>
                      <Text style={styles.orderCardPrice}>{order.totalPrice.toLocaleString('ko-KR')}원</Text>
                    </View>
                  </Pressable>
                )) : null}
              </ScrollView>
            )}
          </Surface>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => { if (!orderActionLoading) setPaymentCancelOpen(false); }}
        transparent
        visible={paymentCancelOpen}
      >
        <View style={styles.modalBackdrop}>
          <Surface style={styles.cancelPaymentModal}>
            <Text style={styles.modalEyebrow}>결제 취소</Text>
            <Text style={styles.modalTitle}>결제를 취소할까요?</Text>
            <Text style={styles.cancelPaymentDescription}>취소하면 주문 상태가 취소로 변경되고 결제 금액이 환불됩니다.</Text>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>취소 사유</Text>
              <TextInput
                editable={!orderActionLoading}
                maxLength={200}
                onChangeText={setPaymentCancelReason}
                placeholder="예: 단순 변심"
                placeholderTextColor={palette.muted}
                style={styles.fieldInput}
                value={paymentCancelReason}
              />
            </View>
            {paymentCancelError ? <Text accessibilityRole="alert" style={styles.orderError}>{paymentCancelError}</Text> : null}
            <View style={styles.cancelPaymentActions}>
              <Pressable disabled={orderActionLoading} onPress={() => setPaymentCancelOpen(false)} style={[styles.orderCancelButton, orderActionLoading && styles.pageDisabled]}>
                <Text style={styles.orderCancelButtonText}>돌아가기</Text>
              </Pressable>
              <ActionButton disabled={orderActionLoading} label={orderActionLoading ? '취소 처리 중…' : '결제 취소 확정'} onPress={() => { void cancelPaidOrder(); }} />
            </View>
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
                    <View style={styles.cartItemNameRow}>
                      <Text style={styles.cartItemName}>{item.name}</Text>
                      {!item.available || item.quantity > item.stockQuantity ? <Text style={styles.soldOutBadge}>품절</Text> : null}
                    </View>
                    {item.discounted ? (
                      <View style={styles.discountMeta}>
                        <Text style={styles.discountRateSmall}>{item.discountRate}% 할인</Text>
                        <Text style={styles.originalPriceSmall}>{item.price.toLocaleString('ko-KR')}원</Text>
                      </View>
                    ) : null}
                    <Text style={[styles.cartItemPrice, item.discounted && styles.cartItemDiscountedPrice]}>{item.salePrice.toLocaleString('ko-KR')}원</Text>
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
                    <Pressable
                      disabled={cartLoading || !item.available || item.quantity >= item.stockQuantity}
                      onPress={() => { void changeCartQuantity(item.productId, item.quantity + 1); }}
                      style={[styles.quantityButton, (!item.available || item.quantity >= item.stockQuantity) && styles.pageDisabled]}
                    >
                      <Text style={styles.quantityButtonText}>+</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </ScrollView>
            {cartHasUnavailableItems ? <Text accessibilityRole="alert" style={styles.soldOutNotice}>품절된 상품을 장바구니에서 제거해 주세요.</Text> : null}
            <View style={styles.cartTotalRow}>
              <Text style={styles.cartTotalLabel}>총 결제 금액</Text>
              <Text style={styles.cartTotalValue}>{cart.totalPrice.toLocaleString('ko-KR')}원</Text>
            </View>
            <ActionButton
              disabled={cartLoading || cart.items.length === 0 || cartHasUnavailableItems}
              label={cartHasUnavailableItems ? '품절 상품 포함' : '구매하기'}
              onPress={openCheckout}
            />
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
  shopToolbar: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  shopToolbarCompact: { alignItems: 'flex-start', flexDirection: 'column', gap: 12 },
  shopFilters: { alignItems: 'flex-start', gap: 12 },
  shopToolbarActions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' },
  shopToolbarActionsCompact: { justifyContent: 'flex-start', width: '100%' },
  shopTabs: { backgroundColor: 'rgba(255,255,255,0.48)', borderColor: palette.lineStrong, borderRadius: 11, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 3, padding: 5 },
  subCategoryTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  shopTab: { borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  subCategoryTab: { ...controlTokens.outline, borderRadius: 999, minHeight: 46, paddingHorizontal: 20, paddingVertical: 10 },
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
  cartButton: { ...controlTokens.secondary, alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 42, paddingHorizontal: 17 },
  toolbarButtonText: { ...typeScale.button, ...controlTextTokens.secondary, fontFamily: font, fontWeight: '500' },
  cartCount: { ...typeScale.button, ...controlTextTokens.secondary, fontFamily: font, fontWeight: '800' },
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
  priceBlock: { alignItems: 'flex-start', gap: 2 },
  discountMeta: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  discountRate: { ...typeScale.label, color: palette.text, fontFamily: font, fontWeight: '800' },
  discountRateSmall: { ...typeScale.label, color: palette.text, fontFamily: font, fontWeight: '700' },
  originalPrice: { ...typeScale.label, color: palette.muted, fontFamily: font, textDecorationLine: 'line-through' },
  originalPriceSmall: { ...typeScale.label, color: palette.muted, fontFamily: font, textDecorationLine: 'line-through' },
  productPrice: { ...typeScale.cardTitle, color: palette.greenDark, fontFamily: font, letterSpacing: -0.3 },
  discountedPrice: { color: palette.red },
  addButton: { ...controlTokens.primary, minHeight: 38, paddingHorizontal: 14, paddingVertical: 9 },
  addButtonAdded: { backgroundColor: palette.greenSoft, borderColor: '#c9dfd1' },
  addButtonSoldOut: { backgroundColor: palette.panelMuted, borderColor: palette.lineStrong },
  addButtonText: { ...typeScale.button, ...controlTextTokens.primary, fontFamily: font },
  addButtonTextAdded: { color: palette.greenDark },
  addButtonTextSoldOut: { color: palette.muted },
  pagination: { alignItems: 'center', flexDirection: 'row', gap: 7, justifyContent: 'center', paddingTop: 4 },
  pageArrow: { ...controlTokens.outline, minHeight: 36, paddingHorizontal: 13 },
  pageDisabled: { opacity: 0.35 },
  pageArrowText: { ...typeScale.button, color: palette.secondary, fontFamily: font },
  pageNumber: { alignItems: 'center', borderRadius: 8, height: 36, justifyContent: 'center', width: 36 },
  pageNumberActive: { backgroundColor: palette.green },
  pageNumberText: { ...typeScale.label, color: palette.secondary, fontFamily: font },
  pageNumberTextActive: { color: '#ffffff' },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(21, 46, 35, 0.34)', flex: 1, justifyContent: 'center', padding: 22 },
  detailModal: { maxHeight: '92%', maxWidth: 680, overflow: 'hidden', padding: 0, width: '100%' },
  detailInfoScroll: { flexGrow: 1, flexShrink: 1, minHeight: 0 },
  detailInfoScrollContent: { width: '100%' },
  detailHero: { gap: 24, padding: 30 },
  detailHeroCompact: { gap: 18, padding: 22 },
  detailTopBar: { alignItems: 'center', flexDirection: 'row', gap: 18, justifyContent: 'space-between' },
  detailTagRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  detailCategoryTag: { ...typeScale.label, backgroundColor: palette.greenSoft, borderRadius: 999, color: palette.greenDark, fontFamily: font, overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 6 },
  detailBadge: { ...typeScale.label, backgroundColor: '#ffffff', borderColor: '#c9dfd1', borderRadius: 999, borderWidth: 1, color: palette.greenDark, fontFamily: font, overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 5 },
  detailClose: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.46)', borderColor: palette.lineStrong, borderRadius: 999, borderWidth: 1, justifyContent: 'center', minHeight: 38, paddingHorizontal: 15 },
  detailCloseText: { ...typeScale.button, color: palette.secondary, fontFamily: font },
  detailTitleGroup: { gap: 8 },
  detailEyebrow: { ...typeScale.label, color: palette.greenDark, fontFamily: font, letterSpacing: 0.8 },
  detailTitle: { ...typeScale.dialogTitle, color: palette.text, fontFamily: font },
  detailDescription: { ...typeScale.body, color: palette.secondary, fontFamily: font, maxWidth: 560 },
  detailInfoSection: { backgroundColor: 'rgba(255,255,255,0.28)', borderTopColor: palette.lineStrong, borderTopWidth: 1, gap: 14, paddingHorizontal: 30, paddingVertical: 24 },
  detailInfoSectionCompact: { paddingHorizontal: 22, paddingVertical: 20 },
  detailSectionTitle: { ...typeScale.label, color: palette.secondary, fontFamily: font },
  detailInfoGrid: { flexDirection: 'column', gap: 10 },
  detailInfoGridCompact: { flexDirection: 'column' },
  detailInfoCard: { backgroundColor: 'rgba(255,255,255,0.58)', borderColor: palette.lineStrong, borderRadius: 14, borderWidth: 1, flexBasis: 'auto', flexGrow: 0, gap: 5, minHeight: 72, minWidth: 0, paddingHorizontal: 16, paddingVertical: 14, width: '100%' },
  detailInfoCardCompact: { flexBasis: 'auto', minHeight: 0, minWidth: 0, width: '100%' },
  detailInfoLabel: { ...typeScale.caption, color: palette.muted, fontFamily: font },
  detailInfoValue: { ...typeScale.bodyStrong, color: palette.text, fontFamily: font },
  detailPurchaseBar: { alignItems: 'center', backgroundColor: 'rgba(228,241,233,0.78)', borderTopColor: '#c9dfd1', borderTopWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 22, justifyContent: 'space-between', paddingHorizontal: 30, paddingVertical: 24 },
  detailPurchaseBarCompact: { alignItems: 'stretch', flexDirection: 'column' },
  detailPriceBlock: { alignItems: 'flex-start', gap: 3 },
  detailPriceLabel: { ...typeScale.caption, color: palette.muted, fontFamily: font },
  cartModal: { gap: 20, maxHeight: '82%', maxWidth: 620, padding: 28, width: '100%' },
  ordersModal: { gap: 20, maxHeight: '82%', maxWidth: 680, padding: 28, width: '100%' },
  cancelPaymentModal: { gap: 18, maxWidth: 500, padding: 28, width: '100%' },
  checkoutModal: { gap: 22, maxHeight: '92%', maxWidth: 680, padding: 30, width: '100%' },
  modalHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 18, justifyContent: 'space-between' },
  modalHeaderCopy: { flex: 1, gap: 5 },
  modalEyebrow: { ...typeScale.label, color: palette.greenDark, fontFamily: font, letterSpacing: 1 },
  modalTitle: { ...typeScale.dialogTitle, color: palette.text, fontFamily: font },
  modalClose: { alignItems: 'center', borderColor: palette.line, borderRadius: 8, borderWidth: 1, justifyContent: 'center', minHeight: 36, paddingHorizontal: 12 },
  modalCloseText: { ...typeScale.button, color: palette.secondary, fontFamily: font },
  modalPrice: { ...typeScale.cardTitle, color: palette.text, fontFamily: font },
  cartList: { maxHeight: 380 },
  emptyCart: { ...typeScale.body, color: palette.muted, paddingVertical: 46, textAlign: 'center' },
  emptyProducts: { ...typeScale.body, color: palette.muted, paddingVertical: 34, textAlign: 'center', width: '100%' },
  cartItem: { alignItems: 'center', borderBottomColor: palette.line, borderBottomWidth: 1, flexDirection: 'row', gap: 18, justifyContent: 'space-between', minHeight: 74, paddingVertical: 12 },
  cartItemCopy: { flex: 1, gap: 5 },
  cartItemNameRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cartItemName: { ...typeScale.cardTitle, color: palette.text, fontFamily: font, fontWeight: '600' },
  cartItemPrice: { ...typeScale.body, color: palette.secondary, fontFamily: font },
  cartItemDiscountedPrice: { color: palette.red, fontWeight: '700' },
  soldOutBadge: { ...typeScale.label, backgroundColor: '#f9e4e0', borderRadius: 999, color: palette.red, fontFamily: font, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 3 },
  soldOutNotice: { ...typeScale.body, color: palette.red, fontFamily: font },
  quantityControl: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  quantityButton: { alignItems: 'center', backgroundColor: palette.panelMuted, borderColor: palette.line, borderRadius: 7, borderWidth: 1, height: 32, justifyContent: 'center', width: 32 },
  quantityButtonText: { color: palette.greenDark, fontFamily: font, fontSize: 16, fontWeight: '700' },
  quantityValue: { ...typeScale.label, color: palette.text, fontFamily: font, fontWeight: '700', minWidth: 24, textAlign: 'center' },
  cartTotalRow: { alignItems: 'center', borderTopColor: palette.lineStrong, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingTop: 18 },
  cartTotalLabel: { ...typeScale.label, color: palette.secondary, fontFamily: font },
  cartTotalValue: { ...typeScale.cardTitle, color: palette.text, fontFamily: font },
  ordersList: { gap: 10 },
  orderCard: { alignItems: 'center', borderColor: palette.line, borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 16, justifyContent: 'space-between', padding: 16 },
  orderCardCopy: { flex: 1, gap: 5 },
  orderCardMeta: { alignItems: 'flex-end', gap: 5 },
  orderCardPrice: { ...typeScale.bodyStrong, color: palette.text, fontFamily: font },
  orderNumber: { ...typeScale.bodyStrong, color: palette.text, fontFamily: font },
  orderDate: { ...typeScale.label, color: palette.muted, fontFamily: font },
  orderStatus: { ...typeScale.label, backgroundColor: palette.greenSoft, borderRadius: 999, color: palette.greenDark, fontFamily: font, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5 },
  orderStatusCancelled: { backgroundColor: '#f9e4e0', color: palette.red },
  orderDetailScroll: { gap: 18 },
  orderBackButton: { alignSelf: 'flex-start' },
  orderBackButtonText: { ...typeScale.button, color: palette.greenDark, fontFamily: font },
  orderDetailHeader: { alignItems: 'center', flexDirection: 'row', gap: 16, justifyContent: 'space-between' },
  orderDetailCopy: { flex: 1, gap: 5 },
  orderItemList: { borderColor: palette.line, borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  orderItem: { alignItems: 'center', borderBottomColor: palette.line, borderBottomWidth: 1, flexDirection: 'row', gap: 16, justifyContent: 'space-between', padding: 14 },
  orderItemCopy: { flex: 1, gap: 4 },
  orderItemName: { ...typeScale.bodyStrong, color: palette.text, fontFamily: font },
  orderItemQuantity: { ...typeScale.label, color: palette.muted, fontFamily: font },
  orderItemPrice: { ...typeScale.bodyStrong, color: palette.text, fontFamily: font },
  orderInfoList: { borderColor: palette.line, borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  orderInfoRow: { alignItems: 'flex-start', borderBottomColor: palette.line, borderBottomWidth: 1, flexDirection: 'row', gap: 16, justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13 },
  orderInfoLabel: { ...typeScale.label, color: palette.muted, fontFamily: font },
  orderInfoValue: { ...typeScale.body, color: palette.text, flex: 1, fontFamily: font, textAlign: 'right' },
  orderTotalRow: { alignItems: 'center', borderTopColor: palette.lineStrong, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingTop: 18 },
  orderCancelButton: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: palette.lineStrong, borderRadius: 10, borderWidth: 1, justifyContent: 'center', minHeight: 48, minWidth: 154, paddingHorizontal: 24, paddingVertical: 12 },
  orderCancelButtonText: { ...typeScale.button, color: palette.red, fontFamily: font },
  orderActions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' },
  cancelPaymentDescription: { ...typeScale.body, color: palette.secondary, fontFamily: font },
  cancelPaymentActions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' },
  orderError: { ...typeScale.body, color: palette.red, fontFamily: font, paddingVertical: 12 },
  checkoutForm: { gap: 16 },
  fieldRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  fieldHalf: { flex: 1, gap: 7, minWidth: 220 },
  fieldGroup: { gap: 7 },
  fieldLabel: { ...typeScale.label, color: palette.secondary, fontFamily: font },
  fieldInput: { ...typeScale.body, backgroundColor: 'rgba(255,255,255,0.5)', borderColor: palette.lineStrong, borderRadius: 10, borderWidth: 1, color: palette.text, fontFamily: font, minHeight: 48, paddingHorizontal: 14, paddingVertical: 11 },
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
