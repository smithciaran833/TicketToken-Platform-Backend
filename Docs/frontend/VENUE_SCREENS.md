# TicketToken — Venue Dashboard Screens (Web)

Generated: 2024-12-28
Total Screens: 205
Total Flows: 312
Platform: React (Web)

---

## Navigation Structure

### Sidebar Navigation
┌──────────────────┬─────────────────────────────────────┐
│                  │                                     │
│  TicketToken     │                                     │
│                  │                                     │
│  Dashboard       │                                     │
│                  │                                     │
│  Events          │         Page Content                │
│  Tickets         │                                     │
│  Scanning        │                                     │
│                  │                                     │
│  Analytics       │                                     │
│  Financials      │                                     │
│  Marketing       │                                     │
│                  │                                     │
│  Venue Setup     │                                     │
│  Team            │                                     │
│  Support         │                                     │
│                  │                                     │
│  ──────────────  │                                     │
│  Settings        │                                     │
│  [Venue Name ▼]  │                                     │
└──────────────────┴─────────────────────────────────────┘

### Multi-Venue Support
- Venue switcher dropdown at bottom of sidebar
- Cross-venue analytics accessible from main Analytics

---

## Screen Index

### Auth (7 screens)
1. Login
2. Forgot Password
3. Reset Password
4. Accept Invite
5. Verify Email
6. Onboarding Welcome
7. Connect Stripe

### Dashboard (1 screen)
8. Dashboard Home

### Events (20 screens)
9. Event List
10. Event Calendar
11. Create Event
12. Event Detail
13. Edit Event
14. Duplicate Event Modal
15. Cancel Event Modal
16. Event Content
17. Event Tickets
18. Event Seating Map
19. Event Access
20. Event Logistics
21. Event Guest List
22. Add Guest Modal
23. Event Automation
24. Event Post-Event Summary
25. Event Reviews
26. Respond to Review Modal
27. Preview Event
28. Event FAQ

### Tickets (13 screens)
29. Ticket Types List
30. Create Ticket Type
31. Edit Ticket Type
32. Ticket Bundles
33. Create Bundle
34. Add-Ons List
35. Create Add-On
36. Promo Codes List
37. Create Promo Code
38. Promo Code Detail
39. Edit Promo Code
40. Bulk Promo Codes
41. Promo Code Analytics

### Scanning (23 screens)
42. Scanner Home
43. Select Event to Scan
44. Select Entry Point
45. Scan Screen
46. Scan Result Valid
47. Scan Result Invalid
48. Scan Result Already Used
49. Scan Result Wrong Entry
50. Manual Lookup
51. Manual Override
52. Override Reason Modal
53. Scan History
54. Live Attendance
55. Zone Occupancy
56. Capacity Alerts
57. Scan Out Mode
58. Scan Re-Entry Mode
59. Switch Entry Point Modal
60. Scan Add-Ons Result
61. Scan VIP Access Result
62. Flag Attendee Modal
63. Banned List
64. Offline Mode

### Analytics (10 screens)
65. Analytics Dashboard
66. Sales Analytics
67. Revenue Analytics
68. Attendance Analytics
69. Audience Demographics
70. Geographic Analytics
71. Event Comparison
72. Custom Reports
73. Saved Reports
74. Schedule Report Modal

### Financials (14 screens)
75. Financials Overview
76. Revenue Dashboard
77. Transactions List
78. Transaction Detail
79. Payouts List
80. Payout Detail
81. Payout Settings
82. Failed Payouts
83. Refunds List
84. Refund Detail
85. Issue Refund Modal
86. Chargebacks
87. Respond to Chargeback
88. Tax Documents

### Marketing (7 screens)
89. Marketing Dashboard
90. Announcements
91. Create Announcement
92. Message Ticket Holders
93. Scheduled Messages
94. Message History
95. Message Templates

### Resale Settings (8 screens)
96. Resale Settings
97. Enable Disable Resale
98. Price Rules
99. Royalty Settings
100. Resale Marketplace View
101. Resale Analytics
102. Resale Policies
103. Flag Listing Modal

### Venue Setup - Profile (8 screens)
104. Venue Profile
105. Edit Venue Profile
106. Venue Photos Videos
107. Venue Social Links
108. Venue Hours
109. Preview Venue Page
110. Publish Venue Modal
111. Age Restrictions

### Venue Setup - Location (8 screens)
112. Location Address
113. Parking Info
114. Transit Info
115. Load-In Info
116. Curfew Noise Rules
117. Entry Points
118. Exit Points
119. Re-Entry Policy

### Venue Setup - Capacity (6 screens)
120. Capacity Settings
121. Seating Configurations
122. Seating Map Builder
123. Sections Zones
124. Accessibility Seating
125. Preview Seating Map

### Venue Setup - VIP (6 screens)
126. VIP Areas
127. VIP Access Rules
128. VIP Amenities
129. Guest Lists
130. Will Call Settings
131. ID Verification Rules

### Venue Setup - Legal (6 screens)
132. Tax Information
133. Insurance Certificates
134. Liquor License
135. Payout Setup Stripe
136. Verification Status
137. Submit Verification

### Venue Setup - Branding (5 screens)
138. Logo Colors
139. Ticket Design
140. Email Branding
141. Preview Branding
142. Custom Domain

### Venue Setup - Staff (8 screens)
143. Staff Roles
144. Staff List
145. Add Staff Member
146. Staff Assignments
147. Security Checkpoints
148. Staff Check-In
149. Staff Announcements
150. Staff On Duty

### Venue Setup - Communication (6 screens)
151. Email Templates
152. Create Email Template
153. Preview Email Template
154. SMS Templates
155. Create SMS Template
156. Notification Settings

### Venue Setup - Policies (5 screens)
157. Refund Policy
158. Age Policy
159. Bag Policy
160. Custom Policies
161. Create Custom Policy

### Venue Setup - Safety (4 screens)
162. Emergency Contacts
163. Evacuation Plan
164. Safety Protocols
165. Medical Stations

### Operations (7 screens)
166. Incidents List
167. Log Incident
168. Incident Detail
169. Equipment List
170. Add Equipment
171. Equipment Check
172. Report Equipment Issue

### Multi-Venue (5 screens)
173. Venue Switcher
174. All Venues List
175. Add New Venue
176. Cross-Venue Analytics
177. Compare Venues

### Team (8 screens)
178. Team List
179. Invite Team Member
180. Team Member Detail
181. Edit Permissions
182. Remove Member Modal
183. Transfer Ownership
184. Audit Log
185. 2FA Setup

### Support (27 screens)
186. Help Center
187. Search Help
188. Help Article
189. Tutorial Videos
190. Getting Started Guide
191. Best Practices
192. Contact Support
193. Live Chat
194. Schedule Call
195. Emergency Hotline
196. Account Manager
197. Request Account Manager
198. Training Sessions
199. Training Materials
200. Sandbox Mode
201. Submit Bug Report
202. Request Feature
203. Vote on Features
204. Support Tickets
205. Support Ticket Detail
206. Terms of Service
207. Privacy Policy
208. Compliance Guides
209. Tax Forms Download
210. Platform Announcements
211. Platform Status
212. Subscribe to Updates

### Settings (5 screens)
213. Account Settings
214. Edit Profile
215. Change Password
216. Enable 2FA
217. Notification Preferences

---

# Auth Screens

---

## 1. Login

**Location:** /login
**Flow(s):** 2

### Components
- TicketToken logo
- "Venue Dashboard" header
- Email input
- Password input
- "Remember me" checkbox
- "Log In" button
- "Forgot Password?" link
- "Don't have an account? Contact Sales" link

### Data Needed
- None

### Actions
- Enter credentials → Validate → Dashboard (or 2FA if enabled)
- Tap "Forgot Password?" → Forgot Password
- Tap "Contact Sales" → External sales page

### States
- Default
- Loading (authenticating)
- Error (invalid credentials)
- Account locked

### Validation
- Email: required, valid format
- Password: required

---

## 2. Forgot Password

**Location:** /forgot-password
**Flow(s):** 3

### Components
- Back to login link
- "Reset Password" header
- Instruction text
- Email input
- "Send Reset Link" button

### Data Needed
- None

### Actions
- Enter email → Submit → Success message

### States
- Default
- Loading (sending)
- Success (email sent)
- Error (email not found)

---

## 3. Reset Password

**Location:** /reset-password/:token
**Flow(s):** 3

### Components
- TicketToken logo
- "Create New Password" header
- New password input
- Confirm password input
- Password requirements list
- "Reset Password" button

### Data Needed
- Reset token from URL

### Actions
- Enter passwords → Validate → Login with success message

### States
- Default
- Loading
- Success
- Error (invalid/expired token)

### Validation
- Password: min 8 chars, 1 uppercase, 1 number, 1 special
- Confirm: matches password

---

## 4. Accept Invite

**Location:** /invite/:token
**Flow(s):** 1, 10

### Components
- TicketToken logo
- "You've Been Invited" header
- Venue name display
- Inviter name display
- Role/permissions display
- Name input
- Password input
- Confirm password input
- Terms checkbox
- "Accept Invitation" button

### Data Needed
- Invite token
- Venue info
- Inviter info
- Assigned role

### Actions
- Complete form → Accept → Onboarding Welcome

### States
- Default
- Loading
- Invalid/expired invite
- Already accepted

---

## 5. Verify Email

**Location:** /verify-email/:token
**Flow(s):** 4

### Components
- TicketToken logo
- Loading spinner (while verifying)
- Success: "Email Verified!" with continue button
- Error: "Link Expired" with resend option

### Data Needed
- Verification token

### Actions
- Auto-verify on load → Success or Error
- Tap "Continue" → Dashboard
- Tap "Resend" → Resend verification

### States
- Verifying
- Success
- Error (invalid/expired)

---

## 6. Onboarding Welcome

**Location:** /onboarding
**Flow(s):** 1

### Components
- "Welcome to TicketToken" header
- Venue name
- Progress steps indicator:
  1. Create Account ✓
  2. Set Up Venue Profile
  3. Connect Payments
  4. Create First Event
- "Get Started" button
- Skip option

### Data Needed
- Venue basic info
- Onboarding progress

### Actions
- Tap "Get Started" → Venue Profile setup
- Tap "Skip" → Dashboard (incomplete onboarding banner)

### States
- Default

---

## 7. Connect Stripe

**Location:** /onboarding/payments
**Flow(s):** 47

### Components
- Progress indicator
- "Connect Your Bank Account" header
- Explanation text
- Benefits list
- Stripe Connect button
- "Skip for Now" link
- Stripe Connect embedded flow

### Data Needed
- Venue ID

### Actions
- Tap "Connect with Stripe" → Stripe Connect OAuth
- Complete Stripe flow → Return to onboarding
- Tap "Skip" → Dashboard (payments incomplete banner)

### States
- Default
- Stripe flow in progress
- Connected successfully
- Connection failed

---

# Dashboard Screens

---

## 8. Dashboard Home

**Location:** /dashboard
**Flow(s):** 186, 187, 188

### Components
- Header: "Dashboard" + date range selector
- Quick stats cards:
  - Total Revenue (period)
  - Tickets Sold (period)
  - Upcoming Events count
  - Active Listings (resale)
- Revenue chart (line graph)
- Upcoming Events list (next 5)
- Recent Sales table (last 10)
- Recent Activity feed
- Alerts/notifications panel
- Quick actions:
  - Create Event
  - View Reports
  - Message Customers

### Data Needed
- Revenue data
- Ticket sales data
- Upcoming events
- Recent transactions
- Activity feed
- Alerts

### Actions
- Change date range → Refresh stats
- Tap event → Event Detail
- Tap transaction → Transaction Detail
- Tap alert → Related screen
- Tap quick action → Navigate

### States
- Loading (skeleton)
- Default
- Error
- Empty (new venue)

---

# Events Screens

---

## 9. Event List

**Location:** /events
**Flow(s):** 107

### Components
- Header: "Events" + "Create Event" button
- Tabs: All, Upcoming, Past, Draft, Cancelled
- Search input
- Filter dropdown (category, date range)
- Sort dropdown (date, name, sales)
- Events table:
  - Event image thumbnail
  - Event name
  - Date
  - Venue (if multi-venue)
  - Status badge
  - Tickets sold / total
  - Revenue
  - Actions dropdown
- Pagination
- Bulk actions (if selected)

### Data Needed
- Events list (paginated)
- Filter options

### Actions
- Tap "Create Event" → Create Event
- Tap tab → Filter list
- Search → Filter results
- Tap event row → Event Detail
- Tap actions → Dropdown (Edit, Duplicate, Cancel, etc.)
- Select multiple → Enable bulk actions

### States
- Loading
- Default
- Empty
- Filtered empty

---

## 10. Event Calendar

**Location:** /events/calendar
**Flow(s):** 107

### Components
- Header: "Event Calendar" + view toggles
- View options: Month, Week, Day
- Navigation: Previous/Next, Today
- Calendar grid
- Events displayed on calendar
- Event preview on hover/click
- "Create Event" button

### Data Needed
- Events with dates

### Actions
- Navigate months → Load events
- Tap event → Event Detail
- Tap date → Create event on that date
- Change view → Update display

### States
- Loading
- Default
- Empty month

---

## 11. Create Event

**Location:** /events/new
**Flow(s):** 108-120

### Components
- Header: "Create Event" + Save/Publish buttons
- Progress indicator (steps)
- Form sections (accordion or tabs):
  - **Basic Info:**
    - Event name input
    - Event category dropdown
    - Event description (rich text)
    - Event image upload
  - **Date & Time:**
    - Event date picker
    - Start time picker
    - End time picker
    - Doors open time picker
    - Timezone selector
  - **Location:**
    - Venue selector (if multi-venue)
    - Entry points assignment
  - **Tickets:**
    - Add ticket type button
    - Ticket types list (inline or link to Tickets)
  - **Settings:**
    - Age restriction selector
    - Visibility (Public, Private, Password-protected)
    - Presale settings
- Artist search/add
- "Save as Draft" button
- "Preview" button
- "Publish" button

### Data Needed
- Categories
- Venues (if multi)
- Entry points
- Artists (search)

### Actions
- Complete sections → Enable publish
- Tap "Save as Draft" → Save → Event List
- Tap "Preview" → Preview Event
- Tap "Publish" → Confirm → Event goes live

### States
- Default (new)
- Saving
- Validation errors
- Saved (draft)

### Validation
- Name: required
- Date: required, future date
- At least one ticket type (for publish)

---

## 12. Event Detail

**Location:** /events/:id
**Flow(s):** 121

### Components
- Header: Event name + status badge + actions dropdown
- Event image (hero)
- Quick stats:
  - Tickets sold / total
  - Revenue
  - Days until event
  - Check-ins (if past/ongoing)
- Tabs:
  - Overview
  - Tickets
  - Sales
  - Guest List
  - Resale
  - Settings
- **Overview tab:**
  - Event details (date, time, venue)
  - Description
  - Artists
  - Sales chart
  - Recent activity
- Action buttons: Edit, Duplicate, Message Attendees, Cancel

### Data Needed
- Event object (full)
- Sales data
- Activity feed

### Actions
- Tap tab → Switch view
- Tap "Edit" → Edit Event
- Tap "Duplicate" → Duplicate Event Modal
- Tap "Cancel" → Cancel Event Modal
- Tap actions dropdown → More options

