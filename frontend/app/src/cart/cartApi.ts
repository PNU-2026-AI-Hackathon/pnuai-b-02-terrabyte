import { authenticatedRequest } from '../auth/authApi';
import type { ShopCategory, ShopSubCategory } from '../shop/shopApi';

export type CartItem = {
  productId: string;
  category: ShopCategory;
  name: string;
  emoji: string;
  desc: string;
  price: number;
  discountRate: number;
  salePrice: number;
  discounted: boolean;
  badge?: string;
  quantity: number;
  subtotal: number;
  stockQuantity: number;
  status: 'ACTIVE' | 'INACTIVE' | 'DISCONTINUED';
  available: boolean;
  imageUrl?: string | null;
  packageQuantity?: number;
  packageUnit?: string;
  subCategory?: ShopSubCategory | null;
};

export type CartResponse = {
  items: CartItem[];
  totalQuantity: number;
  totalPrice: number;
};

export function getCart() {
  return authenticatedRequest<CartResponse>('/api/cart');
}

export function addCartItem(productId: string, quantity = 1) {
  return authenticatedRequest<CartResponse>('/api/cart/items', {
    method: 'POST',
    body: JSON.stringify({ productId, quantity }),
  });
}

export function updateCartItem(productId: string, quantity: number) {
  return authenticatedRequest<CartResponse>(`/api/cart/items/${encodeURIComponent(productId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ quantity }),
  });
}

export function removeCartItem(productId: string) {
  return authenticatedRequest<CartResponse>(`/api/cart/items/${encodeURIComponent(productId)}`, {
    method: 'DELETE',
  });
}

export function clearCart() {
  return authenticatedRequest<CartResponse>('/api/cart', {
    method: 'DELETE',
  });
}
