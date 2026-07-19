import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '../components/GlassCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { SegmentedTabs } from '../components/SegmentedTabs';
import { shopProducts, shopTabs, type ShopCategory, type ShopProduct } from '../data';
import { colors, maxContentWidth, radii, typography } from '../theme';

type ShopScreenProps = {
  isCompact: boolean;
};

const categoryCopy: Record<ShopCategory, { title: string; desc: string }> = {
  parts: {
    title: '재배 장치와 교체 부품',
    desc: '센서, 조명, 관수 장치처럼 재배 환경을 구성하는 부품을 모았어요.',
  },
  soil: {
    title: '용도에 맞는 흙과 배지',
    desc: '배양토와 배수·통기성을 보완하는 재료를 확인해 보세요.',
  },
  seeds: {
    title: '바로 시작하는 작물 씨앗',
    desc: '스마트 재배 도우미가 지원하는 작물의 씨앗을 골라 보세요.',
  },
};

function formatPrice(price: number) {
  return `${price.toLocaleString('ko-KR')}원`;
}

function ProductCard({
  isCompact,
  onAdd,
  product,
  quantity,
}: {
  isCompact: boolean;
  onAdd: (product: ShopProduct) => void;
  product: ShopProduct;
  quantity: number;
}) {
  return (
    <GlassCard soft style={[styles.productCard, isCompact && styles.productCardCompact]}>
      <View style={styles.productVisual}>
        <Text style={styles.productEmoji}>{product.emoji}</Text>
        {product.badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{product.badge}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.productCopy}>
        <Text style={styles.productName}>{product.name}</Text>
        <Text style={styles.productDesc}>{product.desc}</Text>
      </View>

      <View style={styles.productFooter}>
        <Text style={styles.price}>{formatPrice(product.price)}</Text>
        <PrimaryButton
          label={quantity > 0 ? `${quantity}개 담음 · 추가` : '장바구니 담기'}
          onPress={() => onAdd(product)}
          style={styles.addButton}
          textStyle={styles.addButtonText}
        />
      </View>
    </GlassCard>
  );
}