### States
- Loading
- Default
- Event cancelled
- Event passed

---

## 13. Edit Event

**Location:** /events/:id/edit
**Flow(s):** 122

### Components
- Same as Create Event but pre-filled
- Warning banner if tickets sold (some fields locked)
- Change log link

### Data Needed
- Event object
- Edit restrictions (based on sales)

### Actions
- Edit fields → Save
- View change log → Modal

### States
- Default
- Saving
- Validation errors

### Notes
- Some fields locked after tickets sold:
  - Date (requires confirmation)
  - Venue (locked)
  - Ticket prices (locked for sold types)

---

## 14. Duplicate Event Modal

**Location:** /events/:id (modal)
**Flow(s):** 123

### Components
- "Duplicate Event" header
- New event name input (pre-filled with "Copy of [name]")
- New date picker
- Options:
  - Copy ticket types
  - Copy guest list
  - Copy settings
- "Create Duplicate" button
- "Cancel" button

### Data Needed
- Original event

### Actions
- Set options → Create → Edit Event (new)

### States
- Default
- Creating

---

## 15. Cancel Event Modal

**Location:** /events/:id (modal)
**Flow(s):** 124

### Components
- "Cancel Event" header
- Warning: "This will cancel [event name]"
- Impact summary:
  - X tickets will be refunded
  - $X in refunds
- Cancellation reason dropdown
- Additional notes input
- Notify attendees checkbox (default checked)
- Refund options:
  - Full refund (default)
  - Partial refund
  - Credit for future event
- "Cancel Event" button (destructive)
- "Keep Event" button

### Data Needed
- Event details
- Tickets sold count
- Revenue to refund

### Actions
- Confirm → Cancel event → Process refunds

### States
- Default
- Processing
- Completed

---

## 16. Event Content

**Location:** /events/:id/content
**Flow(s):** 125-130

### Components
- Header: "Event Content"
- Description editor (rich text)
- Image gallery manager:
  - Primary image
  - Additional images
  - Drag to reorder
  - Upload new
- Video section:
  - YouTube/Vimeo embed input
  - Upload video
- Tags input
- SEO section:
  - Meta title
  - Meta description
- Save button

### Data Needed
- Event content
- Uploaded media

### Actions
- Edit content → Save
- Upload media → Add to gallery
- Reorder → Update order

### States
- Default
- Saving
- Upload progress

---

## 17. Event Tickets

**Location:** /events/:id/tickets
**Flow(s):** 131-140

### Components
- Header: "Tickets" + "Add Ticket Type" button
- Ticket types table:
  - Name
  - Price
  - Quantity (sold / total)
  - Status (On Sale, Sold Out, Scheduled)
  - Sale dates
  - Actions
- Bundles section
- Add-ons section
- Promo codes link

### Data Needed
- Event ticket types
- Sales per type

### Actions
- Tap "Add Ticket Type" → Create Ticket Type
- Tap type → Edit Ticket Type
- Tap actions → Edit, Disable, Delete

### States
- Loading
- Default
- Empty (no ticket types)

---

## 18. Event Seating Map

**Location:** /events/:id/seating
**Flow(s):** 141

### Components
- Header: "Seating Map"
- Seating map display
- Section list with:
  - Section name
  - Capacity
  - Price
  - Sold count
- Color legend
- Edit section prices
- View sold seats

### Data Needed
- Seating configuration
- Sales by section/seat

### Actions
- Tap section → Edit section
- Tap seat → View ticket holder

### States
- Loading
- Default
- No seating map (GA event)

---

## 19. Event Access

**Location:** /events/:id/access
**Flow(s):** 142-145

### Components
- Header: "Access Settings"
- Visibility section:
  - Public (default)
  - Private (unlisted)
  - Password protected
- Password input (if protected)
- Presale section:
  - Enable presale toggle
  - Presale start date/time
  - Presale end date/time
  - Presale codes list
  - Add presale code button
- General sale section:
  - Sale start date/time
  - Sale end date/time
- Save button

### Data Needed
- Event access settings
- Presale codes

### Actions
- Toggle settings → Save
- Add presale code → Modal

### States
- Default
- Saving

---

## 20. Event Logistics

**Location:** /events/:id/logistics
**Flow(s):** 146-150

### Components
- Header: "Event Logistics"
- Entry points section:
  - Assign entry points for this event
  - Entry point list with toggles
- Capacity override:
  - Use venue default
  - Custom capacity input
- Event-specific policies:
  - Override venue policies toggle
  - Policy editors
- Internal notes:
  - Notes visible only to staff
  - Rich text editor
- Staff assignments section:
  - Assigned staff list
  - Add staff button
- Save button

### Data Needed
- Venue entry points
- Venue default capacity
- Event logistics settings
- Staff list

### Actions
- Toggle entry points → Update
- Set capacity → Update
- Add staff → Staff selector modal

### States
- Default
- Saving

---

## 21. Event Guest List

**Location:** /events/:id/guests
**Flow(s):** 151-153

### Components
- Header: "Guest List" + "Add Guest" button
- Guest list stats:
  - Total guests
  - Checked in
  - Remaining
- Search input
- Filter: All, VIP, Comp, Artist
- Guest table:
  - Name
  - Email
  - Type (VIP, Comp, etc.)
  - Tickets
  - Check-in status
  - Added by
  - Actions
- Export button
- Import button

### Data Needed
- Guest list entries
- Check-in status

### Actions
- Tap "Add Guest" → Add Guest Modal
- Search → Filter results
- Tap guest → Edit guest
- Tap actions → Remove, Resend confirmation

### States
- Loading
- Default
- Empty

---

## 22. Add Guest Modal

**Location:** /events/:id/guests (modal)
**Flow(s):** 152

### Components
- "Add Guest" header
- Name input
- Email input
- Phone input (optional)
- Guest type dropdown:
  - VIP
  - Comp
  - Artist guest
  - Press
  - Other
- Number of tickets input
- Ticket type selector
- Notes input
- Send confirmation email checkbox
- "Add Guest" button
- "Cancel" button

### Data Needed
- Available ticket types

### Actions
- Complete form → Add → Close modal

### States
- Default
- Adding
- Error (validation, capacity)

---

## 23. Event Automation

**Location:** /events/:id/automation
**Flow(s):** 154-156

### Components
- Header: "Automation"
- Automated emails section:
  - Order confirmation (always on)
  - Event reminder toggle
    - When: days before dropdown
  - Day-of info toggle
    - When: hours before dropdown
  - Post-event follow-up toggle
    - When: days after dropdown
    - Include survey toggle
- Each email shows:
  - Preview link
  - Edit template link
  - Status (enabled/disabled)
- Save button

### Data Needed
- Automation settings
- Email templates

### Actions
- Toggle automations → Save
- Tap preview → Email preview modal
- Tap edit → Edit template

### States
- Default
- Saving

---

## 24. Event Post-Event Summary

**Location:** /events/:id/summary
**Flow(s):** 157, 160

### Components
- Header: "Event Summary"
- Stats cards:
  - Total attendance
  - No-shows
  - Revenue
  - Average ticket price
- Attendance chart (check-ins over time)
- Sales breakdown:
  - By ticket type
  - By promo code
- Demographics summary
- Reviews summary with link
- Download report button

### Data Needed
- Event summary data
- Attendance data
- Sales breakdown

### Actions
- Tap "Download Report" → Generate PDF/CSV

### States
- Loading
- Default
- Event not yet completed

---

## 25. Event Reviews

**Location:** /events/:id/reviews
**Flow(s):** 158, 159

### Components
- Header: "Reviews"
- Overall rating display
- Rating breakdown bars
- Reviews list:
  - Reviewer name
  - Rating
  - Date
  - Review text
  - Helpful count
  - "Respond" button (if not responded)
  - Response (if responded)
  - Flag button
- Sort: Most Recent, Highest, Lowest
- Filter: All, Needs Response, Responded

### Data Needed
- Event reviews

### Actions
- Tap "Respond" → Respond to Review Modal
- Tap "Flag" → Flag review
- Sort/Filter → Update list

### States
- Loading
- Default
- Empty (no reviews)

---

## 26. Respond to Review Modal

**Location:** /events/:id/reviews (modal)
**Flow(s):** 159

### Components
- "Respond to Review" header
- Original review display
- Response text area
- "Post Response" button
- "Cancel" button
- Note: "Your response will be public"

### Data Needed
- Review object

### Actions
- Type response → Post → Close modal

### States
- Default
- Posting
- Error

---

## 27. Preview Event

**Location:** /events/:id/preview
**Flow(s):** 119

### Components
- "Preview" header with close button
- Event page as fans see it
- Device toggle: Desktop, Tablet, Mobile
- "Edit Event" button
- "Publish" button (if draft)

### Data Needed
- Event object (full)

### Actions
- Toggle device → Change preview
- Tap "Edit Event" → Edit Event
- Tap "Publish" → Publish confirmation

### States
- Loading
- Default

---

## 28. Event FAQ

**Location:** /events/:id/faq
**Flow(s):** 128

### Components
- Header: "Event FAQ" + "Add Question" button
- FAQ list:
  - Question
  - Answer
  - Order
  - Actions (Edit, Delete, Reorder)
- Drag to reorder
- "Use Venue Defaults" toggle

### Data Needed
- Event FAQs
- Venue default FAQs

### Actions
- Tap "Add Question" → Add FAQ modal
- Tap question → Edit
- Drag → Reorder
- Toggle defaults → Use venue FAQs

### States
- Default
- Empty

---

# Tickets Screens

---

## 29. Ticket Types List

**Location:** /tickets
**Flow(s):** 131

### Components
- Header: "Ticket Types" + "Create Ticket Type" button
- Filter by event dropdown
- Ticket types table:
  - Name
  - Event
  - Price
  - Quantity
  - Sold
  - Status
  - Actions
- Pagination

### Data Needed
- Ticket types across events

### Actions
- Filter by event → Update list
- Tap "Create" → Create Ticket Type
- Tap row → Edit Ticket Type
- Tap actions → Edit, Disable, Delete

### States
- Loading
- Default
- Empty

---

## 30. Create Ticket Type

**Location:** /tickets/new
**Flow(s):** 132, 135-138

### Components
- Header: "Create Ticket Type"
- Event selector (if not from event context)
- Basic info:
  - Name input
  - Description input
  - Price input
  - Quantity input
- Sale settings:
  - Sale start date/time
  - Sale end date/time
  - Or "Use event dates" checkbox
- Limits:
  - Min per order
  - Max per order
- Visibility:
  - Public
  - Hidden (only with link)
  - Presale only
- Advanced:
  - Transferable toggle
  - Resalable toggle
- "Create" button
- "Cancel" button

### Data Needed
- Events list (for selector)

### Actions
- Complete form → Create → Ticket Types List

### States
- Default
- Creating
- Validation errors

### Validation
- Name: required
- Price: required, >= 0
- Quantity: required, > 0

---

## 31. Edit Ticket Type

**Location:** /tickets/:id/edit
**Flow(s):** 133, 134

### Components
- Same as Create but pre-filled
- Warning if tickets sold (some fields locked)
- Sales count display
- "Delete" button (if no sales)

### Data Needed
- Ticket type object
- Sales count

### Actions
- Edit fields → Save
- Tap "Delete" → Confirm → Delete

### States
- Default
- Saving
- Locked fields (tickets sold)

---

## 32. Ticket Bundles

**Location:** /tickets/bundles
**Flow(s):** 134, 139

### Components
- Header: "Bundles" + "Create Bundle" button
- Bundles table:
  - Name
  - Event
  - Included tickets
  - Price
  - Savings %
  - Sold
  - Actions
- Empty state with explanation

### Data Needed
- Bundles list

### Actions
- Tap "Create Bundle" → Create Bundle
- Tap row → Edit bundle

### States
- Loading
- Default
- Empty

---

## 33. Create Bundle

**Location:** /tickets/bundles/new
**Flow(s):** 139

### Components
- Header: "Create Bundle"
- Event selector
- Bundle name input
- Description input
- Included tickets:
  - Add ticket type button
  - List of included types with quantity
- Pricing:
  - Calculate from items
  - Or set custom price
  - Savings display
- Quantity available
- Sale dates
- "Create" button

### Data Needed
- Events
- Ticket types per event

### Actions
- Add tickets → Calculate pricing
- Set custom price → Override
- Create → Save

### States
- Default
- Creating
- Validation errors

---

## 34. Add-Ons List

**Location:** /tickets/addons
**Flow(s):** 136, 140

### Components
- Header: "Add-Ons" + "Create Add-On" button
- Add-ons table:
  - Name
  - Event (or "All Events")
  - Category
  - Price
  - Sold
  - Status
  - Actions
- Filter by event
- Filter by category

### Data Needed
- Add-ons list

### Actions
- Tap "Create" → Create Add-On
- Tap row → Edit add-on

### States
- Loading
- Default
- Empty

---

## 35. Create Add-On

**Location:** /tickets/addons/new
**Flow(s):** 137, 140

### Components
- Header: "Create Add-On"
- Event selector (or "All Events")
- Name input
- Description input
- Category dropdown:
  - Parking
  - Merchandise
  - Food & Drink
  - VIP Upgrade
  - Other
- Image upload
- Price input
- Quantity (optional, unlimited if blank)
- Per-order limit
- "Create" button

### Data Needed
- Events list
- Categories

### Actions
- Complete form → Create

### States
- Default
- Creating
- Validation errors

---

## 36. Promo Codes List

**Location:** /tickets/promos
**Flow(s):** 242-245

### Components
- Header: "Promo Codes" + "Create Promo Code" button
- Tabs: Active, Expired, All
- Search input
- Promo codes table:
  - Code
  - Discount
  - Event(s)
  - Uses (used / limit)
  - Valid dates
  - Status
  - Actions
- Export button

### Data Needed
- Promo codes list

### Actions
- Tap "Create" → Create Promo Code
- Tap tab → Filter
- Search → Filter
- Tap row → Promo Code Detail

### States
- Loading
- Default
- Empty

---

## 37. Create Promo Code

**Location:** /tickets/promos/new
**Flow(s):** 246-250

### Components
- Header: "Create Promo Code"
- Code input (auto-generate option)
- Discount type:
  - Percentage off
  - Fixed amount off
  - Free ticket
- Discount value input
- Applies to:
  - All events
  - Specific events (multi-select)
  - Specific ticket types (multi-select)
- Usage limits:
  - Total uses
  - Uses per customer
- Valid dates:
  - Start date
  - End date
- "Create" button
- "Create & Add Another" button

### Data Needed
- Events list
- Ticket types

### Actions
- Complete form → Create

### States
- Default
- Creating
- Validation errors

### Validation
- Code: required, unique
- Discount: required

---

## 38. Promo Code Detail

**Location:** /tickets/promos/:id
**Flow(s):** 251

### Components
- Header: Code name + status badge
- Code display (large, copyable)
- Stats:
  - Times used
  - Revenue impact
  - Orders using code
- Settings summary
- Usage list:
  - Order ID
  - Customer
  - Date
  - Discount applied
- "Edit" button
- "Deactivate" button

### Data Needed
- Promo code object
- Usage data

### Actions
- Tap "Edit" → Edit Promo Code
- Tap "Deactivate" → Confirm → Deactivate
- Tap order → Order detail

### States
- Loading
- Default

---

## 39. Edit Promo Code

