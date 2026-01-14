# TicketToken — Fan User Flows

Generated: 2024-12-28
Total Flows: 50
Total Steps: 732

---

## Summary

| Section | Flows | Steps |
|---------|-------|-------|
| Account | 10 | 116 |
| Discovery | 13 | 144 |
| Purchase | 9 | 138 |
| My Tickets | 6 | 99 |
| Resale | 5 | 95 |
| Notifications | 2 | 52 |
| Social | 2 | 29 |
| Support | 3 | 59 |
| **Total** | **50** | **732** |

---

## Flow Index

### Account (Flows 1-10)
1. Sign Up
2. Log In
3. Reset Password
4. Verify Email
5. Edit Profile
6. Manage Payment Methods
7. Manage Billing Addresses
8. Connect Phone Number
9. View Purchase History
10. Delete Account

### Discovery (Flows 11-23)
11. Browse Events
12. Search Events
13. Filter Events
14. View Event Details
15. View Venue Page
16. View Artist Page
17. Favorite an Event
18. Follow a Venue
19. Follow an Artist
20. View Following
21. View Favorites
22. View Event on Map
23. Share Event

### Purchase (Flows 24-32)
24. Select Tickets (General Admission)
25. Select Seats (Reserved Seating)
26. Add to Cart
27. View Cart
28. Apply Promo Code
29. Purchase as Gift
30. Checkout
31. View Confirmation
32. Add to Wallet

### My Tickets (Flows 33-38)
33. View My Tickets
34. View Ticket Details
35. View Transfer History
36. Download Ticket PDF
37. Request Refund
38. Enter Venue (Show QR)

### Resale (Flows 39-43)
39. List Ticket for Resale
40. View Price Suggestions
41. Manage My Listings
42. Sale Notification
43. Buy Resale Ticket

### Notifications (Flows 44-45)
44. View Notifications
45. Notification Settings

### Social (Flows 46-47)
46. See Friends Attending
47. Invite Friends to Event

### Support (Flows 48-50)
48. Contact Support
49. View FAQ
50. Report Problem

---

# Account Flows

---

## Flow 1: Sign Up

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 1.1 | User opens app for first time | Splash / Welcome |
| 1.2 | Tap "Create Account" | Welcome |
| 1.3 | Choose signup method (Email, Google, Apple) | Sign Up Options |
| 1.4 | If email: Enter email | Email Form |
| 1.5 | If social: OAuth redirect | External |
| 1.6 | Enter password | Password Form |
| 1.7 | Enter name | Profile Form |
| 1.8 | Enter phone (optional or required) | Phone Form |
| 1.9 | Accept terms and privacy policy | Checkbox / Modal |
| 1.10 | Submit | Loading State |
| 1.11 | Handle success: go to verify email or home | Success |
| 1.12 | Handle error (email taken, weak password) | Error State |

---

## Flow 2: Log In

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 2.1 | User opens app | Splash |
| 2.2 | Tap "Log In" | Welcome |
| 2.3 | Choose login method (Email, Google, Apple) | Login Options |
| 2.4 | If email: Enter email | Email Form |
| 2.5 | If social: OAuth redirect | External |
| 2.6 | Enter password | Password Form |
| 2.7 | Submit | Loading State |
| 2.8 | Handle 2FA if enabled: enter code | 2FA Form |
| 2.9 | Handle success: go to home | Success |
| 2.10 | Handle error (wrong password, no account, locked) | Error State |
| 2.11 | Tap "Forgot Password": go to Flow 3 | Link |

---

## Flow 3: Reset Password

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 3.1 | Tap "Forgot Password" from login | Link |
| 3.2 | Enter email | Email Form |
| 3.3 | Submit request | Loading State |
| 3.4 | Show "check your email" message | Confirmation |
| 3.5 | User opens email, taps link | External (Email) |
| 3.6 | Deep link opens app to reset screen | Reset Password |
| 3.7 | Enter new password | Password Form |
| 3.8 | Confirm new password | Password Form |
| 3.9 | Submit | Loading State |
| 3.10 | Handle success: go to login | Success |
| 3.11 | Handle error (link expired, weak password) | Error State |

---

## Flow 4: Verify Email

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 4.1 | After signup, show "verify your email" prompt | Verification Prompt |
| 4.2 | User opens email, taps link | External (Email) |
| 4.3 | Deep link opens app | App Opens |
| 4.4 | App sends verification token to backend | Loading State |
| 4.5 | Handle success: show verified, continue to home | Success |
| 4.6 | Handle error (link expired, already verified) | Error State |
| 4.7 | Option to resend verification email | Resend Button |
| 4.8 | Resend success | Toast/Confirmation |

---

## Flow 5: Edit Profile

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 5.1 | Navigate to Profile from tab/menu | Navigation |
| 5.2 | Tap "Edit Profile" | Profile Screen |
| 5.3 | View current info (name, photo, email, phone) | Edit Profile Form |
| 5.4 | Tap profile photo to change | Photo Options |
| 5.5 | Choose camera or library | Action Sheet |
| 5.6 | Crop/adjust photo | Image Cropper |
| 5.7 | Upload photo | Loading State |
| 5.8 | Edit name | Text Input |
| 5.9 | Edit phone: may require verification | Phone Input |
| 5.10 | Save changes | Loading State |
| 5.11 | Handle success | Success Toast |
| 5.12 | Handle error (upload failed, invalid phone) | Error State |

---

## Flow 6: Manage Payment Methods

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 6.1 | Navigate to Settings then Payment Methods | Navigation |
| 6.2 | View list of saved cards | Payment Methods List |
| 6.3 | See card details (last 4, expiry, brand icon) | List Item |
| 6.4 | Tap "Add Payment Method" | Button |
| 6.5 | Enter card number | Card Form (Stripe Element) |
| 6.6 | Enter expiry | Card Form |
| 6.7 | Enter CVC | Card Form |
| 6.8 | Enter cardholder name | Card Form |
| 6.9 | Save card | Loading State |
| 6.10 | Handle 3D Secure if required | 3DS Modal |
| 6.11 | Handle success: card appears in list | Success |
| 6.12 | Handle error (declined, invalid) | Error State |
| 6.13 | Tap existing card: options menu | Action Sheet |
| 6.14 | Set as default | Action |
| 6.15 | Delete card | Confirmation Dialog |
| 6.16 | Confirm delete | Loading State |
| 6.17 | Card removed from list | Success |

---

## Flow 7: Manage Billing Addresses

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 7.1 | Navigate to Settings then Billing Addresses | Navigation |
| 7.2 | View list of saved addresses | Address List |
| 7.3 | Tap "Add Address" | Button |
| 7.4 | Enter street address | Address Form |
| 7.5 | Enter city | Address Form |
| 7.6 | Enter state/province | Address Form |
| 7.7 | Enter postal code | Address Form |
| 7.8 | Enter country | Address Form (Dropdown) |
| 7.9 | Save address | Loading State |
| 7.10 | Handle success: address appears in list | Success |
| 7.11 | Handle error (invalid address) | Error State |
| 7.12 | Tap existing address: options | Action Sheet |
| 7.13 | Edit address | Edit Form |
| 7.14 | Set as default | Action |
| 7.15 | Delete address | Confirmation Dialog |

---

## Flow 8: Connect Phone Number

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 8.1 | Navigate to Settings then Phone | Navigation |
| 8.2 | View current phone (if any) | Phone Screen |
| 8.3 | Tap "Add Phone" or "Change Phone" | Button |
| 8.4 | Enter phone number | Phone Input |
| 8.5 | Select country code | Dropdown |
| 8.6 | Submit: send verification code | Loading State |
| 8.7 | Enter SMS code | Code Input |
| 8.8 | Submit code | Loading State |
| 8.9 | Handle success: phone saved | Success |
| 8.10 | Handle error (wrong code, expired) | Error State |
| 8.11 | Resend code option | Button |
| 8.12 | Remove phone | Confirmation Dialog |

---

## Flow 9: View Purchase History

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 9.1 | Navigate to Settings then Purchase History | Navigation |
| 9.2 | Load orders | Loading State |
| 9.3 | View list of orders | Order List |
| 9.4 | Empty state if no orders | Empty State |
| 9.5 | Each order shows: date, event, total, status | List Item |
| 9.6 | Tap order to view details | Navigation |
| 9.7 | View order detail (tickets, fees, payment method) | Order Detail |
| 9.8 | View receipt | Receipt View |
| 9.9 | Download receipt (PDF) | Action |
| 9.10 | Link to tickets from this order | Navigation |

