# TicketToken — Fan Screens (Web + Mobile App)

Generated: 2024-12-28
Total Screens: 102
Total Flows: 73
Platforms: React (Web) + React Native (iOS/Android)

---

## Navigation Structure

### Bottom Tabs
```
┌─────────┬─────────┬─────────┬─────────┬─────────┐
│  Home   │ Search  │ Tickets │  Sell   │ Profile │
└─────────┴─────────┴─────────┴─────────┴─────────┘
```

| Tab | Description | Account Required |
|-----|-------------|------------------|
| Home | Event feed, featured, nearby, recommendations | No |
| Search | Search, filter, browse by category | No |
| Tickets | My tickets, upcoming, past, transfers | Yes |
| Sell | My listings, list ticket, payout history | Yes |
| Profile | Account, settings, support, following | Yes |

### Guest Access
Users can browse Home and Search without an account. All other actions show Sign Up Gate.

---

## Screen Index

### Onboarding (10 screens)
1. Splash
2. Welcome
3. Sign Up
4. Log In
5. Forgot Password
6. Reset Password
7. Verify Email
8. Verify Phone
9. First-Time Walkthrough
10. Enable Notifications (App Only)

### Home Tab (22 screens)
11. Home Feed
12. Featured Events
13. Nearby Events
14. Recommendations
15. Event Detail
16. Venue Info Modal
17. Artist Info Modal
18. Seating Map
19. Event Reviews
20. Write Review
21. Accessibility Info
22. Share Event Modal
23. Select Tickets
24. Select Seats
25. Select Add-Ons
26. Enter Presale Code Modal
27. Cart
28. Enter Promo Code Modal
29. Checkout
30. Payment
31. Order Confirmation
32. Sign Up Gate Modal

### Search Tab (5 screens)
33. Search
34. Search Results
35. Filter Modal
36. Category Results
37. Map View

### Tickets Tab (14 screens)
38. Ticket List
39. Ticket Detail
40. QR Code Fullscreen
41. Add to Wallet
42. Transfer Ticket
43. Transfer Confirmation
44. Transfer History
45. Receive Transfer
46. Order History
47. Order Detail
48. Request Refund
49. Saved Events
50. Waitlist Status
51. Contact Event Support

### Sell Tab (15 screens)
52. My Listings
53. Listing Detail
54. Listing Stats
55. Edit Listing
56. Remove Listing Modal
57. List Ticket for Sale
58. Select Ticket to Sell
59. Set Resale Price
60. Confirm Listing
61. Resale Marketplace
62. Resale Ticket Detail
63. Buy Resale Ticket
64. Seller Account Settings
65. Set Up Seller Account (Stripe Connect)
66. Payout History

### Profile Tab (36 screens)
67. My Profile
68. Edit Profile
69. Account Settings
70. Change Password
71. Enable 2FA
72. 2FA Setup
73. Link Social Accounts
74. Payment Methods
75. Add Payment Method
76. Location Preferences
77. Interest Preferences
78. Notification Settings
79. Following Artists
80. Following Venues
81. Artist Profile
82. Venue Profile
83. NFT Collection
84. NFT Detail
85. Accessibility Settings
86. Request Accommodations
87. Help Center
88. Search Help
89. Help Article
90. Contact Support
91. Live Chat
92. Report Problem
93. Support Tickets
94. Support Ticket Detail
95. Terms of Service
96. Privacy Policy
97. Request Data Export
98. Request Data Deletion
99. Log Out Modal
100. Delete Account
101. Delete Account Confirmation
102. Edit Bank Account

---

# Onboarding Screens

---

## 1. Splash

**Location:** App Launch
**Flow(s):** None (system)

### Components
- App logo (centered)
- Loading indicator
- Background color/gradient

### Data Needed
- None

### Actions
- Auto-navigate to Welcome (if first launch) or Home (if returning user)

### States
- Loading

### Notes
- Display for 1-2 seconds max
- Check auth state during splash

---

## 2. Welcome

**Location:** Onboarding > Welcome
**Flow(s):** 1

### Components
- App logo
- Headline: "Discover live events"
- Subheadline: "Buy, sell, and transfer tickets"
- "Create Account" button (primary)
- "Log In" button (secondary)
- "Continue as Guest" link

### Data Needed
- None

### Actions
- Tap "Create Account" → Sign Up screen
- Tap "Log In" → Log In screen
- Tap "Continue as Guest" → Home Tab

### States
- Default only

### Notes
- Only shown on first launch or after logout
- Skip if user is already logged in

---

## 3. Sign Up

**Location:** Onboarding > Sign Up
**Flow(s):** 1

### Components
- Back button
- "Create Account" header
- Email input
- Password input
- Confirm password input
- Phone input (optional)
- "Sign Up" button (primary)
- "Or sign up with" divider
- Google sign up button
- Apple sign up button
- Terms acceptance checkbox: "I agree to Terms of Service and Privacy Policy"
- "Already have an account? Log In" link

### Data Needed
- None

### Actions
- Tap "Sign Up" → Validate → Verify Email screen
- Tap Google → Google OAuth flow
- Tap Apple → Apple OAuth flow
- Tap "Log In" → Log In screen
- Tap "Terms of Service" → Terms of Service screen
- Tap "Privacy Policy" → Privacy Policy screen

### States
- Default
- Loading (submitting)
- Error (validation failed, email exists)

### Validation
- Email: valid format, not already registered
- Password: min 8 chars, 1 uppercase, 1 number
- Confirm password: matches password
- Terms: must be checked

---

## 4. Log In

**Location:** Onboarding > Log In
**Flow(s):** 2

### Components
- Back button
- "Welcome Back" header
- Email input
- Password input
- "Forgot Password?" link
- "Log In" button (primary)
- "Or log in with" divider
- Google login button
- Apple login button
- "Don't have an account? Sign Up" link

### Data Needed
- None

### Actions
- Tap "Log In" → Validate → Home Tab (or 2FA if enabled)
- Tap "Forgot Password?" → Forgot Password screen
- Tap Google → Google OAuth flow
- Tap Apple → Apple OAuth flow
- Tap "Sign Up" → Sign Up screen

### States
- Default
- Loading (authenticating)
- Error (invalid credentials, account locked)

### Validation
- Email: required, valid format
- Password: required

---

## 5. Forgot Password

**Location:** Onboarding > Forgot Password
**Flow(s):** 3

### Components
- Back button
- "Reset Password" header
- Instruction text: "Enter your email and we'll send you a reset link"
- Email input
- "Send Reset Link" button (primary)
- "Back to Log In" link

### Data Needed
- None

### Actions
- Tap "Send Reset Link" → Validate → Show success message
- Tap "Back to Log In" → Log In screen

### States
- Default
- Loading (sending)
- Success (email sent)
- Error (email not found)

### Validation
- Email: required, valid format

---

## 6. Reset Password

**Location:** Onboarding > Reset Password (from email link)
**Flow(s):** 3

### Components
- App logo
- "Create New Password" header
- New password input
- Confirm password input
- "Reset Password" button (primary)

### Data Needed
- Reset token (from URL/deep link)

### Actions
- Tap "Reset Password" → Validate → Log In screen with success message

### States
- Default
- Loading (submitting)
- Success (password reset)
- Error (invalid token, expired link)

### Validation
- Password: min 8 chars, 1 uppercase, 1 number
- Confirm password: matches password

---

## 7. Verify Email

**Location:** Onboarding > Verify Email
**Flow(s):** 4

### Components
- "Check Your Email" header
- Instruction text: "We sent a verification link to [email]"
- Email icon/illustration
- "Open Email App" button (mobile only)
- "Resend Email" link
- "Change Email" link

### Data Needed
- User email (just registered)

### Actions
- Tap "Open Email App" → Open device email app
- Tap "Resend Email" → Resend verification email
- Tap "Change Email" → Sign Up screen with email pre-filled
- Deep link from email → Verify Phone (if required) or Home Tab

### States
- Default
- Resending
- Resent success
- Error (too many resends)

---

## 8. Verify Phone

**Location:** Onboarding > Verify Phone
**Flow(s):** 4

