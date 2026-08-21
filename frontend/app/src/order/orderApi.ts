import { authenticatedRequest } from '../auth/authApi';
import type { ShopCategory, ShopSubCategory } from '../shop/shopApi';

export type OrderStatus =
  | 'PENDING'
  | 'PAID'
  | 'PREPARING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED';

export type OrderItem = {
  productId: string;
  category: ShopCategory;
  name: string;
  emoji: string;
  desc: string;
  originalUnitPrice: number;
  discountRate: number;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  packageQuantity: number;
  packageUnit: string;
  subCategory?: ShopSubCategory | null;
};

export type OrderSummary = {
  id: number;
  orderNumber: string;
  status: OrderStatus;
  totalQuantity: number;
  totalPrice: number;
  orderedAt: string;
  cancelledAt?: string | null;
};

export type OrderDetail = OrderSummary & {
  recipientName: string;
  recipientPhone: string;
  postalCode: string;
  address: string;
  addressDetail?: string | null;
  items: OrderItem[];
  updatedAt: string;
};

export type CreateOrderInput = {
  recipientName: string;
  recipientPhone: string;
  postalCode: string;
  address: string;
  addressDetail?: string;
};

export function createOrder(input: CreateOrderInput) {
  return authenticatedRequest<OrderDetail>('/api/orders', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getOrders() {
  return authenticatedRequest<OrderSummary[]>('/api/orders');
}

export function getOrder(orderId: number) {
  return authenticatedRequest<OrderDetail>(`/api/orders/${orderId}`);
}

export function cancelOrder(orderId: number) {
  return authenticatedRequest<OrderDetail>(`/api/orders/${orderId}/cancel`, {
    method: 'POST',
  });
}