---

## Flow 10: Delete Account

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 10.1 | Navigate to Settings then Account | Navigation |
| 10.2 | Scroll to "Delete Account" | Settings Screen |
| 10.3 | Tap "Delete Account" | Button (Red/Danger) |
| 10.4 | Show warning: what will be deleted | Warning Modal |
| 10.5 | Require password confirmation | Password Input |
| 10.6 | Confirm deletion | Confirmation Button |
| 10.7 | Submit | Loading State |
| 10.8 | Handle active tickets warning (upcoming events) | Error State |
| 10.9 | Handle active listings warning (must remove first) | Error State |
| 10.10 | Handle success: log out, return to welcome | Success |

---

# Discovery Flows

---

## Flow 11: Browse Events

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 11.1 | Open app or tap Home tab | Navigation |
| 11.2 | Load event feed | Loading State |
| 11.3 | Display event cards | Event Feed |
| 11.4 | Empty state if no events in area | Empty State |
| 11.5 | Pull to refresh | Refresh Loading |
| 11.6 | Scroll for more (infinite scroll or pagination) | Load More |
| 11.7 | See event card: image, name, date, venue, price | Card Component |
| 11.8 | See category tabs or chips (Music, Sports, Comedy) | Category Filter |
| 11.9 | Tap category to filter | Filter Action |
| 11.10 | Tap event card: go to Flow 14 | Navigation |

---

## Flow 12: Search Events

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 12.1 | Tap search icon or search bar | Navigation |
| 12.2 | Focus search input, show keyboard | Search Screen |
| 12.3 | Show recent searches (if any) | Recent List |
| 12.4 | Show trending searches (optional) | Trending List |
| 12.5 | Type query | Text Input |
| 12.6 | Show live suggestions as typing | Autocomplete |
| 12.7 | Submit search | Loading State |
| 12.8 | Display results | Results List |
| 12.9 | Empty state if no results | Empty State |
| 12.10 | Results include: events, venues, artists (tabs or sections) | Mixed Results |
| 12.11 | Tap result: go to appropriate detail screen | Navigation |
| 12.12 | Clear search | Clear Button |
| 12.13 | Clear recent searches | Clear All Link |

---

## Flow 13: Filter Events

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 13.1 | Tap "Filters" button on browse or search | Button |
| 13.2 | Open filter modal or screen | Filter Screen |
| 13.3 | Select date range (Today, This Weekend, Pick Dates) | Date Picker |
| 13.4 | Select price range (slider or min/max) | Price Range |
| 13.5 | Select categories (multi-select) | Category Chips |
| 13.6 | Select distance (5mi, 25mi, 50mi, 100mi, Any) | Distance Slider |
| 13.7 | Select event type (General Admission, Reserved, Both) | Toggle/Radio |
| 13.8 | Sort by (Date, Price Low-High, Price High-Low, Distance) | Sort Dropdown |
| 13.9 | See active filter count | Badge |
| 13.10 | Apply filters | Apply Button |
| 13.11 | Results update | Loading State |
| 13.12 | Clear all filters | Clear Button |
| 13.13 | Filters persist during session | State |

---

## Flow 14: View Event Details

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 14.1 | Tap event from feed, search, or link | Navigation |
| 14.2 | Load event details | Loading State |
| 14.3 | Display hero image or gallery | Image Section |
| 14.4 | Display event name | Title |
| 14.5 | Display date and time | Date/Time |
| 14.6 | Display venue name (tappable: Flow 15) | Venue Link |
| 14.7 | Display artist/performer names (tappable: Flow 16) | Artist Links |
| 14.8 | Display ticket price range ("From $45") | Price |
| 14.9 | Display event description | Description |
| 14.10 | Display lineup or schedule (if multi-act) | Lineup Section |
| 14.11 | Display age restriction (21+, All Ages) | Badge |
| 14.12 | Display event policies (no re-entry, bag policy) | Policies Section |
| 14.13 | Display rating summary (if reviews exist) | Rating |
| 14.14 | Tap to see reviews | Reviews Link |
| 14.15 | Favorite button | Heart Icon |
| 14.16 | Share button: Flow 23 | Share Icon |
| 14.17 | See friends attending (if social connected) | Friends Section |
| 14.18 | "Get Tickets" button (sticky at bottom) | CTA Button |
| 14.19 | If sold out, show "Sold Out" or "Find Resale" | Sold Out State |
| 14.20 | If not on sale yet, show countdown or notify button | Coming Soon State |
| 14.21 | Tap "Get Tickets": go to Flow 24 or 25 | Navigation |

---

## Flow 15: View Venue Page

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 15.1 | Tap venue name from event detail | Navigation |
| 15.2 | Load venue data | Loading State |
| 15.3 | Display venue image or header | Image Section |
| 15.4 | Display venue name | Title |
| 15.5 | Display address | Address |
| 15.6 | Display map preview (tappable: Flow 22) | Map Thumbnail |
| 15.7 | Display venue description or about | Description |
| 15.8 | Display capacity | Detail |
| 15.9 | Display amenities (parking, accessibility) | Amenities List |
| 15.10 | Display policies (bag check, re-entry) | Policies Section |
| 15.11 | Display contact info | Contact |
| 15.12 | Follow button | Follow CTA |
| 15.13 | Load upcoming events at this venue | Loading State |
| 15.14 | Display event list | Event List |
| 15.15 | Empty state if no upcoming events | Empty State |
| 15.16 | Tap event: Flow 14 | Navigation |
| 15.17 | Share venue | Share Icon |

---

## Flow 16: View Artist Page

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 16.1 | Tap artist name from event detail | Navigation |
| 16.2 | Load artist data | Loading State |
| 16.3 | Display artist image or header | Image Section |
| 16.4 | Display artist name | Title |
| 16.5 | Display genres | Genre Tags |
| 16.6 | Display bio or about | Description |
| 16.7 | Display social links (Spotify, Instagram) | Social Links |
| 16.8 | Follow button | Follow CTA |
| 16.9 | Load upcoming events for this artist | Loading State |
| 16.10 | Display event list (across all venues) | Event List |
| 16.11 | Empty state if no upcoming events | Empty State |
| 16.12 | Tap event: Flow 14 | Navigation |
| 16.13 | Share artist | Share Icon |

---

## Flow 17: Favorite an Event

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 17.1 | View event (card or detail) | Event Screen |
| 17.2 | Tap heart icon | Tap Action |
| 17.3 | Optimistic UI: heart fills immediately | Icon Change |
| 17.4 | Send request to backend | Background Request |
| 17.5 | Handle success: stay filled | Success |
| 17.6 | Handle error: unfill, show toast | Error State |
| 17.7 | Tap again to unfavorite | Toggle |
| 17.8 | Confirmation or instant unfavorite (product decision) | UX Decision |

---

## Flow 18: Follow a Venue

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 18.1 | View venue page | Venue Screen |
| 18.2 | Tap "Follow" button | Tap Action |
| 18.3 | Optimistic UI: button changes to "Following" | Button Change |
| 18.4 | Send request to backend | Background Request |
| 18.5 | Handle success | Success |
| 18.6 | Handle error: revert button, show toast | Error State |
| 18.7 | Tap again to unfollow | Toggle |
| 18.8 | Confirm unfollow (product decision) | UX Decision |

---

## Flow 19: Follow an Artist

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 19.1 | View artist page | Artist Screen |
| 19.2 | Tap "Follow" button | Tap Action |
| 19.3 | Optimistic UI: button changes to "Following" | Button Change |
| 19.4 | Send request to backend | Background Request |
| 19.5 | Handle success | Success |
| 19.6 | Handle error: revert button, show toast | Error State |
| 19.7 | Tap again to unfollow | Toggle |
| 19.8 | Confirm unfollow (product decision) | UX Decision |

---

## Flow 20: View Following

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 20.1 | Navigate to Profile then Following | Navigation |
| 20.2 | Load following list | Loading State |
| 20.3 | Display tabs: Venues / Artists | Tab Bar |
| 20.4 | Display venue list | Venue List |
| 20.5 | Display artist list | Artist List |
| 20.6 | Empty state if not following anyone | Empty State |
| 20.7 | Each item shows: image, name, upcoming event count | List Item |
| 20.8 | Tap item: go to venue or artist page | Navigation |
| 20.9 | Unfollow from list (swipe or button) | Unfollow Action |
| 20.10 | Confirm unfollow | Confirmation |