**Location:** /tickets/promos/:id/edit
**Flow(s):** 252, 253

### Components
- Same as Create but pre-filled
- Code not editable
- "Deactivate" button

### Data Needed
- Promo code object

### Actions
- Edit fields → Save
- Deactivate → Confirm

### States
- Default
- Saving

---

## 40. Bulk Promo Codes

**Location:** /tickets/promos/bulk
**Flow(s):** 254, 255

### Components
- Header: "Bulk Promo Codes"
- Generation options:
  - Number of codes to generate
  - Code prefix
  - Code length
- Same discount settings as Create
- Preview generated codes
- "Generate" button
- "Export CSV" button (after generation)

### Data Needed
- None

### Actions
- Set options → Generate → Preview
- Export → Download CSV

### States
- Default
- Generating
- Generated (with export option)

---

## 41. Promo Code Analytics

**Location:** /tickets/promos/analytics
**Flow(s):** 256-258

### Components
- Header: "Promo Code Analytics"
- Date range selector
- Summary stats:
  - Total discounts given
  - Orders with promos
  - Promo conversion rate
- Top promo codes chart
- Usage over time chart
- Comparison table:
  - Code
  - Uses
  - Revenue (with promo)
  - Revenue impact
  - Conversion rate
- Export button

### Data Needed
- Promo analytics data

### Actions
- Change date range → Refresh
- Export → Download

### States
- Loading
- Default
- Empty

---

# Scanning Screens

---

## 42. Scanner Home

**Location:** /scanning
**Flow(s):** 161

### Components
- Header: "Ticket Scanning"
- Today's events section:
  - Event cards with:
    - Event name
    - Time
    - Check-in stats
    - "Start Scanning" button
- Upcoming events section
- Recent scan history link
- Scanner settings link

### Data Needed
- Today's events
- Upcoming events
- Recent scan stats

### Actions
- Tap "Start Scanning" → Select Entry Point (or Scan Screen if only one)
- Tap event → Event scanning dashboard

### States
- Loading
- Default
- No events today

---

## 43. Select Event to Scan

**Location:** /scanning/select-event
**Flow(s):** 162

### Components
- Header: "Select Event"
- Today's events list:
  - Event name
  - Time
  - Venue (if multi-venue)
  - Check-in progress
- Date selector for other dates

### Data Needed
- Events by date

### Actions
- Tap event → Select Entry Point

### States
- Loading
- Default
- No events

---

## 44. Select Entry Point

**Location:** /scanning/select-entry
**Flow(s):** 163

### Components
- Header: "Select Entry Point"
- Event name display
- Entry points list:
  - Entry point name
  - Type (Main, VIP, Will Call)
  - Current scanner count
  - Check-ins at this point
- "All Entry Points" option

### Data Needed
- Event entry points
- Scanner assignments

### Actions
- Tap entry point → Scan Screen

### States
- Loading
- Default

---

## 45. Scan Screen

**Location:** /scanning/scan
**Flow(s):** 164

### Components
- Header: Event name + Entry point + Live count
- Camera viewfinder (large, centered)
- Scan target overlay
- "Manual Entry" button
- "Switch Camera" button (if multiple)
- Flash toggle
- Sound toggle
- Last scan result (brief)
- Stats bar:
  - Scanned this session
  - Total check-ins
  - Remaining

### Data Needed
- Event info
- Entry point
- Scan stats

### Actions
- Scan QR → Process → Show result
- Tap "Manual Entry" → Manual Lookup
- Tap stats → Live Attendance

### States
- Ready to scan
- Processing scan
- Result overlay (valid/invalid)

### Notes
- Uses device camera
- Real-time validation
- Sound/vibrate feedback

---

## 46. Scan Result Valid

**Location:** /scanning/scan (overlay)
**Flow(s):** 165

### Components
- Green background
- Checkmark icon
- "Valid Ticket" header
- Attendee name
- Ticket type
- Seat/section (if assigned)
- Entry time
- Auto-dismiss after 2 seconds
- "View Details" link

### Data Needed
- Ticket/attendee info

### Actions
- Auto-dismiss → Ready to scan
- Tap "View Details" → Attendee detail modal

### States
- Default (success)

---

## 47. Scan Result Invalid

**Location:** /scanning/scan (overlay)
**Flow(s):** 166

### Components
- Red background
- X icon
- "Invalid Ticket" header
- Reason:
  - "Ticket not found"
  - "Wrong event"
  - "Ticket cancelled"
  - "Fake ticket"
- "Override" button (if permitted)
- "Dismiss" button

### Data Needed
- Error reason

### Actions
- Tap "Override" → Override Reason Modal
- Tap "Dismiss" → Ready to scan

### States
- Default (error)

---

## 48. Scan Result Already Used

**Location:** /scanning/scan (overlay)
**Flow(s):** 167

### Components
- Yellow/orange background
- Warning icon
- "Already Scanned" header
- Original scan info:
  - Time
  - Entry point
  - Scanned by
- Attendee name
- "Override" button
- "Dismiss" button

### Data Needed
- Original scan info
- Attendee info

### Actions
- Tap "Override" → Override Reason Modal
- Tap "Dismiss" → Ready to scan

### States
- Default (warning)

---

## 49. Scan Result Wrong Entry

**Location:** /scanning/scan (overlay)
**Flow(s):** 168

### Components
- Yellow background
- Warning icon
- "Wrong Entry Point" header
- Message: "This ticket is for [correct entry]"
- Attendee name
- Ticket type
- "Override & Allow" button
- "Redirect to [correct entry]" button
- "Dismiss" button

### Data Needed
- Ticket info
- Correct entry point

### Actions
- Tap "Override" → Override Reason Modal
- Tap "Redirect" → Show directions
- Tap "Dismiss" → Ready to scan

### States
- Default (warning)

---

## 50. Manual Lookup

**Location:** /scanning/manual
**Flow(s):** 169

### Components
- Header: "Manual Lookup"
- Search tabs: Name, Email, Confirmation #, Phone
- Search input
- Results list:
  - Attendee name
  - Ticket type
  - Status (not checked in, checked in)
  - "Check In" button
- Empty state
- "Back to Scanner" button

### Data Needed
- Search results

### Actions
- Search → Show results
- Tap "Check In" → Process check-in → Show result
- Tap attendee → Attendee detail

### States
- Default
- Searching
- Results
- No results

---

## 51. Manual Override

**Location:** /scanning/scan (flow)
**Flow(s):** 170

### Components
- Confirmation before override
- Select override reason

### Notes
- Leads to Override Reason Modal

---

## 52. Override Reason Modal

**Location:** /scanning (modal)
**Flow(s):** 171

### Components
- "Override Entry" header
- Reason dropdown:
  - Technical issue
  - Customer service
  - VIP exception
  - Manager approval
  - Other
- Notes input (required for "Other")
- Manager PIN input (if required)
- "Allow Entry" button
- "Cancel" button

### Data Needed
- Override reasons
- Manager PIN requirement

### Actions
- Select reason → Enable button
- Enter PIN (if required) → Validate
- Tap "Allow Entry" → Log override → Valid result

### States
- Default
- Validating PIN
- Error (wrong PIN)

---

## 53. Scan History

**Location:** /scanning/history
**Flow(s):** 174

### Components
- Header: "Scan History"
- Date/event filter
- Session filter
- History table:
  - Time
  - Attendee name
  - Ticket type
  - Result (Valid, Invalid, Override)
  - Entry point
  - Scanned by
- Export button

### Data Needed
- Scan history

### Actions
- Filter → Update list
- Tap row → Scan detail
- Export → Download CSV

### States
- Loading
- Default
- Empty

---

## 54. Live Attendance

**Location:** /scanning/attendance
**Flow(s):** 175

### Components
- Header: "Live Attendance" + Event name
- Auto-refresh indicator
- Total stats:
  - Checked in / Total tickets
  - Progress bar
  - Check-in rate
- Check-ins over time chart
- By ticket type breakdown
- By entry point breakdown
- Recent check-ins feed
- "Open Scanner" button

### Data Needed
- Real-time attendance data

### Actions
- Auto-refresh every 30 seconds
- Tap "Open Scanner" → Scan Screen

### States
- Loading
- Default
- No check-ins yet

---

## 55. Zone Occupancy

**Location:** /scanning/zones
**Flow(s):** 177

### Components
- Header: "Zone Occupancy"
- Venue map with zones
- Zone list:
  - Zone name
  - Current count / Capacity
  - Percentage bar
  - Status indicator (Green/Yellow/Red)
- Capacity alerts toggle
- Alert thresholds settings

### Data Needed
- Zone definitions
- Real-time occupancy

### Actions
- Tap zone → Zone detail
- Toggle alerts → Update settings

### States
- Loading
- Default

---

## 56. Capacity Alerts

**Location:** /scanning/alerts
**Flow(s):** 178

### Components
- Header: "Capacity Alerts"
- Alert settings:
  - Warning threshold (default 80%)
  - Critical threshold (default 95%)
  - Notification method (sound, push, both)
- Active alerts list:
  - Zone
  - Current capacity
  - Alert level
  - Time triggered
- Alert history

### Data Needed
- Alert settings
- Active alerts
- Alert history

### Actions
- Update thresholds → Save
- Acknowledge alert → Mark resolved

### States
- Default
- Active alerts

---

## 57. Scan Out Mode

**Location:** /scanning/scan-out
**Flow(s):** 172

### Components
- Same as Scan Screen but:
  - Header shows "Scan Out" mode
  - Different color scheme (blue)
  - Records exit instead of entry
  - Shows re-entry eligibility

### Data Needed
- Same as Scan Screen
- Re-entry policy

### Actions
- Scan → Record exit
- Show re-entry pass if applicable

### States
- Same as Scan Screen

---

## 58. Scan Re-Entry Mode

**Location:** /scanning/re-entry
**Flow(s):** 173

### Components
- Same as Scan Screen but:
  - Header shows "Re-Entry" mode
  - Validates re-entry eligibility
  - Shows original exit time

### Data Needed
- Same as Scan Screen
- Exit records

### Actions
- Scan → Validate re-entry → Allow or deny

### States
- Same as Scan Screen

---

## 59. Switch Entry Point Modal

**Location:** /scanning (modal)
**Flow(s):** 176

### Components
- "Switch Entry Point" header
- Current entry point display
- Entry points list
- "Switch" button
- "Cancel" button

### Data Needed
- Available entry points

### Actions
- Select entry point → Switch → Update scanner

### States
- Default

---

## 60. Scan Add-Ons Result

**Location:** /scanning/scan (overlay)
**Flow(s):** 179

### Components
- Similar to valid scan result
- Shows add-on type:
  - "Parking Pass Valid"
  - "Drink Ticket Redeemed"
  - etc.
- Add-on details
- Redemption count (if limited)

### Data Needed
- Add-on info
- Redemption status

### Actions
- Auto-dismiss or manual dismiss

### States
- Valid
- Already redeemed
- Invalid

---

## 61. Scan VIP Access Result

**Location:** /scanning/scan (overlay)
**Flow(s):** 180

### Components
- Special VIP styling (gold/purple)
- "VIP Access Granted" header
- VIP area name
- Guest name
- VIP amenities included
- "View VIP Details" link

### Data Needed
- VIP ticket info
- VIP amenities

### Actions
- Auto-dismiss
- Tap details → VIP guest detail

### States
- Valid VIP
- Invalid (not VIP ticket)

---

## 62. Flag Attendee Modal

**Location:** /scanning (modal)
**Flow(s):** 181

### Components
- "Flag Attendee" header
- Attendee info display
- Flag reason dropdown:
  - Security concern
  - Behavior issue
  - ID mismatch
  - Other
- Notes input
- Alert security checkbox
- "Flag" button
- "Cancel" button

### Data Needed
- Attendee info

### Actions
- Complete form → Flag → Notify security if checked

### States
- Default
- Flagging

---

## 63. Banned List

**Location:** /scanning/banned
**Flow(s):** 182

### Components
- Header: "Banned List"
- Search input
- Banned list table:
  - Name
  - Photo (if available)
  - Reason
  - Date banned
  - Banned by
  - Actions
- "Add to Ban List" button

### Data Needed
- Banned individuals

### Actions
- Search → Filter
- Tap "Add" → Add ban modal
- Tap row → Edit/remove ban

### States
- Loading
- Default
- Empty

---

## 64. Offline Mode

**Location:** /scanning (mode)
**Flow(s):** 183, 184

### Components
- Offline indicator banner
- Last sync time
- Cached ticket count
- "Sync Now" button (when online)
- Offline scan queue count
- Limited functionality notice

### Data Needed
- Cached tickets
- Offline scan queue

### Actions
- Continue scanning with cached data
- Queue scans for sync
- Tap "Sync Now" → Upload queue → Download updates

### States
- Offline (with cached data)
- Syncing
- Online

### Notes
- Automatically detects connectivity
- Caches ticket data for offline validation

---

# Analytics Screens

---

## 65. Analytics Dashboard

**Location:** /analytics
**Flow(s):** 186

### Components
- Header: "Analytics" + date range selector
- Quick stats cards:
  - Total Revenue
  - Tickets Sold
  - Events Held
  - Average Attendance
- Revenue chart (line)
- Sales by event (bar chart)
- Top performing events table
- Audience insights summary
- Quick links:
  - Sales Analytics
  - Audience Demographics
  - Custom Reports

### Data Needed
- Aggregated analytics data

### Actions
- Change date range → Refresh
- Tap chart section → Drill down
- Tap quick link → Navigate

### States
- Loading
- Default
- Empty (no data yet)

---

## 66. Sales Analytics

**Location:** /analytics/sales
**Flow(s):** 187-190

### Components
- Header: "Sales Analytics"
- Date range selector
- Filter by event dropdown
- Tabs: Overview, By Event, By Ticket Type, Over Time
- **Overview:**
  - Total tickets sold
  - Total revenue
  - Average order value
  - Conversion rate
- **By Event:**
  - Event sales table
  - Comparative bar chart
- **By Ticket Type:**
  - Ticket type breakdown
  - Pie chart
- **Over Time:**
  - Line chart (daily/weekly/monthly)
  - Comparison to previous period toggle
- Export button

### Data Needed
- Sales data (various breakdowns)

### Actions
- Change filters → Update data
- Toggle comparison → Show overlay
- Export → Download

### States
- Loading
- Default

---

## 67. Revenue Analytics

**Location:** /analytics/revenue
**Flow(s):** 191-194

### Components
- Header: "Revenue Analytics"
- Date range selector
- Revenue breakdown:
  - Ticket sales
  - Add-ons
  - Resale royalties
  - Fees collected
- Revenue by event chart
- Revenue by ticket type chart
- Revenue over time chart
- Projections (upcoming events)
- Export button

### Data Needed
- Revenue data (various breakdowns)

### Actions
- Change date range → Update
- Export → Download

### States
- Loading
- Default

---

## 68. Attendance Analytics

**Location:** /analytics/attendance
**Flow(s):** 195-198

### Components
- Header: "Attendance Analytics"
- Event selector (or all events)
- Stats:
  - Total tickets sold
  - Total check-ins
  - No-show rate
  - Average check-in time
- Check-in timeline chart
- Peak times analysis
- Entry point breakdown
- No-shows list (exportable)
- Export button

### Data Needed
- Attendance data

### Actions
- Select event → Update
- Export no-shows → Download
- Export report → Download

