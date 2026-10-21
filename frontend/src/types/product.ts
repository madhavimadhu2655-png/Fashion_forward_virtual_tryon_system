export interface ColorVariant {
  color_name: string;
  color_hex: string;
  image_url: string | null;
  stock: number;
}

export interface SizeOption {
  size: string;
  shoulder_cm: number | null;
  chest_cm: number | null;
  waist_cm: number | null;
  length_cm: number | null;
  stock: number;
}

export interface ProductImageEntry {
  image_type: string;
  image_url: string;
  sort_order: number;
}

export interface ProductListItem {
  id: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  discount_price: number | null;
  fabric?: string;
  fit_type?: string;
  description?: string;
  rating: number;
  review_count: number;
  is_trending: boolean;
  is_new: boolean;
  thumbnail_url: string | null;
  colors: ColorVariant[];
  sizes?: string[];
}

export interface ProductDetail {
  id: string;
  name: string;
  brand: string;
  category: string;
  description: string;
  price: number;
  discount_price: number | null;
  fabric: string;
  fit_type: string;
  rating: number;
  review_count: number;
  stock: number;
  is_trending: boolean;
  is_new: boolean;
  images: ProductImageEntry[];
  variants: ColorVariant[];
  sizes: SizeOption[];
}

export interface ProductListResponse {
  items: ProductListItem[];
  total: number;
  skip: number;
  limit: number;
}

export interface FilterOptions {
  categories: string[];
  colors: ColorVariant[];
  fabrics: string[];
  fits: string[];
  min_price: number;
  max_price: number;
}

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  color: string;
  size: string;
  quantity: number;
  imageUrl: string | null;
}