---

## Flow 21: View Favorites

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 21.1 | Navigate to Profile then Favorites (or tab) | Navigation |
| 21.2 | Load favorites list | Loading State |
| 21.3 | Display event cards | Event List |
| 21.4 | Empty state if no favorites | Empty State |
| 21.5 | Show "Event passed" indicator for past events | Badge |
| 21.6 | Option to filter: Upcoming / Past / All | Filter Tabs |
| 21.7 | Tap event: Flow 14 | Navigation |
| 21.8 | Unfavorite from list (swipe or tap heart) | Unfavorite Action |
| 21.9 | Event removed from list | List Update |

---

## Flow 22: View Event on Map

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 22.1 | Tap map or address on event/venue page | Tap Action |
| 22.2 | Open map view | Map Screen |
| 22.3 | Show venue pin on map | Map Marker |
| 22.4 | Show venue name and address in card | Info Card |
| 22.5 | Tap "Directions": open in Maps app | External Link |
| 22.6 | Choose Maps app (Apple Maps, Google Maps, Waze) | Action Sheet |
| 22.7 | Close map: return to previous screen | Close Button |

---

## Flow 23: Share Event

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 23.1 | Tap share icon on event | Tap Action |
| 23.2 | Generate share link | Background |
| 23.3 | Open native share sheet | Share Sheet |
| 23.4 | Options: Messages, Email, Social, Copy Link | Share Options |
| 23.5 | User selects destination | External App |
| 23.6 | Share completes | Success |
| 23.7 | Copy link option: show "Copied" toast | Toast |

---

# Purchase Flows

---

## Flow 24: Select Tickets (General Admission)

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 24.1 | Tap "Get Tickets" from event detail | Navigation |
| 24.2 | Load ticket types | Loading State |
| 24.3 | Display available ticket types | Ticket Type List |
| 24.4 | Each type shows: name, description, price, availability | List Item |
| 24.5 | Show "Low Stock" warning if almost sold out | Badge |
| 24.6 | Show "Sold Out" for unavailable types | Disabled State |
| 24.7 | Show ticket limit per order ("Max 4 per order") | Info Text |
| 24.8 | Tap +/- to adjust quantity | Quantity Selector |
| 24.9 | Enforce min/max limits | Validation |
| 24.10 | Show running subtotal | Price Summary |
| 24.11 | Show fees breakdown (service fee, facility fee) | Fee Details |
| 24.12 | Show total | Total |
| 24.13 | "Add to Cart" or "Continue" button | CTA Button |
| 24.14 | Tap continue: Flow 26 or 27 | Navigation |
| 24.15 | Ticket reservation timer starts (10 min hold) | Timer |

---

## Flow 25: Select Seats (Reserved Seating)

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 25.1 | Tap "Get Tickets" from event detail | Navigation |
| 25.2 | Load seating map | Loading State |
| 25.3 | Display interactive seat map | Seat Map |
| 25.4 | Color code: available, selected, unavailable, price tiers | Legend |
| 25.5 | Pinch to zoom on map | Gesture |
| 25.6 | Tap section to zoom in | Tap Action |
| 25.7 | Tap individual seat to select | Tap Action |
| 25.8 | Selected seat changes color | Visual Feedback |
| 25.9 | Show seat details: section, row, seat number, price | Tooltip/Modal |
| 25.10 | Tap again to deselect | Toggle |
| 25.11 | Enforce ticket limit | Validation |
| 25.12 | "Best Available" button option | Auto-Select |
| 25.13 | Filter by price range | Filter |
| 25.14 | Filter by accessibility seating | Filter |
| 25.15 | Show selected seats list | Selection Summary |
| 25.16 | Show subtotal, fees, total | Price Summary |
| 25.17 | "Add to Cart" or "Continue" button | CTA Button |
| 25.18 | Tap continue: Flow 26 or 27 | Navigation |
| 25.19 | Seat reservation timer starts | Timer |

---

## Flow 26: Add to Cart

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 26.1 | Tap "Add to Cart" from ticket selection | Tap Action |
| 26.2 | Send reservation request to backend | Loading State |
| 26.3 | Handle success: tickets reserved | Success |
| 26.4 | Show confirmation toast "Added to cart" | Toast |
| 26.5 | Show cart badge update (number of items) | Badge |
| 26.6 | Handle error: tickets no longer available | Error State |
| 26.7 | Prompt to select different tickets | Recovery |
| 26.8 | Option: "Continue Shopping" or "View Cart" | Action Options |
| 26.9 | Continue shopping: back to browse | Navigation |
| 26.10 | View cart: Flow 27 | Navigation |

---

## Flow 27: View Cart

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 27.1 | Tap cart icon or "View Cart" | Navigation |
| 27.2 | Load cart contents | Loading State |
| 27.3 | Display cart items | Cart List |
| 27.4 | Empty state if cart is empty | Empty State |
| 27.5 | Each item shows: event image, event name, date, tickets, price | Cart Item |
| 27.6 | Show reservation timer for each item | Timer |
| 27.7 | Timer expired: item removed, show message | Expiry State |
| 27.8 | Edit quantity button | Edit Button |
| 27.9 | Tap edit: adjust quantity | Quantity Selector |
| 27.10 | Remove item button | Remove Button |
| 27.11 | Confirm remove | Confirmation |
| 27.12 | Item removed, cart updates | List Update |
| 27.13 | Show subtotal (all items) | Subtotal |
| 27.14 | Show fees | Fees |
| 27.15 | Show promo code field: Flow 28 | Promo Input |
| 27.16 | Show total | Total |
| 27.17 | "Checkout" button | CTA Button |
| 27.18 | Tap checkout: Flow 30 | Navigation |
| 27.19 | "Continue Shopping" link | Link |

---

## Flow 28: Apply Promo Code

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 28.1 | Tap "Add Promo Code" in cart or checkout | Tap Action |
| 28.2 | Show promo code input field | Text Input |
| 28.3 | Enter code | Typing |
| 28.4 | Tap "Apply" | Submit Button |
| 28.5 | Send validation request | Loading State |
| 28.6 | Handle valid code: show discount | Success |
| 28.7 | Display discount amount or percentage | Discount Line |
| 28.8 | Update total | Total Update |
| 28.9 | Handle invalid code: show error | Error State |
| 28.10 | Error types: expired, not applicable, already used, invalid | Error Messages |
| 28.11 | Remove applied code | Remove Button |
| 28.12 | Only one code at a time (or stack if allowed) | Validation |

---

## Flow 29: Purchase as Gift

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 29.1 | Toggle "Send as gift" in cart or checkout | Toggle |
| 29.2 | Enter recipient email | Email Input |
| 29.3 | Enter recipient name (optional) | Name Input |
| 29.4 | Enter gift message (optional) | Message Input |
| 29.5 | Select delivery date (now or scheduled) | Date Picker |
| 29.6 | Preview gift email | Preview |
| 29.7 | Confirm gift details | Confirmation |
| 29.8 | Gift info saved with order | State |
| 29.9 | On purchase complete, ticket sent to recipient | Backend Action |
| 29.10 | Sender gets confirmation, recipient gets ticket email | Emails |

---

## Flow 30: Checkout

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 30.1 | Navigate to checkout from cart | Navigation |
| 30.2 | Load checkout screen | Loading State |
| 30.3 | Display order summary (items, fees, total) | Order Summary |
| 30.4 | Display/select payment method | Payment Section |
| 30.5 | If no saved payment, prompt to add (Flow 6 inline) | Add Payment |
| 30.6 | Tap to change payment method | Payment Selector |
| 30.7 | Display/select billing address | Billing Section |
| 30.8 | If no saved address, prompt to add (Flow 7 inline) | Add Address |
| 30.9 | Tap to change billing address | Address Selector |
| 30.10 | Display promo code (if applied) | Promo Display |
| 30.11 | Option to add/change promo: Flow 28 | Promo Link |
| 30.12 | Display gift info (if gift purchase) | Gift Display |
| 30.13 | Terms and conditions checkbox | Checkbox |
| 30.14 | Link to full terms | Link to Modal |
| 30.15 | "Place Order" button (disabled until terms accepted) | CTA Button |
| 30.16 | Tap "Place Order" | Submit |
| 30.17 | Processing state | Loading State |
| 30.18 | Send payment to Stripe | Backend |
| 30.19 | Handle 3D Secure if required | 3DS Modal |
| 30.20 | Handle success: Flow 31 | Navigation |
| 30.21 | Handle payment failure | Error State |
| 30.22 | Error: card declined | Error Message |
| 30.23 | Error: insufficient funds | Error Message |
| 30.24 | Error: card expired | Error Message |
| 30.25 | Option to try different payment method | Recovery |
| 30.26 | Handle timeout | Error State |
| 30.27 | Handle network error | Error State |

