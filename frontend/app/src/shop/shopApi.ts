import { authenticatedRequest } from '../auth/authApi';

export type ShopCategory = 'parts' | 'soil' | 'seeds';
export type ShopSubCategory = 'SOIL' | 'MEDIA' | 'NUTRIENT';

export type ShopProduct = {
  id: string;
  category: ShopCategory;
  name: string;
  emoji: string;
  desc: string;
  price: number;
  discountRate?: number;
  salePrice?: number;
  discounted?: boolean;
  badge?: string;
  stockQuantity?: number;
  status?: 'ACTIVE' | 'INACTIVE' | 'DISCONTINUED';
  available?: boolean;
  imageUrl?: string | null;
  packageQuantity?: number;
  packageUnit?: string;
  subCategory?: ShopSubCategory | null;
};

export function getShopProducts() {
  return authenticatedRequest<ShopProduct[]>('/api/products');
}