### States
- Loading
- Default

---

## 69. Audience Demographics

**Location:** /analytics/demographics
**Flow(s):** 199-202

### Components
- Header: "Audience Demographics"
- Date range selector
- Demographics breakdown:
  - Age groups (chart)
  - Gender (chart)
  - Location (map + list)
- Repeat customer rate
- New vs returning chart
- Top customer segments
- Export button

### Data Needed
- Demographic data

### Actions
- Change date range → Update
- Tap segment → Drill down
- Export → Download

### States
- Loading
- Default
- Limited data (privacy note)

---

## 70. Geographic Analytics

**Location:** /analytics/geographic
**Flow(s):** 203-205

### Components
- Header: "Geographic Analytics"
- Interactive map:
  - Heat map of ticket sales
  - Cluster markers
  - Zoom controls
- Filter by event
- Top cities table
- Distance traveled stats:
  - Average distance
  - Furthest customer
  - Local vs travel %
- Export button

### Data Needed
- Geographic sales data

### Actions
- Interact with map → Show details
- Filter → Update map
- Export → Download

### States
- Loading
- Default

---

## 71. Event Comparison

**Location:** /analytics/compare
**Flow(s):** 206-208

### Components
- Header: "Compare Events"
- Event selector (multi-select, up to 5)
- Comparison table:
  - Metric
  - Event 1
  - Event 2
  - Event 3
  - etc.
- Metrics compared:
  - Tickets sold
  - Revenue
  - Attendance rate
  - Sell-through rate
  - Average ticket price
  - Promo code usage
  - Resale activity
- Comparative charts
- Export button

### Data Needed
- Event data for comparison

### Actions
- Select events → Generate comparison
- Export → Download

### States
- Default (select events)
- Comparing
- Results

---

## 72. Custom Reports

**Location:** /analytics/reports
**Flow(s):** 209, 210

### Components
- Header: "Custom Reports" + "Create Report" button
- Report builder:
  - Report name
  - Data source (Sales, Attendance, Revenue, etc.)
  - Metrics to include (checkboxes)
  - Dimensions (group by)
  - Filters
  - Date range
  - Visualization type
- Preview pane
- "Save Report" button
- "Run Report" button

### Data Needed
- Available metrics
- Available dimensions

### Actions
- Build report → Preview
- Save → Add to Saved Reports
- Run → Generate report

### States
- Building
- Previewing
- Saving

---

## 73. Saved Reports

**Location:** /analytics/reports/saved
**Flow(s):** 211

### Components
- Header: "Saved Reports"
- Reports list:
  - Report name
  - Created date
  - Last run
  - Schedule (if any)
  - Actions
- Tap report → Run and view
- Actions: Edit, Schedule, Delete, Duplicate

### Data Needed
- Saved reports list

### Actions
- Tap report → Run report
- Tap action → Execute

### States
- Loading
- Default
- Empty

---

## 74. Schedule Report Modal

**Location:** /analytics/reports (modal)
**Flow(s):** 213

### Components
- "Schedule Report" header
- Report name display
- Frequency:
  - Daily
  - Weekly (select day)
  - Monthly (select date)
- Time of day
- Recipients (email list)
- Format (PDF, CSV, Excel)
- "Save Schedule" button
- "Cancel" button

### Data Needed
- Report info

### Actions
- Set schedule → Save
- Cancel → Dismiss

### States
- Default
- Saving

---

# Financials Screens

---

## 75. Financials Overview

**Location:** /financials
**Flow(s):** 214

### Components
- Header: "Financials" + date range selector
- Balance card:
  - Available balance
  - Pending balance
  - Next payout date
- Quick stats:
  - Total revenue
  - Platform fees
  - Refunds issued
  - Net revenue
- Revenue chart
- Recent transactions list
- Recent payouts list
- Quick links to all sections

### Data Needed
- Financial summary
- Balance info
- Recent transactions

### Actions
- Change date range → Update
- Tap transaction → Transaction Detail
- Tap payout → Payout Detail

### States
- Loading
- Default

---

## 76. Revenue Dashboard

**Location:** /financials/revenue
**Flow(s):** 215-218

### Components
- Header: "Revenue"
- Date range selector
- Revenue breakdown:
  - Ticket sales
  - Add-ons
  - Resale royalties
- Revenue by event table
- Revenue by ticket type table
- Trends chart
- Export button

### Data Needed
- Revenue data

### Actions
- Filter → Update
- Export → Download

### States
- Loading
- Default

---

## 77. Transactions List

**Location:** /financials/transactions
**Flow(s):** 219-222

### Components
- Header: "Transactions"
- Search input
- Filters:
  - Type (Sale, Refund, Payout, Fee)
  - Date range
  - Event
  - Status
- Transactions table:
  - Date
  - Type
  - Description
  - Customer
  - Event
  - Amount
  - Status
  - Actions
- Pagination
- Export button

### Data Needed
- Transactions list

### Actions
- Search → Filter
- Apply filters → Update
- Tap row → Transaction Detail
- Export → Download

### States
- Loading
- Default
- Empty

---

## 78. Transaction Detail

**Location:** /financials/transactions/:id
**Flow(s):** 223

### Components
- Header: "Transaction Details"
- Transaction ID
- Type badge
- Status badge
- Date and time
- Customer info:
  - Name
  - Email
- Event info
- Items purchased:
  - Ticket types
  - Add-ons
  - Quantities
  - Prices
- Payment breakdown:
  - Subtotal
  - Fees
  - Discounts
  - Total
- Payment method (last 4)
- Related transactions (refunds, etc.)
- Actions: Refund, Contact Customer

### Data Needed
- Transaction object (full)

### Actions
- Tap "Refund" → Issue Refund Modal
- Tap "Contact Customer" → Email

### States
- Loading
- Default

---

## 79. Payouts List

**Location:** /financials/payouts
**Flow(s):** 224-226

### Components
- Header: "Payouts"
- Tabs: All, Pending, Completed, Failed
- Payouts table:
  - Date
  - Amount
  - Status
  - Bank account (last 4)
  - Period covered
  - Actions
- Pagination
- Export button

### Data Needed
- Payouts list

### Actions
- Tap tab → Filter
- Tap row → Payout Detail
- Export → Download

### States
- Loading
- Default
- Empty

---

## 80. Payout Detail

**Location:** /financials/payouts/:id
**Flow(s):** 228

### Components
- Header: "Payout Details"
- Payout ID
- Status badge
- Amount
- Date initiated
- Date completed (or expected)
- Bank account info
- Period covered
- Transactions included:
  - Transaction list
  - Summary totals
- Fees deducted
- Net payout

### Data Needed
- Payout object (full)
- Related transactions

### Actions
- Tap transaction → Transaction Detail

### States
- Loading
- Default

---

## 81. Payout Settings

**Location:** /financials/settings
**Flow(s):** 229, 230

### Components
- Header: "Payout Settings"
- Connected account:
  - Bank name
  - Account type
  - Last 4 digits
  - "Update" button
- Payout schedule:
  - Frequency (Daily, Weekly)
  - Day of week (if weekly)
  - Minimum amount
- Payout notifications:
  - Email on payout
  - Email on failed payout
- "Save" button

### Data Needed
- Stripe Connect account info
- Payout settings

### Actions
- Tap "Update" → Stripe Connect flow
- Change settings → Save

### States
- Default
- Saving
- Not connected (show setup)

---

## 82. Failed Payouts

**Location:** /financials/payouts/failed
**Flow(s):** 227

### Components
- Header: "Failed Payouts"
- Failed payouts list:
  - Date
  - Amount
  - Failure reason
  - Bank account
  - Actions
- Each failure shows:
  - Explanation
  - Resolution steps
  - "Retry" button (if applicable)
  - "Update Bank Account" button

### Data Needed
- Failed payouts

### Actions
- Tap "Retry" → Retry payout
- Tap "Update" → Payout Settings

### States
- Loading
- Default
- No failures (success state)

---

## 83. Refunds List

**Location:** /financials/refunds
**Flow(s):** 231-234

### Components
- Header: "Refunds"
- Tabs: All, Pending, Completed
- Search input
- Filters:
  - Date range
  - Event
  - Reason
- Refunds table:
  - Date
  - Order ID
  - Customer
  - Event
  - Amount
  - Reason
  - Status
  - Actions
- Total refunds summary
- Export button

### Data Needed
- Refunds list

### Actions
- Search → Filter
- Tap row → Refund Detail
- Export → Download

### States
- Loading
- Default
- Empty

---

## 84. Refund Detail

**Location:** /financials/refunds/:id
**Flow(s):** 235

### Components
- Header: "Refund Details"
- Refund ID
- Status badge
- Original order link
- Customer info
- Event info
- Refund breakdown:
  - Items refunded
  - Refund amount
  - Fees refunded
  - Net refund
- Reason
- Notes
- Processed by
- Date processed

### Data Needed
- Refund object (full)

### Actions
- Tap order → Order/Transaction Detail

### States
- Loading
- Default

---

## 85. Issue Refund Modal

**Location:** /financials (modal)
**Flow(s):** 236

### Components
- "Issue Refund" header
- Order summary
- Refund options:
  - Full refund
  - Partial refund
- If partial:
  - Item selector
  - Custom amount input
- Refund amount display
- Fees handling:
  - Refund fees
  - Keep fees
- Reason dropdown
- Notes input
- "Process Refund" button
- "Cancel" button

### Data Needed
- Order info

### Actions
- Select options → Calculate refund
- Process → Issue refund → Close

### States
- Default
- Processing
- Success
- Error

---

## 86. Chargebacks

**Location:** /financials/chargebacks
**Flow(s):** 237

### Components
- Header: "Chargebacks"
- Summary stats:
  - Open chargebacks
  - Won
  - Lost
  - Total amount at risk
- Chargebacks table:
  - Date
  - Order ID
  - Customer
  - Amount
  - Reason
  - Status
  - Deadline
  - Actions
- Filter by status

### Data Needed
- Chargebacks list

### Actions
- Tap row → Respond to Chargeback
- Filter → Update list

### States
- Loading
- Default
- No chargebacks (good!)

---

## 87. Respond to Chargeback

**Location:** /financials/chargebacks/:id
**Flow(s):** 238

### Components
- Header: "Chargeback Response"
- Chargeback info:
  - Amount
  - Reason
  - Deadline countdown
- Original transaction info
- Evidence section:
  - Order confirmation
  - Delivery proof (ticket sent)
  - Customer communication
  - Event attendance (if checked in)
  - Custom evidence upload
- Pre-written response template
- Edit response text area
- "Submit Response" button
- "Accept Chargeback" button

### Data Needed
- Chargeback details
- Order details
- Evidence documents

### Actions
- Add evidence → Attach
- Edit response → Update
- Submit → Submit to Stripe
- Accept → Forfeit

### States
- Default
- Submitting
- Submitted
- Won/Lost

---

## 88. Tax Documents

**Location:** /financials/tax
**Flow(s):** 239-241

### Components
- Header: "Tax Documents"
- Tax year selector
- Documents list:
  - 1099-K (if applicable)
  - Transaction summary
  - Annual report
- Download buttons for each
- Tax information on file:
  - Business name
  - Tax ID (masked)
  - Address
- "Update Tax Info" link
- Note about Stripe handling 1099s

### Data Needed
- Tax documents
- Tax info on file

### Actions
- Select year → Load documents
- Download → Download PDF
- Update info → Stripe dashboard

### States
- Loading
- Default
- No documents yet

---

# Marketing Screens

---

## 89. Marketing Dashboard

**Location:** /marketing
**Flow(s):** 84

### Components
- Header: "Marketing"
- Quick stats:
  - Messages sent (period)
  - Open rate
  - Click rate
  - Unsubscribes
- Recent campaigns list
- Upcoming scheduled messages
- Quick actions:
  - Send Announcement
  - Message Ticket Holders
  - Create Template
- Audience size display

### Data Needed
- Marketing stats
- Recent campaigns

### Actions
- Tap quick action → Navigate
- Tap campaign → Campaign detail

### States
- Loading
- Default

---

## 90. Announcements

**Location:** /marketing/announcements
**Flow(s):** 85, 86, 87

### Components
- Header: "Announcements" + "New Announcement" button
- Tabs: All, Sent, Scheduled, Draft
- Announcements list:
  - Title
  - Audience
  - Sent/Scheduled date
  - Status
  - Opens/Clicks (if sent)
  - Actions
- Pagination

### Data Needed
- Announcements list

### Actions
- Tap "New" → Create Announcement
- Tap row → Announcement detail
- Tap actions → Edit, Duplicate, Delete

### States
- Loading
- Default
- Empty

---

## 91. Create Announcement

**Location:** /marketing/announcements/new
**Flow(s):** 87

### Components
- Header: "Create Announcement"
- Subject line input
- Audience selector:
  - All subscribers
  - Event attendees (select event)
  - Ticket holders (select event + ticket type)
  - Custom segment
- Content editor (rich text)
- Preview pane
- Attachments section
- Send options:
  - Send now
  - Schedule for later (date/time picker)
- "Send" / "Schedule" button
- "Save as Draft" button

### Data Needed
- Audience options
- Events list

### Actions
- Build message → Preview
- Send → Confirm → Send
- Schedule → Set time → Schedule
- Save draft → Save

### States
- Building
- Previewing
- Sending
- Sent

---

## 92. Message Ticket Holders

**Location:** /marketing/message
**Flow(s):** 88-90

### Components
- Header: "Message Ticket Holders"
- Event selector
- Audience:
  - All ticket holders
  - Specific ticket types (multi-select)
  - Checked in only
  - Not checked in only
- Audience count display
- Message type:
  - Email
  - SMS (if enabled)
- Content editor
- Preview
- Send options
- "Send" button

### Data Needed
- Events
- Ticket types per event
- Audience counts

### Actions
- Select event → Load ticket types
- Select audience → Show count
- Send → Confirm → Send

### States
- Building
- Previewing
- Sending
- Sent

---

## 93. Scheduled Messages

**Location:** /marketing/scheduled
**Flow(s):** 91

### Components
- Header: "Scheduled Messages"
- Calendar view with scheduled items
- List view toggle
- Scheduled messages list:
  - Title
  - Audience
  - Scheduled time
  - Type (Announcement, Event, Automated)
  - Actions
- Filter by type

### Data Needed
- Scheduled messages

### Actions
- Tap item → Edit
- Tap actions → Edit, Cancel
- Toggle view → Switch

### States
- Loading
- Default
- Empty

---

## 94. Message History

**Location:** /marketing/history
**Flow(s):** 92

### Components
- Header: "Message History"
- Date range selector
- Filter by type
- Messages table:
  - Date
  - Subject/Title
  - Type
  - Audience
  - Sent count
  - Opens
  - Clicks
  - Actions
- Pagination
- Export button

### Data Needed
- Message history

### Actions
- Filter → Update
- Tap row → Message detail
- Export → Download

### States
- Loading
- Default
- Empty

---

## 95. Message Templates

**Location:** /marketing/templates
**Flow(s):** 93

### Components
- Header: "Message Templates" + "New Template" button
- Templates list:
  - Name
  - Type (Email, SMS)
  - Last modified
  - Used count
  - Actions
- System templates section (non-editable defaults)
- Custom templates section

### Data Needed
- Templates list