---

## Flow 31: View Confirmation

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 31.1 | Payment successful, navigate to confirmation | Navigation |
| 31.2 | Display success animation/icon | Success Visual |
| 31.3 | Display "You're going!" or similar message | Headline |
| 31.4 | Display order number | Order ID |
| 31.5 | Display event name, date, venue | Event Summary |
| 31.6 | Display tickets purchased | Ticket Summary |
| 31.7 | Display total charged | Total |
| 31.8 | Display payment method used | Payment Info |
| 31.9 | "Confirmation email sent to [email]" | Email Notice |
| 31.10 | "View Tickets" button: Flow 33 | CTA Button |
| 31.11 | "Add to Calendar" button | Calendar Action |
| 31.12 | Choose calendar app | Action Sheet |
| 31.13 | Event added to calendar | Success |
| 31.14 | "Add to Wallet" button: Flow 32 | Wallet Action |
| 31.15 | Share event with friends | Share Button |
| 31.16 | "Browse More Events" link | Link |

---

## Flow 32: Add to Wallet

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 32.1 | Tap "Add to Apple Wallet" or "Add to Google Wallet" | Tap Action |
| 32.2 | Generate wallet pass | Loading State |
| 32.3 | iOS: show Apple Wallet add dialog | System Dialog |
| 32.4 | Android: show Google Wallet add dialog | System Dialog |
| 32.5 | User confirms add | User Action |
| 32.6 | Pass added to wallet | Success |
| 32.7 | Show confirmation toast | Toast |
| 32.8 | Handle error: wallet not supported | Error State |
| 32.9 | Handle error: generation failed | Error State |
| 32.10 | Pass contains: event name, date, QR code, venue | Pass Content |

---

# My Tickets Flows

---

## Flow 33: View My Tickets

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 33.1 | Tap "Tickets" tab in bottom navigation | Navigation |
| 33.2 | Load user's tickets | Loading State |
| 33.3 | Display ticket list | Ticket List |
| 33.4 | Empty state if no tickets | Empty State |
| 33.5 | Empty state CTA: "Browse Events" | CTA Button |
| 33.6 | Tabs or segments: Upcoming / Past | Tab Bar |
| 33.7 | Default to Upcoming | Default State |
| 33.8 | Each ticket shows: event image, event name, date, venue, ticket count | Ticket Card |
| 33.9 | Show ticket type (GA, VIP) | Badge |
| 33.10 | Show ticket status (Valid, Used, Expired, Listed for Sale) | Status Badge |
| 33.11 | Group multiple tickets for same event | Grouped Card |
| 33.12 | Show "X tickets" count on grouped card | Count |
| 33.13 | Sort by date (soonest first for Upcoming, recent first for Past) | Sort Order |
| 33.14 | Pull to refresh | Refresh |
| 33.15 | Tap ticket card: Flow 34 | Navigation |

---

## Flow 34: View Ticket Details

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 34.1 | Tap ticket from My Tickets list | Navigation |
| 34.2 | Load ticket details | Loading State |
| 34.3 | Display event image header | Image |
| 34.4 | Display event name | Title |
| 34.5 | Display date and time | Date/Time |
| 34.6 | Display venue name (tappable) | Venue Link |
| 34.7 | Display venue address | Address |
| 34.8 | "Get Directions" button: opens maps | Action Button |
| 34.9 | Display ticket type | Ticket Type |
| 34.10 | Display section, row, seat (if reserved) | Seat Info |
| 34.11 | Display ticket status | Status |
| 34.12 | Display order number | Order ID |
| 34.13 | Display purchase date | Purchase Date |
| 34.14 | Display price paid | Price |
| 34.15 | If multiple tickets, show list/carousel | Ticket Selector |
| 34.16 | Tap individual ticket to view its QR | Selection |
| 34.17 | "Show QR Code" button: Flow 38 | CTA Button |
| 34.18 | "Add to Wallet" button: Flow 32 | Action Button |
| 34.19 | "View Transfer History" link: Flow 35 | Link |
| 34.20 | "Download PDF" button: Flow 36 | Action Button |
| 34.21 | "Sell Ticket" button: Flow 39 | Action Button |
| 34.22 | If already listed, show "Manage Listing": Flow 41 | Action Button |
| 34.23 | "Request Refund" link: Flow 37 | Link |
| 34.24 | "Report Problem" link: Flow 50 | Link |
| 34.25 | Add to calendar button | Action Button |

---

## Flow 35: View Transfer History

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 35.1 | Tap "Transfer History" from ticket detail | Navigation |
| 35.2 | Load transfer history | Loading State |
| 35.3 | Display transfer timeline | Timeline List |
| 35.4 | Empty state if no transfers (original owner) | Empty State |
| 35.5 | Each entry shows: date, from, to, type (sale/transfer) | Timeline Item |
| 35.6 | Original purchase shown as first entry | First Entry |
| 35.7 | "You" label for user's ownership period | Label |
| 35.8 | Current owner highlighted | Highlight |
| 35.9 | Sale prices shown (if resale) | Price |
| 35.10 | Scroll through full history | Scroll |
| 35.11 | Close/back to ticket detail | Navigation |

---

## Flow 36: Download Ticket PDF

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 36.1 | Tap "Download PDF" from ticket detail | Tap Action |
| 36.2 | Generate PDF request | Loading State |
| 36.3 | PDF generated | Backend |
| 36.4 | iOS: Open share sheet with PDF | Share Sheet |
| 36.5 | Android: Download to device or share | Share/Download |
| 36.6 | Options: Save to Files, Print, Share | Actions |
| 36.7 | Handle error: generation failed | Error State |
| 36.8 | PDF contains: event info, QR code, terms | PDF Content |
| 36.9 | Success toast or confirmation | Success |

---

## Flow 37: Request Refund

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 37.1 | Tap "Request Refund" from ticket detail | Tap Action |
| 37.2 | Check refund eligibility | Loading State |
| 37.3 | If not eligible, show reason | Ineligible State |
| 37.4 | Reasons: past refund window, event too close, used ticket | Error Messages |
| 37.5 | If eligible, show refund policy | Policy Display |
| 37.6 | Display refund amount (may be partial) | Amount |
| 37.7 | Display fees withheld (if any) | Fee Info |
| 37.8 | Select refund reason (dropdown) | Reason Selector |
| 37.9 | Add comments (optional) | Text Input |
| 37.10 | Confirm refund request | Confirmation |
| 37.11 | Show what happens: ticket invalidated, money returned | Explanation |
| 37.12 | "Submit Request" button | CTA Button |
| 37.13 | Submit request | Loading State |
| 37.14 | Handle success: refund initiated | Success State |
| 37.15 | Display timeline: "Refund in 5-10 business days" | Timeline |
| 37.16 | Ticket status changes to "Refund Pending" | Status Update |
| 37.17 | Confirmation email sent | Email |
| 37.18 | Handle error: refund failed | Error State |
| 37.19 | Contact support option on error | Support Link |

---

## Flow 38: Enter Venue (Show QR)

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 38.1 | Tap "Show QR Code" from ticket detail | Navigation |
| 38.2 | Load QR code | Loading State |
| 38.3 | Display large QR code | QR Display |
| 38.4 | Increase screen brightness automatically | System Action |
| 38.5 | Disable screen timeout | System Action |
| 38.6 | Display ticket holder name | Name |
| 38.7 | Display event name | Event |
| 38.8 | Display ticket type | Type |
| 38.9 | Display section/row/seat (if reserved) | Seat Info |
| 38.10 | QR refreshes periodically (rotating code for security) | Auto-Refresh |
| 38.11 | Show countdown to next refresh | Timer |
| 38.12 | If multiple tickets, swipe to see each QR | Carousel |
| 38.13 | Ticket indicator dots | Pagination |
| 38.14 | "Show All" option for group entry | Bulk Display |
| 38.15 | All QRs displayed in grid | Grid View |
| 38.16 | After scan, ticket status updates to "Used" | Status Update |
| 38.17 | Handle already used ticket | Error State |
| 38.18 | Handle invalid ticket | Error State |
| 38.19 | Close/back to ticket detail | Navigation |
| 38.20 | Restore normal brightness and timeout on exit | System Action |

