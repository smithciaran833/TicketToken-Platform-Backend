# TicketToken — Mockup Checklist

Version: 1.0
Last Updated: 2024-12-28

---

## Overview

**Total Mocks Needed: 34**
**Covers: 593 screens through reusable patterns**

---

## Phase 1: Layouts (4 mocks)

These are the shells that contain all other screens.

| # | Mock | Used By | Priority |
|---|------|---------|----------|
| 1 | Dashboard Layout (Sidebar + Header + Content) | Venue, Artist, Admin | 🔴 Critical |
| 2 | Fan Web Layout (Header + Content + Footer) | Fan Web | 🔴 Critical |
| 3 | Fan Mobile Layout (Header + Content + Tab Bar) | Fan Mobile | 🔴 Critical |
| 4 | Scanner App Layout (Minimal Header + Full Screen) | Scanner | 🟡 High |

**Deliverable:** 4 layout templates

---

## Phase 2: Common Patterns (12 mocks)

These patterns repeat across all apps.

| # | Mock | Pattern Type | Example Screens | Count |
|---|------|--------------|-----------------|-------|
| 5 | List Page - Cards | Grid of cards | Events list, Venues list | ~40 |
| 6 | List Page - Table | Data table | Transactions, Users, Orders | ~60 |
| 7 | Detail Page - Hero | Image + info + actions | Event detail, Venue detail | ~30 |
| 8 | Detail Page - Tabs | Tabbed content | Fan detail, Event management | ~25 |
| 9 | Form - Single Page | Simple form | Login, Create promo code | ~50 |
| 10 | Form - Multi-Step | Wizard flow | Checkout, Event creation | ~15 |
| 11 | Settings Page | Grouped settings | Account, Notifications | ~20 |
| 12 | Dashboard Home | Stats + charts + activity | All dashboard homes | 4 |
| 13 | Analytics Page | Charts + filters | Revenue, Attendance | ~15 |
| 14 | Modal - Confirm | Confirmation dialog | Delete, Cancel, Approve | ~40 |
| 15 | Modal - Form | Form in modal | Edit, Add, Quick create | ~30 |
| 16 | Empty State | No data illustration | All lists when empty | ~50 |

**Deliverable:** 12 pattern templates

---

## Phase 3: Auth Screens (4 mocks)

Same across all apps.

| # | Mock | Used By |
|---|------|---------|
| 17 | Login | All apps |
| 18 | Sign Up | Fan |
| 19 | Forgot Password | All apps |
| 20 | 2FA Verification | All apps |

**Deliverable:** 4 auth screens

---

## Phase 4: App-Specific Unique Screens (14 mocks)

Screens with unique UI that don't fit patterns.

### Fan App (5 mocks)

| # | Mock | Why Unique |
|---|------|------------|
| 21 | Event Detail (Fan) | Hero image, ticket selector, countdown |
| 22 | Ticket Display | QR code, animations, wallet-style |
| 23 | Checkout Flow | Cart, payment, confirmation |
| 24 | Seating Map Picker | Interactive seat selection |
| 25 | Resale Marketplace | Price comparisons, filters |

### Venue Dashboard (4 mocks)

| # | Mock | Why Unique |
|---|------|------------|
| 26 | Venue Dashboard Home | Revenue, events, activity combined |
| 27 | Event Creation Wizard | Multi-step with preview |
| 28 | Seating Map Builder | Drag-drop canvas |
| 29 | Live Scanning Dashboard | Real-time check-ins |

### Admin Dashboard (3 mocks)

| # | Mock | Why Unique |
|---|------|------------|
| 30 | Admin Dashboard Home | Platform-wide metrics |
| 31 | User Detail (Admin) | Full user view + actions |
| 32 | Moderation Queue | Review + approve/reject |

### Scanner App (2 mocks)

| # | Mock | Why Unique |
|---|------|------------|
| 33 | Scan Screen | Camera + result overlay |
| 34 | Scan Result States | Valid / Invalid / Already Used |

**Deliverable:** 14 unique screens

---

## Mockup Checklist Summary

| Phase | Mocks | Purpose |
|-------|-------|---------|
| 1. Layouts | 4 | App shells |
| 2. Patterns | 12 | Reusable templates |
| 3. Auth | 4 | Login/signup flow |
| 4. Unique | 14 | Special screens |
| **Total** | **34** | |

---

## Progress Tracker

### Phase 1: Layouts
- [ ] #1 Dashboard Layout
- [ ] #2 Fan Web Layout
- [ ] #3 Fan Mobile Layout
- [ ] #4 Scanner App Layout

