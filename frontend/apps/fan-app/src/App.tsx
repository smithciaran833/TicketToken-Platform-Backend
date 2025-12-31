import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

// Home
import {
  HomePage,
  SearchPage,
  SearchResults,
  CategoryResults,
  MapView,
  FeaturedEvents,
  NearbyEvents,
  Recommendations,
} from "./pages/Home";

// Event
import {
  EventPage,
  SelectTickets,
  SeatingMap,
  EventReviews,
  WriteReview,
  SelectAddOns,
  Cart,
} from "./pages/Event";

// Checkout
import { CheckoutPage, ConfirmationPage, Payment } from "./pages/Checkout";

// Tickets
import {
  TicketsList,
  TicketView,
  QRCodeFullscreen,
  TransferTicket,
  TransferConfirmation,
  TransferHistory,
  ReceiveTransfer,
  OrderHistory,
  OrderDetail,
  RequestRefund,
  SavedEvents,
  WaitlistStatus,
  ContactEventSupport,
} from "./pages/Tickets";

// Sell
import {
  MyListings,
  ListingDetail,
  ListingStats,
  EditListing,
  ListTicket,
  SetResalePrice,
  ConfirmListing,
  ListingSuccess,
  ResaleMarketplace,
  ResaleTicketDetail,
  SellerAccountSettings,
  SetUpSellerAccount,
  PayoutHistory,
} from "./pages/Sell";

// Profile
import {
  MyProfile,
  EditProfile,
  AccountSettings,
  ChangePassword,
  Enable2FA,
  TwoFactorSetup,
  LinkedAccounts,
  PaymentMethods,
  LocationPreferences,
  InterestPreferences,
  NotificationSettings,
  FollowingList,
  NFTCollection,
  NFTDetail,
  AccessibilitySettings,
  HelpSupport,
  FAQList,
  ContactSupport,
  LegalPages,
  TermsOfService,
  PrivacyPolicy,
  DeleteAccount,
  AppVersion,
} from "./pages/Profile";

// Auth
import {
  LoginPage,
  SignUpPage,
  ForgotPassword,
  ResetPassword,
  VerifyEmail,
} from "./pages/Auth";