---

# Resale Flows

---

## Flow 39: List Ticket for Resale

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 39.1 | Tap "Sell Ticket" from ticket detail | Navigation |
| 39.2 | Check listing eligibility | Loading State |
| 39.3 | If not eligible, show reason | Ineligible State |
| 39.4 | Reasons: non-transferable, too close to event, already used | Error Messages |
| 39.5 | If eligible, show listing form | Listing Form |
| 39.6 | Display ticket info (event, type, seat) | Ticket Summary |
| 39.7 | Show price suggestions: Flow 40 | Price Suggestions |
| 39.8 | Enter asking price | Price Input |
| 39.9 | Show minimum price (if venue enforces floor) | Min Price |
| 39.10 | Show maximum price (if venue enforces cap) | Max Price |
| 39.11 | Validation: price within allowed range | Validation |
| 39.12 | Display fee breakdown (platform fee, payment processing) | Fee Display |
| 39.13 | Display "You'll receive" amount after fees | Net Amount |
| 39.14 | Display royalty to venue/artist (if applicable) | Royalty Display |
| 39.15 | If multiple tickets, select which to list | Ticket Selector |
| 39.16 | Option to list all together or individually | Listing Options |
| 39.17 | Review listing terms | Terms |
| 39.18 | Agree to seller terms checkbox | Checkbox |
| 39.19 | "List for Sale" button | CTA Button |
| 39.20 | Submit listing | Loading State |
| 39.21 | Handle success: ticket listed | Success State |
| 39.22 | Ticket status changes to "Listed for Sale" | Status Update |
| 39.23 | Show confirmation: "Your ticket is now on the marketplace" | Confirmation |
| 39.24 | "View Listing" button | CTA Button |
| 39.25 | Handle error: listing failed | Error State |
| 39.26 | Notification preferences for when ticket sells | Settings |

---

## Flow 40: View Price Suggestions

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 40.1 | Displayed within listing flow or tap "See Suggestions" | Section/Modal |
| 40.2 | Load comparable listings | Loading State |
| 40.3 | Show current lowest price for same ticket type | Lowest Price |
| 40.4 | Show average price for same ticket type | Average Price |
| 40.5 | Show highest price for same ticket type | Highest Price |
| 40.6 | Show original face value | Face Value |
| 40.7 | Show price trend (up/down/stable) | Trend Indicator |
| 40.8 | Show number of listings at each price range | Distribution |
| 40.9 | "Price to sell fast" recommendation | Recommendation |
| 40.10 | Tap suggestion to auto-fill price | Auto-Fill |
| 40.11 | Handle no comparables: show face value only | Fallback |

---

## Flow 41: Manage My Listings

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 41.1 | Navigate to Profile then My Listings | Navigation |
| 41.2 | Load active listings | Loading State |
| 41.3 | Display listings list | Listings List |
| 41.4 | Empty state if no listings | Empty State |
| 41.5 | Tabs: Active / Sold | Tab Bar |
| 41.6 | Each listing shows: event, ticket type, asking price, days listed | Listing Card |
| 41.7 | Show view count (how many people viewed) | Views |
| 41.8 | Tap listing to manage | Navigation |
| 41.9 | View listing detail | Listing Detail |
| 41.10 | "Edit Price" button | Action Button |
| 41.11 | Enter new price | Price Input |
| 41.12 | Save price change | Loading State |
| 41.13 | Price updated confirmation | Success |
| 41.14 | "Remove Listing" button | Action Button |
| 41.15 | Confirm removal | Confirmation Dialog |
| 41.16 | Remove listing | Loading State |
| 41.17 | Listing removed, ticket back in My Tickets as "Valid" | Success |
| 41.18 | Sold tab shows completed sales | Sold List |
| 41.19 | Each sold item shows: event, sale price, sale date, payout status | Sold Card |
| 41.20 | "View Payout Details" link | Link |

---

## Flow 42: Sale Notification

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 42.1 | Ticket sells on marketplace | Backend Event |
| 42.2 | Push notification sent | Push Notification |
| 42.3 | Notification content: "Your ticket sold for $X" | Notification |
| 42.4 | Tap notification: open app | Deep Link |
| 42.5 | Navigate to sold listing detail | Navigation |
| 42.6 | Display sale summary | Sale Detail |
| 42.7 | Show sale price | Price |
| 42.8 | Show fees deducted | Fees |
| 42.9 | Show royalties paid | Royalties |
| 42.10 | Show net payout amount | Net Amount |
| 42.11 | Show payout method (card on file, bank account) | Payout Method |
| 42.12 | Show payout timeline ("Funds arrive in 2-3 days") | Timeline |
| 42.13 | Show payout status (Pending, Processing, Completed) | Status |
| 42.14 | Email confirmation also sent | Email |

---

## Flow 43: Buy Resale Ticket

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 43.1 | View event detail for sold-out or resale event | Event Detail |
| 43.2 | See "Resale Tickets Available" or "Buy from Fans" | Indicator |
| 43.3 | Tap "View Resale Tickets" | Navigation |
| 43.4 | Load resale listings | Loading State |
| 43.5 | Display resale listings | Listings List |
| 43.6 | Filter by ticket type | Filter |
| 43.7 | Filter by section (if reserved) | Filter |
| 43.8 | Sort by price (low to high default) | Sort |
| 43.9 | Sort by section/row (for reserved) | Sort |
| 43.10 | Each listing shows: ticket type, section/row/seat, price | Listing Card |
| 43.11 | Show comparison to face value ("+$20" or "-$10") | Price Comparison |
| 43.12 | Show number of tickets in listing | Quantity |
| 43.13 | Show seller rating (if implemented) | Rating |
| 43.14 | Tap listing to select | Selection |
| 43.15 | View listing detail | Listing Detail |
| 43.16 | Show price breakdown (price + fees) | Price Breakdown |
| 43.17 | Show ticket details | Ticket Info |
| 43.18 | "Buy Now" button | CTA Button |
| 43.19 | Tap Buy Now: proceed to checkout (Flow 30) | Navigation |
| 43.20 | Resale ticket added to cart with seller info | Cart |
| 43.21 | Complete purchase same as primary | Checkout |
| 43.22 | On success, ticket transferred to buyer | Backend |
| 43.23 | Buyer sees ticket in My Tickets | Confirmation |
| 43.24 | Seller notified: Flow 42 | Notification |

---

# Notifications Flows

---

## Flow 44: View Notifications

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 44.1 | Tap notification bell icon (header) or Notifications tab | Navigation |
| 44.2 | Load notifications | Loading State |
| 44.3 | Display notification list | Notification List |
| 44.4 | Empty state if no notifications | Empty State |
| 44.5 | Show unread count badge on icon | Badge |
| 44.6 | Unread notifications visually distinct (bold, dot, background) | Unread Style |
| 44.7 | Each notification shows: icon, title, message, time | Notification Item |
| 44.8 | Group by date (Today, Yesterday, This Week, Earlier) | Date Groups |
| 44.9 | Notification types: purchase confirmation | Receipt Icon |
| 44.10 | Notification types: event reminder (24hr, 2hr before) | Calendar Icon |
| 44.11 | Notification types: event update (time change, venue change) | Alert Icon |
| 44.12 | Notification types: event cancelled | Cancel Icon |
| 44.13 | Notification types: ticket sold | Money Icon |
| 44.14 | Notification types: price drop on favorited event | Tag Icon |
| 44.15 | Notification types: new event from followed artist/venue | Star Icon |
| 44.16 | Notification types: resale ticket available for sold-out favorite | Ticket Icon |
| 44.17 | Notification types: transfer received | Gift Icon |
| 44.18 | Notification types: refund processed | Refund Icon |
| 44.19 | Tap notification to navigate to relevant screen | Deep Link |
| 44.20 | Mark as read on tap | Auto Mark Read |
| 44.21 | Swipe to delete (iOS) | Swipe Action |
| 44.22 | Long press for options (Android) | Long Press Menu |
| 44.23 | Options: Mark as read, Delete | Action Menu |
| 44.24 | "Mark All as Read" button | Bulk Action |
| 44.25 | Pull to refresh | Refresh |
| 44.26 | Infinite scroll for older notifications | Pagination |
| 44.27 | Settings gear icon: Flow 45 | Navigation |

---