### Phase 2: Common Patterns
- [ ] #5 List Page - Cards
- [ ] #6 List Page - Table
- [ ] #7 Detail Page - Hero
- [ ] #8 Detail Page - Tabs
- [ ] #9 Form - Single Page
- [ ] #10 Form - Multi-Step
- [ ] #11 Settings Page
- [ ] #12 Dashboard Home
- [ ] #13 Analytics Page
- [ ] #14 Modal - Confirm
- [ ] #15 Modal - Form
- [ ] #16 Empty State

### Phase 3: Auth
- [ ] #17 Login
- [ ] #18 Sign Up
- [ ] #19 Forgot Password
- [ ] #20 2FA Verification

### Phase 4: Unique Screens
- [ ] #21 Event Detail (Fan)
- [ ] #22 Ticket Display
- [ ] #23 Checkout Flow
- [ ] #24 Seating Map Picker
- [ ] #25 Resale Marketplace
- [ ] #26 Venue Dashboard Home
- [ ] #27 Event Creation Wizard
- [ ] #28 Seating Map Builder
- [ ] #29 Live Scanning Dashboard
- [ ] #30 Admin Dashboard Home
- [ ] #31 User Detail (Admin)
- [ ] #32 Moderation Queue
- [ ] #33 Scan Screen
- [ ] #34 Scan Result States

---

## How Mocks Map to Screens

| Apps | Total Screens | Covered By |
|------|---------------|------------|
| Fan | 102 | Layouts 2-3, Patterns 5-16, Auth 17-20, Unique 21-25 |
| Venue | 217 | Layout 1, Patterns 5-16, Auth 17-20, Unique 26-29 |
| Artist | 86 | Layout 1, Patterns 5-16, Auth 17-20 |
| Admin | 156 | Layout 1, Patterns 5-16, Auth 17-20, Unique 30-32 |
| Scanner | 32 | Layout 4, Unique 33-34 |

---

## Recommended Order

### Week 1: Foundation
1. Dashboard Layout (#1)
2. Fan Web Layout (#2)
3. List Page - Cards (#5)
4. List Page - Table (#6)
5. Detail Page - Hero (#7)
6. Form - Single Page (#9)
7. Login (#17)

### Week 2: Core Flows
8. Event Detail Fan (#21)
9. Ticket Display (#22)
10. Checkout Flow (#23)
11. Dashboard Home (#12)
12. Modal - Confirm (#14)
13. Modal - Form (#15)
14. Empty State (#16)

### Week 3: Dashboards
15. Venue Dashboard Home (#26)
16. Event Creation Wizard (#27)
17. Detail Page - Tabs (#8)
18. Settings Page (#11)
19. Analytics Page (#13)
20. Form - Multi-Step (#10)

### Week 4: Specialized
21. Seating Map Picker (#24)
22. Seating Map Builder (#28)
23. Resale Marketplace (#25)
24. Admin Dashboard Home (#30)
25. User Detail Admin (#31)
26. Moderation Queue (#32)

### Week 5: Mobile & Scanner
27. Fan Mobile Layout (#3)
28. Scanner App Layout (#4)
29. Scan Screen (#33)
30. Scan Result States (#34)
31. Live Scanning Dashboard (#29)

### Week 6: Remaining
32. Sign Up (#18)
33. Forgot Password (#19)
34. 2FA Verification (#20)

---

## Tools

| Tool | Use For | Link |
|------|---------|------|
| Figma | All mockups | figma.com |
| Lucide | Icons | lucide.dev |
| undraw.co | Illustrations | undraw.co |

---

## References

Use these docs while designing:

| Doc | Use For |
|-----|---------|
| `DESIGN_SYSTEM.md` | Colors, fonts, spacing, components |
| `FAN_SCREENS.md` | Fan app screen specs |
| `VENUE_SCREENS.md` | Venue dashboard screen specs |
| `ARTIST_SCREENS.md` | Artist dashboard screen specs |
| `ADMIN_SCREENS.md` | Admin dashboard screen specs |
| `SCANNER_SCREENS.md` | Scanner app screen specs |

---

## Acceptance Criteria

Each mock should have:

- [ ] Desktop view (1440px wide)
- [ ] Mobile view (375px wide) - where applicable
- [ ] Follows Design System colors/typography
- [ ] Real-ish content (not lorem ipsum)
- [ ] Loading state (skeleton) - optional for first pass
- [ ] Empty state - where applicable