export default function App() {
  return (
    <Router>
      <Routes>
        {/* ===== HOME TAB ===== */}
        <Route path="/" element={<HomePage />} />
        <Route path="/featured" element={<FeaturedEvents />} />
        <Route path="/nearby" element={<NearbyEvents />} />
        <Route path="/recommendations" element={<Recommendations />} />

        {/* ===== SEARCH ===== */}
        <Route path="/search" element={<SearchPage />} />
        <Route path="/search/results" element={<SearchResults />} />
        <Route path="/search/category/:categoryId" element={<CategoryResults />} />
        <Route path="/search/map" element={<MapView />} />

        {/* ===== EVENT FLOW ===== */}
        <Route path="/event/:id" element={<EventPage />} />
        <Route path="/event/:id/tickets" element={<SelectTickets />} />
        <Route path="/event/:id/seating" element={<SeatingMap />} />
        <Route path="/event/:id/addons" element={<SelectAddOns />} />
        <Route path="/event/:id/cart" element={<Cart />} />
        <Route path="/event/:id/checkout" element={<CheckoutPage />} />
        <Route path="/event/:id/reviews" element={<EventReviews />} />
        <Route path="/event/:id/reviews/write" element={<WriteReview />} />

        {/* ===== CHECKOUT ===== */}
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/checkout/payment" element={<Payment />} />
        <Route path="/checkout/confirmation" element={<ConfirmationPage />} />

        {/* ===== TICKETS TAB ===== */}
        <Route path="/tickets" element={<TicketsList />} />
        <Route path="/tickets/:id" element={<TicketView />} />
        <Route path="/tickets/:id/qr" element={<QRCodeFullscreen />} />
        <Route path="/tickets/:id/transfer" element={<TransferTicket />} />
        <Route path="/tickets/:id/transfer/confirmation" element={<TransferConfirmation />} />
        <Route path="/tickets/transfer-history" element={<TransferHistory />} />
        <Route path="/tickets/receive/:transferId" element={<ReceiveTransfer />} />
        <Route path="/tickets/orders" element={<OrderHistory />} />
        <Route path="/tickets/orders/:orderId" element={<OrderDetail />} />
        <Route path="/tickets/orders/:orderId/refund" element={<RequestRefund />} />
        <Route path="/tickets/saved" element={<SavedEvents />} />
        <Route path="/tickets/waitlist" element={<WaitlistStatus />} />
        <Route path="/tickets/:ticketId/support" element={<ContactEventSupport />} />

        {/* ===== SELL TAB ===== */}
        <Route path="/sell" element={<MyListings />} />
        <Route path="/sell/listing/:listingId" element={<ListingDetail />} />
        <Route path="/sell/listing/:listingId/stats" element={<ListingStats />} />
        <Route path="/sell/listing/:listingId/edit" element={<EditListing />} />
        <Route path="/sell/new" element={<ListTicket />} />
        <Route path="/sell/new/:ticketId/price" element={<SetResalePrice />} />
        <Route path="/sell/new/:ticketId/confirm" element={<ConfirmListing />} />
        <Route path="/sell/success" element={<ListingSuccess />} />
        <Route path="/sell/marketplace" element={<ResaleMarketplace />} />
        <Route path="/sell/resale/:listingId" element={<ResaleTicketDetail />} />
        <Route path="/sell/settings" element={<SellerAccountSettings />} />
        <Route path="/sell/setup" element={<SetUpSellerAccount />} />
        <Route path="/sell/payouts" element={<PayoutHistory />} />

        {/* ===== PROFILE TAB ===== */}
        <Route path="/profile" element={<MyProfile />} />
        <Route path="/profile/edit" element={<EditProfile />} />
        <Route path="/profile/settings" element={<AccountSettings />} />
        <Route path="/profile/settings/password" element={<ChangePassword />} />
        <Route path="/profile/settings/2fa" element={<Enable2FA />} />
        <Route path="/profile/settings/2fa/setup" element={<TwoFactorSetup />} />
        <Route path="/profile/settings/linked-accounts" element={<LinkedAccounts />} />
        <Route path="/profile/settings/location" element={<LocationPreferences />} />
        <Route path="/profile/settings/interests" element={<InterestPreferences />} />
        <Route path="/profile/settings/notifications" element={<NotificationSettings />} />
        <Route path="/profile/payment-methods" element={<PaymentMethods />} />
        <Route path="/profile/payment-methods/add" element={<Payment />} />
        <Route path="/profile/following" element={<FollowingList />} />
        <Route path="/profile/nfts" element={<NFTCollection />} />
        <Route path="/profile/nfts/:nftId" element={<NFTDetail />} />
        <Route path="/profile/accessibility" element={<AccessibilitySettings />} />
        <Route path="/profile/help" element={<HelpSupport />} />
        <Route path="/profile/help/category/:category" element={<FAQList />} />
        <Route path="/profile/help/contact" element={<ContactSupport />} />
        <Route path="/profile/legal" element={<LegalPages />} />
        <Route path="/profile/legal/terms" element={<TermsOfService />} />
        <Route path="/profile/legal/privacy" element={<PrivacyPolicy />} />
        <Route path="/profile/delete-account" element={<DeleteAccount />} />
        <Route path="/profile/about" element={<AppVersion />} />

        {/* ===== AUTH (No bottom nav) ===== */}
        <Route path="/auth/login" element={<LoginPage />} />
        <Route path="/auth/signup" element={<SignUpPage />} />
        <Route path="/auth/forgot-password" element={<ForgotPassword />} />
        <Route path="/auth/reset-password" element={<ResetPassword />} />
        <Route path="/auth/verify-email" element={<VerifyEmail />} />
      </Routes>
    </Router>
  );
}