## Flow 45: Notification Settings

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 45.1 | Tap settings icon from notifications or Profile then Notification Settings | Navigation |
| 45.2 | Load current settings | Loading State |
| 45.3 | Display notification preferences | Settings Form |
| 45.4 | Push Notifications section | Section Header |
| 45.5 | Master toggle: Enable push notifications | Toggle |
| 45.6 | If disabled, show prompt to enable in system settings | System Link |
| 45.7 | Purchase and Tickets section | Section Header |
| 45.8 | Toggle: Order confirmations | Toggle |
| 45.9 | Toggle: Event reminders | Toggle |
| 45.10 | Reminder timing: 24 hours, 2 hours, both | Options |
| 45.11 | Toggle: Ticket transfers received | Toggle |
| 45.12 | Toggle: Refund updates | Toggle |
| 45.13 | Resale section | Section Header |
| 45.14 | Toggle: Ticket sold notifications | Toggle |
| 45.15 | Toggle: Payout completed | Toggle |
| 45.16 | Toggle: Price suggestions for listings | Toggle |
| 45.17 | Events and Discovery section | Section Header |
| 45.18 | Toggle: Event updates (changes, cancellations) | Toggle |
| 45.19 | Toggle: New events from followed artists | Toggle |
| 45.20 | Toggle: New events from followed venues | Toggle |
| 45.21 | Toggle: Resale available for sold-out favorites | Toggle |
| 45.22 | Toggle: Price drops on favorited events | Toggle |
| 45.23 | Marketing section | Section Header |
| 45.24 | Toggle: Recommendations and suggestions | Toggle |
| 45.25 | Toggle: Special offers and promotions | Toggle |
| 45.26 | Email Preferences section | Section Header |
| 45.27 | Toggle: Email notifications (separate from push) | Toggle |
| 45.28 | Email frequency: Instant, Daily digest, Weekly digest | Options |
| 45.29 | SMS Preferences section | Section Header |
| 45.30 | Toggle: SMS notifications | Toggle |
| 45.31 | SMS only for: Event reminders, Critical updates | Options |
| 45.32 | Save changes | Auto-Save or Save Button |
| 45.33 | Success confirmation | Toast |
| 45.34 | Handle error saving | Error State |

---

# Social Flows

---

## Flow 46: See Friends Attending

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 46.1 | View event detail | Event Detail |
| 46.2 | See "Friends Going" section | Section |
| 46.3 | If not connected to contacts, show "Connect to see friends" | Prompt |
| 46.4 | Tap to connect | Navigation |
| 46.5 | Request contacts permission | System Dialog |
| 46.6 | Permission granted, sync contacts | Loading State |
| 46.7 | Permission denied, show explanation | Denied State |
| 46.8 | Match contacts to TicketToken users | Backend |
| 46.9 | Display friend avatars on event | Avatars |
| 46.10 | Show count "3 friends going" | Count |
| 46.11 | Tap to see full list | Modal |
| 46.12 | Display friend names and photos | Friend List |
| 46.13 | Tap friend to view their profile | Navigation |
| 46.14 | Privacy setting to hide your attendance | Settings Link |

---

## Flow 47: Invite Friends to Event

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 47.1 | Tap "Invite Friends" on event detail | Tap Action |
| 47.2 | Open invite modal | Modal |
| 47.3 | Show friends on TicketToken first | Friend List |
| 47.4 | Search friends | Search Input |
| 47.5 | Select friends to invite | Multi-Select |
| 47.6 | Selected friends highlighted | Selection State |
| 47.7 | Add personal message (optional) | Text Input |
| 47.8 | "Send Invite" button | CTA Button |
| 47.9 | Send invites | Loading State |
| 47.10 | Handle success | Success State |
| 47.11 | Friends receive notification | Backend |
| 47.12 | Show confirmation "Invites sent to X friends" | Toast |
| 47.13 | Option to share outside app | Share Button |
| 47.14 | Open native share sheet | Share Sheet |
| 47.15 | Share link via Messages, WhatsApp, etc | External Apps |

---

# Support Flows

---

## Flow 48: Contact Support

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 48.1 | Navigate to Profile then Help then Contact Support | Navigation |
| 48.2 | Display contact options | Contact Screen |
| 48.3 | Option: Live Chat | Option |
| 48.4 | Tap Live Chat | Navigation |
| 48.5 | Load chat interface | Loading State |
| 48.6 | Show queue position if waiting | Queue Status |
| 48.7 | Connected to agent | Chat Active |
| 48.8 | Send and receive messages | Chat Interface |
| 48.9 | Attach images (screenshot of issue) | Attachment |
| 48.10 | End chat option | End Button |
| 48.11 | Rate support experience | Rating Prompt |
| 48.12 | Chat transcript emailed | Email |
| 48.13 | Option: Email Support | Option |
| 48.14 | Tap Email Support | Action |
| 48.15 | Open email composer with pre-filled address | Email Composer |
| 48.16 | Option: Phone Support | Option |
| 48.17 | Tap Phone Support | Action |
| 48.18 | Show phone number | Display |
| 48.19 | Tap to call | System Action |
| 48.20 | Show support hours | Info |

---

## Flow 49: View FAQ

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 49.1 | Navigate to Profile then Help then FAQ | Navigation |
| 49.2 | Load FAQ content | Loading State |
| 49.3 | Display FAQ categories | Category List |
| 49.4 | Categories: Account, Purchasing, Tickets, Resale, Refunds, Venue Entry | Categories |
| 49.5 | Tap category to expand | Accordion |
| 49.6 | Display questions in category | Question List |
| 49.7 | Tap question to expand answer | Accordion |
| 49.8 | Display answer | Answer Content |
| 49.9 | Links within answers to relevant screens | Deep Links |
| 49.10 | Search FAQ | Search Input |
| 49.11 | Type query | Typing |
| 49.12 | Display matching questions | Search Results |
| 49.13 | No results state | Empty State |
| 49.14 | "Still need help?" link to Contact Support | Link |
| 49.15 | "Was this helpful?" feedback on each answer | Feedback |
| 49.16 | Thumbs up or down | Tap Action |
| 49.17 | If thumbs down, prompt for more feedback | Feedback Form |

---

## Flow 50: Report Problem

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 50.1 | Tap "Report Problem" from ticket, order, or listing | Navigation |
| 50.2 | Load report form | Loading State |
| 50.3 | Auto-populate context (ticket ID, order ID, event) | Pre-filled |
| 50.4 | Select problem category | Dropdown |
| 50.5 | Categories: Wrong ticket, Can't access ticket, Didn't receive ticket, Ticket not working at venue, Fraudulent listing, Other | Options |
| 50.6 | Describe the problem | Text Input |
| 50.7 | Attach screenshots (optional) | Image Picker |
| 50.8 | Select up to 5 images | Multi-Select |
| 50.9 | Preview attached images | Image Preview |
| 50.10 | Remove attached image | Remove Button |
| 50.11 | Select preferred contact method | Radio |
| 50.12 | Options: Email, Phone, In-app chat | Options |
| 50.13 | Confirm contact info is correct | Confirmation |
| 50.14 | "Submit Report" button | CTA Button |
| 50.15 | Submit report | Loading State |
| 50.16 | Handle success | Success State |
| 50.17 | Display case number | Case ID |
| 50.18 | Show expected response time | Timeline |
| 50.19 | Confirmation email sent | Email |
| 50.20 | Option to track case status | Link |
| 50.21 | Handle error submitting | Error State |
| 50.22 | Retry option | Retry Button |

---

# End of Fan User Flows

---

# Additional Flows (51-70)

---

## Flow 51: Enable 2FA

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 51.1 | Navigate to Settings then Security | Navigation |
| 51.2 | Tap "Enable Two-Factor Authentication" | Button |
| 51.3 | Choose 2FA method (SMS, Authenticator App) | Options |
| 51.4 | If SMS: verify phone number first | Phone Verification |
| 51.5 | If Authenticator: display QR code | QR Display |
| 51.6 | Scan QR with authenticator app | External App |
| 51.7 | Enter verification code from app | Code Input |
| 51.8 | Submit code | Loading State |
| 51.9 | Handle success: 2FA enabled | Success |
| 51.10 | Display backup codes | Backup Codes |
| 51.11 | Prompt to save backup codes | Warning |
| 51.12 | Confirm codes saved | Checkbox |
| 51.13 | Handle error (wrong code) | Error State |
| 51.14 | Option to disable 2FA later | Settings |

---

