import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { CartItem } from "../types/product";

interface CartContextValue {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (productId: string, color: string, size: string) => void;
  updateQuantity: (productId: string, color: string, size: string, quantity: number) => void;
  clearCart: () => void;
  subtotal: number;
  itemCount: number;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

function sameLine(a: CartItem, productId: string, color: string, size: string) {
  return a.productId === productId && a.color === color && a.size === size;
}

export function CartProvider({ children }: { children: ReactNode }) {
  // In-memory only for this milestone — persistence to a real backend
  // cart table arrives once authentication + the cart API exist.
  const [items, setItems] = useState<CartItem[]>([]);

  function addItem(newItem: CartItem) {
    setItems((prev) => {
      const existing = prev.find((i) => sameLine(i, newItem.productId, newItem.color, newItem.size));
      if (existing) {
        return prev.map((i) =>
          sameLine(i, newItem.productId, newItem.color, newItem.size)
            ? { ...i, quantity: i.quantity + newItem.quantity }
            : i
        );
      }
      return [...prev, newItem];
    });
  }

  function removeItem(productId: string, color: string, size: string) {
    setItems((prev) => prev.filter((i) => !sameLine(i, productId, color, size)));
  }

  function updateQuantity(productId: string, color: string, size: string, quantity: number) {
    if (quantity < 1) return;
    setItems((prev) =>
      prev.map((i) => (sameLine(i, productId, color, size) ? { ...i, quantity } : i))
    );
  }

  function clearCart() {
    setItems([]);
  }

  const subtotal = useMemo(
    () => items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    [items]
  );

  const itemCount = useMemo(() => items.reduce((sum, i) => sum + i.quantity, 0), [items]);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQuantity, clearCart, subtotal, itemCount }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