### Actions
- Tap "New" → Create template
- Tap row → Edit template
- Tap actions → Duplicate, Delete

### States
- Loading
- Default
- Empty

---

# Resale Settings Screens

---

## 96. Resale Settings

**Location:** /resale
**Flow(s):** 259

### Components
- Header: "Resale Settings"
- Resale status:
  - Enabled/Disabled toggle
  - Last updated
- Quick stats (if enabled):
  - Active listings
  - Total resale volume
  - Royalties earned
- Settings sections links:
  - Price Rules
  - Royalty Settings
  - Policies
- Marketplace view link
- Analytics link

### Data Needed
- Resale settings
- Resale stats

### Actions
- Toggle enabled → Save
- Tap section → Navigate

### States
- Loading
- Default

---

## 97. Enable Disable Resale

**Location:** /resale (toggle action)
**Flow(s):** 260

### Components
- Confirmation modal for enable/disable
- If disabling:
  - Warning about active listings
  - Option to cancel active listings
  - Impact explanation

### Data Needed
- Active listings count

### Actions
- Confirm → Toggle status

### States
- Confirming
- Processing

---

## 98. Price Rules

**Location:** /resale/pricing
**Flow(s):** 261-265

### Components
- Header: "Price Rules"
- Global settings:
  - Minimum price rule:
    - No minimum
    - Percentage of face value
    - Fixed minimum amount
  - Maximum price rule:
    - No maximum
    - Percentage of face value
    - Fixed maximum amount
  - Price cap options
- Event-specific overrides:
  - Event list with override indicator
  - "Add Override" button
- Preview calculator:
  - Face value input
  - Shows min/max range
- "Save" button

### Data Needed
- Current price rules
- Event overrides

### Actions
- Set rules → Preview
- Save → Apply rules
- Add override → Event override modal

### States
- Default
- Saving

---

## 99. Royalty Settings

**Location:** /resale/royalties
**Flow(s):** 266-270

### Components
- Header: "Royalty Settings"
- Venue royalty:
  - Enable toggle
  - Percentage input
- Artist royalty:
  - Enable toggle
  - Percentage input
  - Note: "Shared with artists on events"
- Total royalty preview
- Seller payout preview:
  - Example calculation
  - "Seller receives X% minimum"
- "Save" button

### Data Needed
- Current royalty settings

### Actions
- Adjust percentages → Update preview
- Save → Apply

### States
- Default
- Saving

### Validation
- Total royalties cannot exceed platform limits
- Seller must receive minimum percentage

---

## 100. Resale Marketplace View

**Location:** /resale/marketplace
**Flow(s):** 271-275

### Components
- Header: "Resale Marketplace"
- Filter by event
- Stats:
  - Active listings
  - Average price vs face value
  - Total volume
- Listings table:
  - Event
  - Ticket type
  - Face value
  - List price
  - Listed date
  - Seller (anonymized)
  - Status
  - Actions
- Export button

### Data Needed
- Resale listings

### Actions
- Filter → Update
- Tap row → Listing detail
- Tap actions → Flag listing

### States
- Loading
- Default
- Empty

---

## 101. Resale Analytics

**Location:** /resale/analytics
**Flow(s):** 276-278

### Components
- Header: "Resale Analytics"
- Date range selector
- Summary stats:
  - Total resale volume
  - Total royalties earned
  - Average markup
  - Sell-through rate
- Volume over time chart
- Price trends chart
- By event breakdown
- Top resold events
- Export button

### Data Needed
- Resale analytics data

### Actions
- Change date range → Update
- Export → Download

### States
- Loading
- Default

---

## 102. Resale Policies

**Location:** /resale/policies
**Flow(s):** 279-281

### Components
- Header: "Resale Policies"
- Buyer protections:
  - Guarantee authentic tickets
  - Money-back guarantee
  - Delivery guarantee
- Seller requirements:
  - Verified account required
  - Bank account required
  - Listing accuracy policy
- Terms display
- Custom policy additions
- "Save" button

### Data Needed
- Current policies

### Actions
- Toggle protections → Save
- Edit custom policies → Save

### States
- Default
- Saving

---

## 103. Flag Listing Modal

**Location:** /resale (modal)
**Flow(s):** 275

### Components
- "Flag Listing" header
- Listing info display
- Flag reason dropdown:
  - Suspicious pricing
  - Duplicate listing
  - Fraudulent seller
  - Policy violation
  - Other
- Notes input
- Action:
  - Flag only (review)
  - Flag and remove
  - Flag and suspend seller
- "Submit" button
- "Cancel" button

### Data Needed
- Listing info

### Actions
- Select reason → Enable submit
- Submit → Process flag

### States
- Default
- Submitting

---

# Venue Setup Screens

---

## 104. Venue Profile

**Location:** /setup/profile
**Flow(s):** 14

### Components
- Header: "Venue Profile"
- Profile completeness indicator
- Venue name input
- Venue type dropdown
- Description editor (rich text)
- Short description input (for previews)
- Website URL input
- Quick links:
  - Edit Photos & Videos
  - Edit Social Links
  - Preview Public Page
- "Save" button

### Data Needed
- Venue profile data

### Actions
- Edit fields → Save
- Tap quick link → Navigate

### States
- Default
- Saving

---

## 105. Edit Venue Profile

**Location:** /setup/profile/edit
**Flow(s):** 14

### Components
- Same as Venue Profile
- Full edit mode

---

## 106. Venue Photos Videos

**Location:** /setup/media
**Flow(s):** 15, 16

### Components
- Header: "Photos & Videos"
- Cover photo section:
  - Current cover
  - "Change Cover" button
  - Recommended dimensions
- Photo gallery:
  - Grid of photos
  - Drag to reorder
  - Delete button on each
  - "Add Photos" button
- Videos section:
  - Video list
  - YouTube/Vimeo URL input
  - Video upload (if supported)
  - Delete button on each
- "Save Order" button

### Data Needed
- Venue media

### Actions
- Upload photos → Add to gallery
- Drag photos → Reorder
- Delete → Remove
- Add video URL → Validate → Add

### States
- Default
- Uploading
- Saving

---

## 107. Venue Social Links

**Location:** /setup/social
**Flow(s):** 17, 18

### Components
- Header: "Social Links"
- Social platform inputs:
  - Facebook URL
  - Instagram URL
  - Twitter URL
  - TikTok URL
  - YouTube URL
- Website URL
- "Save" button
- Preview of how links appear

### Data Needed
- Current social links

### Actions
- Enter URLs → Validate format
- Save → Apply

### States
- Default
- Saving
- Validation errors

---

## 108. Venue Hours

**Location:** /setup/hours
**Flow(s):** 19

### Components
- Header: "Venue Hours"
- Regular hours section:
  - Day of week rows
  - Open time / Close time per day
  - "Closed" checkbox per day
- Box office hours section:
  - Separate hours for box office
  - "Same as venue" checkbox
- Special hours:
  - Holiday closures
  - Special events
- Timezone setting
- "Save" button

### Data Needed
- Current hours

### Actions
- Set hours → Save

### States
- Default
- Saving

---

## 109. Preview Venue Page

**Location:** /setup/preview
**Flow(s):** 21

### Components
- Header: "Preview" + "Edit" button + "Publish" button
- Device toggle: Desktop, Tablet, Mobile
- Venue page as fans see it:
  - Cover photo
  - Venue name
  - Description
  - Upcoming events
  - Photos
  - Info sections

### Data Needed
- Complete venue data

### Actions
- Toggle device → Change preview
- Tap "Edit" → Venue Profile
- Tap "Publish" → Publish modal

### States
- Loading
- Default

---

## 110. Publish Venue Modal

**Location:** /setup (modal)
**Flow(s):** 22

### Components
- "Publish Venue Page" header
- Checklist of requirements:
  - Profile complete ✓
  - Photos added ✓
  - Hours set ✓
  - etc.
- Incomplete items highlighted
- "Publish" button (if complete)
- "Save as Draft" button
- "Cancel" button

### Data Needed
- Venue completeness status

### Actions
- Publish → Make live
- Save draft → Keep unpublished

### States
- Ready to publish
- Incomplete (blocked)

---

## 111. Age Restrictions

**Location:** /setup/age
**Flow(s):** 20

### Components
- Header: "Age Restrictions"
- Default age policy:
  - All ages
  - 18+
  - 21+
  - Custom
- ID check requirements:
  - Never
  - 21+ events only
  - Always
- Event override note
- "Save" button

### Data Needed
- Current age settings

### Actions
- Select policy → Save

### States
- Default
- Saving

---

## 112. Location Address

**Location:** /setup/location
**Flow(s):** 23

### Components
- Header: "Location"
- Address inputs:
  - Street address
  - Address line 2
  - City
  - State/Province
  - Postal code
  - Country
- Map preview:
  - Interactive map
  - Draggable pin
- Coordinates display
- "Save" button

### Data Needed
- Current address

### Actions
- Enter address → Geocode → Update map
- Drag pin → Update address
- Save → Apply

### States
- Default
- Geocoding
- Saving

---

## 113. Parking Info

**Location:** /setup/parking
**Flow(s):** 24

### Components
- Header: "Parking Information"
- On-site parking section:
  - Available toggle
  - Number of spots
  - Price
  - Payment methods
- Nearby parking section:
  - Add parking lot button
  - Lot list (name, address, distance, price)
- Parking instructions editor
- Rideshare drop-off location
- "Save" button

### Data Needed
- Current parking info

### Actions
- Add parking lot → Modal
- Edit lot → Modal
- Save → Apply

### States
- Default
- Saving

---

## 114. Transit Info

**Location:** /setup/transit
**Flow(s):** 25

### Components
- Header: "Transit Information"
- Public transit section:
  - Nearby stations list
  - Transit lines/routes
  - Walking directions
- Bus routes section
- Rideshare section:
  - Pickup location
  - Drop-off location
  - Instructions
- Bike parking section
- "Save" button

### Data Needed
- Current transit info

### Actions
- Edit sections → Save

### States
- Default
- Saving

---

## 115. Load-In Info

**Location:** /setup/loadin
**Flow(s):** 26

### Components
- Header: "Load-In Information"
- Load-in address (if different from venue)
- Load-in hours
- Contact person:
  - Name
  - Phone
  - Email
- Instructions editor:
  - Where to park
  - Where to unload
  - Equipment access
- Stage dimensions
- Power specifications
- Upload venue spec sheet
- "Save" button

### Data Needed
- Current load-in info

### Actions
- Edit fields → Save
- Upload spec sheet → Attach

### States
- Default
- Saving

---

## 116. Curfew Noise Rules

**Location:** /setup/curfew
**Flow(s):** 27

### Components
- Header: "Curfew & Noise Rules"
- Curfew time:
  - No curfew
  - Hard stop time
- Noise restrictions:
  - Decibel limit (if any)
  - Quiet hours
  - Indoor/outdoor differences
- Local ordinances notes
- "Save" button

### Data Needed
- Current curfew rules

### Actions
- Set rules → Save

### States
- Default
- Saving

---

## 117. Entry Points

**Location:** /setup/entry
**Flow(s):** 28

### Components
- Header: "Entry Points"
- Entry points list:
  - Name
  - Type (Main, VIP, Will Call, Accessible)
  - Location description
  - Status (Active/Inactive)
  - Actions
- "Add Entry Point" button
- Map view (if available)

### Data Needed
- Entry points

### Actions
- Add → Entry point modal
- Edit → Entry point modal
- Toggle status → Update

### States
- Default
- Empty

---

## 118. Exit Points

**Location:** /setup/exits
**Flow(s):** 29

### Components
- Header: "Exit Points"
- Exit points list:
  - Name
  - Location
  - Re-entry allowed toggle
  - Status
  - Actions
- "Add Exit Point" button
- Map view

### Data Needed
- Exit points

### Actions
- Add → Exit point modal
- Edit → Modal
- Toggle re-entry → Update

### States
- Default
- Empty

---

## 119. Re-Entry Policy

**Location:** /setup/reentry
**Flow(s):** 30

### Components
- Header: "Re-Entry Policy"
- Re-entry allowed:
  - No re-entry
  - Unlimited re-entry
  - Single re-entry
  - Time-limited re-entry
- If time-limited:
  - Time limit input
- Re-entry method:
  - Hand stamp
  - Wristband
  - Scan out/in
- Re-entry hours (if different from event)
- Policy text editor
- "Save" button

### Data Needed
- Current re-entry policy

### Actions
- Select options → Save

### States
- Default
- Saving

---

## 120. Capacity Settings

**Location:** /setup/capacity
**Flow(s):** 31

### Components
- Header: "Capacity"
- Total venue capacity input
- Fire marshal capacity (legal max)
- Default event capacity
- Standing capacity
- Seated capacity
- Capacity by configuration selector
- "Save" button

### Data Needed
- Current capacity settings

### Actions
- Set capacities → Save

### States
- Default
- Saving

---

## 121. Seating Configurations

**Location:** /setup/seating/configs
**Flow(s):** 32

### Components
- Header: "Seating Configurations"
- Configurations list:
  - Name
  - Type (Theater, Standing, Banquet, etc.)
  - Capacity
  - Default indicator
  - Actions
- "Add Configuration" button

### Data Needed
- Seating configurations

### Actions
- Add → Configuration modal
- Edit → Modal
- Set default → Update

### States
- Default
- Empty

---

## 122. Seating Map Builder

**Location:** /setup/seating/builder
**Flow(s):** 33, 34

### Components
- Header: "Seating Map Builder"
- Configuration selector
- Interactive canvas:
  - Zoom controls
  - Pan controls
  - Grid toggle
- Tools palette:
  - Add section
  - Add row
  - Add seat
  - Add stage
  - Add obstruction
  - Select tool
  - Delete tool
- Properties panel:
  - Selected item properties
  - Section name, row label, seat numbers
  - Pricing tier
- "Save" button
- "Preview" button

### Data Needed
- Current seating map
- Pricing tiers

### Actions
- Use tools → Modify map
- Select item → Edit properties
- Save → Persist changes
- Preview → Preview Seating Map

### States
- Default
- Unsaved changes
- Saving

---

## 123. Sections Zones

**Location:** /setup/seating/sections
**Flow(s):** 35, 36

### Components
- Header: "Sections & Zones"
- Sections list:
  - Section name
  - Type (Reserved, GA)
  - Capacity
  - Pricing tier
  - Actions
- GA zones list:
  - Zone name
  - Capacity
  - Actions
- "Add Section" button
- "Add Zone" button

### Data Needed
- Sections and zones

### Actions
- Add → Modal
- Edit → Modal
- Delete → Confirm

### States
- Default
- Empty

---

## 124. Accessibility Seating

**Location:** /setup/seating/accessibility
**Flow(s):** 36, 37

### Components
- Header: "Accessibility Seating"
- Accessible sections list:
  - Section
  - Wheelchair spaces
  - Companion seats
- Total accessible capacity
- ADA compliance notes
- Accommodation request process
- Contact info for accessibility
- "Save" button

### Data Needed
- Accessibility seating data

### Actions
- Set accessible sections → Save

### States
- Default
- Saving

---

## 125. Preview Seating Map

**Location:** /setup/seating/preview
**Flow(s):** 37

### Components
- Header: "Preview Seating Map"
- Interactive map (view only)
- Legend
- Section click → Show details
- Seat click → Show seat info
- "Edit Map" button

### Data Needed
- Seating map data