## Flow 52: Link Social Accounts

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 52.1 | Navigate to Settings then Connected Accounts | Navigation |
| 52.2 | View list of available connections | Account List |
| 52.3 | Show connected status for each (Google, Apple, Facebook) | Status |
| 52.4 | Tap "Connect" on unconnected account | Button |
| 52.5 | OAuth redirect to provider | External |
| 52.6 | User authorizes connection | External |
| 52.7 | Return to app | Deep Link |
| 52.8 | Handle success: account linked | Success |
| 52.9 | Handle error (already linked to another user) | Error State |
| 52.10 | Tap "Disconnect" on connected account | Button |
| 52.11 | Confirm disconnect | Confirmation Dialog |
| 52.12 | Handle success: account unlinked | Success |
| 52.13 | Prevent disconnect if only login method | Validation |

---

## Flow 53: Write Event Review

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 53.1 | After event ends, prompt to review | Push Notification |
| 53.2 | Or tap "Write Review" from past ticket | Button |
| 53.3 | Load review form | Loading State |
| 53.4 | Display event info | Event Summary |
| 53.5 | Select star rating (1-5) | Star Selector |
| 53.6 | Write review text | Text Input |
| 53.7 | Optional: rate specific aspects (venue, sound, crowd) | Sub-Ratings |
| 53.8 | Optional: add photos | Image Picker |
| 53.9 | Preview review | Preview |
| 53.10 | Submit review | Loading State |
| 53.11 | Handle success: review posted | Success |
| 53.12 | Review appears on event page | Confirmation |
| 53.13 | Handle error | Error State |
| 53.14 | Edit review later | Edit Option |
| 53.15 | Delete review | Delete Option |

---

## Flow 54: Browse Nearby Events

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 54.1 | Tap "Nearby" tab or filter | Navigation |
| 54.2 | Request location permission | System Dialog |
| 54.3 | Permission granted: get current location | Loading State |
| 54.4 | Permission denied: prompt to enter location manually | Manual Input |
| 54.5 | Load events near location | Loading State |
| 54.6 | Display events on map | Map View |
| 54.7 | Display events in list below map | List View |
| 54.8 | Toggle between map and list view | Toggle |
| 54.9 | Tap map pin: show event preview | Preview Card |
| 54.10 | Tap preview: go to event detail | Navigation |
| 54.11 | Adjust search radius | Radius Slider |
| 54.12 | Results update based on radius | Refresh |
| 54.13 | Empty state if no nearby events | Empty State |

---

## Flow 55: View Recommendations

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 55.1 | View "For You" section on home | Section |
| 55.2 | Or navigate to Discover then Recommended | Navigation |
| 55.3 | Load personalized recommendations | Loading State |
| 55.4 | Display recommended events | Event List |
| 55.5 | Show why recommended ("Because you like Rock") | Reason Tag |
| 55.6 | Empty state if new user (no history) | Empty State |
| 55.7 | Prompt to set preferences | CTA |
| 55.8 | Tap event: go to detail | Navigation |
| 55.9 | "Not interested" option on each | Dismiss Button |
| 55.10 | Event removed, improves future recommendations | Feedback |
| 55.11 | Pull to refresh for new recommendations | Refresh |

---

## Flow 56: Purchase Add-Ons

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 56.1 | After selecting tickets, show add-ons | Add-On Section |
| 56.2 | Display available add-ons (parking, merch, drinks) | Add-On List |
| 56.3 | Each shows: name, description, price | Add-On Card |
| 56.4 | Tap to add | Tap Action |
| 56.5 | Select quantity if applicable | Quantity Selector |
| 56.6 | Add-on added to cart | Cart Update |
| 56.7 | Show updated total | Price Update |
| 56.8 | Remove add-on | Remove Button |
| 56.9 | Some add-ons may require ticket type (VIP parking) | Validation |
| 56.10 | Continue to checkout with add-ons | Navigation |
| 56.11 | Add-ons appear in order confirmation | Confirmation |
| 56.12 | Add-ons appear in My Tickets | Ticket Detail |

---

## Flow 57: Join Waitlist

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 57.1 | View sold-out event | Event Detail |
| 57.2 | See "Join Waitlist" button instead of "Get Tickets" | CTA Button |
| 57.3 | Tap "Join Waitlist" | Tap Action |
| 57.4 | Select ticket type wanted | Ticket Selector |
| 57.5 | Select quantity wanted | Quantity Selector |
| 57.6 | Confirm contact method (push, email, SMS) | Contact Options |
| 57.7 | Submit waitlist request | Loading State |
| 57.8 | Handle success: added to waitlist | Success |
| 57.9 | Show position in waitlist (if available) | Position |
| 57.10 | When tickets available: receive notification | Notification |
| 57.11 | Tap notification: go to purchase | Deep Link |
| 57.12 | Limited time to complete purchase | Timer |
| 57.13 | Leave waitlist option | Leave Button |
| 57.14 | Confirm leave | Confirmation |

---

## Flow 58: Enter Presale Code

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 58.1 | View event not yet on sale | Event Detail |
| 58.2 | See "Presale" indicator | Badge |
| 58.3 | Tap "Enter Presale Code" | Button |
| 58.4 | Enter code | Code Input |
| 58.5 | Submit code | Loading State |
| 58.6 | Handle valid code: unlock presale tickets | Success |
| 58.7 | Display presale ticket options | Ticket List |
| 58.8 | Handle invalid code | Error State |
| 58.9 | Handle expired code | Error State |
| 58.10 | Handle code already used (if single-use) | Error State |
| 58.11 | Proceed to ticket selection | Navigation |
| 58.12 | Presale prices may differ from general sale | Price Display |

---

## Flow 59: View NFT Collection

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 59.1 | Navigate to Profile then My NFTs or Wallet | Navigation |
| 59.2 | Load NFT collection | Loading State |
| 59.3 | Display NFT grid | NFT Grid |
| 59.4 | Each NFT shows: image, event name, date | NFT Card |
| 59.5 | Empty state if no NFTs | Empty State |
| 59.6 | Filter: All, Upcoming, Past | Filter Tabs |
| 59.7 | Sort: Date, Event Name | Sort Options |
| 59.8 | Tap NFT: go to Flow 60 | Navigation |
| 59.9 | Pull to refresh | Refresh |
| 59.10 | Show total NFT count | Count |

---

## Flow 60: View NFT Details

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 60.1 | Tap NFT from collection | Navigation |
| 60.2 | Load NFT details | Loading State |
| 60.3 | Display NFT image/artwork | Image |
| 60.4 | Display event name | Title |
| 60.5 | Display event date attended | Date |
| 60.6 | Display venue | Venue |
| 60.7 | Display ticket type | Type |
| 60.8 | Display seat info if reserved | Seat Info |
| 60.9 | Display NFT metadata (mint date, token ID) | Metadata |
| 60.10 | Display blockchain info (Solana address) | Blockchain Info |
| 60.11 | "View on Explorer" link | External Link |
| 60.12 | Share NFT | Share Button |
| 60.13 | Download NFT image | Download Button |
| 60.14 | Link to original ticket | Ticket Link |

---

## Flow 61: Request Accessibility Accommodations

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 61.1 | View event detail | Event Detail |
| 61.2 | Tap "Accessibility" or wheelchair icon | Button |
| 61.3 | View accessibility info for venue | Info Screen |
| 61.4 | Tap "Request Accommodations" | CTA Button |
| 61.5 | Select accommodation type | Checkbox List |
| 61.6 | Options: wheelchair seating, ASL interpreter, assisted listening, companion seat, other | Options |
| 61.7 | Add details/notes | Text Input |
| 61.8 | Provide contact info | Contact Form |
| 61.9 | Submit request | Loading State |
| 61.10 | Handle success: request submitted | Success |
| 61.11 | Confirmation email sent | Email |
| 61.12 | Venue will contact to confirm | Expectation |
| 61.13 | View request status | Status Screen |
| 61.14 | Modify or cancel request | Edit Options |

---

## Flow 62: View Accessibility Info

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 62.1 | View venue page or event detail | Screen |
| 62.2 | Tap "Accessibility" section | Section |
| 62.3 | Display wheelchair accessibility | Info |
| 62.4 | Display accessible parking | Info |
| 62.5 | Display accessible restrooms | Info |
| 62.6 | Display assisted listening devices | Info |
| 62.7 | Display ASL interpretation availability | Info |
| 62.8 | Display service animal policy | Info |
| 62.9 | Display accessible seating areas | Info |
| 62.10 | Display elevator/ramp locations | Info |
| 62.11 | Contact for more info | Contact Link |
| 62.12 | Request accommodations: Flow 61 | CTA Button |

