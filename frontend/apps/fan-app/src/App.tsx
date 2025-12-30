import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import MobileLayout from "./components/layout/MobileLayout";

// Auth
import { Welcome, Login, Signup, VerifyEmail, ForgotPassword } from "./pages/Auth";

// Home Tab
import { HomeFeed, EventDetail, SelectTickets, Cart } from "./pages/Home";

// Search Tab
import { SearchPage } from "./pages/Search";

// Tickets Tab
import { TicketList, TicketDetail } from "./pages/Tickets";

// Sell Tab
import { MyListings } from "./pages/Sell";

// Profile Tab
import { ProfilePage } from "./pages/Profile";

// Routes that don't use MobileLayout
const authRoutes = ["/welcome", "/login", "/signup", "/verify-email", "/forgot-password"];

function isAuthRoute(pathname: string): boolean {
  return authRoutes.some(route => pathname.startsWith(route));
}

function AppContent() {
  const location = useLocation();

  // Auth routes - no bottom nav
  if (isAuthRoute(location.pathname)) {
    return (
      <Routes>
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
      </Routes>
    );
  }

  // Main app with bottom navigation
  return (
    <MobileLayout>
      <Routes>
        {/* Home Tab */}
        <Route path="/" element={<HomeFeed />} />
        <Route path="/featured" element={<HomeFeed />} />
        <Route path="/nearby" element={<HomeFeed />} />
        <Route path="/event/:id" element={<EventDetail />} />
        <Route path="/event/:id/select-tickets" element={<SelectTickets />} />
        <Route path="/event/:id/cart" element={<Cart />} />
        <Route path="/checkout" element={<Cart />} />

        {/* Search Tab */}
        <Route path="/search" element={<SearchPage />} />

        {/* Tickets Tab */}
        <Route path="/tickets" element={<TicketList />} />
        <Route path="/tickets/:id" element={<TicketDetail />} />

        {/* Sell Tab */}
        <Route path="/sell" element={<MyListings />} />

        {/* Profile Tab */}
        <Route path="/profile" element={<ProfilePage />} />
      </Routes>
    </MobileLayout>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