### Actions
- Interact with map → View details
- Edit → Seating Map Builder

### States
- Loading
- Default

---

## 126. VIP Areas

**Location:** /setup/vip/areas
**Flow(s):** 38

### Components
- Header: "VIP Areas"
- VIP areas list:
  - Area name
  - Location
  - Capacity
  - Access level
  - Amenities
  - Actions
- "Add VIP Area" button
- Map view (if available)

### Data Needed
- VIP areas

### Actions
- Add → VIP area modal
- Edit → Modal
- Delete → Confirm

### States
- Default
- Empty

---

## 127. VIP Access Rules

**Location:** /setup/vip/access
**Flow(s):** 39, 40

### Components
- Header: "VIP Access Rules"
- Per VIP area:
  - Area name
  - Who can access:
    - Specific ticket types (multi-select)
    - Guest list entries
    - Staff roles
  - Time restrictions
- Save button

### Data Needed
- VIP areas
- Ticket types
- Staff roles

### Actions
- Set rules per area → Save

### States
- Default
- Saving

---

## 128. VIP Amenities

**Location:** /setup/vip/amenities
**Flow(s):** 40, 41

### Components
- Header: "VIP Amenities"
- Amenities list:
  - Amenity name
  - Type (Drink, Food, Merch, Service)
  - Included with (ticket types)
  - Quantity per ticket
  - Actions
- "Add Amenity" button

### Data Needed
- VIP amenities

### Actions
- Add → Amenity modal
- Edit → Modal
- Delete → Confirm

### States
- Default
- Empty

---

## 129. Guest Lists

**Location:** /setup/vip/guestlists
**Flow(s):** 41, 42

### Components
- Header: "Guest Lists"
- Default guest list settings:
  - Max guests per event
  - Auto-approve requests
  - Notification settings
- Guest list templates:
  - Template name
  - Default entries
  - Actions
- "Create Template" button

### Data Needed
- Guest list settings
- Templates

### Actions
- Edit settings → Save
- Create template → Modal

### States
- Default
- Saving

---

## 130. Will Call Settings

**Location:** /setup/vip/willcall
**Flow(s):** 43

### Components
- Header: "Will Call"
- Will call enabled toggle
- Will call location
- Will call hours
- ID requirements:
  - ID type accepted
  - Name match policy
- Authorization settings:
  - Original purchaser only
  - Allow authorization
- Pickup instructions editor
- "Save" button

### Data Needed
- Will call settings

### Actions
- Set options → Save

### States
- Default
- Saving

---

## 131. ID Verification Rules

**Location:** /setup/vip/idverify
**Flow(s):** 43

### Components
- Header: "ID Verification"
- When to verify:
  - 21+ events
  - Will call pickup
  - VIP access
  - Always
  - Never
- Accepted IDs:
  - Government ID
  - Passport
  - Military ID
- Name match strictness:
  - Exact match
  - Partial match allowed
- "Save" button

### Data Needed
- ID verification settings

### Actions
- Set rules → Save

### States
- Default
- Saving

---

## 132. Tax Information

**Location:** /setup/legal/tax
**Flow(s):** 44

### Components
- Header: "Tax Information"
- Business type selector
- Legal business name
- Tax ID / EIN
- Business address
- Tax exempt status
- State tax nexus
- "Update via Stripe" button
- Stripe dashboard link

### Data Needed
- Tax info (from Stripe)

### Actions
- Update → Stripe dashboard

### States
- Loading
- Default
- Not set up

---

## 133. Insurance Certificates

**Location:** /setup/legal/insurance
**Flow(s):** 45

### Components
- Header: "Insurance Certificates"
- Certificates list:
  - Type (Liability, Property, etc.)
  - Provider
  - Policy number
  - Coverage amount
  - Expiration date
  - Document link
  - Status (Current/Expired)
- "Upload Certificate" button
- Expiration warnings

### Data Needed
- Insurance certificates

### Actions
- Upload → Add certificate
- View → Open document
- Delete → Remove

### States
- Default
- Empty

---

## 134. Liquor License

**Location:** /setup/legal/liquor
**Flow(s):** 46

### Components
- Header: "Liquor License"
- License type
- License number
- Issuing authority
- Expiration date
- Restrictions:
  - Hours of service
  - Age requirements
  - Event types
- Upload license document
- "Save" button

### Data Needed
- Liquor license info

### Actions
- Edit fields → Save
- Upload → Attach document

### States
- Default
- Not applicable (dry venue)
- Saving

---

## 135. Payout Setup Stripe

**Location:** /setup/legal/payouts
**Flow(s):** 47

### Components
- Header: "Payout Setup"
- Connection status:
  - Connected indicator
  - Account info
  - "Update Account" button
- If not connected:
  - Explanation
  - Benefits
  - "Connect with Stripe" button
- Stripe Connect embedded flow

### Data Needed
- Stripe Connect status

### Actions
- Connect → Stripe OAuth flow
- Update → Stripe dashboard

### States
- Not connected
- Connecting
- Connected

---

## 136. Verification Status

**Location:** /setup/legal/verification
**Flow(s):** 48, 49

### Components
- Header: "Venue Verification"
- Verification status badge:
  - Not Started
  - In Progress
  - Verified
  - Rejected
- Requirements checklist:
  - Business documents
  - Tax info
  - Insurance
  - Ownership proof
- Document upload sections
- "Submit for Verification" button
- Rejection reasons (if rejected)

### Data Needed
- Verification status
- Required documents

### Actions
- Upload documents → Attach
- Submit → Start verification

### States
- Not started
- In progress
- Verified
- Rejected

---

## 137. Submit Verification

**Location:** /setup/legal/verification/submit
**Flow(s):** 48

### Components
- "Submit for Verification" header
- Checklist review
- Document review
- Declaration checkbox
- "Submit" button

### Data Needed
- Verification requirements

### Actions
- Submit → Start verification process

### States
- Ready
- Submitting
- Submitted

---

## 138. Logo Colors

**Location:** /setup/branding/logo
**Flow(s):** 50, 51

### Components
- Header: "Logo & Colors"
- Logo upload:
  - Current logo preview
  - Upload button
  - Size requirements
- Color settings:
  - Primary color picker
  - Secondary color picker
  - Accent color picker
- Preview of colors applied
- "Save" button

### Data Needed
- Current branding

### Actions
- Upload logo → Process → Update preview
- Pick colors → Update preview
- Save → Apply

### States
- Default
- Uploading
- Saving

---

## 139. Ticket Design

**Location:** /setup/branding/tickets
**Flow(s):** 52

### Components
- Header: "Ticket Design"
- Template selector:
  - Standard
  - Premium
  - Minimal
  - Custom
- Customization options:
  - Logo placement
  - Color scheme
  - Font selection
- Preview pane (ticket mockup)
- "Save" button

### Data Needed
- Current ticket design

### Actions
- Select template → Update preview
- Customize → Update preview
- Save → Apply

### States
- Default
- Saving

---

## 140. Email Branding

**Location:** /setup/branding/email
**Flow(s):** 53

### Components
- Header: "Email Branding"
- Email header:
  - Logo
  - Header color
- Email footer:
  - Footer text
  - Social links
  - Unsubscribe text
- Preview email button
- "Save" button

### Data Needed
- Current email branding

### Actions
- Customize → Preview
- Save → Apply

### States
- Default
- Saving

---

## 141. Preview Branding

**Location:** /setup/branding/preview
**Flow(s):** 54

### Components
- Header: "Preview Branding"
- Preview tabs:
  - Event page
  - Ticket
  - Confirmation email
  - Venue page
- Device toggle for pages
- "Edit" buttons per section

### Data Needed
- All branding settings

### Actions
- Tab → Switch preview
- Edit → Navigate to setting

### States
- Loading
- Default

---

## 142. Custom Domain

**Location:** /setup/branding/domain
**Flow(s):** (implied)

### Components
- Header: "Custom Domain"
- Current domain display
- Custom domain input
- Setup instructions:
  - DNS configuration
  - CNAME record
- Verification status
- SSL certificate status
- "Verify Domain" button

### Data Needed
- Domain settings

### Actions
- Enter domain → Validate
- Verify → Check DNS

### States
- Not configured
- Pending verification
- Verified
- SSL provisioning
- Active

---

## 143. Staff Roles

**Location:** /setup/staff/roles
**Flow(s):** 55

### Components
- Header: "Staff Roles"
- Roles list:
  - Role name
  - Description
  - Permissions summary
  - Staff count
  - Actions
- Default roles:
  - Manager
  - Box Office
  - Security
  - Scanner
  - VIP Host
- "Add Custom Role" button

### Data Needed
- Staff roles

### Actions
- Add → Role modal
- Edit → Modal
- Delete → Confirm (if no staff assigned)

### States
- Default

---

## 144. Staff List

**Location:** /setup/staff/list
**Flow(s):** 56

### Components
- Header: "Staff" + "Add Staff" button
- Search input
- Filter by role
- Staff table:
  - Name
  - Email
  - Role
  - Status (Active, Invited, Inactive)
  - Last active
  - Actions
- Pagination

### Data Needed
- Staff list

### Actions
- Search → Filter
- Add → Add Staff Member
- Tap row → Staff detail
- Actions → Edit, Deactivate, Remove

### States
- Loading
- Default
- Empty

---

## 145. Add Staff Member

**Location:** /setup/staff/add
**Flow(s):** 56

### Components
- Header: "Add Staff Member"
- Name input
- Email input
- Phone input
- Role selector
- Permissions overrides (optional)
- Send invitation checkbox
- "Add Staff" button
- "Cancel" button

### Data Needed
- Available roles

### Actions
- Complete form → Add → Send invitation

### States
- Default
- Adding
- Error (email exists)

---

## 146. Staff Assignments

**Location:** /setup/staff/assignments
**Flow(s):** 57, 59

### Components
- Header: "Staff Assignments"
- Event selector
- Assigned staff list:
  - Name
  - Role
  - Position/checkpoint
  - Shift time
  - Actions
- Unassigned staff list
- Drag to assign
- "Add Assignment" button

### Data Needed
- Staff list
- Event assignments

### Actions
- Select event → Load assignments
- Drag staff → Assign
- Add → Assignment modal

### States
- Default
- Empty event selected

---

## 147. Security Checkpoints

**Location:** /setup/staff/checkpoints
**Flow(s):** 58

### Components
- Header: "Security Checkpoints"
- Checkpoints list:
  - Checkpoint name
  - Location
  - Type (Entry, Exit, VIP, Bag Check)
  - Staff required
  - Actions
- "Add Checkpoint" button
- Map view (if available)

### Data Needed
- Checkpoints

### Actions
- Add → Checkpoint modal
- Edit → Modal
- Delete → Confirm

### States
- Default
- Empty

---

## 148. Staff Check-In

**Location:** /setup/staff/checkin
**Flow(s):** 57, 60

### Components
- Header: "Staff Check-In"
- Today's event selector
- Staff on duty list:
  - Name
  - Role
  - Check-in time
  - Assignment
  - Status
- Check-in button per staff
- Manual check-in option
- QR code check-in option

### Data Needed
- Today's assignments
- Check-in status

### Actions
- Check in staff → Update status
- Check out staff → Update status

### States
- Loading
- Default
- No event today

---

## 149. Staff Announcements

**Location:** /setup/staff/announcements
**Flow(s):** 61

### Components
- Header: "Staff Announcements"
- New announcement:
  - Message input
  - Recipient selector (All, Role, Event)
  - Priority (Normal, Urgent)
  - "Send" button
- Recent announcements list:
  - Message
  - Sent to
  - Time
  - Read count

### Data Needed
- Recent announcements
- Staff groups

### Actions
- Send announcement → Notify staff

### States
- Default
- Sending

---

## 150. Staff On Duty

**Location:** /setup/staff/onduty
**Flow(s):** 61

### Components
- Header: "Staff On Duty"
- Event selector
- Currently on duty list:
  - Name
  - Role
  - Assignment
  - Check-in time
  - Duration
- By location breakdown
- By role breakdown
- Contact buttons

### Data Needed
- On-duty staff

### Actions
- Select event → Load staff
- Contact → Message/call

### States
- Loading
- Default
- No one on duty

---

## 151. Email Templates

**Location:** /setup/communication/email
**Flow(s):** 63-65

### Components
- Header: "Email Templates" + "Create Template" button
- Template categories:
  - Order confirmations
  - Reminders
  - Updates
  - Marketing
- Templates list:
  - Name
  - Category
  - Last modified
  - Status (Active/Inactive)
  - Actions
- System templates (non-deletable)
- Custom templates

### Data Needed
- Email templates

### Actions
- Create → Create Email Template
- Tap row → Edit template
- Actions → Edit, Duplicate, Delete

### States
- Loading
- Default

---

## 152. Create Email Template

**Location:** /setup/communication/email/new
**Flow(s):** 63

### Components
- Header: "Create Email Template"
- Template name input
- Category selector
- Subject line input
- Body editor (rich text)
- Placeholders panel:
  - {{customer_name}}
  - {{event_name}}
  - {{event_date}}
  - {{ticket_type}}
  - {{order_number}}
  - etc.
- "Preview" button
- "Save" button

### Data Needed
- Available placeholders

### Actions
- Insert placeholder → Add to content
- Preview → Preview Email Template
- Save → Create template

### States
- Default
- Saving

---

## 153. Preview Email Template

**Location:** /setup/communication/email/preview (modal)
**Flow(s):** 66

### Components
- "Preview Email" header
- Sample data applied
- Desktop/mobile toggle
- Email preview:
  - Subject
  - Header
  - Body with placeholders replaced
  - Footer
- "Send Test" button
- "Close" button

### Data Needed
- Template content
- Sample data

### Actions
- Toggle device → Change preview
- Send test → Send to self

### States
- Default
- Sending test

---

## 154. SMS Templates

**Location:** /setup/communication/sms
**Flow(s):** 68-70

### Components
- Header: "SMS Templates" + "Create Template" button
- SMS enabled status
- Character count guidelines
- Templates list:
  - Name
  - Preview text
  - Character count
  - Status
  - Actions

### Data Needed
- SMS templates

### Actions
- Create → Create SMS Template
- Tap row → Edit
- Actions → Edit, Delete

### States
- Loading
- Default
- SMS not enabled

---

## 155. Create SMS Template

**Location:** /setup/communication/sms/new
**Flow(s):** 68

### Components
- Header: "Create SMS Template"
- Template name input
- Message input
- Character counter (160 char segments)
- Placeholders panel
- Preview pane
- "Save" button

### Data Needed
- Available placeholders

### Actions
- Type message → Update preview and counter
- Insert placeholder → Add to message
- Save → Create template

### States
- Default
- Saving

---

## 156. Notification Settings

**Location:** /setup/communication/notifications
**Flow(s):** 71-74

### Components
- Header: "Notification Settings"
- Customer notifications:
  - Order confirmation (always on)
  - Ticket delivery
  - Event reminders
  - Event updates
  - Post-event follow-up
- Timing settings:
  - Reminder: days before
  - Follow-up: days after
- Channels per notification:
  - Email
  - SMS
  - Push (app)
- "Save" button

### Data Needed
- Current notification settings

### Actions
- Toggle notifications → Save
- Set timing → Save

### States
- Default
- Saving

---

## 157. Refund Policy

**Location:** /setup/policies/refund
**Flow(s):** 75