---

## Flow 63: View Terms of Service

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 63.1 | Navigate to Settings then Legal then Terms of Service | Navigation |
| 63.2 | Load terms | Loading State |
| 63.3 | Display terms document | Document View |
| 63.4 | Scroll through content | Scroll |
| 63.5 | Table of contents for sections | TOC |
| 63.6 | Tap section to jump | Navigation |
| 63.7 | Last updated date displayed | Date |
| 63.8 | Option to download PDF | Download Button |
| 63.9 | Link to contact for questions | Contact Link |

---

## Flow 64: View Privacy Policy

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 64.1 | Navigate to Settings then Legal then Privacy Policy | Navigation |
| 64.2 | Load policy | Loading State |
| 64.3 | Display privacy policy document | Document View |
| 64.4 | Scroll through content | Scroll |
| 64.5 | Sections: data collected, how used, sharing, rights | Sections |
| 64.6 | Last updated date displayed | Date |
| 64.7 | Option to download PDF | Download Button |
| 64.8 | Link to manage privacy settings | Settings Link |
| 64.9 | Link to request data: Flow 65 | CTA Link |

---

## Flow 65: Request Data Export

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 65.1 | Navigate to Settings then Privacy then Request My Data | Navigation |
| 65.2 | Display what data will be included | Info |
| 65.3 | Select data categories (optional) | Checkboxes |
| 65.4 | Select format (JSON, CSV) | Options |
| 65.5 | Confirm request | CTA Button |
| 65.6 | Verify identity (password or 2FA) | Verification |
| 65.7 | Submit request | Loading State |
| 65.8 | Handle success: request submitted | Success |
| 65.9 | Display timeline ("Ready in 24-48 hours") | Timeline |
| 65.10 | Email sent when ready | Email Notice |
| 65.11 | Download link in email | Email |
| 65.12 | Download link expires after X days | Expiry |
| 65.13 | View past data requests | History |

---

## Flow 66: First-Time Walkthrough

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 66.1 | After signup, walkthrough begins | Onboarding |
| 66.2 | Welcome screen | Welcome |
| 66.3 | Slide 1: Browse events near you | Feature Intro |
| 66.4 | Slide 2: Buy tickets securely | Feature Intro |
| 66.5 | Slide 3: Your tickets as NFTs | Feature Intro |
| 66.6 | Slide 4: Resell tickets you can't use | Feature Intro |
| 66.7 | Enable location permission prompt | Permission |
| 66.8 | Enable notifications permission prompt | Permission |
| 66.9 | Set favorite categories | Category Selector |
| 66.10 | Set home location | Location Input |
| 66.11 | Complete walkthrough | Done Button |
| 66.12 | Skip option on each step | Skip Button |
| 66.13 | Go to home screen | Navigation |
| 66.14 | Option to replay walkthrough in settings | Settings |

---

## Flow 67: Set Location Preferences

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 67.1 | Navigate to Settings then Location | Navigation |
| 67.2 | View current location setting | Current Setting |
| 67.3 | Option: Use current location | Toggle |
| 67.4 | Option: Set custom location | Button |
| 67.5 | Enter city or zip code | Search Input |
| 67.6 | Autocomplete suggestions | Suggestions |
| 67.7 | Select location | Selection |
| 67.8 | Confirm location | Save Button |
| 67.9 | Set default search radius | Radius Slider |
| 67.10 | Save preferences | Loading State |
| 67.11 | Handle success | Success Toast |
| 67.12 | Home feed updates to new location | Feed Update |

---

## Flow 68: Set Interest Preferences

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 68.1 | Navigate to Settings then Interests | Navigation |
| 68.2 | Or prompted during onboarding | Onboarding |
| 68.3 | Display category list | Category Grid |
| 68.4 | Categories: Music, Sports, Comedy, Theater, Festivals, etc. | Options |
| 68.5 | Tap to select/deselect | Toggle |
| 68.6 | Subcategories available (Music: Rock, Hip-Hop, Country) | Expandable |
| 68.7 | Minimum selections required (at least 1) | Validation |
| 68.8 | Save preferences | Save Button |
| 68.9 | Handle success | Success Toast |
| 68.10 | Recommendations update based on interests | Personalization |
| 68.11 | Can update anytime | Edit Option |

---

## Flow 69: View Listing Stats

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 69.1 | View active listing in My Listings | Listing Detail |
| 69.2 | See "Stats" section or tap for details | Section |
| 69.3 | Display total views | Stat |
| 69.4 | Display views over time (chart) | Chart |
| 69.5 | Display saves/favorites count | Stat |
| 69.6 | Display position among similar listings | Ranking |
| 69.7 | Display average time on listing | Stat |
| 69.8 | Suggestion to adjust price if low engagement | Tip |
| 69.9 | Refresh stats | Refresh Button |

---

## Flow 70: Contact Event Support

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 70.1 | From ticket detail or event page | Screen |
| 70.2 | Tap "Contact Event Support" or "Help with this event" | Button |
| 70.3 | Display event-specific contact options | Contact Options |
| 70.4 | Option: Contact venue directly | Venue Contact |
| 70.5 | Option: Contact TicketToken support | Platform Support |
| 70.6 | Pre-fill event/ticket info in support form | Pre-filled |
| 70.7 | Select issue type | Dropdown |
| 70.8 | Issue types: Event questions, Accessibility, Refund, Other | Options |
| 70.9 | Describe issue | Text Input |
| 70.10 | Submit | Loading State |
| 70.11 | Handle success | Success |
| 70.12 | Ticket created, confirmation shown | Confirmation |

---

# Updated Summary

## Summary

| Section | Flows | Steps |
|---------|-------|-------|
| Account | 13 | TBD |
| Discovery | 16 | TBD |
| Purchase | 12 | TBD |
| My Tickets | 6 | TBD |
| Resale | 6 | TBD |
| Notifications | 2 | 52 |
| Social | 2 | 29 |
| Support | 3 | 59 |
| NFT/Wallet | 2 | TBD |
| Accessibility | 2 | TBD |
| Legal | 3 | TBD |
| Onboarding | 3 | TBD |
| **Total** | **70** | **TBD** |

---

## Updated Flow Index

### Account (Flows 1-13)
1. Sign Up
2. Log In
3. Reset Password
4. Verify Email
5. Edit Profile
6. Manage Payment Methods
7. Manage Billing Addresses
8. Connect Phone Number
9. View Purchase History
10. Delete Account
11. Enable 2FA
12. Link Social Accounts
13. (reserved)

### Discovery (Flows 14-29)
14. Browse Events
15. Search Events
16. Filter Events
17. View Event Details
18. View Venue Page
19. View Artist Page
20. Favorite an Event
21. Follow a Venue
22. Follow an Artist
23. View Following
24. View Favorites
25. View Event on Map
26. Share Event
27. Browse Nearby Events
28. View Recommendations
29. Write Event Review

### Purchase (Flows 30-41)
30. Select Tickets (General Admission)
31. Select Seats (Reserved Seating)
32. Add to Cart
33. View Cart
34. Apply Promo Code
35. Purchase as Gift
36. Checkout
37. View Confirmation
38. Add to Wallet
39. Purchase Add-Ons
40. Join Waitlist
41. Enter Presale Code

### My Tickets (Flows 42-47)
42. View My Tickets
43. View Ticket Details
44. View Transfer History
45. Download Ticket PDF
46. Request Refund
47. Enter Venue (Show QR)

### Resale (Flows 48-53)
48. List Ticket for Resale
49. View Price Suggestions
50. Manage My Listings
51. Sale Notification
52. Buy Resale Ticket
53. View Listing Stats

### Notifications (Flows 54-55)
54. View Notifications
55. Notification Settings

### Social (Flows 56-57)
56. See Friends Attending
57. Invite Friends to Event

### Support (Flows 58-60)
58. Contact Support
59. View FAQ
60. Report Problem
61. Contact Event Support

### NFT/Wallet (Flows 62-63)
62. View NFT Collection
63. View NFT Details

### Accessibility (Flows 64-65)
64. Request Accessibility Accommodations
65. View Accessibility Info

### Legal (Flows 66-68)
66. View Terms of Service
67. View Privacy Policy
68. Request Data Export

### Onboarding (Flows 69-71)
69. First-Time Walkthrough
70. Set Location Preferences
71. Set Interest Preferences

---

# End of Fan User Flows (Updated)