### Components
- "Verify Phone" header
- Instruction text: "Enter the code sent to [phone]"
- 6-digit code input (auto-advance)
- "Resend Code" link
- "Change Phone Number" link
- Countdown timer for resend

### Data Needed
- User phone number

### Actions
- Enter code → Auto-submit → First-Time Walkthrough
- Tap "Resend Code" → Resend SMS
- Tap "Change Phone Number" → Edit phone modal

### States
- Default
- Loading (verifying)
- Success (verified)
- Error (invalid code, expired)

### Validation
- Code: 6 digits, matches server

---

## 9. First-Time Walkthrough

**Location:** Onboarding > Walkthrough
**Flow(s):** 66

### Components
- Page indicator dots
- Skip button
- Illustration/animation
- Headline text
- Body text
- "Next" button (pages 1-3)
- "Get Started" button (final page)

### Pages
1. "Discover Events" — Browse concerts, sports, shows near you
2. "Buy & Sell Tickets" — Purchase tickets or resell ones you can't use
3. "Easy Entry" — Show your QR code at the door
4. "Set Your Preferences" — Choose your interests (links to Location Preferences)

### Data Needed
- None

### Actions
- Tap "Next" → Next page
- Tap "Skip" → Location Preferences
- Tap "Get Started" → Location Preferences

### States
- Default only

---

## 10. Enable Notifications (App Only)

**Location:** Onboarding > Notifications
**Flow(s):** 66

### Components
- Bell icon/illustration
- "Stay Updated" header
- Instruction text: "Get notified about your tickets, events, and exclusive presales"
- "Enable Notifications" button (primary)
- "Maybe Later" link

### Data Needed
- None

### Actions
- Tap "Enable Notifications" → System permission prompt → Home Tab
- Tap "Maybe Later" → Home Tab

### States
- Default only

### Notes
- Only shown on mobile app
- System permission prompt is OS-controlled

---

# Home Tab Screens

---

## 11. Home Feed

**Location:** Home Tab > Home Feed
**Flow(s):** 11, 54, 55

### Components
- Header with logo, location, notification bell
- Location selector (tap to change)
- Search bar (tap to go to Search tab)
- Featured events carousel
- "Nearby Events" section with horizontal scroll
- "Recommended for You" section (if logged in)
- "Popular in [City]" section
- Event cards (image, name, date, venue, price)
- Pull to refresh

### Data Needed
- User location (or default)
- Featured events array
- Nearby events array
- Recommended events array (if logged in)
- Popular events array

### Actions
- Tap location → Location selector modal
- Tap search bar → Search tab
- Tap notification bell → Notifications (if logged in) or Sign Up Gate
- Tap event card → Event Detail screen
- Tap "See All" on any section → Category Results with filter
- Pull down → Refresh data

### States
- Loading (skeleton)
- Default (with data)
- Error (failed to load)
- Empty (no events nearby)

---

## 12. Featured Events

**Location:** Home Tab > Featured Events
**Flow(s):** 11

### Components
- Back button
- "Featured Events" header
- Event list (vertical)
- Event cards (large format)
- Load more on scroll

### Data Needed
- Featured events array (paginated)

### Actions
- Tap event card → Event Detail screen
- Scroll to bottom → Load more

### States
- Loading
- Default
- Error
- Empty

---

## 13. Nearby Events

**Location:** Home Tab > Nearby Events
**Flow(s):** 54

### Components
- Back button
- "Nearby Events" header
- Distance filter (5mi, 10mi, 25mi, 50mi)
- Map toggle button
- Event list (vertical)
- Event cards with distance shown

### Data Needed
- User location
- Nearby events array (paginated)
- Distance for each event

### Actions
- Tap distance filter → Update results
- Tap map toggle → Map View
- Tap event card → Event Detail screen

### States
- Loading
- Default
- Error
- Empty (no events within distance)
- Location permission denied

---

## 14. Recommendations

**Location:** Home Tab > Recommendations
**Flow(s):** 55

### Components
- Back button
- "Recommended for You" header
- "Based on your interests and history" subheader
- Event list (vertical)
- Event cards with "Why recommended" tag (genre match, artist you follow, etc.)

### Data Needed
- User preferences
- User history
- Recommended events array

### Actions
- Tap event card → Event Detail screen
- Tap "Why recommended" → Show explanation

### States
- Loading
- Default
- Empty (not enough data yet)

### Notes
- Requires logged in user
- Shows Sign Up Gate if guest

---

## 15. Event Detail

**Location:** Home Tab > Event Detail
**Flow(s):** 14, 15, 16, 17, 18, 19, 20, 21, 22

### Components
- Back button
- Share button
- Save/heart button
- Event image (hero)
- Event name
- Event date and time
- Venue name (tappable)
- Artist name(s) (tappable)
- "Get Tickets" button (sticky at bottom)
- Tabs: About, Tickets, Reviews
- **About tab:**
  - Event description
  - Lineup/performers
  - Age restriction badge
  - Accessibility info link
  - Venue info (address, map preview)
  - Parking info
  - Doors open time
- **Tickets tab:**
  - Ticket types list (name, price, availability)
  - "Sold Out" badge if applicable
  - "Join Waitlist" button if sold out
  - Resale tickets section (if available)
- **Reviews tab:**
  - Average rating
  - Rating breakdown (5-star, 4-star, etc.)
  - Review list
  - "Write Review" button (if attended)

### Data Needed
- Event object (full details)
- Venue object
- Artist object(s)
- Ticket types array
- Reviews array
- User's saved events (to show heart state)
- User's following (to show follow state)
- User's past tickets (to show "Write Review")

### Actions
- Tap back → Previous screen
- Tap share → Share Event Modal
- Tap heart → Save event (or Sign Up Gate)
- Tap venue → Venue Info Modal
- Tap artist → Artist Info Modal
- Tap accessibility → Accessibility Info screen
- Tap "Get Tickets" → Select Tickets screen
- Tap ticket type → Select Tickets with type pre-selected
- Tap "Join Waitlist" → Join Waitlist flow (or Sign Up Gate)
- Tap resale ticket → Resale Ticket Detail
- Tap "Write Review" → Write Review screen
- Tap review → Review detail modal

### States
- Loading
- Default
- Error
- Event not found
- Event cancelled
- Event passed

---

## 16. Venue Info Modal

**Location:** Home Tab > Event Detail > Venue Info Modal
**Flow(s):** 15

### Components
- Close button (X)
- Venue image
- Venue name
- Venue type (Concert Hall, Arena, Club, etc.)
- Address
- Map preview (tappable for full map)
- "Get Directions" button
- Capacity info
- Accessibility features list
- Contact info
- Social links
- "View All Events at This Venue" link
- "Follow Venue" button

### Data Needed
- Venue object (full details)
- User's following status

### Actions
- Tap close → Dismiss modal
- Tap map → Open in maps app
- Tap "Get Directions" → Open in maps app
- Tap social link → Open in browser/app
- Tap "View All Events" → Category Results filtered by venue
- Tap "Follow Venue" → Follow (or Sign Up Gate)

### States
- Loading
- Default

---

## 17. Artist Info Modal

**Location:** Home Tab > Event Detail > Artist Info Modal
**Flow(s):** 16

### Components
- Close button (X)
- Artist image
- Artist name
- Genre tags
- Bio/description
- Streaming links (Spotify, Apple Music, etc.)
- Social links
- "View All Events" link
- "Follow Artist" button
- Follower count

### Data Needed
- Artist object (full details)
- User's following status

### Actions
- Tap close → Dismiss modal
- Tap streaming link → Open in streaming app
- Tap social link → Open in browser/app
- Tap "View All Events" → Category Results filtered by artist
- Tap "Follow Artist" → Follow (or Sign Up Gate)

### States
- Loading
- Default

---

## 18. Seating Map

**Location:** Home Tab > Event Detail > Seating Map
**Flow(s):** 17

### Components
- Back button
- "Select Seats" header
- Interactive seating map
- Zoom controls
- Section labels
- Color legend (available, selected, unavailable, accessible)
- Selected seats summary
- Price display
- "Continue" button