### Components
- Header: "Refund Policy"
- Policy type:
  - No refunds
  - Full refund until X days before
  - Partial refund tiers
  - Custom policy
- If tiered:
  - Tier editor (days, percentage)
- Exceptions:
  - Event cancellation (always full refund)
  - Event postponement options
- Policy text editor (customer-facing)
- "Save" button

### Data Needed
- Current refund policy

### Actions
- Select policy type → Configure
- Edit text → Update
- Save → Apply

### States
- Default
- Saving

---

## 158. Age Policy

**Location:** /setup/policies/age
**Flow(s):** 76

### Components
- Header: "Age Policy"
- Default age requirement:
  - All ages
  - 18+
  - 21+
- Minor policy:
  - Not allowed
  - Allowed with guardian
  - Allowed in certain areas
- ID requirements:
  - At door
  - For alcohol purchase
- Policy text editor
- "Save" button

### Data Needed
- Current age policy

### Actions
- Set requirements → Save

### States
- Default
- Saving

---

## 159. Bag Policy

**Location:** /setup/policies/bags
**Flow(s):** 78

### Components
- Header: "Bag Policy"
- Bag policy type:
  - No bags
  - Clear bags only
  - Small bags only (size limit)
  - All bags allowed
- Size restrictions:
  - Max dimensions
- Prohibited items list editor
- Bag check available toggle
- Bag check fee input
- Policy text editor
- "Save" button

### Data Needed
- Current bag policy

### Actions
- Set policy → Save

### States
- Default
- Saving

---

## 160. Custom Policies

**Location:** /setup/policies/custom
**Flow(s):** 79

### Components
- Header: "Custom Policies"
- Policies list:
  - Policy name
  - Display location
  - Status (Active/Inactive)
  - Actions
- "Add Policy" button

### Data Needed
- Custom policies

### Actions
- Add → Create Custom Policy
- Tap row → Edit
- Actions → Edit, Delete, Toggle status

### States
- Default
- Empty

---

## 161. Create Custom Policy

**Location:** /setup/policies/custom/new
**Flow(s):** 79

### Components
- Header: "Create Policy"
- Policy name input
- Display locations:
  - Event page
  - Checkout
  - Confirmation
  - Ticket
- Policy text editor
- Require acknowledgment checkbox
- "Save" button

### Data Needed
- Display location options

### Actions
- Complete form → Save

### States
- Default
- Saving

---

## 162. Emergency Contacts

**Location:** /setup/safety/emergency
**Flow(s):** 80

### Components
- Header: "Emergency Contacts"
- Venue emergency contacts:
  - Contact name
  - Role
  - Phone
  - Email
- Local emergency services:
  - Police
  - Fire
  - Medical
  - Poison control
- Internal contacts:
  - Manager on duty
  - Security lead
- "Add Contact" button
- "Save" button

### Data Needed
- Emergency contacts

### Actions
- Add contact → Modal
- Edit → Update
- Save → Apply

### States
- Default
- Saving

---

## 163. Evacuation Plan

**Location:** /setup/safety/evacuation
**Flow(s):** 81

### Components
- Header: "Evacuation Plan"
- Evacuation map upload
- Primary evacuation routes:
  - Route name
  - Exit used
  - Assembly point
- Secondary routes
- Assembly points list
- Special instructions:
  - Accessibility considerations
  - VIP evacuation
- Download/print button
- "Save" button

### Data Needed
- Evacuation plan data

### Actions
- Upload map → Attach
- Edit routes → Update
- Save → Apply

### States
- Default
- Saving

---

## 164. Safety Protocols

**Location:** /setup/safety/protocols
**Flow(s):** 82, 83

### Components
- Header: "Safety Protocols"
- Protocol categories:
  - Fire emergency
  - Medical emergency
  - Severe weather
  - Active threat
  - Crowd control
- Per protocol:
  - Step-by-step instructions
  - Responsible parties
  - Communication plan
- Training materials link
- Last updated date
- "Save" button

### Data Needed
- Safety protocols

### Actions
- Edit protocols → Save

### States
- Default
- Saving

---

## 165. Medical Stations

**Location:** /setup/safety/medical
**Flow(s):** 83

### Components
- Header: "Medical Stations"
- Stations list:
  - Station name
  - Location
  - Staffing level
  - Equipment list
  - Actions
- "Add Station" button
- Map view
- AED locations
- First aid kit locations

### Data Needed
- Medical stations

### Actions
- Add → Station modal
- Edit → Modal
- View map → Map display

### States
- Default
- Empty

---

# Operations Screens

---

## 166. Incidents List

**Location:** /operations/incidents
**Flow(s):** 94

### Components
- Header: "Incidents" + "Log Incident" button
- Filter by event
- Filter by type
- Filter by status (Open, Resolved)
- Incidents table:
  - Date/time
  - Event
  - Type
  - Description
  - Severity
  - Status
  - Actions
- Export button

### Data Needed
- Incidents list

### Actions
- Log → Log Incident
- Filter → Update list
- Tap row → Incident Detail
- Export → Download

### States
- Loading
- Default
- Empty

---

## 167. Log Incident

**Location:** /operations/incidents/new
**Flow(s):** 95

### Components
- Header: "Log Incident"
- Event selector (default to current/recent)
- Incident type dropdown:
  - Medical
  - Security
  - Damage/Property
  - Customer complaint
  - Staff issue
  - Other
- Severity selector:
  - Low
  - Medium
  - High
  - Critical
- Location input
- Description editor
- People involved:
  - Staff
  - Customers
  - External
- Actions taken editor
- Photo upload
- Witnesses
- "Log Incident" button

### Data Needed
- Events
- Incident types
- Staff list

### Actions
- Complete form → Log
- Upload photos → Attach

### States
- Default
- Logging
- Error

---

## 168. Incident Detail

**Location:** /operations/incidents/:id
**Flow(s):** 96

### Components
- Header: Incident ID + Status badge
- Incident summary:
  - Event
  - Type
  - Severity
  - Date/time
  - Location
- Description
- People involved
- Photos
- Actions taken
- Follow-up notes:
  - Add note button
  - Notes timeline
- Resolution section
- "Mark Resolved" button
- "Edit" button

### Data Needed
- Incident object

### Actions
- Add note → Add follow-up
- Mark resolved → Resolution modal
- Edit → Edit mode

### States
- Loading
- Default (open)
- Default (resolved)

---

## 169. Equipment List

**Location:** /operations/equipment
**Flow(s):** 98

### Components
- Header: "Equipment" + "Add Equipment" button
- Filter by category
- Filter by status
- Equipment table:
  - Name
  - Category
  - Location
  - Status (Working, Needs Repair, Out of Service)
  - Last check
  - Actions
- Maintenance schedule link

### Data Needed
- Equipment list

### Actions
- Add → Add Equipment
- Filter → Update list
- Tap row → Equipment detail
- Actions → Check, Report issue

### States
- Loading
- Default
- Empty

---

## 170. Add Equipment

**Location:** /operations/equipment/add
**Flow(s):** 99

### Components
- Header: "Add Equipment"
- Equipment name input
- Category selector:
  - Audio
  - Visual
  - Lighting
  - Safety
  - Furniture
  - Other
- Location input
- Serial number input
- Purchase date
- Warranty info
- Notes
- Photo upload
- "Add Equipment" button

### Data Needed
- Categories

### Actions
- Complete form → Add

### States
- Default
- Adding

---

## 171. Equipment Check

**Location:** /operations/equipment/check
**Flow(s):** 100

### Components
- Header: "Equipment Check"
- Event selector (or general check)
- Equipment checklist:
  - Equipment name
  - Status checkbox (Working, Issue)
  - Notes input per item
- Overall notes
- "Complete Check" button

### Data Needed
- Equipment for check

### Actions
- Check items → Update status
- Complete → Log check

### States
- Default
- Completing

---

## 172. Report Equipment Issue

**Location:** /operations/equipment/issue (modal)
**Flow(s):** 101

### Components
- "Report Issue" header
- Equipment name display
- Issue type:
  - Not working
  - Damaged
  - Missing
  - Other
- Description input
- Priority:
  - Low
  - Medium
  - High
  - Urgent
- Photo upload
- "Report" button
- "Cancel" button

### Data Needed
- Equipment info

### Actions
- Complete form → Report → Update equipment status

### States
- Default
- Reporting

---

# Multi-Venue Screens

---

## 173. Venue Switcher

**Location:** Sidebar component
**Flow(s):** 102

### Components
- Current venue name + dropdown arrow
- Dropdown list:
  - Venue name
  - Venue location
  - Active indicator
- "Manage Venues" link
- "Add Venue" link

### Data Needed
- User's venues

### Actions
- Tap venue → Switch venue → Reload dashboard
- Tap "Manage" → All Venues List
- Tap "Add" → Add New Venue

### States
- Default

---

## 174. All Venues List

**Location:** /venues
**Flow(s):** 103

### Components
- Header: "Your Venues" + "Add Venue" button
- Venues grid/list:
  - Venue image
  - Venue name
  - Location
  - Status (Active, Setup, Inactive)
  - Events count
  - Quick stats
- Actions per venue:
  - Switch to
  - Edit
  - Deactivate

### Data Needed
- User's venues with stats

### Actions
- Tap venue → Switch to venue
- Tap "Add" → Add New Venue
- Tap actions → Execute action

### States
- Loading
- Default
- Single venue (hide multi-venue features)

---

## 175. Add New Venue

**Location:** /venues/new
**Flow(s):** 104

### Components
- Header: "Add New Venue"
- Venue name input
- Venue type selector
- Address inputs
- Description input
- "Create Venue" button
- Note: "You'll complete setup after creating"

### Data Needed
- Venue types

### Actions
- Complete form → Create → Venue Setup onboarding

### States
- Default
- Creating

---

## 176. Cross-Venue Analytics

**Location:** /venues/analytics
**Flow(s):** 105

### Components
- Header: "Cross-Venue Analytics"
- Date range selector
- Venue selector (multi-select)
- Summary stats (all venues):
  - Total revenue
  - Total tickets
  - Total events
- Revenue by venue chart
- Sales by venue chart
- Comparison table:
  - Venue
  - Revenue
  - Tickets
  - Events
  - Avg ticket price
- Export button

### Data Needed
- Analytics for all venues

### Actions
- Select venues → Update
- Change date range → Update
- Export → Download

### States
- Loading
- Default

---

## 177. Compare Venues

**Location:** /venues/compare
**Flow(s):** 106

### Components
- Header: "Compare Venues"
- Venue selector (2-4 venues)
- Comparison metrics:
  - Revenue
  - Tickets sold
  - Events held
  - Average attendance
  - Sell-through rate
  - Customer satisfaction
- Side-by-side charts
- Performance ranking
- Export button

### Data Needed
- Venue comparison data

### Actions
- Select venues → Generate comparison
- Export → Download

### States
- Select venues
- Comparing
- Results

---

# Team Screens

---

## 178. Team List

**Location:** /team
**Flow(s):** 5, 9

### Components
- Header: "Team" + "Invite Member" button
- Team members table:
  - Avatar
  - Name
  - Email
  - Role
  - Status (Active, Invited, Inactive)
  - Last active
  - Actions
- Owner badge on owner
- Pending invitations section

### Data Needed
- Team members
- Pending invitations

### Actions
- Tap "Invite" → Invite Team Member
- Tap row → Team Member Detail
- Actions → Edit, Remove

### States
- Loading
- Default

---

## 179. Invite Team Member

**Location:** /team/invite
**Flow(s):** 9

### Components
- Header: "Invite Team Member"
- Email input
- Name input (optional)
- Role selector:
  - Owner
  - Admin
  - Manager
  - Staff
  - Scanner
  - Custom
- Permissions panel (if custom):
  - Dashboard access
  - Events (view, create, edit)
  - Financials (view, manage)
  - Settings (view, manage)
  - Team (view, manage)
- Personal message input
- "Send Invitation" button

### Data Needed
- Available roles
- Permission options

### Actions
- Select role → Show permissions
- Customize → Override permissions
- Send → Invite sent

### States
- Default
- Sending
- Sent

---

## 180. Team Member Detail

**Location:** /team/:id
**Flow(s):** 7

### Components
- Header: Member name
- Profile section:
  - Avatar
  - Name
  - Email
  - Phone
  - Role badge
  - Status badge
- Activity section:
  - Last login
  - Actions performed
  - Events worked
- Permissions summary
- "Edit" button
- "Remove" button (not for owner)
- "Transfer Ownership" button (if owner viewing)

### Data Needed
- Team member object
- Activity data

### Actions
- Edit → Edit Permissions
- Remove → Remove Member Modal
- Transfer → Transfer Ownership

### States
- Loading
- Default

---

## 181. Edit Permissions

**Location:** /team/:id/permissions
**Flow(s):** 8, 11

### Components
- Header: "Edit Permissions"
- Member info display
- Role selector
- Permissions grid:
  - Feature area
  - No access / View / Edit / Full
- Per-venue permissions (if multi-venue):
  - Venue checkboxes
- "Save" button

### Data Needed
- Member current permissions
- Available permissions

### Actions
- Change role → Update permissions
- Customize → Override
- Save → Apply

### States
- Default
- Saving

---

## 182. Remove Member Modal

**Location:** /team (modal)
**Flow(s):** 12

### Components
- "Remove Team Member" header
- Warning message
- Member name display
- Impact explanation:
  - Will lose access immediately
  - Assigned tasks/events affected
- Reassign option (if applicable)
- "Remove Member" button (destructive)
- "Cancel" button

### Data Needed
- Member info
- Assignments

### Actions
- Reassign → Select new assignee
- Remove → Remove access

### States
- Default
- Removing

---

## 183. Transfer Ownership

**Location:** /team/transfer
**Flow(s):** 13

### Components
- Header: "Transfer Ownership"
- Current owner display
- Warning message:
  - "This action cannot be undone"
  - "You will become an Admin"
- New owner selector (from existing admins)
- Password confirmation
- "Transfer Ownership" button
- "Cancel" button

### Data Needed
- Current owner
- Eligible admins

### Actions
- Select new owner → Enable button
- Confirm → Transfer

### States
- Default
- Confirming
- Transferred

---

## 184. Audit Log

**Location:** /team/audit
**Flow(s):** 11-13

### Components
- Header: "Audit Log"
- Date range selector
- Filter by user
- Filter by action type
- Audit log table:
  - Date/time
  - User
  - Action
  - Details
  - IP address
- Export button

### Data Needed
- Audit log entries

### Actions
- Filter → Update
- Tap row → Expand details
- Export → Download

### States
- Loading
- Default

---

## 185. 2FA Setup

**Location:** /team/2fa (or /settings/security/2fa)
**Flow(s):** 7

### Components
- Header: "Two-Factor Authentication"
- Current status:
  - Enabled/Disabled badge
  - Method (SMS, Authenticator)
- Setup section (if disabled):
  - Method selector
  - Setup flow
- If SMS:
  - Phone number display
  - "Send Code" button
  - Code input
- If Authenticator:
  - QR code
  - Manual code
  - Verification input
- Backup codes section
- "Disable 2FA" button (if enabled)

### Data Needed
- 2FA status
- Phone number
- Authenticator secret

### Actions
- Enable → Setup flow
- Verify → Enable 2FA
- View backup codes → Display
- Disable → Confirm → Disable

