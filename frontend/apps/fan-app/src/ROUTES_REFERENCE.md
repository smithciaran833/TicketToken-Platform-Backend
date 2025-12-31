# TicketToken Fan App - Routes Reference

## Home Tab
- `/` - HomePage
- `/featured` - FeaturedEvents
- `/nearby` - NearbyEvents
- `/recommendations` - Recommendations

## Search Tab
- `/search` - SearchPage
- `/search/results` - SearchResults
- `/search/category/:categoryId` - CategoryResults
- `/search/map` - MapView

## Event Flow
- `/event/:id` - EventPage
- `/event/:id/tickets` - SelectTickets
- `/event/:id/seating` - SeatingMap
- `/event/:id/addons` - SelectAddOns
- `/event/:id/cart` - Cart
- `/event/:id/checkout` - CheckoutPage
- `/event/:id/reviews` - EventReviews
- `/event/:id/reviews/write` - WriteReview

## Tickets Tab
- `/tickets` - TicketsList
- `/tickets/:id` - TicketView
- `/tickets/:id/qr` - QRCodeFullscreen
- `/tickets/:id/transfer` - TransferTicket
- `/tickets/:id/transfer/confirmation` - TransferConfirmation
- `/tickets/transfer-history` - TransferHistory
- `/tickets/receive/:transferId` - ReceiveTransfer
- `/tickets/orders` - OrderHistory
- `/tickets/orders/:orderId` - OrderDetail
- `/tickets/orders/:orderId/refund` - RequestRefund
- `/tickets/saved` - SavedEvents
- `/tickets/waitlist` - WaitlistStatus
- `/tickets/:ticketId/support` - ContactEventSupport

## Sell Tab
- `/sell` - MyListings
- `/sell/listing/:listingId` - ListingDetail
- `/sell/listing/:listingId/stats` - ListingStats
- `/sell/listing/:listingId/edit` - EditListing
- `/sell/new` - ListTicket
- `/sell/new/:ticketId/price` - SetResalePrice
- `/sell/new/:ticketId/confirm` - ConfirmListing
- `/sell/success` - ListingSuccess
- `/sell/marketplace` - ResaleMarketplace
- `/sell/resale/:listingId` - ResaleTicketDetail
- `/sell/settings` - SellerAccountSettings
- `/sell/setup` - SetUpSellerAccount
- `/sell/payouts` - PayoutHistory

## Profile Tab
- `/profile` - MyProfile
- `/profile/edit` - EditProfile
- `/profile/settings` - AccountSettings
- `/profile/settings/password` - ChangePassword
- `/profile/settings/2fa` - Enable2FA
- `/profile/settings/2fa/setup` - TwoFactorSetup
- `/profile/settings/linked-accounts` - LinkedAccounts
- `/profile/settings/location` - LocationPreferences
- `/profile/settings/interests` - InterestPreferences
- `/profile/settings/notifications` - NotificationSettings
- `/profile/payment-methods` - PaymentMethods
- `/profile/payment-methods/add` - Payment (reuse from Checkout)
- `/profile/following` - FollowingList
- `/profile/nfts` - NFTCollection
- `/profile/nfts/:nftId` - NFTDetail
- `/profile/accessibility` - AccessibilitySettings
- `/profile/help` - HelpSupport
- `/profile/help/category/:category` - FAQList
- `/profile/help/contact` - ContactSupport
- `/profile/legal` - LegalPages
- `/profile/legal/terms` - TermsOfService
- `/profile/legal/privacy` - PrivacyPolicy
- `/profile/delete-account` - DeleteAccount
- `/profile/about` - AppVersion

## Auth (No bottom nav)
- `/auth/login` - LoginPage
- `/auth/signup` - SignUpPage
- `/auth/forgot-password` - ForgotPassword
- `/auth/reset-password` - ResetPassword
- `/auth/verify-email` - VerifyEmail

## Checkout (No bottom nav)
- `/checkout` - CheckoutPage
- `/checkout/payment` - Payment
- `/checkout/confirmation` - ConfirmationPage

---

## Total Screens: 102
- Home Tab: 14 screens
- Search Tab: 5 screens
- Event Flow: 10 screens
- Tickets Tab: 14 screens
- Sell Tab: 15 screens
- Profile Tab: 36 screens
- Auth: 5 screens
- Checkout: 3 screens