### Data Needed
- Seating map configuration
- Available seats
- Seat prices by section
- Accessibility seats

### Actions
- Pinch/zoom → Zoom map
- Tap section → Zoom to section
- Tap seat → Select/deselect seat
- Tap "Continue" → Cart screen

### States
- Loading
- Default
- Error (map failed to load)

### Notes
- Only shown for seated events
- GA events skip this screen

---

## 19. Event Reviews

**Location:** Home Tab > Event Detail > Reviews Tab
**Flow(s):** 18

### Components
- Average rating (large)
- Rating breakdown bars
- Total review count
- Sort dropdown (Most Recent, Highest, Lowest)
- Review list
- Each review: user name, rating, date, text, helpful count
- "Helpful" button on each review
- "Write Review" button (if eligible)
- Load more on scroll

### Data Needed
- Reviews array (paginated)
- User's eligibility to review (attended event)

### Actions
- Tap sort → Change sort order
- Tap "Helpful" → Mark helpful
- Tap "Write Review" → Write Review screen
- Scroll → Load more

### States
- Loading
- Default
- Empty (no reviews yet)

---

## 20. Write Review

**Location:** Home Tab > Write Review
**Flow(s):** 53

### Components
- Back button
- "Write Review" header
- Event name and date (display only)
- Star rating selector (1-5)
- Review text input (multiline)
- Character count
- Photo upload (optional)
- "Submit Review" button

### Data Needed
- Event object
- User's ticket (proof of attendance)

### Actions
- Tap star → Set rating
- Type review → Update text
- Tap add photo → Image picker
- Tap "Submit Review" → Submit → Event Detail with success toast

### States
- Default
- Loading (submitting)
- Success
- Error

### Validation
- Rating: required (1-5)
- Text: optional, max 1000 chars

### Notes
- Only accessible if user attended event
- One review per user per event

---

## 21. Accessibility Info

**Location:** Home Tab > Event Detail > Accessibility Info
**Flow(s):** 62

### Components
- Back button
- "Accessibility" header
- Venue accessibility features list:
  - Wheelchair accessible
  - Accessible parking
  - Accessible restrooms
  - Assistive listening
  - Sign language interpretation
  - Elevator access
  - Service animals welcome
- Accessible seating info
- "Request Accommodations" button
- Contact info for accessibility questions

### Data Needed
- Venue accessibility features
- Event accessibility info

### Actions
- Tap "Request Accommodations" → Request Accommodations screen
- Tap contact → Open email/phone

### States
- Default

---

## 22. Share Event Modal

**Location:** Home Tab > Event Detail > Share Modal
**Flow(s):** 19

### Components
- "Share Event" header
- Event preview card (image, name, date)
- Share options:
  - Copy link
  - Messages
  - Email
  - Facebook
  - Twitter
  - Instagram Stories
  - More (system share sheet)
- Close button

### Data Needed
- Event share URL
- Event preview data

### Actions
- Tap option → Execute share action
- Tap close → Dismiss modal

### States
- Default

---

## 23. Select Tickets

**Location:** Home Tab > Select Tickets
**Flow(s):** 24

### Components
- Back button
- "Select Tickets" header
- Event summary (name, date, venue)
- Ticket types list:
  - Ticket name
  - Price
  - Description (expandable)
  - Quantity selector (+/-)
  - Availability (X remaining)
  - "Sold Out" badge
  - Per-order limit note
- Fee disclosure link
- Order summary (sticky bottom):
  - Tickets selected count
  - Subtotal
  - "Continue" button

### Data Needed
- Event object
- Ticket types array with availability
- Per-order limits

### Actions
- Tap +/- → Adjust quantity
- Tap description → Expand/collapse
- Tap fee disclosure → Show fee breakdown modal
- Tap "Continue" → Select Add-Ons (if available) or Cart

### States
- Loading
- Default
- Error
- All sold out

### Validation
- Quantity: within limits, within availability

---

## 24. Select Seats

**Location:** Home Tab > Select Seats
**Flow(s):** 25

### Components
- Same as Seating Map (Screen 18)

### Notes
- This is the same screen as Seating Map
- Only shown for seated events after selecting ticket type

---

## 25. Select Add-Ons

**Location:** Home Tab > Select Add-Ons
**Flow(s):** 56

### Components
- Back button
- "Add-Ons" header
- Add-ons list:
  - Add-on name
  - Price
  - Description
  - Image (if applicable)
  - Quantity selector or checkbox
  - "Add" button
- Categories (Parking, Merchandise, Food & Drink, etc.)
- "Skip" link
- Order summary (sticky bottom):
  - Items count
  - Subtotal
  - "Continue" button

### Data Needed
- Available add-ons for event
- Add-on categories

### Actions
- Tap "Add" → Add to order
- Tap "Skip" → Cart
- Tap "Continue" → Cart

### States
- Loading
- Default
- No add-ons available (skip screen)

---

## 26. Enter Presale Code Modal

**Location:** Home Tab > Enter Presale Code
**Flow(s):** 58

### Components
- Close button
- "Enter Presale Code" header
- Code input
- "Apply" button
- Error message area
- "Don't have a code?" help link

### Data Needed
- Event presale configuration

### Actions
- Enter code → Enable "Apply"
- Tap "Apply" → Validate → Unlock presale tickets
- Tap close → Dismiss modal

### States
- Default
- Loading (validating)
- Success (code valid)
- Error (invalid code, expired, already used)

---

## 27. Cart

**Location:** Home Tab > Cart
**Flow(s):** 26

### Components
- Back button
- "Your Order" header
- Event summary (name, date, venue)
- Cart items list:
  - Ticket type × quantity
  - Add-ons × quantity
  - Price per item
  - Remove button
- "Add Promo Code" link
- Price breakdown:
  - Subtotal
  - Fees
  - Promo discount (if applied)
  - Total
- Timer (if tickets are held)
- "Checkout" button

### Data Needed
- Cart contents
- Pricing details
- Applied promo code
- Hold timer

### Actions
- Tap remove → Remove item
- Tap "Add Promo Code" → Enter Promo Code Modal
- Tap "Checkout" → Checkout screen (or Sign Up Gate)

### States
- Default
- Empty cart
- Timer expired

### Notes
- If timer expires, show modal and return to Event Detail

---

## 28. Enter Promo Code Modal

**Location:** Home Tab > Cart > Promo Code Modal
**Flow(s):** 27

### Components
- Close button
- "Promo Code" header
- Code input
- "Apply" button
- Error message area

### Data Needed
- Event promo codes

### Actions
- Enter code → Enable "Apply"
- Tap "Apply" → Validate → Apply discount
- Tap close → Dismiss modal

### States
- Default
- Loading (validating)
- Success (discount applied)
- Error (invalid, expired, not applicable)

---

## 29. Checkout

**Location:** Home Tab > Checkout
**Flow(s):** 28

### Components
- Back button
- "Checkout" header
- Order summary (collapsed, expandable)
- Contact info section:
  - Email (pre-filled if logged in)
  - Phone (pre-filled if logged in)
- Payment method section:
  - Saved cards list
  - "Add new card" option
  - Apple Pay / Google Pay buttons
- Billing address section (if required)
- Terms checkbox: "I agree to the Terms of Service and Refund Policy"
- "Place Order" button
- Price breakdown:
  - Subtotal
  - Fees
  - Discount
  - Total

### Data Needed
- Cart contents
- User profile (email, phone)
- Saved payment methods
- Billing address

### Actions
- Tap order summary → Expand/collapse
- Tap saved card → Select payment method
- Tap "Add new card" → Payment screen
- Tap Apple Pay → Apple Pay flow
- Tap Google Pay → Google Pay flow
- Tap terms link → Terms of Service
- Tap "Place Order" → Process payment → Order Confirmation

### States
- Default
- Loading (processing)
- Error (payment failed)

### Validation
- Contact info: required
- Payment method: required
- Terms: must be checked

---

## 30. Payment

**Location:** Home Tab > Payment
**Flow(s):** 28

### Components
- Back button
- "Add Payment Method" header
- Card number input
- Expiry input
- CVC input
- Cardholder name input
- Billing zip code input
- "Save card for future purchases" checkbox
- "Add Card" button