### States
- Disabled
- Setting up
- Enabled

---

# Support Screens

---

## 186. Help Center

**Location:** /support
**Flow(s):** 286

### Components
- Header: "Help Center"
- Search input
- Categories grid:
  - Getting Started
  - Events
  - Tickets
  - Payments
  - Settings
  - etc.
- Popular articles list
- Contact support card
- Training resources link

### Data Needed
- Help categories
- Popular articles

### Actions
- Search → Search Help
- Tap category → Category articles
- Tap article → Help Article
- Tap contact → Contact Support

### States
- Loading
- Default

---

## 187. Search Help

**Location:** /support/search
**Flow(s):** 287

### Components
- Header: "Search Help"
- Search input (auto-focus)
- Results list:
  - Article title
  - Category
  - Preview snippet
- No results state with contact link

### Data Needed
- Search results

### Actions
- Type → Search
- Tap result → Help Article

### States
- Default
- Results
- No results

---

## 188. Help Article

**Location:** /support/articles/:id
**Flow(s):** 287

### Components
- Breadcrumb navigation
- Article title
- Last updated date
- Article content (rich text)
- Table of contents (if long)
- "Was this helpful?" feedback
- Related articles
- "Still need help?" with contact button

### Data Needed
- Article object

### Actions
- Tap feedback → Submit
- Tap related → Navigate
- Tap contact → Contact Support

### States
- Loading
- Default

---

## 189. Tutorial Videos

**Location:** /support/tutorials
**Flow(s):** 288

### Components
- Header: "Tutorial Videos"
- Video categories:
  - Getting Started
  - Events
  - Scanning
  - Analytics
  - etc.
- Video grid:
  - Thumbnail
  - Title
  - Duration
  - Category
- Video player modal

### Data Needed
- Video list

### Actions
- Tap video → Open player
- Filter by category → Update

### States
- Loading
- Default

---

## 190. Getting Started Guide

**Location:** /support/getting-started
**Flow(s):** 289

### Components
- Header: "Getting Started"
- Progress indicator
- Step-by-step guide:
  1. Set up your venue
  2. Configure settings
  3. Create your first event
  4. Sell tickets
  5. Scan attendees
- Each step:
  - Title
  - Description
  - Video/image
  - "Complete" checkbox
  - Link to relevant page
- "Mark Complete" button per step

### Data Needed
- Setup progress

### Actions
- Tap step → Navigate to page
- Mark complete → Update progress

### States
- In progress
- Complete

---

## 191. Best Practices

**Location:** /support/best-practices
**Flow(s):** 290

### Components
- Header: "Best Practices"
- Topics list:
  - Event creation tips
  - Pricing strategies
  - Marketing your events
  - Day-of operations
  - Customer service
- Expandable content per topic
- Related articles links

### Data Needed
- Best practices content

### Actions
- Expand topic → Show content
- Tap link → Navigate

### States
- Default

---

## 192. Contact Support

**Location:** /support/contact
**Flow(s):** 282

### Components
- Header: "Contact Support"
- Contact options:
  - Live Chat (if available)
  - Email
  - Phone
  - Schedule a Call
- Issue category selector
- Description input
- Attachments upload
- Account info (pre-filled)
- "Submit" button

### Data Needed
- Support availability
- Account info

### Actions
- Select channel → Show form
- Submit → Create ticket

### States
- Default
- Submitting
- Submitted

---

## 193. Live Chat

**Location:** /support/chat
**Flow(s):** 283

### Components
- Header: "Live Chat"
- Chat window:
  - Messages (user and agent)
  - Typing indicator
  - Timestamps
- Message input
- Send button
- Attach file button
- End chat button
- Queue position (if waiting)

### Data Needed
- Chat session

### Actions
- Send message → Deliver
- Attach file → Upload
- End chat → Confirm → End

### States
- Connecting
- Waiting in queue
- Active
- Ended

---

## 194. Schedule Call

**Location:** /support/schedule
**Flow(s):** 284

### Components
- Header: "Schedule a Call"
- Topic selector
- Available times calendar
- Time slot selection
- Phone number input
- Notes input
- "Schedule" button

### Data Needed
- Available slots
- User phone

### Actions
- Select slot → Enable button
- Schedule → Confirm → Scheduled

### States
- Default
- Scheduling
- Scheduled

---

## 195. Emergency Hotline

**Location:** /support/emergency
**Flow(s):** 285

### Components
- Header: "Emergency Support"
- Emergency phone number (large, clickable)
- Available hours
- What qualifies as emergency:
  - Day-of-event critical issues
  - System-wide outages
  - Security emergencies
- Non-emergency redirect to regular support

### Data Needed
- Emergency contact info

### Actions
- Tap phone → Initiate call

### States
- Default

---

## 196. Account Manager

**Location:** /support/account-manager
**Flow(s):** 292

### Components
- Header: "Account Manager"
- If assigned:
  - Manager photo
  - Name
  - Email
  - Phone
  - Office hours
  - "Schedule Meeting" button
  - "Send Email" button
- If not assigned:
  - Explanation
  - "Request Account Manager" button

### Data Needed
- Account manager info

### Actions
- Contact → Email/call
- Schedule → Calendar integration
- Request → Request Account Manager

### States
- Has manager
- No manager

---

## 197. Request Account Manager

**Location:** /support/account-manager/request
**Flow(s):** 291

### Components
- Header: "Request Account Manager"
- Benefits explanation
- Eligibility info
- Request form:
  - Business size
  - Monthly volume
  - Specific needs
- "Submit Request" button

### Data Needed
- Current account info

### Actions
- Submit → Request sent

### States
- Default
- Submitting
- Submitted

---

## 198. Training Sessions

**Location:** /support/training
**Flow(s):** 293

### Components
- Header: "Training"
- Upcoming sessions:
  - Session title
  - Date/time
  - Topic
  - "Register" button
- Past sessions:
  - Recording link
- Schedule private training button
- Training topics available

### Data Needed
- Available sessions
- Registered sessions

### Actions
- Register → Confirm registration
- Watch recording → Video player
- Schedule private → Scheduling form

### States
- Loading
- Default

---

## 199. Training Materials

**Location:** /support/training/materials
**Flow(s):** 294

### Components
- Header: "Training Materials"
- Materials categories:
  - Guides
  - Videos
  - Checklists
  - Templates
- Materials list:
  - Title
  - Type
  - Description
  - Download/view button
- Search input

### Data Needed
- Training materials

### Actions
- Download → Get file
- View → Open viewer

### States
- Loading
- Default

---

## 200. Sandbox Mode

**Location:** /support/sandbox
**Flow(s):** 295

### Components
- Header: "Sandbox Mode"
- Sandbox status toggle
- Explanation:
  - Test without real transactions
  - No real charges
  - Reset data anytime
- Test credit card numbers
- "Enable Sandbox" button
- "Reset Sandbox Data" button
- Warning when in sandbox mode

### Data Needed
- Sandbox status

### Actions
- Enable → Activate sandbox
- Disable → Return to live
- Reset → Clear test data

### States
- Live mode
- Sandbox mode

---

## 201. Submit Bug Report

**Location:** /support/bug-report
**Flow(s):** 296

### Components
- Header: "Report a Bug"
- Bug title input
- Steps to reproduce editor
- Expected behavior input
- Actual behavior input
- Severity selector
- Browser/device info (auto-filled)
- Screenshots upload
- Console log attach (optional)
- "Submit" button

### Data Needed
- System info

### Actions
- Complete form → Submit

### States
- Default
- Submitting
- Submitted

---

## 202. Request Feature

**Location:** /support/feature-request
**Flow(s):** 297, 298

### Components
- Header: "Request a Feature"
- Feature title input
- Description editor
- Use case explanation
- Category selector
- Priority (nice to have, important, critical)
- "Submit" button
- Link to vote on existing requests

### Data Needed
- Categories

### Actions
- Submit → Create request
- Tap vote link → Vote on Features

### States
- Default
- Submitting
- Submitted

---

## 203. Vote on Features

**Location:** /support/features
**Flow(s):** 299

### Components
- Header: "Feature Requests"
- Filter: All, Popular, Recent, Planned, Completed
- Feature list:
  - Title
  - Description
  - Vote count
  - Status badge
  - "Vote" button
- Your votes section
- "Request New Feature" button

### Data Needed
- Feature requests
- User's votes

### Actions
- Vote → Add vote
- Unvote → Remove vote
- Filter → Update list
- Tap feature → Feature detail

### States
- Loading
- Default

---

## 204. Support Tickets

**Location:** /support/tickets
**Flow(s):** 300

### Components
- Header: "Your Tickets"
- Tabs: All, Open, Resolved
- Tickets list:
  - Ticket number
  - Subject
  - Status
  - Created date
  - Last update
- "New Ticket" button

### Data Needed
- User's support tickets

### Actions
- Tap tab → Filter
- Tap ticket → Support Ticket Detail
- New ticket → Contact Support

### States
- Loading
- Default
- Empty

---

## 205. Support Ticket Detail

**Location:** /support/tickets/:id
**Flow(s):** 300

### Components
- Header: Ticket number + Status badge
- Subject
- Created date
- Conversation thread:
  - User messages
  - Support messages
  - Timestamps
  - Attachments
- Reply input
- Attach file button
- "Send" button
- "Close Ticket" button (if resolved)

### Data Needed
- Ticket object

### Actions
- Reply → Send message
- Attach → Upload file
- Close → Confirm close

### States
- Loading
- Default (open)
- Default (closed)

---

## 206. Terms of Service

**Location:** /support/legal/terms
**Flow(s):** 301

### Components
- Header: "Terms of Service"
- Last updated date
- Terms content (rich text, scrollable)
- Table of contents
- Download PDF button

### Data Needed
- Terms content

### Actions
- Download → Get PDF

### States
- Loading
- Default

---

## 207. Privacy Policy

**Location:** /support/legal/privacy
**Flow(s):** 302

### Components
- Header: "Privacy Policy"
- Last updated date
- Policy content (rich text)
- Table of contents
- Download PDF button

### Data Needed
- Privacy policy content

### Actions
- Download → Get PDF

### States
- Loading
- Default

---

## 208. Compliance Guides

**Location:** /support/legal/compliance
**Flow(s):** 303

### Components
- Header: "Compliance Guides"
- Guides list:
  - ADA compliance
  - State ticketing laws
  - Consumer protection
  - Data privacy (GDPR, CCPA)
  - Tax compliance
- Each guide:
  - Overview
  - Requirements
  - How we help
  - Resources
- Download buttons

### Data Needed
- Compliance guides

### Actions
- Tap guide → Expand
- Download → Get PDF

### States
- Loading
- Default

---

## 209. Tax Forms Download

**Location:** /support/legal/tax-forms
**Flow(s):** 304

### Components
- Header: "Tax Forms"
- Forms list:
  - W-9 (blank)
  - Your W-9 (submitted)
  - 1099-K (if applicable)
  - Transaction summary
- Download buttons
- Tax year selector
- "Update Tax Info" link (to Stripe)

### Data Needed
- Available tax forms

### Actions
- Download → Get form
- Update → Stripe dashboard

### States
- Loading
- Default

---

## 210. Platform Announcements

**Location:** /support/announcements
**Flow(s):** 305, 306

### Components
- Header: "Announcements"
- Tabs: All, Product Updates, Maintenance, News
- Announcements list:
  - Date
  - Title
  - Category badge
  - Preview
- Expand to read full
- "Subscribe to Updates" link

### Data Needed
- Announcements

### Actions
- Tap tab → Filter
- Expand → Read full
- Subscribe → Subscribe to Updates

### States
- Loading
- Default

---

## 211. Platform Status

**Location:** /support/status
**Flow(s):** 312

### Components
- Header: "Platform Status"
- Overall status indicator (Operational, Degraded, Outage)
- Systems list:
  - Ticket sales
  - Scanning
  - Payouts
  - Dashboard
  - API
- Per system:
  - Status indicator
  - Uptime percentage
- Incident history
- "Subscribe to Status Updates" button

### Data Needed
- System status
- Incident history

### Actions
- Subscribe → Email/SMS signup

### States
- All operational
- Partial outage
- Major outage

---

## 212. Subscribe to Updates

**Location:** /support/subscribe
**Flow(s):** 307

### Components
- Header: "Subscribe to Updates"
- Subscription options:
  - Product updates
  - Maintenance notices
  - Platform status
  - Newsletter
- Channel selection:
  - Email
  - SMS
- Frequency:
  - All updates
  - Weekly digest
  - Important only
- "Save Preferences" button

### Data Needed
- Current subscriptions

### Actions
- Toggle options → Save

### States
- Default
- Saving

---

# Settings Screens

---

## 213. Account Settings

**Location:** /settings
**Flow(s):** 5

### Components
- Header: "Settings"
- Settings navigation:
  - Profile
  - Password
  - Security (2FA)
  - Notifications
- Account info display
- Danger zone:
  - Deactivate account
  - Delete account

### Data Needed
- Account info

### Actions
- Tap section → Navigate

### States
- Default

---

## 214. Edit Profile

**Location:** /settings/profile
**Flow(s):** 5

### Components
- Header: "Profile"
- Avatar upload
- Name input
- Email input (may require verification)
- Phone input
- Job title input
- Timezone selector
- "Save" button

### Data Needed
- User profile

### Actions
- Upload avatar → Update
- Edit fields → Save

### States
- Default
- Saving

---

## 215. Change Password

**Location:** /settings/password
**Flow(s):** 6

### Components
- Header: "Change Password"
- Current password input
- New password input
- Confirm password input
- Password requirements display
- "Update Password" button

### Data Needed
- None

### Actions
- Complete form → Update

### States
- Default
- Updating
- Success
- Error

### Validation
- Current password: required, correct
- New password: meets requirements
- Confirm: matches new

---

## 216. Enable 2FA

**Location:** /settings/security
**Flow(s):** 7

### Components
- Same as 2FA Setup (Screen 185)

---

## 217. Notification Preferences

**Location:** /settings/notifications
**Flow(s):** 8

### Components
- Header: "Notifications"
- Email notifications:
  - Sales alerts
  - Daily summary
  - Weekly report
  - New reviews
  - Support updates
  - Marketing
- Push notifications (if app):
  - Same categories
- SMS notifications:
  - Urgent alerts only
- "Save" button

### Data Needed
- Current preferences

### Actions
- Toggle options → Save

### States
- Default
- Saving

---

# End of Venue Dashboard Screens

---

## Summary

| Section | Screens |
|---------|---------|
| Auth | 7 |
| Dashboard | 1 |
| Events | 20 |
| Tickets | 13 |
| Scanning | 23 |
| Analytics | 10 |
| Financials | 14 |
| Marketing | 7 |
| Resale Settings | 8 |
| Venue Setup - Profile | 8 |
| Venue Setup - Location | 8 |
| Venue Setup - Capacity | 6 |
| Venue Setup - VIP | 6 |
| Venue Setup - Legal | 6 |
| Venue Setup - Branding | 5 |
| Venue Setup - Staff | 8 |
| Venue Setup - Communication | 6 |
| Venue Setup - Policies | 5 |
| Venue Setup - Safety | 4 |
| Operations | 7 |
| Multi-Venue | 5 |
| Team | 8 |
| Support | 27 |
| Settings | 5 |
| **Total** | **217** |

All 312 flows mapped to 217 screens.