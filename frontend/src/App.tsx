import { lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import Home from "./pages/Home";
import Shop from "./pages/Shop";
import ProductDetails from "./pages/ProductDetails";
import Cart from "./pages/Cart";
import Wishlist from "./pages/Wishlist";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Profile from "./pages/Profile";
import Orders from "./pages/Orders";
import Checkout from "./pages/Checkout";
import Admin from "./pages/Admin";
import SavedLooks from "./pages/SavedLooks";
import Rooms from "./pages/Rooms";
import JoinRoom from "./pages/JoinRoom";
import NotFound from "./pages/NotFound";
import { CartProvider } from "./context/CartContext";
import { WishlistProvider } from "./context/WishlistContext";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { TryOnSessionProvider } from "./context/TryOnSessionContext";

// Camera/AI pages pull in MediaPipe and the TPS pipeline; load them on demand.
const TryOn = lazy(() => import("./pages/TryOn"));
const PhotoStudio = lazy(() => import("./pages/PhotoStudio"));
const Compare = lazy(() => import("./pages/Compare"));
const Room = lazy(() => import("./pages/Room"));
const Status = lazy(() => import("./pages/Status"));

/** Old /photo-try-on links keep working (and keep their query string). */
function PhotoTryOnRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/studio${search}`} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <CartProvider>
            <WishlistProvider>
              <TryOnSessionProvider>
                <Routes>
                  <Route element={<Layout />}>
                    {/* Public — browsing never requires login */}
                    <Route index element={<Home />} />
                    <Route path="shop" element={<Shop />} />
                    <Route path="product/:id" element={<ProductDetails />} />
                    <Route path="cart" element={<Cart />} />
                    <Route path="checkout" element={<Checkout />} />
                    <Route path="wishlist" element={<Wishlist />} />
                    <Route path="favorites" element={<Navigate to="/wishlist" replace />} />
                    <Route path="status" element={<Status />} />
                    <Route path="demo" element={<Status />} />
                    <Route path="login" element={<Login />} />
                    <Route path="register" element={<Register />} />

                    {/* Protected — require login */}
                    <Route element={<ProtectedRoute />}>
                      <Route path="profile" element={<Profile />} />
                      <Route path="orders" element={<Orders />} />
                      <Route path="try-on" element={<TryOn />} />
                      <Route path="studio" element={<PhotoStudio />} />
                      <Route path="photo-try-on" element={<PhotoTryOnRedirect />} />
                      <Route path="compare" element={<Compare />} />
                      <Route path="saved-looks" element={<SavedLooks />} />
                      <Route path="rooms" element={<Rooms />} />
                      <Route path="rooms/join" element={<JoinRoom />} />
                      <Route path="rooms/:roomId" element={<Room />} />
                    </Route>

                    {/* Protected — require login AND admin role */}
                    <Route element={<ProtectedRoute requireAdmin />}>
                      <Route path="admin" element={<Admin />} />
                    </Route>
                    <Route path="*" element={<NotFound />} />
                  </Route>
                </Routes>
              </TryOnSessionProvider>
            </WishlistProvider>
          </CartProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