### Data Needed
- None (new card entry)

### Actions
- Enter card details → Validate in real-time
- Tap "Add Card" → Validate → Return to Checkout with card selected

### States
- Default
- Loading (validating)
- Error (invalid card)

### Validation
- Card number: valid format, Luhn check
- Expiry: valid, not expired
- CVC: 3-4 digits
- Name: required
- Zip: required

### Notes
- Uses Stripe Elements or similar for PCI compliance

---

## 31. Order Confirmation

**Location:** Home Tab > Order Confirmation
**Flow(s):** 29

### Components
- Success icon/animation
- "You're Going!" header
- Event image
- Event name, date, venue
- Order number
- Ticket summary (type × quantity)
- "View Tickets" button (primary)
- "Add to Calendar" button
- "Share with Friends" link
- "Confirmation email sent to [email]" note

### Data Needed
- Order object
- Event object
- Tickets array

### Actions
- Tap "View Tickets" → Tickets Tab > Ticket Detail
- Tap "Add to Calendar" → Add to device calendar
- Tap "Share with Friends" → Share Event Modal

### States
- Default only

### Notes
- No back button (can't go back to checkout)
- Can navigate away via tabs

---

## 32. Sign Up Gate Modal

**Location:** Any screen (modal overlay)
**Flow(s):** Various

### Components
- Close button
- Illustration
- "Create Account to Continue" header
- Explanation text (varies by action):
  - "Sign up to purchase tickets"
  - "Sign up to save events"
  - "Sign up to follow artists"
  - etc.
- "Create Account" button (primary)
- "Log In" link
- "Continue as Guest" link (if applicable)

### Data Needed
- Action that triggered the gate

### Actions
- Tap "Create Account" → Sign Up screen
- Tap "Log In" → Log In screen
- Tap "Continue as Guest" → Dismiss (if allowed)
- Tap close → Dismiss and cancel action

### States
- Default

---

# Search Tab Screens

---

## 33. Search

**Location:** Search Tab
**Flow(s):** 12

### Components
- Search input (auto-focus)
- Cancel button
- Recent searches list
- Trending searches list
- Search suggestions (as typing)

### Data Needed
- User's recent searches
- Trending searches
- Search suggestions (from API)

### Actions
- Type → Show suggestions
- Tap suggestion → Search Results
- Tap recent search → Search Results
- Tap trending → Search Results
- Tap Cancel → Clear and show default state

### States
- Default (recent + trending)
- Typing (suggestions)
- No suggestions

---

## 34. Search Results

**Location:** Search Tab > Search Results
**Flow(s):** 12

### Components
- Back button
- Search input (with query)
- Filter button (with active filter count)
- Sort dropdown (Relevance, Date, Price)
- Results tabs: All, Events, Artists, Venues
- Results list:
  - Event cards
  - Artist cards
  - Venue cards
- Results count
- Load more on scroll

### Data Needed
- Search query
- Search results (events, artists, venues)
- Active filters

### Actions
- Tap filter → Filter Modal
- Tap sort → Change sort order
- Tap tab → Filter results type
- Tap event → Event Detail
- Tap artist → Artist Profile
- Tap venue → Venue Profile
- Scroll → Load more

### States
- Loading
- Default
- No results
- Error

---

## 35. Filter Modal

**Location:** Search Tab > Filter Modal
**Flow(s):** 13

### Components
- Close button
- "Filters" header
- Reset link
- Filter sections:
  - Date range (Today, This Weekend, This Week, This Month, Custom)
  - Price range (slider)
  - Category (Music, Sports, Comedy, Theater, etc.)
  - Distance (if location enabled)
  - Accessibility options
- "Apply Filters" button
- Active filter count

### Data Needed
- Current filters
- Filter options

### Actions
- Select filter → Update selection
- Tap Reset → Clear all filters
- Tap "Apply Filters" → Apply and dismiss
- Tap close → Dismiss without applying

### States
- Default

---

## 36. Category Results

**Location:** Search Tab > Category Results
**Flow(s):** 11

### Components
- Back button
- Category header (e.g., "Music", "Sports")
- Subcategory tabs (e.g., "Rock", "Hip Hop", "Country" for Music)
- Filter button
- Sort dropdown
- Event list
- Load more on scroll

### Data Needed
- Category
- Subcategories
- Events in category

### Actions
- Tap subcategory → Filter results
- Tap filter → Filter Modal
- Tap sort → Change sort
- Tap event → Event Detail

### States
- Loading
- Default
- Empty
- Error

---

## 37. Map View

**Location:** Search Tab > Map View
**Flow(s):** 54

### Components
- Back button
- Search input
- Map (full screen)
- Event pins on map
- Current location button
- List toggle button
- Event preview card (when pin selected)

### Data Needed
- User location
- Events with coordinates

### Actions
- Tap pin → Show event preview card
- Tap event card → Event Detail
- Tap current location → Center on user
- Tap list toggle → Return to list view
- Drag/zoom map → Load events in view

### States
- Loading
- Default
- No events in view
- Location denied

---

# Tickets Tab Screens

---

## 38. Ticket List

**Location:** Tickets Tab
**Flow(s):** 33

### Components
- "My Tickets" header
- Tabs: Upcoming, Past
- Ticket cards:
  - Event image
  - Event name
  - Date and time
  - Venue
  - Ticket count badge
  - Days until event badge (upcoming)
- Empty state per tab
- Pull to refresh

### Data Needed
- User's tickets (grouped by event)
- Event details for each

### Actions
- Tap tab → Switch view
- Tap ticket card → Ticket Detail
- Pull down → Refresh

### States
- Loading
- Default
- Empty (no tickets)

### Notes
- Requires login (Sign Up Gate if guest)

---

## 39. Ticket Detail

**Location:** Tickets Tab > Ticket Detail
**Flow(s):** 34

### Components
- Back button
- Share button
- Event image (hero)
- Event name
- Date and time
- Venue (tappable)
- Countdown to event
- Ticket info:
  - Ticket type
  - Seat/section (if assigned)
  - Barcode/QR code (tappable for fullscreen)
  - Ticket holder name
- Action buttons:
  - "Add to Wallet" (app only)
  - "Transfer Ticket"
  - "Sell Ticket"
- Event details:
  - Doors open time
  - Address
  - Parking info
  - "Get Directions" button
- "Contact Support" link

### Data Needed
- Ticket object
- Event object
- Venue object

### Actions
- Tap share → Share ticket
- Tap QR code → QR Code Fullscreen
- Tap venue → Venue Info Modal
- Tap "Add to Wallet" → Add to Wallet flow
- Tap "Transfer Ticket" → Transfer Ticket screen
- Tap "Sell Ticket" → List Ticket for Sale
- Tap "Get Directions" → Open maps
- Tap "Contact Support" → Contact Event Support

### States
- Loading
- Default
- Ticket transferred (show transfer status)
- Ticket listed for sale (show listing status)
- Event passed

---

## 40. QR Code Fullscreen

**Location:** Tickets Tab > QR Code Fullscreen
**Flow(s):** 34

### Components
- Close button
- Event name
- Ticket type
- Seat/section (if assigned)
- QR code (large, centered)
- Brightness auto-increase
- Ticket holder name
- "Screenshot saved" prevention note

### Data Needed
- Ticket QR code data

### Actions
- Tap close → Return to Ticket Detail

### States
- Default

### Notes
- Increase screen brightness automatically
- Prevent screenshots if possible (OS-dependent)

---

## 41. Add to Wallet

**Location:** Tickets Tab > Add to Wallet
**Flow(s):** 35

### Components
- This is a system flow (Apple Wallet / Google Wallet)

### Actions
- Tap "Add to Wallet" on Ticket Detail → System prompt → Ticket added

### Notes
- App only (not web)
- Uses PassKit (iOS) or Google Wallet API (Android)

---

## 42. Transfer Ticket

**Location:** Tickets Tab > Transfer Ticket
**Flow(s):** 36

### Components
- Back button
- "Transfer Ticket" header
- Ticket summary (event, type, seat)
- Recipient input:
  - Email input
  - Or phone input
  - Or select from contacts
- Personal message input (optional)
- Transfer note: "Recipient will receive an email to claim this ticket"
- Warning: "This action cannot be undone"
- "Transfer" button

### Data Needed
- Ticket object
- User's contacts (if permitted)

### Actions
- Enter recipient → Validate
- Tap contacts → Select from contacts
- Tap "Transfer" → Confirm → Transfer Confirmation

### States
- Default
- Loading (processing)
- Error (invalid recipient, already transferred)

### Validation
- Recipient: valid email or phone

---

## 43. Transfer Confirmation

**Location:** Tickets Tab > Transfer Confirmation
**Flow(s):** 36

### Components
- Success icon
- "Ticket Transferred!" header
- Ticket summary
- "Sent to [email/phone]" message
- "Done" button

### Data Needed
- Transfer details

### Actions
- Tap "Done" → Return to Ticket List

### States
- Default

---

## 44. Transfer History

**Location:** Tickets Tab > Transfer History
**Flow(s):** 37

### Components
- Back button
- "Transfer History" header
- Transfer list:
  - Event name
  - Ticket type
  - Direction (Sent / Received)
  - Recipient/sender
  - Date
  - Status (Completed, Pending, Cancelled)
- Empty state

### Data Needed
- User's transfer history

### Actions
- Tap transfer → Transfer detail (or just expand inline)

### States
- Loading
- Default
- Empty

---

## 45. Receive Transfer

**Location:** Deep link → Receive Transfer
**Flow(s):** 38

### Components
- Event image
- "You've Received a Ticket!" header
- Event name, date, venue
- Ticket type
- "From [sender name]" note
- Personal message (if included)
- "Accept Ticket" button
- "Decline" link

### Data Needed
- Transfer object
- Event object

### Actions
- Tap "Accept Ticket" → Add to My Tickets → Ticket Detail
- Tap "Decline" → Decline transfer → Confirmation

### States
- Default
- Loading (accepting)
- Already claimed
- Expired
- Declined

### Notes
- Accessed via deep link from email/SMS
- Requires login (or Sign Up) to accept

---

## 46. Order History

**Location:** Tickets Tab > Order History
**Flow(s):** 30

### Components
- Back button
- "Order History" header
- Order list:
  - Order number
  - Event name
  - Date
  - Total
  - Status (Completed, Refunded, Cancelled)
- Load more on scroll

### Data Needed
- User's orders (paginated)

### Actions
- Tap order → Order Detail

### States
- Loading
- Default
- Empty

---

## 47. Order Detail

**Location:** Tickets Tab > Order Detail
**Flow(s):** 31

### Components
- Back button
- "Order Details" header
- Order number
- Order date
- Order status
- Event summary (name, date, venue)
- Items list:
  - Ticket type × quantity × price
  - Add-ons × quantity × price
- Price breakdown:
  - Subtotal
  - Fees
  - Discount
  - Total
- Payment method (last 4 digits)
- Receipt link ("View Receipt")
- "Request Refund" button (if eligible)
- "Contact Support" link

### Data Needed
- Order object (full details)

### Actions
- Tap "View Receipt" → Open receipt PDF
- Tap "Request Refund" → Request Refund screen
- Tap "Contact Support" → Contact Event Support

### States
- Loading
- Default

---

## 48. Request Refund

**Location:** Tickets Tab > Request Refund
**Flow(s):** 32

### Components
- Back button
- "Request Refund" header
- Order summary
- Refund policy display
- Refund eligibility status
- If eligible:
  - Select items to refund
  - Refund amount preview
  - Reason dropdown
  - Additional notes input
  - "Submit Request" button
- If not eligible:
  - Explanation
  - "Contact Support" link

### Data Needed
- Order object
- Refund policy
- Eligibility status

### Actions
- Select items → Update refund amount
- Tap "Submit Request" → Submit → Confirmation
- Tap "Contact Support" → Contact Support

### States
- Default
- Loading (submitting)
- Success (request submitted)
- Error

---

## 49. Saved Events

**Location:** Tickets Tab > Saved Events
**Flow(s):** 23

### Components
- Back button
- "Saved Events" header
- Saved events list:
  - Event card (image, name, date, venue)
  - Remove (heart) button
- Empty state

### Data Needed
- User's saved events

### Actions
- Tap event → Event Detail
- Tap heart → Remove from saved

### States
- Loading
- Default
- Empty

---

## 50. Waitlist Status

**Location:** Tickets Tab > Waitlist Status
**Flow(s):** 57

### Components
- Back button
- "Waitlists" header
- Waitlist items:
  - Event card
  - Position in waitlist
  - Ticket type requested
  - Date joined
  - Status (Waiting, Offer Available, Expired)
  - "Leave Waitlist" button
- If offer available:
  - "Complete Purchase" button
  - Offer expiry countdown

### Data Needed
- User's waitlist entries

### Actions
- Tap event → Event Detail
- Tap "Leave Waitlist" → Confirm → Remove
- Tap "Complete Purchase" → Checkout

### States
- Loading
- Default
- Empty

---

## 51. Contact Event Support

**Location:** Tickets Tab > Contact Event Support
**Flow(s):** 70

### Components
- Back button
- "Event Support" header
- Event summary (name, date)
- Issue type dropdown:
  - Ticket not received
  - Wrong ticket
  - Can't access ticket
  - Event question
  - Accessibility request
  - Other
- Description input
- Attach photos (optional)
- "Submit" button

### Data Needed
- Event object
- User's tickets for event

### Actions
- Select issue type → Update form
- Tap "Submit" → Submit → Confirmation

### States
- Default
- Loading (submitting)
- Success
- Error

---

# Sell Tab Screens

---

## 52. My Listings

**Location:** Sell Tab
**Flow(s):** 40

### Components
- "My Listings" header
- Tabs: Active, Sold, Expired
- Listing cards:
  - Event image
  - Event name and date
  - Ticket type
  - Listing price
  - Status badge
  - Views count
- "List a Ticket" button (FAB or header)
- Empty state per tab

### Data Needed
- User's resale listings

### Actions
- Tap tab → Switch view
- Tap listing → Listing Detail
- Tap "List a Ticket" → List Ticket for Sale

### States
- Loading
- Default
- Empty

### Notes
- Requires login
- Requires Stripe Connect setup to list

---

## 53. Listing Detail

**Location:** Sell Tab > Listing Detail
**Flow(s):** 40

### Components
- Back button
- Event image (hero)
- Event name and date
- Venue
- Ticket type
- Seat/section (if applicable)
- Listing status badge
- Listing price
- Your payout (after fees)
- Fee breakdown
- Stats:
  - Views
  - Saves
  - Days listed
- Action buttons:
  - "Edit Price" (if active)
  - "Remove Listing" (if active)
- If sold:
  - Sold date
  - Payout status

### Data Needed
- Listing object
- Stats

### Actions
- Tap "Edit Price" → Edit Listing
- Tap "Remove Listing" → Remove Listing Modal

### States
- Loading
- Default (active)
- Sold
- Expired

---

## 54. Listing Stats

**Location:** Sell Tab > Listing Stats
**Flow(s):** 69

### Components
- Back button
- "Listing Stats" header
- Stats summary:
  - Total views
  - Unique viewers
  - Saves/favorites
  - Days listed
- Views over time chart
- Comparison to similar listings
- Price suggestion (if applicable)

### Data Needed
- Listing stats

### Actions
- View only

### States
- Loading
- Default

---

## 55. Edit Listing

**Location:** Sell Tab > Edit Listing
**Flow(s):** 41

### Components
- Back button
- "Edit Listing" header
- Current price display
- New price input
- Price rules reminder (min/max if set by venue)
- Your payout preview
- "Save Changes" button

### Data Needed
- Listing object
- Event resale rules

### Actions
- Enter price → Update payout preview
- Tap "Save Changes" → Save → Return to Listing Detail

### States
- Default
- Loading (saving)
- Error (price out of range)

### Validation
- Price: within venue min/max rules

---

## 56. Remove Listing Modal

**Location:** Sell Tab > Remove Listing Modal
**Flow(s):** 42

### Components
- "Remove Listing?" header
- Warning text: "Your ticket will be removed from the marketplace"
- "Remove" button (destructive)
- "Cancel" button

### Data Needed
- Listing object

### Actions
- Tap "Remove" → Remove listing → Return to My Listings
- Tap "Cancel" → Dismiss modal

### States
- Default
- Loading (removing)

---

## 57. List Ticket for Sale

**Location:** Sell Tab > List Ticket for Sale
**Flow(s):** 39

### Components
- Back button
- "Sell a Ticket" header
- If no Stripe account:
  - "Set up payouts first" message
  - "Set Up" button → Set Up Seller Account
- If Stripe connected:
  - Available tickets list (tickets not already listed)
  - "Select ticket to sell" instruction

### Data Needed
- User's sellable tickets
- Stripe Connect status

### Actions
- Tap ticket → Select Ticket to Sell

### States
- Loading
- Default (with tickets)
- No sellable tickets
- Stripe not connected

---

## 58. Select Ticket to Sell

**Location:** Sell Tab > Select Ticket to Sell
**Flow(s):** 39

### Components
- Back button
- "Select Ticket" header
- Ticket cards:
  - Event name and date
  - Ticket type
  - Seat/section
  - Face value
- "Continue" button (after selection)

### Data Needed
- User's sellable tickets

### Actions
- Tap ticket → Select
- Tap "Continue" → Set Resale Price

### States
- Default

---

## 59. Set Resale Price

**Location:** Sell Tab > Set Resale Price
**Flow(s):** 39

### Components
- Back button
- "Set Your Price" header
- Ticket summary (event, type, seat)
- Face value display
- Price input
- Price rules (if venue set min/max):
  - "Minimum: $X"
  - "Maximum: $X"
- Breakdown:
  - Your price
  - Platform fee (X%)
  - Your payout
- Suggested price (based on demand)
- "Continue" button

### Data Needed
- Ticket object
- Event resale rules
- Market data (for suggestion)

### Actions
- Enter price → Update breakdown
- Tap "Continue" → Confirm Listing

### States
- Default
- Error (price out of range)

### Validation
- Price: positive number, within rules

---

## 60. Confirm Listing

**Location:** Sell Tab > Confirm Listing
**Flow(s):** 39

### Components
- Back button
- "Confirm Listing" header
- Listing summary:
  - Event
  - Ticket type
  - Seat/section
  - Your price
  - Your payout
- Terms checkbox: "I agree to the Resale Terms"
- Note: "Your ticket will be transferred to buyer upon sale"
- "List for Sale" button

### Data Needed
- Listing preview

### Actions
- Check terms → Enable button
- Tap "List for Sale" → Create listing → Success screen

### States
- Default
- Loading (creating)
- Success
- Error

---

## 61. Resale Marketplace

**Location:** Sell Tab > Resale Marketplace
**Flow(s):** 43

### Components
- Back button
- "Resale Tickets" header
- Search input
- Filter button
- Event list with resale tickets:
  - Event card
  - "X tickets available" badge
  - Price range
- Empty state

### Data Needed
- Events with resale tickets

### Actions
- Tap search → Search
- Tap filter → Filter Modal
- Tap event → Event Detail (resale tab)

### States
- Loading
- Default
- Empty

### Notes
- Also accessible from Home/Search

---

## 62. Resale Ticket Detail

**Location:** Sell Tab > Resale Ticket Detail
**Flow(s):** 44

### Components
- Back button
- Event image
- Event name and date
- Venue
- Ticket info:
  - Ticket type
  - Section/seat (if assigned)
  - Seller's listing price
- Price breakdown:
  - Ticket price
  - Fees
  - Total
- Buyer protection note
- "Buy Now" button

### Data Needed
- Listing object
- Event object

### Actions
- Tap "Buy Now" → Buy Resale Ticket

### States
- Loading
- Default
- Sold (listing no longer available)

---

## 63. Buy Resale Ticket

**Location:** Sell Tab > Buy Resale Ticket
**Flow(s):** 45

### Components
- Same as Checkout (Screen 29) but for resale ticket
- Additional resale terms acceptance

### Notes
- Uses same checkout flow as primary sales

---

## 64. Seller Account Settings

**Location:** Sell Tab > Seller Account Settings
**Flow(s):** 72

### Components
- Back button
- "Seller Account" header
- Stripe Connect status
- Bank account:
  - Account name
  - Last 4 digits
  - "Change" button
- Payout schedule display
- "View Payout History" link
- Tax info:
  - 1099 status
  - Tax form link

### Data Needed
- Stripe Connect account
- Payout settings

### Actions
- Tap "Change" → Edit Bank Account
- Tap "View Payout History" → Payout History

### States
- Loading
- Default
- Not connected (show setup)

---

## 65. Set Up Seller Account (Stripe Connect)

**Location:** Sell Tab > Set Up Seller Account
**Flow(s):** 71

### Components
- Back button
- "Set Up Payouts" header
- Explanation: "Connect your bank account to receive payouts when your tickets sell"
- Benefits list:
  - "Get paid within X days of sale"
  - "Secure payments via Stripe"
- "Connect Bank Account" button
- Stripe Connect onboarding flow (hosted by Stripe)

### Data Needed
- None (starts Stripe Connect flow)

### Actions
- Tap "Connect Bank Account" → Stripe Connect onboarding → Return to app

### States
- Default
- Stripe Connect in progress
- Success (connected)
- Error

### Notes
- Uses Stripe Connect Express or Standard

---

## 66. Payout History

**Location:** Sell Tab > Payout History
**Flow(s):** 72

### Components
- Back button
- "Payout History" header
- Payout list:
  - Date
  - Amount
  - Status (Pending, Completed, Failed)
  - Related sale
- Empty state

### Data Needed
- User's payouts

### Actions
- Tap payout → Expand details

### States
- Loading
- Default
- Empty

---

# Profile Tab Screens

---

## 67. My Profile

**Location:** Profile Tab
**Flow(s):** 5

### Components
- Profile photo
- User name
- Email
- "Edit Profile" button
- Stats:
  - Events attended
  - Followers (if social features)
- Menu list:
  - Account Settings
  - Payment Methods
  - Following
  - NFT Collection
  - Accessibility
  - Support
  - Legal
  - Log Out

### Data Needed
- User profile
- User stats

### Actions
- Tap "Edit Profile" → Edit Profile
- Tap menu item → Navigate to section

### States
- Loading
- Default

---

## 68. Edit Profile

**Location:** Profile Tab > Edit Profile
**Flow(s):** 5

### Components
- Back button
- "Edit Profile" header
- Profile photo (tap to change)
- Name input
- Email (display only or tap to change with verification)
- Phone input
- "Save" button

### Data Needed
- User profile

### Actions
- Tap photo → Image picker
- Edit fields → Enable save
- Tap "Save" → Save changes

### States
- Default
- Loading (saving)
- Success
- Error

---

## 69. Account Settings

**Location:** Profile Tab > Account Settings
**Flow(s):** 5, 6, 7, 8

### Components
- Back button
- "Account Settings" header
- Settings list:
  - Change Password
  - Two-Factor Authentication
  - Linked Accounts
  - Location Preferences
  - Interest Preferences
  - Notification Settings

### Data Needed
- User settings

### Actions
- Tap setting → Navigate to setting screen

### States
- Default

---

## 70. Change Password

**Location:** Profile Tab > Change Password
**Flow(s):** 6

### Components
- Back button
- "Change Password" header
- Current password input
- New password input
- Confirm new password input
- Password requirements list
- "Update Password" button

### Data Needed
- None

### Actions
- Tap "Update Password" → Validate → Success toast

### States
- Default
- Loading
- Success
- Error (wrong current password)

### Validation
- Current password: required
- New password: min 8 chars, 1 uppercase, 1 number
- Confirm: matches new password

---

## 71. Enable 2FA

**Location:** Profile Tab > Enable 2FA
**Flow(s):** 51

### Components
- Back button
- "Two-Factor Authentication" header
- Current status (Enabled/Disabled)
- Explanation text
- If disabled:
  - "Enable 2FA" button
- If enabled:
  - Method display (SMS/Authenticator)
  - "Disable 2FA" button
  - "View Backup Codes" button

### Data Needed
- User 2FA status

### Actions
- Tap "Enable 2FA" → 2FA Setup
- Tap "Disable 2FA" → Confirm → Disable
- Tap "View Backup Codes" → Show codes

### States
- Default (disabled)
- Default (enabled)

---

## 72. 2FA Setup

**Location:** Profile Tab > 2FA Setup
**Flow(s):** 51

### Components
- Back button
- "Set Up 2FA" header
- Method selection:
  - SMS (to phone number)
  - Authenticator app
- If SMS:
  - Phone number display
  - "Send Code" button
  - Code input
  - "Verify" button
- If Authenticator:
  - QR code display
  - Manual code display
  - Code input
  - "Verify" button
- Backup codes display (after setup)
- "Download Backup Codes" button

### Data Needed
- User phone
- 2FA setup secret

### Actions
- Select method → Show method setup
- Complete verification → Show backup codes

### States
- Method selection
- SMS verification
- Authenticator setup
- Backup codes

---

## 73. Link Social Accounts

**Location:** Profile Tab > Link Social Accounts
**Flow(s):** 52

### Components
- Back button
- "Linked Accounts" header
- Account list:
  - Google (Connected/Not Connected)
  - Apple (Connected/Not Connected)
  - Facebook (Connected/Not Connected)
- Connect/Disconnect buttons for each

### Data Needed
- User's linked accounts

### Actions
- Tap "Connect" → OAuth flow → Connected
- Tap "Disconnect" → Confirm → Disconnected

### States
- Default

---

## 74. Payment Methods

**Location:** Profile Tab > Payment Methods
**Flow(s):** 7

### Components
- Back button
- "Payment Methods" header
- Saved cards list:
  - Card brand icon
  - Last 4 digits
  - Expiry
  - Default badge
  - "Set as Default" option
  - "Remove" button
- "Add Payment Method" button

### Data Needed
- User's saved payment methods

### Actions
- Tap "Set as Default" → Set default
- Tap "Remove" → Confirm → Remove
- Tap "Add Payment Method" → Add Payment Method

### States
- Loading
- Default
- Empty

---

## 75. Add Payment Method

**Location:** Profile Tab > Add Payment Method
**Flow(s):** 7

### Components
- Same as Payment screen (Screen 30)

---

## 76. Location Preferences

**Location:** Profile Tab > Location Preferences
**Flow(s):** 67

### Components
- Back button
- "Location" header
- Current location display
- "Use Current Location" button
- Search input for city/zip
- Recent locations list
- "Save" button

### Data Needed
- User's location preference
- Device location (if permitted)

### Actions
- Tap "Use Current Location" → Request permission → Set location
- Search city → Select from results
- Tap "Save" → Save preference

### States
- Default
- Location permission prompt

---

## 77. Interest Preferences

**Location:** Profile Tab > Interest Preferences
**Flow(s):** 68

### Components
- Back button
- "Interests" header
- Category list with checkboxes:
  - Music (with subcategories)
  - Sports
  - Comedy
  - Theater
  - Festivals
  - etc.
- "Save" button

### Data Needed
- Available categories
- User's selected interests

### Actions
- Tap category → Toggle selection
- Tap subcategory → Toggle selection
- Tap "Save" → Save preferences

### States
- Default
- Loading (saving)

---

## 78. Notification Settings

**Location:** Profile Tab > Notification Settings
**Flow(s):** 8, 47

### Components
- Back button
- "Notifications" header
- Push notifications toggle (app only)
- Email notifications toggle
- SMS notifications toggle
- Notification types:
  - Order confirmations
  - Event reminders
  - Price drops on saved events
  - New events from followed artists/venues
  - Resale listing updates
  - Marketing/promotions
- Toggle for each type

### Data Needed
- User's notification preferences

### Actions
- Toggle setting → Save immediately

### States
- Default

---

## 79. Following Artists

**Location:** Profile Tab > Following Artists
**Flow(s):** 20

### Components
- Back button
- "Following Artists" header
- Artist list:
  - Artist image
  - Artist name
  - Genre
  - "Following" button (to unfollow)
- Empty state

### Data Needed
- User's followed artists

### Actions
- Tap artist → Artist Profile
- Tap "Following" → Unfollow

### States
- Loading
- Default
- Empty

---

## 80. Following Venues

**Location:** Profile Tab > Following Venues
**Flow(s):** 21

### Components
- Back button
- "Following Venues" header
- Venue list:
  - Venue image
  - Venue name
  - Location
  - "Following" button (to unfollow)
- Empty state

### Data Needed
- User's followed venues

### Actions
- Tap venue → Venue Profile
- Tap "Following" → Unfollow

### States
- Loading
- Default
- Empty

---

## 81. Artist Profile

**Location:** Profile Tab > Artist Profile
**Flow(s):** 16, 20

### Components
- Back button
- Share button
- Artist image (hero)
- Artist name
- Genre tags
- "Follow" / "Following" button
- Follower count
- Tabs: Events, About
- **Events tab:**
  - Upcoming events list
  - Past events list
- **About tab:**
  - Bio
  - Streaming links
  - Social links

### Data Needed
- Artist object
- Artist's events
- User's following status

### Actions
- Tap "Follow" → Follow artist
- Tap event → Event Detail
- Tap streaming link → Open app
- Tap social link → Open browser

### States
- Loading
- Default

---

## 82. Venue Profile

**Location:** Profile Tab > Venue Profile
**Flow(s):** 15, 21

### Components
- Back button
- Share button
- Venue image (hero)
- Venue name
- Location
- "Follow" / "Following" button
- Follower count
- Tabs: Events, About
- **Events tab:**
  - Upcoming events list
  - Past events list
- **About tab:**
  - Description
  - Address with map
  - Capacity
  - Accessibility features
  - Contact info

### Data Needed
- Venue object
- Venue's events
- User's following status

### Actions
- Tap "Follow" → Follow venue
- Tap event → Event Detail
- Tap address → Open maps

### States
- Loading
- Default

---

## 83. NFT Collection

**Location:** Profile Tab > NFT Collection
**Flow(s):** 59

### Components
- Back button
- "My Collection" header
- NFT grid:
  - NFT image
  - Event name
  - Date
- Filter by year
- Empty state

### Data Needed
- User's NFT tickets

### Actions
- Tap NFT → NFT Detail

### States
- Loading
- Default
- Empty

---

## 84. NFT Detail

**Location:** Profile Tab > NFT Detail
**Flow(s):** 60

### Components
- Back button
- Share button
- NFT image (large)
- Event name
- Event date
- Venue
- Ticket type
- Token ID
- Blockchain info
- "View on Explorer" link
- "Share NFT" button

### Data Needed
- NFT object

### Actions
- Tap "View on Explorer" → Open blockchain explorer
- Tap "Share NFT" → Share sheet

### States
- Loading
- Default

---

## 85. Accessibility Settings

**Location:** Profile Tab > Accessibility
**Flow(s):** 62

### Components
- Back button
- "Accessibility" header
- Saved preferences:
  - Wheelchair accessible seating
  - Assistive listening
  - Sign language interpretation
  - Service animal
  - Other needs (text)
- "Save" button
- "Request Accommodations" link (for specific event)

### Data Needed
- User's accessibility preferences

### Actions
- Update preferences → Save
- Tap "Request Accommodations" → Request Accommodations

### States
- Default

---

## 86. Request Accommodations

**Location:** Profile Tab > Request Accommodations
**Flow(s):** 61

### Components
- Back button
- "Request Accommodations" header
- Event selector (if not from specific event)
- Accommodation types (checkboxes):
  - Wheelchair accessible seating
  - Companion seat
  - Assistive listening device
  - Sign language interpreter
  - Service animal
  - Other
- Details input (if "Other")
- Contact preference (email/phone)
- "Submit Request" button

### Data Needed
- User's upcoming events (for selector)
- User's accessibility preferences (pre-fill)

### Actions
- Select event → Update form
- Select accommodations → Update form
- Tap "Submit Request" → Submit → Confirmation

### States
- Default
- Loading (submitting)
- Success
- Error

---

## 87. Help Center

**Location:** Profile Tab > Help Center
**Flow(s):** 49

### Components
- Back button
- "Help Center" header
- Search input
- FAQ categories:
  - Getting Started
  - Buying Tickets
  - My Tickets
  - Selling Tickets
  - Transfers
  - Refunds
  - Account
- Popular articles list
- "Contact Support" button

### Data Needed
- FAQ categories
- Popular articles

### Actions
- Tap search → Search Help
- Tap category → Category articles list
- Tap article → Help Article
- Tap "Contact Support" → Contact Support

### States
- Loading
- Default

---

## 88. Search Help

**Location:** Profile Tab > Search Help
**Flow(s):** 49

### Components
- Back button
- Search input (auto-focus)
- Search results list
- "No results" state with "Contact Support" link

### Data Needed
- Search query
- Search results

### Actions
- Type → Search
- Tap result → Help Article
- Tap "Contact Support" → Contact Support

### States
- Default (empty)
- Results
- No results

---

## 89. Help Article

**Location:** Profile Tab > Help Article
**Flow(s):** 49

### Components
- Back button
- Article title
- Article content (rich text)
- "Was this helpful?" feedback
- Related articles
- "Still need help? Contact Support" link

### Data Needed
- Article object

### Actions
- Tap helpful → Submit feedback
- Tap related article → Help Article
- Tap "Contact Support" → Contact Support

### States
- Loading
- Default

---

## 90. Contact Support

**Location:** Profile Tab > Contact Support
**Flow(s):** 48

### Components
- Back button
- "Contact Support" header
- Contact options:
  - Live Chat (if available)
  - Email Support
  - Phone (if available)
- Issue type selector
- Description input
- Attach screenshots (optional)
- "Submit" button

### Data Needed
- Support availability
- User's recent orders (for context)

### Actions
- Tap "Live Chat" → Live Chat
- Tap "Email" → Submit email ticket
- Tap "Phone" → Open dialer
- Tap "Submit" → Submit ticket

### States
- Default
- Loading (submitting)
- Success

---

## 91. Live Chat

**Location:** Profile Tab > Live Chat
**Flow(s):** 48

### Components
- Back button / close button
- "Support Chat" header
- Chat messages:
  - User messages (right)
  - Agent messages (left)
  - Timestamps
  - Typing indicator
- Message input
- Send button
- Attach image button
- "End Chat" option

### Data Needed
- Chat session
- Agent info

### Actions
- Type message → Send
- Attach image → Image picker → Send
- Tap "End Chat" → Confirm → End

### States
- Connecting
- Waiting in queue
- Connected
- Ended

---

## 92. Report Problem

**Location:** Profile Tab > Report Problem
**Flow(s):** 50

### Components
- Back button
- "Report a Problem" header
- Related item (if from specific ticket/order):
  - Order/ticket info display
- Problem type dropdown
- Description input
- Attach screenshots (optional)
- "Submit" button

### Data Needed
- Related order/ticket (if applicable)

### Actions
- Select type → Update form
- Tap "Submit" → Submit → Confirmation

### States
- Default
- Loading (submitting)
- Success
- Error

---

## 93. Support Tickets

**Location:** Profile Tab > Support Tickets
**Flow(s):** 50

### Components
- Back button
- "My Requests" header
- Ticket list:
  - Ticket number
  - Subject
  - Status (Open, Pending, Resolved)
  - Date
- Empty state

### Data Needed
- User's support tickets

### Actions
- Tap ticket → Support Ticket Detail

### States
- Loading
- Default
- Empty

---

## 94. Support Ticket Detail

**Location:** Profile Tab > Support Ticket Detail
**Flow(s):** 50

### Components
- Back button
- Ticket number header
- Status badge
- Created date
- Conversation thread:
  - User messages
  - Support messages
  - Timestamps
- Reply input (if not resolved)
- "Send" button
- "Reopen Ticket" button (if resolved)

### Data Needed
- Support ticket object

### Actions
- Type reply → Send
- Tap "Reopen Ticket" → Reopen → Update status

### States
- Loading
- Default (open)
- Default (resolved)

---

## 95. Terms of Service

**Location:** Profile Tab > Terms of Service
**Flow(s):** 63

### Components
- Back button
- "Terms of Service" header
- Terms content (scrollable, rich text)
- Last updated date

### Data Needed
- Terms content

### Actions
- Scroll → Read

### States
- Loading
- Default

---

## 96. Privacy Policy

**Location:** Profile Tab > Privacy Policy
**Flow(s):** 64

### Components
- Back button
- "Privacy Policy" header
- Policy content (scrollable, rich text)
- Last updated date

### Data Needed
- Privacy policy content

### Actions
- Scroll → Read

### States
- Loading
- Default

---

## 97. Request Data Export

**Location:** Profile Tab > Request Data Export
**Flow(s):** 65

### Components
- Back button
- "Export Your Data" header
- Explanation text
- Data included list:
  - Account info
  - Order history
  - Ticket history
  - Preferences
- "Request Export" button
- Processing time note

### Data Needed
- Existing export request status (if any)

### Actions
- Tap "Request Export" → Submit → Confirmation

### States
- Default
- Already requested (show status)
- Processing
- Ready to download

---

## 98. Request Data Deletion

**Location:** Profile Tab > Request Data Deletion
**Flow(s):** 9

### Components
- Back button
- "Delete Your Data" header
- Warning text
- What will be deleted list
- What will be retained (legal requirements)
- Password confirmation input
- "Request Deletion" button (destructive)

### Data Needed
- User's data summary

### Actions
- Enter password → Enable button
- Tap "Request Deletion" → Confirm → Process

### States
- Default
- Loading (processing)
- Success (request submitted)
- Error

---

## 99. Log Out Modal

**Location:** Profile Tab > Log Out Modal
**Flow(s):** 8

### Components
- "Log Out?" header
- "Are you sure you want to log out?" text
- "Don't ask me again" checkbox
- "Log Out" button
- "Cancel" button

### Data Needed
- User's "don't ask again" preference

### Actions
- Tap "Log Out" → Log out → Welcome screen
- Tap "Cancel" → Dismiss
- Check "Don't ask again" → Save preference

### States
- Default

---

## 100. Delete Account

**Location:** Profile Tab > Delete Account
**Flow(s):** 10

### Components
- Back button
- "Delete Account" header
- Warning text: "This action is permanent"
- What will be deleted list
- What will be retained (legal requirements)
- Reason dropdown (optional)
- "Continue" button

### Data Needed
- User's account summary

### Actions
- Select reason → Optional
- Tap "Continue" → Delete Account Confirmation

### States
- Default

---

## 101. Delete Account Confirmation

**Location:** Profile Tab > Delete Account Confirmation
**Flow(s):** 10

### Components
- Back button
- "Confirm Deletion" header
- Final warning
- Type "DELETE" to confirm input
- Password input
- "Delete My Account" button (destructive)

### Data Needed
- None

### Actions
- Type "DELETE" + password → Enable button
- Tap "Delete My Account" → Delete → Welcome screen

### States
- Default
- Loading (deleting)
- Error (wrong password)

### Validation
- Confirm text: must be "DELETE"
- Password: required, must be correct

---

## 102. Edit Bank Account

**Location:** Sell Tab > Edit Bank Account
**Flow(s):** 73

### Components
- Back button
- "Update Bank Account" header
- Current account display (last 4)
- "Update via Stripe" button → Opens Stripe Connect flow

### Data Needed
- Current bank account info

### Actions
- Tap "Update via Stripe" → Stripe Connect flow

### States
- Default

### Notes
- Uses Stripe Connect for security

---

# End of Fan Screens

---

## Summary

| Section | Screens |
|---------|---------|
| Onboarding | 10 |
| Home Tab | 22 |
| Search Tab | 5 |
| Tickets Tab | 14 |
| Sell Tab | 15 |
| Profile Tab | 36 |
| **Total** | **102** |

All 73 flows mapped to 102 screens.