export function ShopScreen({ isCompact }: ShopScreenProps) {
  const [category, setCategory] = useState<ShopCategory>('parts');
  const [cart, setCart] = useState<Record<string, number>>({});
  const products = shopProducts.filter((product) => product.category === category);
  const cartCount = Object.values(cart).reduce((total, quantity) => total + quantity, 0);
  const copy = categoryCopy[category];

  const addToCart = (product: ShopProduct) => {
    setCart((current) => ({
      ...current,
      [product.id]: (current[product.id] ?? 0) + 1,
    }));
  };

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.container}>
        <GlassCard style={[styles.hero, isCompact && styles.heroCompact]}>
          <View style={styles.heroCopy}>
            <View style={styles.eyebrowRow}>
              <Text style={styles.eyebrow}>GROW SHOP</Text>
              <View style={styles.cartPill}>
                <Text style={styles.cartIcon}>🛒</Text>
                <Text style={styles.cartText}>장바구니 {cartCount}</Text>
              </View>
            </View>
            <Text style={styles.heading}>재배 준비물을 한곳에서</Text>
            <Text style={styles.subheading}>
              필요한 부품부터 흙과 씨앗까지, 카테고리별로 빠르게 찾아보세요.
            </Text>
          </View>
          <View style={styles.heroEmojiWrap}>
            <Text style={styles.heroEmoji}>🌱</Text>
          </View>
        </GlassCard>

        <GlassCard style={styles.catalog}>
          <View style={styles.tabsWrap}>
            <SegmentedTabs value={category} options={shopTabs} onChange={setCategory} />
          </View>

          <View style={[styles.sectionHeader, isCompact && styles.sectionHeaderCompact]}>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionTitle}>{copy.title}</Text>
              <Text style={styles.sectionDesc}>{copy.desc}</Text>
            </View>
            <Text style={styles.productCount}>{products.length}개 상품</Text>
          </View>

          <View style={[styles.productGrid, isCompact && styles.oneColumn]}>
            {products.map((product) => (
              <ProductCard
                isCompact={isCompact}
                key={product.id}
                onAdd={addToCart}
                product={product}
                quantity={cart[product.id] ?? 0}
              />
            ))}
          </View>
        </GlassCard>

        <Text style={styles.disclaimer}>
          * 현재 상품과 가격은 화면 구성을 위한 예시이며, 실제 결제 기능은 아직 연결되지 않았습니다.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    paddingBottom: 80,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  container: {
    gap: 20,
    maxWidth: maxContentWidth,
    width: '100%',
  },
  hero: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 24,
    justifyContent: 'space-between',
    minHeight: 220,
    overflow: 'hidden',
    padding: 32,
  },
  heroCompact: {
    alignItems: 'flex-start',
    flexDirection: 'column',
  },
  heroCopy: {
    flex: 1,
    gap: 10,
  },
  eyebrowRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  eyebrow: {
    color: '#2b8f6e',
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  cartPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderColor: 'rgba(255,255,255,0.8)',
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  cartIcon: {
    fontSize: 13,
  },
  cartText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '800',
  },
  heading: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
    fontSize: 30,
    fontWeight: '900',
  },
  subheading: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
    fontSize: 15,
    lineHeight: 24,
  },
  heroEmojiWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderColor: 'rgba(255,255,255,0.75)',
    borderRadius: 999,
    borderWidth: 1,
    height: 132,
    justifyContent: 'center',
    width: 132,
  },
  heroEmoji: {
    fontSize: 62,
  },
  catalog: {
    gap: 24,
    padding: 28,
  },
  tabsWrap: {
    alignSelf: 'center',
    maxWidth: 480,
    width: '100%',
  },
  sectionHeader: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 20,
    justifyContent: 'space-between',
  },
  sectionHeaderCompact: {
    alignItems: 'flex-start',
    flexDirection: 'column',
    gap: 10,
  },
  sectionCopy: {
    flex: 1,
    gap: 5,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
    fontSize: 20,
    fontWeight: '900',
  },
  sectionDesc: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
    fontSize: 13,
    lineHeight: 20,
  },
  productCount: {
    color: colors.textMuted,
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
  },
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  oneColumn: {
    flexDirection: 'column',
  },
  productCard: {
    flex: 1,
    flexBasis: '30%',
    gap: 16,
    minHeight: 320,
    minWidth: 250,
    padding: 20,
  },
  productCardCompact: {
    minHeight: 0,
    minWidth: 0,
    width: '100%',
  },
  productVisual: {
    alignItems: 'center',
    backgroundColor: 'rgba(214,244,224,0.55)',
    borderColor: 'rgba(255,255,255,0.75)',
    borderRadius: 18,
    borderWidth: 1,
    height: 112,
    justifyContent: 'center',
    position: 'relative',
  },
  productEmoji: {
    fontSize: 44,
  },
  badge: {
    backgroundColor: 'rgba(63,174,111,0.92)',
    borderRadius: radii.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
    position: 'absolute',
    right: 10,
    top: 10,
  },
  badgeText: {
    color: '#fff',
    fontFamily: typography.fontFamily,
    fontSize: 10,
    fontWeight: '900',
  },
  productCopy: {
    flex: 1,
    gap: 6,
  },
  productName: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
    fontSize: 16,
    fontWeight: '900',
  },
  productDesc: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
    fontSize: 13,
    lineHeight: 20,
  },
  productFooter: {
    gap: 12,
  },
  price: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
    fontSize: 21,
    fontWeight: '900',
  },
  addButton: {
    borderRadius: 12,
    shadowOpacity: 0.2,
  },
  addButtonText: {
    fontSize: 13,
  },
  disclaimer: {
    color: colors.textMuted,
    fontFamily: typography.fontFamily,
    fontSize: 12,
    paddingHorizontal: 8,
    textAlign: 'center',
  },
});
