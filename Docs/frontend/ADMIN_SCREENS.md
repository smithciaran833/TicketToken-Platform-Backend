# TicketToken — Admin Dashboard Screens (Web)

Generated: 2024-12-28
Total Screens: 156
Total Flows: 169
Platform: React (Web)

---

## Navigation Structure

### Sidebar Navigation
```
┌──────────────────┬─────────────────────────────────────┐
│                  │                                     │
│  TicketToken     │                                     │
│  ADMIN           │                                     │
│                  │                                     │
│  Dashboard       │                                     │
│                  │                                     │
│  Users           │         Page Content                │
│    › Fans        │                                     │
│    › Venues      │                                     │
│    › Artists     │                                     │
│                  │                                     │
│  Events          │                                     │
│  Financials      │                                     │
│  Moderation      │                                     │
│  Support         │                                     │
│                  │                                     │
│  Platform        │                                     │
│    › Settings    │                                     │
│    › Compliance  │                                     │
│    › Analytics   │                                     │
│                  │                                     │
│  ──────────────  │                                     │
│  Team            │                                     │
│  [Admin Name ▼]  │                                     │
└──────────────────┴─────────────────────────────────────┘
```

---

## Screen Index

### Auth (5 screens)
1. Login
2. Forgot Password
3. Reset Password
4. 2FA Verification
5. 2FA Setup

### Dashboard (1 screen)
6. Dashboard Home

### Users - Fans (13 screens)
7. Fans List
8. Fan Detail
9. Fan Tickets
10. Fan Orders
11. Fan Resale Activity
12. Fan Support History
13. Impersonate Fan Modal
14. Suspend Fan Modal
15. Ban Fan Modal
16. Delete Fan Modal
17. Merge Accounts Modal
18. Fan Audit Log
19. Export Fans

### Users - Venues (17 screens)
20. Venues List
21. Venue Detail
22. Venue Events
23. Venue Financials
24. Venue Team
25. Venue Settings
26. Venue Audit Log
27. Impersonate Venue Modal
28. Onboard Venue
29. Venue Invite Link
30. Approve Venue Modal
31. Suspend Venue Modal
32. Deactivate Venue Modal
33. Adjust Venue Fees Modal
34. Venue Payout History
35. Venue Support History
36. Export Venues

### Users - Artists (12 screens)
37. Artists List
38. Artist Detail
39. Artist Events
40. Artist Analytics
41. Artist Team
42. Artist Audit Log
43. Impersonate Artist Modal
44. Link Artist to Event Modal
45. Verify Artist Modal
46. Suspend Artist Modal
47. Merge Artist Profiles Modal
48. Export Artists

### Events (13 screens)
49. Events List
50. Event Detail
51. Event Sales
52. Event Attendance
53. Event Resale Activity
54. Event Issues
55. Cancel Event Modal
56. Postpone Event Modal
57. Transfer Event Modal
58. Flag Event Modal
59. Event Audit Log
60. Events Calendar
61. Export Events

### Financials (14 screens)
62. Financials Overview
63. Platform Revenue
64. Transactions List
65. Transaction Detail
66. Payouts List
67. Payout Detail
68. Trigger Payout Modal
69. Refunds List
70. Refund Detail
71. Process Refund Modal
72. Chargebacks List
73. Chargeback Detail
74. Stripe Dashboard Link
75. Financial Reports

### Content Moderation (10 screens)
76. Moderation Queue
77. Review Detail
78. Approve Content Modal
79. Reject Content Modal
80. Flagged Content List
81. Flagged Content Detail
82. Auto-Moderation Settings
83. Banned Words List
84. Moderation History
85. Moderation Analytics

### Support Tickets (15 screens)
86. Support Dashboard
87. Tickets List
88. Ticket Detail
89. Assign Ticket Modal
90. Escalate Ticket Modal
91. Merge Tickets Modal
92. Canned Responses
93. Create Canned Response
94. Edit Canned Response
95. Support Analytics
96. Agent Performance
97. Response Time Report
98. Ticket Categories
99. SLA Settings
100. Support Settings

### Platform Settings (18 screens)
101. Platform Settings Overview
102. General Settings
103. Feature Flags
104. Feature Flag Detail
105. System-Wide Flags
106. Per-Venue Flags
107. Emergency Controls
108. Kill Switch Modal
109. Maintenance Mode Modal
110. Platform Branding
111. Email Settings
112. Email Templates
113. API Keys
114. Create API Key Modal
115. Webhooks
116. Create Webhook Modal
117. Integrations
118. Platform Logs

### Compliance (12 screens)
119. Compliance Dashboard
120. Age Verification Settings
121. Legal Holds List
122. Create Legal Hold Modal
123. Legal Hold Detail
124. Tax Documents
125. 1099 Tracking
126. W-9 Management
127. GDPR Requests
128. CCPA Requests
129. Data Export Request Detail
130. Data Deletion Request Detail

### Analytics (14 screens)
131. Analytics Dashboard
132. Platform Metrics
133. User Growth
134. Event Volume
135. Transaction Volume
136. Revenue Analytics
137. Geographic Analytics
138. Funnel Analytics
139. Cohort Analysis
140. Custom Reports
141. Saved Reports
142. Schedule Report Modal
143. Export Analytics
144. Real-Time Dashboard

### Team (8 screens)
145. Admin Team List
146. Invite Admin
147. Admin Detail
148. Edit Admin Permissions
149. Remove Admin Modal
150. Admin Roles
151. Create Role Modal
152. Admin Audit Log

### Account (4 screens)
153. My Profile
154. Change Password
155. My 2FA Settings
156. My Activity Log

---

# Auth Screens

---

## 1. Login

**Location:** /admin/login
**Flow(s):** 1, 2

### Components
- TicketToken Admin logo
- "Admin Portal" header
- Email input
- Password input
- "Log In" button
- "Forgot Password?" link
- Security notice: "This is a restricted system"

### Data Needed
- None

### Actions
- Enter credentials → Validate → 2FA Verification (required) → Dashboard
- Tap "Forgot Password?" → Forgot Password

### States
- Default
- Loading
- Error (invalid credentials)
- Account locked

### Notes
- 2FA required for all admin accounts

---

## 2. Forgot Password

**Location:** /admin/forgot-password
**Flow(s):** 3

### Components
- Back to login link
- "Reset Password" header
- Email input
- "Send Reset Link" button
- Security note

### Data Needed
- None

### Actions
- Submit → Send reset email

### States
- Default
- Loading
- Success
- Error

---

## 3. Reset Password

**Location:** /admin/reset-password/:token
**Flow(s):** 3

### Components
- "Create New Password" header
- New password input
- Confirm password input
- Password requirements (stricter for admin)
- "Reset Password" button

### Data Needed
- Reset token

### Actions
- Submit → Reset → Login

### States
- Default
- Loading
- Success
- Error (invalid/expired token)

### Validation
- Password: min 12 chars, uppercase, lowercase, number, special char

---

## 4. 2FA Verification

**Location:** /admin/2fa
**Flow(s):** 2

### Components
- "Two-Factor Authentication" header
- Code input (6 digits)
- "Verify" button
- "Use backup code" link
- "Resend code" link (if SMS)

### Data Needed
- 2FA method (SMS or Authenticator)

### Actions
- Enter code → Verify → Dashboard
- Use backup code → Backup code input

### States
- Default
- Verifying
- Error (invalid code)

---

## 5. 2FA Setup

**Location:** /admin/2fa/setup
**Flow(s):** 4

### Components
- "Set Up 2FA" header
- Method selector (Authenticator required for admin)
- QR code display
- Manual code display
- Verification code input
- Backup codes display
- "Download Backup Codes" button
- "Complete Setup" button

### Data Needed
- Authenticator secret

### Actions
- Scan QR → Enter code → Verify → Download backup codes → Complete

### States
- Setup
- Verifying
- Backup codes
- Complete

### Notes
- 2FA mandatory for admin accounts
- Authenticator app required (no SMS option)

---

# Dashboard Screen

---

## 6. Dashboard Home

**Location:** /admin/dashboard
**Flow(s):** 12-27

### Components
- Header: "Dashboard" + date range selector
- Platform health indicators:
  - System status (green/yellow/red)
  - Active incidents
  - Pending moderation
  - Open support tickets
- Quick stats cards:
  - Total Users
  - Active Venues
  - Events Today
  - Revenue Today
  - Transactions Today
- Revenue chart (line)
- Recent activity feed:
  - New venue signups
  - Large transactions
  - Flagged content
  - Support escalations
- Alerts panel:
  - System alerts
  - Compliance deadlines
  - Payout issues
- Quick actions:
  - View Support Queue
  - View Moderation Queue
  - System Status

### Data Needed
- Platform metrics
- Activity feed
- Alerts
- System status

### Actions
- Change date range → Refresh
- Tap alert → Navigate to issue
- Tap activity → Navigate to detail
- Tap quick action → Navigate

### States
- Loading
- Default
- System issues (warning state)

---

# Users - Fans Screens

---

## 7. Fans List

**Location:** /admin/users/fans
**Flow(s):** 28, 29

### Components
- Header: "Fans" + "Export" button
- Search input (name, email, phone)
- Filters:
  - Status (Active, Suspended, Banned)
  - Registration date range
  - Has purchases
  - Has listings
- Fans table:
  - Avatar
  - Name
  - Email
  - Status badge
  - Registered date
  - Orders count
  - Total spent
  - Actions
- Pagination
- Bulk actions (if selected)

### Data Needed
- Fans list (paginated)
- Filter options

### Actions
- Search → Filter
- Apply filters → Update
- Tap row → Fan Detail
- Tap actions → Dropdown menu
- Select multiple → Enable bulk actions
- Export → Export Fans

### States
- Loading
- Default
- Empty
- Filtered empty

---

## 8. Fan Detail

**Location:** /admin/users/fans/:id
**Flow(s):** 30, 31

### Components
- Header: Fan name + Status badge + Actions dropdown
- Profile section:
  - Avatar
  - Name
  - Email
  - Phone
  - Registered date
  - Last active
  - Email verified badge
  - Phone verified badge
- Account status section:
  - Status (Active, Suspended, Banned)
  - Suspension reason (if applicable)
  - Ban reason (if applicable)
- Stats cards:
  - Total orders
  - Total spent
  - Tickets owned
  - Resale listings
- Tabs:
  - Overview
  - Tickets
  - Orders
  - Resale
  - Support
  - Audit Log
- Action buttons:
  - Impersonate
  - Suspend
  - Ban
  - Delete

### Data Needed
- Fan object (full)
- Stats

### Actions
- Tap tab → Switch view
- Tap action → Modal
- Impersonate → Impersonate Fan Modal

### States
- Loading
- Default
- Suspended
- Banned

---

## 9. Fan Tickets

**Location:** /admin/users/fans/:id/tickets
**Flow(s):** 30

### Components
- Tickets table:
  - Event name
  - Ticket type
  - Purchase date
  - Status (Active, Used, Transferred, Resold)
  - Actions
- Filter by status
- Filter by event

### Data Needed
- Fan's tickets

### Actions
- Tap ticket → Ticket detail modal
- Filter → Update

### States
- Loading
- Default
- Empty

---

## 10. Fan Orders

**Location:** /admin/users/fans/:id/orders
**Flow(s):** 30

### Components
- Orders table:
  - Order ID
  - Date
  - Event
  - Items
  - Total
  - Status
  - Actions
- Filter by status
- Filter by date

### Data Needed
- Fan's orders

### Actions
- Tap order → Transaction Detail
- Filter → Update

### States
- Loading
- Default
- Empty

---

## 11. Fan Resale Activity

**Location:** /admin/users/fans/:id/resale
**Flow(s):** 30

### Components
- Resale stats:
  - Total listings
  - Total sold
  - Total earned
- Active listings table
- Sold listings table
- Purchased resale table

### Data Needed
- Fan's resale activity

### Actions
- Tap listing → Listing detail

### States
- Loading
- Default
- No resale activity

---

## 12. Fan Support History

**Location:** /admin/users/fans/:id/support
**Flow(s):** 30

### Components
- Support tickets table:
  - Ticket ID
  - Subject
  - Status
  - Created date
  - Resolved date
  - Agent
- Filter by status

### Data Needed
- Fan's support tickets

### Actions
- Tap ticket → Ticket Detail

### States
- Loading
- Default
- No tickets

---

## 13. Impersonate Fan Modal

**Location:** /admin/users/fans/:id (modal)
**Flow(s):** 31

### Components
- "Impersonate User" header
- Warning: "You will see the platform as this user"
- User info display
- Reason input (required)
- "Impersonate" button
- "Cancel" button
- Note: "All actions will be logged"

### Data Needed
- Fan info

### Actions
- Enter reason → Impersonate → Open new tab as user

### States
- Default
- Starting impersonation

### Notes
- Opens in new tab
- Banner shown while impersonating
- All actions logged with admin who impersonated

---

## 14. Suspend Fan Modal

**Location:** /admin/users/fans/:id (modal)
**Flow(s):** 32

### Components
- "Suspend Account" header
- User info display
- Suspension reason dropdown:
  - Policy violation
  - Suspicious activity
  - Chargeback abuse
  - Other
- Additional notes input
- Duration:
  - Temporary (select days)
  - Until further notice
- Notify user checkbox
- "Suspend" button
- "Cancel" button

### Data Needed
- Fan info

### Actions
- Select reason → Enable suspend
- Suspend → Apply → Close

### States
- Default
- Suspending

---

## 15. Ban Fan Modal

**Location:** /admin/users/fans/:id (modal)
**Flow(s):** 33

### Components
- "Ban Account" header
- Warning: "This action is severe"
- User info display
- Ban reason dropdown:
  - Fraud
  - Harassment
  - Repeated violations
  - Legal requirement
  - Other
- Evidence/notes input
- "Ban Account" button (destructive)
- "Cancel" button

### Data Needed
- Fan info

### Actions
- Select reason → Enable ban
- Ban → Confirm → Apply

### States
- Default
- Banning

---

## 16. Delete Fan Modal

**Location:** /admin/users/fans/:id (modal)
**Flow(s):** 34

### Components
- "Delete Account" header
- Warning: "This action is permanent"
- User info display
- What will be deleted:
  - Account
  - Profile data
  - Preferences
- What will be retained:
  - Transaction records
  - Audit logs
- Confirmation input: Type "DELETE"
- "Delete Account" button (destructive)
- "Cancel" button

### Data Needed
- Fan info

### Actions
- Type confirmation → Enable delete
- Delete → Process → Close

### States
- Default
- Deleting

---

## 17. Merge Accounts Modal

**Location:** /admin/users/fans (modal)
**Flow(s):** 35

### Components
- "Merge Accounts" header
- Primary account selector/search
- Secondary account selector/search
- Comparison display:
  - Account 1 info
  - Account 2 info
- What will be merged:
  - Orders → Primary
  - Tickets → Primary
  - Resale history → Primary
- Secondary account action:
  - Delete after merge
  - Keep as inactive
- "Merge Accounts" button
- "Cancel" button

### Data Needed
- Both accounts info

### Actions
- Select accounts → Show comparison
- Merge → Process → Success

### States
- Select accounts
- Comparing
- Merging
- Success

---

## 18. Fan Audit Log

**Location:** /admin/users/fans/:id/audit
**Flow(s):** 36

### Components
- Header: "Audit Log"
- Date range filter
- Action type filter
- Audit log table:
  - Timestamp
  - Action
  - Details
  - IP address
  - Performed by (user or admin)
- Export button

### Data Needed
- Audit log entries

### Actions
- Filter → Update
- Export → Download

### States
- Loading
- Default

---

## 19. Export Fans

**Location:** /admin/users/fans/export (modal)
**Flow(s):** 40

### Components
- "Export Fans" header
- Filter options:
  - All fans
  - Filtered results only
- Fields to include (checkboxes)
- Format selector (CSV, Excel)
- "Export" button
- Note: "Large exports may take time"

### Data Needed
- Current filters
- Field options

### Actions
- Select options → Export → Download

### States
- Default
- Exporting
- Ready

---

# Users - Venues Screens

---

## 20. Venues List

**Location:** /admin/users/venues
**Flow(s):** 41, 42

### Components
- Header: "Venues" + "Onboard Venue" button + "Export" button
- Search input
- Filters:
  - Status (Active, Pending, Suspended)
  - Verification status
  - Has events
  - Fee tier
- Venues table:
  - Logo
  - Venue name
  - Location
  - Status badge
  - Verification badge
  - Events count
  - Revenue
  - Fee rate
  - Actions
- Pagination

### Data Needed
- Venues list

### Actions
- Search → Filter
- Tap row → Venue Detail
- Tap "Onboard" → Onboard Venue
- Export → Export Venues

### States
- Loading
- Default
- Empty

---

## 21. Venue Detail

**Location:** /admin/users/venues/:id
**Flow(s):** 43, 44

### Components
- Header: Venue name + Status badges + Actions dropdown
- Venue profile section:
  - Logo
  - Name
  - Location
  - Contact info
  - Joined date
  - Verification status
- Stats cards:
  - Total events
  - Total revenue
  - Total tickets sold
  - Active listings
- Tabs:
  - Overview
  - Events
  - Financials
  - Team
  - Settings
  - Audit Log
- Action buttons:
  - Impersonate
  - Adjust Fees
  - Suspend
  - Deactivate

### Data Needed
- Venue object (full)
- Stats

### Actions
- Tap tab → Switch view
- Tap action → Modal

### States
- Loading
- Default

---

## 22. Venue Events

**Location:** /admin/users/venues/:id/events
**Flow(s):** 43

### Components
- Events table:
  - Event name
  - Date
  - Status
  - Tickets sold
  - Revenue
  - Actions
- Filter by status
- Filter by date

### Data Needed
- Venue's events

### Actions
- Tap event → Event Detail

### States
- Loading
- Default
- Empty

---

## 23. Venue Financials

**Location:** /admin/users/venues/:id/financials
**Flow(s):** 43

### Components
- Financial summary:
  - Total revenue
  - Platform fees collected
  - Total payouts
  - Pending balance
- Recent transactions
- Recent payouts
- Fee rate display
- "Adjust Fees" button

### Data Needed
- Venue financial data

### Actions
- Tap transaction → Transaction Detail
- Tap payout → Payout Detail
- Adjust fees → Modal

### States
- Loading
- Default

---

## 24. Venue Team

**Location:** /admin/users/venues/:id/team
**Flow(s):** 43

### Components
- Team members table:
  - Name
  - Email
  - Role
  - Last active
  - Actions
- Owner highlighted

### Data Needed
- Venue team

### Actions
- Tap member → View detail
- Tap actions → Impersonate, Suspend

### States
- Loading
- Default

---

## 25. Venue Settings

**Location:** /admin/users/venues/:id/settings
**Flow(s):** 43

### Components
- Settings overview:
  - Payout settings
  - Fee rate
  - Feature flags enabled
  - Resale settings
- Edit capabilities for admin

### Data Needed
- Venue settings

### Actions
- Edit setting → Update

### States
- Default

---

## 26. Venue Audit Log

**Location:** /admin/users/venues/:id/audit
**Flow(s):** 44

### Components
- Same as Fan Audit Log but for venue

### Data Needed
- Venue audit log

---

## 27. Impersonate Venue Modal

**Location:** /admin/users/venues/:id (modal)
**Flow(s):** 45

### Components
- Same as Impersonate Fan but for venue dashboard

---

## 28. Onboard Venue

**Location:** /admin/users/venues/onboard
**Flow(s):** 46

### Components
- Header: "Onboard New Venue"
- Venue info:
  - Venue name
  - Contact name
  - Contact email
  - Phone
  - Address
- Onboarding options:
  - Send invite link
  - Create account manually
- Fee tier selector:
  - Standard (5%)
  - Premium (4%)
  - Enterprise (custom)
- Custom fee input (if enterprise)
- Notes input
- "Send Invite" or "Create Account" button

### Data Needed
- Fee tier options

### Actions
- Complete form → Send invite or create account

### States
- Default
- Sending
- Sent/Created

---

## 29. Venue Invite Link

**Location:** /admin/users/venues/invite (modal)
**Flow(s):** 46

### Components
- "Invite Link Generated" header
- Unique invite link (copyable)
- Link expiration (7 days)
- "Copy Link" button
- "Send via Email" button
- "Close" button

### Data Needed
- Generated invite link

### Actions
- Copy → Copy to clipboard
- Send email → Send invite email

### States
- Default

---

## 30. Approve Venue Modal

**Location:** /admin/users/venues/:id (modal)
**Flow(s):** 47

### Components
- "Approve Venue" header
- Venue info display
- Verification checklist:
  - Business documents ✓/✗
  - Tax info ✓/✗
  - Bank account ✓/✗
  - Insurance ✓/✗
- Notes input
- "Approve" button
- "Request More Info" button
- "Reject" button

### Data Needed
- Verification documents status

### Actions
- Approve → Activate venue
- Request info → Send email
- Reject → Rejection reason modal

### States
- Default
- Approving

---

## 31. Suspend Venue Modal

**Location:** /admin/users/venues/:id (modal)
**Flow(s):** 48

### Components
- Same structure as Suspend Fan
- Additional: Impact on active events

### Data Needed
- Venue info
- Active events count

### Actions
- Suspend → Handle active events → Apply

---

## 32. Deactivate Venue Modal

**Location:** /admin/users/venues/:id (modal)
**Flow(s):** 49

### Components
- "Deactivate Venue" header
- Warning about permanent deactivation
- Active events handling:
  - Cancel all
  - Transfer to another venue
  - Complete scheduled, then deactivate
- Payout handling:
  - Process final payout
  - Hold for review
- "Deactivate" button
- "Cancel" button

### Data Needed
- Venue status
- Active events
- Pending payouts

### Actions
- Select options → Deactivate → Process

### States
- Default
- Processing

---

## 33. Adjust Venue Fees Modal

**Location:** /admin/users/venues/:id (modal)
**Flow(s):** 50

### Components
- "Adjust Fee Rate" header
- Current fee rate display
- New fee rate input (percentage)
- Effective date:
  - Immediately
  - Next billing cycle
  - Custom date
- Reason input
- "Update Fee" button
- "Cancel" button

### Data Needed
- Current fee rate

### Actions
- Set new rate → Update → Apply

### States
- Default
- Updating

---

## 34. Venue Payout History

**Location:** /admin/users/venues/:id/payouts
**Flow(s):** 51

### Components
- Payouts table:
  - Date
  - Amount
  - Status
  - Bank account (last 4)
  - Actions
- Trigger manual payout button

### Data Needed
- Venue payouts

### Actions
- Tap payout → Payout Detail
- Trigger payout → Modal

### States
- Loading
- Default

---

## 35. Venue Support History

**Location:** /admin/users/venues/:id/support
**Flow(s):** 52

### Components
- Same as Fan Support History

---

## 36. Export Venues

**Location:** /admin/users/venues/export (modal)
**Flow(s):** 57

### Components
- Same structure as Export Fans

---

# Users - Artists Screens

---

## 37. Artists List

**Location:** /admin/users/artists
**Flow(s):** 58, 59

### Components
- Header: "Artists" + "Export" button
- Search input
- Filters:
  - Status (Active, Suspended)
  - Verified status
  - Has events
  - Genre
- Artists table:
  - Photo
  - Artist name
  - Genre
  - Status
  - Verified badge
  - Events count
  - Followers
  - Actions
- Pagination

### Data Needed
- Artists list

### Actions
- Search → Filter
- Tap row → Artist Detail
- Export → Export Artists

### States
- Loading
- Default
- Empty

---

## 38. Artist Detail

**Location:** /admin/users/artists/:id
**Flow(s):** 60, 61

### Components
- Header: Artist name + Badges + Actions dropdown
- Profile section:
  - Photo
  - Name
  - Genres
  - Bio snippet
  - Joined date
  - Verified status
- Stats cards:
  - Total events
  - Total fans reached
  - Followers
- Tabs:
  - Overview
  - Events
  - Analytics
  - Team
  - Audit Log
- Action buttons:
  - Impersonate
  - Verify
  - Suspend
  - Merge Profiles

### Data Needed
- Artist object
- Stats

### Actions
- Tap tab → Switch view
- Tap action → Modal

### States
- Loading
- Default

---

## 39. Artist Events

**Location:** /admin/users/artists/:id/events
**Flow(s):** 60

### Components
- Events table:
  - Event name
  - Date
  - Venue
  - Role (Headliner, Support)
  - Status
  - Actions
- "Link to Event" button

### Data Needed
- Artist's events

### Actions
- Tap event → Event Detail
- Link to event → Modal

### States
- Loading
- Default
- Empty

---

## 40. Artist Analytics

**Location:** /admin/users/artists/:id/analytics
**Flow(s):** 60

### Components
- Analytics summary:
  - Fans reached
  - Revenue generated
  - Follower growth
- Charts

### Data Needed
- Artist analytics

### States
- Loading
- Default

---

## 41. Artist Team

**Location:** /admin/users/artists/:id/team
**Flow(s):** 60

### Components
- Same structure as Venue Team

---

## 42. Artist Audit Log

**Location:** /admin/users/artists/:id/audit
**Flow(s):** 61

### Components
- Same as Fan Audit Log

---

## 43. Impersonate Artist Modal

**Location:** /admin/users/artists/:id (modal)
**Flow(s):** 62

### Components
- Same as Impersonate Fan

---

## 44. Link Artist to Event Modal

**Location:** /admin/users/artists/:id (modal)
**Flow(s):** 63

### Components
- "Link to Event" header
- Event search input
- Search results list
- Selected event display
- Role selector:
  - Headliner
  - Support
  - Guest
- "Link Artist" button
- "Cancel" button

### Data Needed
- Events search results

### Actions
- Search → Show results
- Select event → Enable link
- Link → Create association

### States
- Default
- Searching
- Linking

---

## 45. Verify Artist Modal

**Location:** /admin/users/artists/:id (modal)
**Flow(s):** 64

### Components
- "Verify Artist" header
- Verification checklist:
  - Profile complete
  - Real artist (not impersonator)
  - Social links verified
- Notes input
- "Verify" button
- "Deny" button

### Data Needed
- Artist verification status

### Actions
- Verify → Add verified badge
- Deny → Send denial reason

### States
- Default
- Verifying

---

## 46. Suspend Artist Modal

**Location:** /admin/users/artists/:id (modal)
**Flow(s):** 65

### Components
- Same as Suspend Fan

---

## 47. Merge Artist Profiles Modal

**Location:** /admin/users/artists (modal)
**Flow(s):** 66

### Components
- "Merge Artist Profiles" header
- Primary profile selector
- Secondary profile selector
- Comparison view
- What will be merged:
  - Events
  - Followers
  - Analytics
- "Merge" button
- "Cancel" button

### Data Needed
- Both profiles

### Actions
- Select profiles → Compare
- Merge → Process

### States
- Select
- Comparing
- Merging

---

## 48. Export Artists

**Location:** /admin/users/artists/export (modal)
**Flow(s):** 73

### Components
- Same as Export Fans

---

# Events Screens

---

## 49. Events List

**Location:** /admin/events
**Flow(s):** 74, 75

### Components
- Header: "Events" + "Export" button
- Search input
- Filters:
  - Status (Upcoming, Live, Past, Cancelled)
  - Date range
  - Venue
  - Has issues
- Events table:
  - Event name
  - Date
  - Venue
  - Status
  - Tickets sold
  - Revenue
  - Issues flag
  - Actions
- Pagination

### Data Needed
- Events list

### Actions
- Search → Filter
- Tap row → Event Detail
- Export → Export Events

### States
- Loading
- Default
- Empty

---

## 50. Event Detail

**Location:** /admin/events/:id
**Flow(s):** 76, 77

### Components
- Header: Event name + Status + Actions dropdown
- Event info:
  - Image
  - Date/time
  - Venue
  - Artists
- Stats cards:
  - Tickets sold / total
  - Revenue
  - Check-ins
  - Resale volume
- Tabs:
  - Overview
  - Sales
  - Attendance
  - Resale
  - Issues
  - Audit Log
- Action buttons:
  - View as Venue
  - Cancel Event
  - Postpone Event
  - Transfer Event

### Data Needed
- Event object (full)

### Actions
- Tap tab → Switch view
- Tap action → Modal

### States
- Loading
- Default

---

## 51. Event Sales

**Location:** /admin/events/:id/sales
**Flow(s):** 76

### Components
- Sales overview:
  - Total sold
  - Revenue
  - Breakdown by type
- Sales over time chart
- Sales by ticket type table
- Recent transactions

### Data Needed
- Event sales data

### States
- Loading
- Default

---

## 52. Event Attendance

**Location:** /admin/events/:id/attendance
**Flow(s):** 76

### Components
- Attendance stats:
  - Check-ins
  - No-shows
  - Rate
- Check-in timeline
- By entry point breakdown

### Data Needed
- Attendance data

### States
- Loading
- Default
- Event not started

---

## 53. Event Resale Activity

**Location:** /admin/events/:id/resale
**Flow(s):** 76

### Components
- Resale overview:
  - Active listings
  - Completed sales
  - Volume
- Price comparison chart
- Listings table

### Data Needed
- Event resale data

### States
- Loading
- Default

---

## 54. Event Issues

**Location:** /admin/events/:id/issues
**Flow(s):** 76

### Components
- Issues list:
  - Type
  - Description
  - Status
  - Reported by
  - Actions
- Support tickets related to event
- Refund requests

### Data Needed
- Event issues

### Actions
- Tap issue → Issue detail
- Resolve → Update status

### States
- Loading
- Default
- No issues

---

## 55. Cancel Event Modal

**Location:** /admin/events/:id (modal)
**Flow(s):** 78

### Components
- "Cancel Event" header
- Event info display
- Impact summary:
  - Tickets to refund
  - Refund amount
- Cancellation reason
- Refund handling:
  - Full automatic refund
  - Partial refund
  - Credit
- Notify options:
  - Notify ticket holders
  - Notify venue
  - Notify artists
- "Cancel Event" button
- "Keep Event" button

### Data Needed
- Event info
- Tickets sold

### Actions
- Set options → Cancel → Process

### States
- Default
- Processing

---

## 56. Postpone Event Modal

**Location:** /admin/events/:id (modal)
**Flow(s):** 79

### Components
- "Postpone Event" header
- New date picker
- New time picker
- Notify options
- Ticket handling:
  - Tickets remain valid
  - Offer refunds
- "Postpone" button
- "Cancel" button

### Data Needed
- Event info

### Actions
- Set new date → Postpone → Notify

### States
- Default
- Processing

---

## 57. Transfer Event Modal

**Location:** /admin/events/:id (modal)
**Flow(s):** 80

### Components
- "Transfer Event" header
- Current venue display
- New venue selector/search
- Transfer options:
  - Keep ticket prices
  - Update venue info
- "Transfer" button
- "Cancel" button

### Data Needed
- Event info
- Venues list

### Actions
- Select venue → Transfer → Process

### States
- Default
- Transferring

---

## 58. Flag Event Modal

**Location:** /admin/events/:id (modal)
**Flow(s):** 81

### Components
- "Flag Event" header
- Flag reason:
  - Suspicious activity
  - Policy violation
  - Under review
- Notes input
- Actions:
  - Flag only (review)
  - Flag and hide from public
  - Flag and suspend sales
- "Flag" button
- "Cancel" button

### Data Needed
- Event info

### Actions
- Select reason → Flag → Apply

### States
- Default
- Flagging

---

## 59. Event Audit Log

**Location:** /admin/events/:id/audit
**Flow(s):** 82

### Components
- Same as Fan Audit Log

---

## 60. Events Calendar

**Location:** /admin/events/calendar
**Flow(s):** 83

### Components
- Calendar view (month/week)
- Events displayed
- Filter by venue
- Filter by status
- Click event → Detail

### Data Needed
- Events with dates

### States
- Loading
- Default

---

## 61. Export Events

**Location:** /admin/events/export (modal)
**Flow(s):** 86

### Components
- Same as Export Fans

---

# Financials Screens

---

## 62. Financials Overview

**Location:** /admin/financials
**Flow(s):** 87, 88

### Components
- Header: "Financials" + date range
- Quick stats:
  - Platform revenue
  - Total transactions
  - Total payouts
  - Pending payouts
- Platform revenue chart
- Recent large transactions
- Payout summary
- Quick links:
  - Transactions
  - Payouts
  - Refunds
  - Chargebacks
  - Stripe Dashboard

### Data Needed
- Financial summary

### Actions
- Change date range → Refresh
- Tap quick link → Navigate

### States
- Loading
- Default

---

## 63. Platform Revenue

**Location:** /admin/financials/revenue
**Flow(s):** 89

### Components
- Revenue breakdown:
  - Primary sales fees
  - Resale fees
  - Other fees
- Revenue over time chart
- Revenue by venue
- Revenue by event category
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

## 64. Transactions List

**Location:** /admin/financials/transactions
**Flow(s):** 90

### Components
- Search input (order ID, customer)
- Filters:
  - Type (Sale, Refund, Payout)
  - Status
  - Date range
  - Venue
  - Amount range
- Transactions table:
  - ID
  - Date
  - Type
  - Customer
  - Venue
  - Amount
  - Status
  - Actions
- Pagination
- Export button

### Data Needed
- Transactions list

### Actions
- Search → Filter
- Tap row → Transaction Detail
- Export → Download

### States
- Loading
- Default
- Empty

---

## 65. Transaction Detail

**Location:** /admin/financials/transactions/:id
**Flow(s):** 91

### Components
- Transaction ID + Status
- Transaction type
- Customer info (link to fan)
- Venue info (link to venue)
- Event info (link to event)
- Items:
  - Tickets
  - Add-ons
- Payment breakdown:
  - Subtotal
  - Platform fee
  - Venue payout
  - Total
- Payment method (last 4)
- Stripe transaction ID
- Timeline:
  - Created
  - Processed
  - Payout (if applicable)
- Actions:
  - Refund
  - View in Stripe

### Data Needed
- Transaction object (full)

### Actions
- Refund → Process Refund Modal
- View in Stripe → Open Stripe

### States
- Loading
- Default

---

## 66. Payouts List

**Location:** /admin/financials/payouts
**Flow(s):** 92

### Components
- Filters:
  - Status (Pending, Processing, Completed, Failed)
  - Venue
  - Date range
- Payouts table:
  - ID
  - Date
  - Venue
  - Amount
  - Status
  - Actions
- Trigger payout button
- Pagination

### Data Needed
- Payouts list

### Actions
- Filter → Update
- Tap row → Payout Detail
- Trigger payout → Modal

### States
- Loading
- Default
- Empty

---

## 67. Payout Detail

**Location:** /admin/financials/payouts/:id
**Flow(s):** 93

### Components
- Payout ID + Status
- Venue info
- Amount
- Bank account (last 4)
- Period covered
- Transactions included:
  - List of transactions
  - Total
- Fees deducted
- Net payout
- Timeline:
  - Initiated
  - Processing
  - Completed/Failed
- If failed: Failure reason and retry option

### Data Needed
- Payout object (full)

### Actions
- Retry (if failed) → Retry payout
- View in Stripe → Open Stripe

### States
- Loading
- Default

---

## 68. Trigger Payout Modal

**Location:** /admin/financials/payouts (modal)
**Flow(s):** 94

### Components
- "Trigger Payout" header
- Venue selector
- Amount:
  - Full available balance
  - Custom amount
- Reason for manual payout
- "Trigger Payout" button
- "Cancel" button

### Data Needed
- Venues with balances

### Actions
- Select venue → Show balance
- Trigger → Process

### States
- Default
- Processing

---

## 69. Refunds List

**Location:** /admin/financials/refunds
**Flow(s):** 95

### Components
- Filters:
  - Status (Pending, Completed, Failed)
  - Reason
  - Date range
- Refunds table:
  - ID
  - Date
  - Customer
  - Event
  - Amount
  - Reason
  - Status
  - Actions
- Pagination

### Data Needed
- Refunds list

### Actions
- Filter → Update
- Tap row → Refund Detail

### States
- Loading
- Default
- Empty

---

## 70. Refund Detail

**Location:** /admin/financials/refunds/:id
**Flow(s):** 96

### Components
- Refund ID + Status
- Original transaction link
- Customer info
- Refund amount
- Reason
- Processed by
- Timeline
- If failed: Failure reason

### Data Needed
- Refund object

### States
- Loading
- Default

---

## 71. Process Refund Modal

**Location:** /admin/financials (modal)
**Flow(s):** 97

### Components
- "Process Refund" header
- Order/transaction info
- Refund options:
  - Full refund
  - Partial refund
- Amount input (if partial)
- Reason dropdown
- Notes input
- "Process Refund" button
- "Cancel" button

### Data Needed
- Transaction info

### Actions
- Set options → Process → Complete

### States
- Default
- Processing

---

## 72. Chargebacks List

**Location:** /admin/financials/chargebacks
**Flow(s):** 98

### Components
- Filters:
  - Status (Open, Won, Lost)
  - Date range
- Summary:
  - Total open
  - Amount at risk
- Chargebacks table:
  - ID
  - Date
  - Customer
  - Amount
  - Reason
  - Deadline
  - Status
  - Actions
- Pagination

### Data Needed
- Chargebacks list

### Actions
- Tap row → Chargeback Detail

### States
- Loading
- Default
- No chargebacks

---

## 73. Chargeback Detail

**Location:** /admin/financials/chargebacks/:id
**Flow(s):** 99

### Components
- Chargeback ID + Status
- Amount
- Reason
- Deadline countdown
- Original transaction
- Customer info
- Evidence submission:
  - Auto-collected evidence
  - Add additional evidence
- Response status
- "Submit Response" button
- "Accept Chargeback" button

### Data Needed
- Chargeback object
- Evidence

### Actions
- Add evidence → Attach
- Submit → Send to Stripe
- Accept → Forfeit

### States
- Loading
- Default
- Submitted
- Won/Lost

---

## 74. Stripe Dashboard Link

**Location:** /admin/financials/stripe
**Flow(s):** 100

### Components
- "Stripe Dashboard" header
- Link to Stripe dashboard
- Quick Stripe stats (from API)
- Note: "Full financial management in Stripe"

### Actions
- Open Stripe → New tab

---

## 75. Financial Reports

**Location:** /admin/financials/reports
**Flow(s):** 100

### Components
- Pre-built reports:
  - Daily summary
  - Weekly summary
  - Monthly summary
  - Venue payouts report
  - Refunds report
- Custom report builder
- Download buttons

### Data Needed
- Report options

### Actions
- Download → Get report

### States
- Default

---

# Content Moderation Screens

---

## 76. Moderation Queue

**Location:** /admin/moderation
**Flow(s):** 101, 102

### Components
- Header: "Moderation Queue"
- Queue stats:
  - Pending items
  - Average response time
  - Today's resolved
- Queue filters:
  - Type (Review, Profile, Event)
  - Priority
  - Flagged by (Auto, User)
- Queue list:
  - Content type
  - Preview
  - Flagged reason
  - Priority
  - Time in queue
  - Actions (Approve, Reject, Skip)
- Quick action buttons

### Data Needed
- Moderation queue

### Actions
- Approve → Approve Content Modal
- Reject → Reject Content Modal
- Tap item → Review Detail

### States
- Loading
- Default
- Empty (queue clear!)

---

## 77. Review Detail

**Location:** /admin/moderation/:id
**Flow(s):** 103

### Components
- Content display:
  - Full content
  - Author info
  - Context (event, venue)
- Flag info:
  - Reason flagged
  - Flagged by (auto or user)
  - Rules triggered
- Author history:
  - Previous flags
  - Account status
- Actions:
  - Approve
  - Reject
  - Edit and Approve
  - Escalate

### Data Needed
- Content object
- Flag info
- Author history

### Actions
- Approve → Apply
- Reject → Rejection reason
- Escalate → Assign to senior

### States
- Loading
- Default

---

## 78. Approve Content Modal

**Location:** /admin/moderation (modal)
**Flow(s):** 104

### Components
- "Approve Content" header
- Content preview
- Notes (optional)
- "Approve" button
- "Cancel" button

### Actions
- Approve → Publish content

---

## 79. Reject Content Modal

**Location:** /admin/moderation (modal)
**Flow(s):** 105

### Components
- "Reject Content" header
- Content preview
- Rejection reason dropdown
- Custom message to author (optional)
- Action on author:
  - No action
  - Warning
  - Suspend
- "Reject" button
- "Cancel" button

### Actions
- Reject → Remove content → Notify author

---

## 80. Flagged Content List

**Location:** /admin/moderation/flagged
**Flow(s):** 106

### Components
- All flagged content (not just queue)
- Filter by status (Pending, Approved, Rejected)
- Filter by type
- Filter by date
- Table with content items

### Data Needed
- Flagged content list

### Actions
- Tap item → Flagged Content Detail

### States
- Loading
- Default

---

## 81. Flagged Content Detail

**Location:** /admin/moderation/flagged/:id
**Flow(s):** 107

### Components
- Same as Review Detail

---

## 82. Auto-Moderation Settings

**Location:** /admin/moderation/settings
**Flow(s):** 108

### Components
- Header: "Auto-Moderation Settings"
- Enable/disable auto-moderation
- Sensitivity level slider
- Rules:
  - Profanity filter (on/off, level)
  - Hate speech detection
  - Spam detection
  - Contact info detection
  - Link detection
- Per-rule actions:
  - Auto-reject
  - Flag for review
  - Allow with warning
- "Save Settings" button

### Data Needed
- Current settings

### Actions
- Toggle rules → Update
- Save → Apply

### States
- Default
- Saving

---

## 83. Banned Words List

**Location:** /admin/moderation/banned-words
**Flow(s):** 109

### Components
- Header: "Banned Words" + "Add Word" button
- Banned words table:
  - Word/phrase
  - Category
  - Action (block, flag)
  - Added by
  - Date
  - Actions
- Import list button
- Export button

### Data Needed
- Banned words list

### Actions
- Add → Modal
- Edit → Modal
- Delete → Confirm
- Import → Upload CSV

### States
- Default

---

## 84. Moderation History

**Location:** /admin/moderation/history
**Flow(s):** 110

### Components
- Date range filter
- Moderator filter
- Action filter
- History table:
  - Date
  - Content type
  - Action taken
  - Moderator
  - Time to resolve
- Export button

### Data Needed
- Moderation history

### Actions
- Filter → Update
- Export → Download

### States
- Loading
- Default

---

## 85. Moderation Analytics

**Location:** /admin/moderation/analytics
**Flow(s):** 110

### Components
- Summary stats:
  - Total moderated
  - Approval rate
  - Rejection rate
  - Average response time
- Volume over time chart
- By content type breakdown
- By reason breakdown
- Moderator performance

### Data Needed
- Moderation analytics

### States
- Loading
- Default

---

# Support Tickets Screens

---

## 86. Support Dashboard

**Location:** /admin/support
**Flow(s):** 111

### Components
- Header: "Support"
- Queue stats:
  - Open tickets
  - Unassigned
  - Overdue
  - Avg response time
- Ticket distribution:
  - By category
  - By priority
  - By agent
- Recent tickets
- Quick actions:
  - View all tickets
  - Unassigned queue
  - My tickets

### Data Needed
- Support stats

### Actions
- Tap quick action → Navigate

### States
- Loading
- Default

---

## 87. Tickets List

**Location:** /admin/support/tickets
**Flow(s):** 112

### Components
- Filters:
  - Status (Open, Pending, Resolved)
  - Priority
  - Category
  - Assigned to
  - Date range
- Search input
- Tickets table:
  - ID
  - Subject
  - Customer
  - Category
  - Priority
  - Status
  - Assigned to
  - Created
  - Last update
  - Actions
- Pagination
- Bulk actions

### Data Needed
- Tickets list

### Actions
- Filter → Update
- Tap row → Ticket Detail
- Bulk assign → Modal

### States
- Loading
- Default
- Empty

---

## 88. Ticket Detail

**Location:** /admin/support/tickets/:id
**Flow(s):** 113

### Components
- Header: Ticket ID + Status + Priority
- Customer info sidebar:
  - Name
  - Email
  - Account status
  - Previous tickets
  - Recent orders
  - Link to user profile
- Conversation thread:
  - Customer messages
  - Agent messages
  - Internal notes (highlighted)
  - Timestamps
- Reply section:
  - Text editor
  - Canned responses dropdown
  - Internal note toggle
  - Attachments
  - "Send" button
- Actions:
  - Assign
  - Change priority
  - Change status
  - Escalate
  - Merge

### Data Needed
- Ticket object
- Customer info
- Conversation

### Actions
- Reply → Send
- Assign → Modal
- Escalate → Modal
- Change status → Update

### States
- Loading
- Default

---

## 89. Assign Ticket Modal

**Location:** /admin/support/tickets (modal)
**Flow(s):** 114

### Components
- "Assign Ticket" header
- Agent selector
- Assignment note
- "Assign" button
- "Cancel" button

### Data Needed
- Available agents

### Actions
- Select agent → Assign

---

## 90. Escalate Ticket Modal

**Location:** /admin/support/tickets (modal)
**Flow(s):** 115

### Components
- "Escalate Ticket" header
- Escalation reason
- Escalate to:
  - Senior agent
  - Supervisor
  - Technical team
- Notes
- "Escalate" button
- "Cancel" button

### Actions
- Escalate → Reassign with priority

---

## 91. Merge Tickets Modal

**Location:** /admin/support/tickets (modal)
**Flow(s):** 116

### Components
- "Merge Tickets" header
- Primary ticket selector
- Tickets to merge selector
- Preview merged conversation
- "Merge" button
- "Cancel" button

### Actions
- Select tickets → Preview
- Merge → Combine

---

## 92. Canned Responses

**Location:** /admin/support/canned
**Flow(s):** 117

### Components
- Header: "Canned Responses" + "Create New" button
- Categories:
  - General
  - Refunds
  - Technical
  - Account
- Responses list:
  - Name
  - Category
  - Preview
  - Usage count
  - Actions
- Search input

### Data Needed
- Canned responses

### Actions
- Create → Create Canned Response
- Edit → Edit Canned Response
- Delete → Confirm

### States
- Default

---

## 93. Create Canned Response

**Location:** /admin/support/canned/new
**Flow(s):** 118

### Components
- Header: "Create Canned Response"
- Name input
- Category selector
- Content editor
- Variables panel:
  - {{customer_name}}
  - {{order_id}}
  - {{event_name}}
  - etc.
- "Save" button

### Actions
- Complete form → Save

### States
- Default
- Saving

---

## 94. Edit Canned Response

**Location:** /admin/support/canned/:id
**Flow(s):** 119

### Components
- Same as Create

---

## 95. Support Analytics

**Location:** /admin/support/analytics
**Flow(s):** 120

### Components
- Date range selector
- Summary stats:
  - Total tickets
  - Resolution rate
  - Avg response time
  - Avg resolution time
  - Customer satisfaction
- Volume over time chart
- By category breakdown
- By priority breakdown
- Resolution time distribution
- Export button

### Data Needed
- Support analytics

### States
- Loading
- Default

---

## 96. Agent Performance

**Location:** /admin/support/agents
**Flow(s):** 121

### Components
- Agents table:
  - Agent name
  - Tickets resolved
  - Avg response time
  - Avg resolution time
  - Satisfaction rating
  - Status (Available, Busy)
- Date range selector
- Performance charts

### Data Needed
- Agent performance data

### States
- Loading
- Default

---

## 97. Response Time Report

**Location:** /admin/support/response-time
**Flow(s):** 122

### Components
- Response time metrics:
  - First response time
  - Resolution time
  - By priority
  - By category
- SLA compliance rate
- Charts and trends
- Export button

### Data Needed
- Response time data

### States
- Loading
- Default

---

## 98. Ticket Categories

**Location:** /admin/support/categories
**Flow(s):** 123

### Components
- Categories list:
  - Name
  - Description
  - Ticket count
  - Avg resolution time
  - Actions
- "Add Category" button
- Reorder categories

### Data Needed
- Categories

### Actions
- Add → Modal
- Edit → Modal
- Delete → Confirm

### States
- Default

---

## 99. SLA Settings

**Location:** /admin/support/sla
**Flow(s):** 124

### Components
- SLA tiers:
  - Low priority: X hours response, Y hours resolution
  - Medium priority: X hours response, Y hours resolution
  - High priority: X hours response, Y hours resolution
  - Urgent: X hours response, Y hours resolution
- Business hours settings
- Holiday calendar
- Escalation rules
- "Save" button

### Data Needed
- Current SLA settings

### Actions
- Edit settings → Save

### States
- Default
- Saving

---

## 100. Support Settings

**Location:** /admin/support/settings
**Flow(s):** 125

### Components
- Auto-assignment settings
- Routing rules
- Email templates
- Notifications settings
- "Save" button

### Data Needed
- Support settings

### Actions
- Edit → Save

### States
- Default
- Saving

---

# Platform Settings Screens

---

## 101. Platform Settings Overview

**Location:** /admin/platform
**Flow(s):** 126

### Components
- Settings sections:
  - General Settings
  - Feature Flags
  - Emergency Controls
  - Branding
  - Email
  - API & Integrations
  - Logs
- Quick status indicators

### Actions
- Tap section → Navigate

### States
- Default

---

## 102. General Settings

**Location:** /admin/platform/general
**Flow(s):** 127

### Components
- Platform name
- Support email
- Support phone
- Default timezone
- Default currency
- Terms of Service URL
- Privacy Policy URL
- "Save" button

### Data Needed
- Current settings

### Actions
- Edit → Save

### States
- Default
- Saving

---

## 103. Feature Flags

**Location:** /admin/platform/features
**Flow(s):** 128

### Components
- Header: "Feature Flags" + "Create Flag" button
- Tabs: System-Wide, Per-Venue
- Flags list:
  - Flag name
  - Description
  - Status (On/Off)
  - Scope
  - Actions
- Search input

### Data Needed
- Feature flags

### Actions
- Toggle flag → Update
- Tap row → Feature Flag Detail
- Create → Modal

### States
- Default

---

## 104. Feature Flag Detail

**Location:** /admin/platform/features/:id
**Flow(s):** 129

### Components
- Flag name
- Description
- Status toggle
- Scope:
  - System-wide
  - Per-venue (with venue selector)
  - Percentage rollout
- Enabled venues list (if per-venue)
- Audit log for flag
- "Save" button
- "Delete Flag" button

### Data Needed
- Flag object

### Actions
- Toggle → Update
- Add venue → Enable for venue
- Save → Apply

### States
- Default
- Saving

---

## 105. System-Wide Flags

**Location:** /admin/platform/features/system
**Flow(s):** 130

### Components
- System flags list:
  - Resale enabled
  - NFT tickets enabled
  - Artist profiles enabled
  - etc.
- Quick toggles

### Data Needed
- System flags

### Actions
- Toggle → Confirm → Update

---

## 106. Per-Venue Flags

**Location:** /admin/platform/features/venues
**Flow(s):** 131

### Components
- Venue selector
- Flags for selected venue
- Override toggles
- "Using default" / "Custom" indicator

### Data Needed
- Venue feature flags

### Actions
- Select venue → Show flags
- Toggle → Update

---

## 107. Emergency Controls

**Location:** /admin/platform/emergency
**Flow(s):** 132

### Components
- Header: "Emergency Controls"
- Warning banner: "These controls affect the entire platform"
- Kill switches:
  - Disable all ticket sales
  - Disable all resale
  - Disable all payouts
  - Disable new signups
- Maintenance mode toggle
- Status for each control
- Last modified info

### Data Needed
- Emergency control status

### Actions
- Toggle control → Kill Switch Modal or Maintenance Mode Modal

### States
- Normal
- Emergency active

---

## 108. Kill Switch Modal

**Location:** /admin/platform/emergency (modal)
**Flow(s):** 133

### Components
- "Activate Kill Switch" header
- Warning: "This will immediately disable [function] platform-wide"
- Affected count:
  - Active events
  - Pending transactions
  - etc.
- Reason input (required)
- Admin password confirmation
- "Activate" button (destructive)
- "Cancel" button

### Actions
- Confirm → Activate → Log

### States
- Default
- Activating

---

## 109. Maintenance Mode Modal

**Location:** /admin/platform/emergency (modal)
**Flow(s):** 134

### Components
- "Maintenance Mode" header
- Enable/disable toggle
- Maintenance message input
- Estimated duration
- Allow admin access toggle
- "Apply" button
- "Cancel" button

### Actions
- Apply → Enable/disable maintenance

---

## 110. Platform Branding

**Location:** /admin/platform/branding
**Flow(s):** 135

### Components
- Logo upload
- Favicon upload
- Primary color picker
- Secondary color picker
- Email footer text
- Preview sections
- "Save" button

### Data Needed
- Current branding

### Actions
- Upload/edit → Preview
- Save → Apply

### States
- Default
- Saving

---

## 111. Email Settings

**Location:** /admin/platform/email
**Flow(s):** 136

### Components
- Email provider settings
- From name
- From email
- Reply-to email
- Email signature
- Test email button
- "Save" button

### Data Needed
- Email settings

### Actions
- Edit → Save
- Test → Send test email

---

## 112. Email Templates

**Location:** /admin/platform/email/templates
**Flow(s):** 137

### Components
- System email templates:
  - Welcome email
  - Order confirmation
  - Ticket delivery
  - Password reset
  - etc.
- Each template:
  - Preview
  - Edit link
  - Test link

### Data Needed
- Email templates

### Actions
- Edit → Template editor
- Test → Send test

---

## 113. API Keys

**Location:** /admin/platform/api
**Flow(s):** 138

### Components
- Header: "API Keys" + "Create Key" button
- Keys list:
  - Name
  - Key prefix
  - Created by
  - Last used
  - Status
  - Actions
- Usage stats

### Data Needed
- API keys

### Actions
- Create → Create API Key Modal
- Revoke → Confirm

---

## 114. Create API Key Modal

**Location:** /admin/platform/api (modal)
**Flow(s):** 139

### Components
- "Create API Key" header
- Key name input
- Permissions checkboxes
- Rate limit settings
- "Create" button
- Key display (show once)
- Copy button

### Actions
- Create → Generate → Display key

---

## 115. Webhooks

**Location:** /admin/platform/webhooks
**Flow(s):** 140

### Components
- Header: "Webhooks" + "Create Webhook" button
- Webhooks list:
  - Name
  - URL
  - Events subscribed
  - Status
  - Last triggered
  - Actions
- Webhook logs link

### Data Needed
- Webhooks

### Actions
- Create → Create Webhook Modal
- Edit → Modal
- Delete → Confirm

---

## 116. Create Webhook Modal

**Location:** /admin/platform/webhooks (modal)
**Flow(s):** 141

### Components
- "Create Webhook" header
- Name input
- URL input
- Events to subscribe (checkboxes)
- Secret key (auto-generated)
- "Create" button

### Actions
- Create → Test → Save

---

## 117. Integrations

**Location:** /admin/platform/integrations
**Flow(s):** 142

### Components
- Available integrations:
  - Stripe (required)
  - Google Analytics
  - Facebook Pixel
  - Mailchimp
  - etc.
- Per integration:
  - Status (Connected/Not connected)
  - Configure button
  - Disconnect button

### Data Needed
- Integration status

### Actions
- Configure → Integration settings
- Connect → OAuth flow
- Disconnect → Confirm

---

## 118. Platform Logs

**Location:** /admin/platform/logs
**Flow(s):** 143

### Components
- Log type selector:
  - Application logs
  - Error logs
  - Access logs
  - Audit logs
- Date range filter
- Severity filter
- Search input
- Logs table:
  - Timestamp
  - Level
  - Message
  - Source
  - Details
- Real-time toggle
- Export button

### Data Needed
- Platform logs

### Actions
- Filter → Update
- Tap log → Expand details
- Export → Download

### States
- Loading
- Default
- Real-time streaming

---

# Compliance Screens

---

## 119. Compliance Dashboard

**Location:** /admin/compliance
**Flow(s):** 144

### Components
- Compliance overview:
  - Pending data requests
  - Active legal holds
  - Tax deadlines
- Quick stats:
  - GDPR requests
  - CCPA requests
  - Legal holds
- Upcoming deadlines
- Quick links to sections

### Data Needed
- Compliance summary

### Actions
- Tap quick link → Navigate

### States
- Default

---

## 120. Age Verification Settings

**Location:** /admin/compliance/age
**Flow(s):** 145

### Components
- Age verification method:
  - Self-reported DOB
  - ID verification (third party)
- Default age restrictions
- Venue override permissions
- "Save" button

### Data Needed
- Current settings

### Actions
- Edit → Save

---

## 121. Legal Holds List

**Location:** /admin/compliance/holds
**Flow(s):** 146

### Components
- Header: "Legal Holds" + "Create Hold" button
- Holds table:
  - ID
  - Subject (user/venue)
  - Reason
  - Created date
  - Status
  - Actions
- Filter by status

### Data Needed
- Legal holds

### Actions
- Create → Create Legal Hold Modal
- Tap row → Legal Hold Detail

---

## 122. Create Legal Hold Modal

**Location:** /admin/compliance/holds (modal)
**Flow(s):** 147

### Components
- "Create Legal Hold" header
- Subject type (User, Venue, Event)
- Subject selector/search
- Reason/case number
- Data to preserve
- "Create Hold" button

### Actions
- Create → Apply hold

---

## 123. Legal Hold Detail

**Location:** /admin/compliance/holds/:id
**Flow(s):** 148

### Components
- Hold ID + Status
- Subject info
- Reason
- Data preserved:
  - Account data
  - Transaction data
  - Communications
- Created by
- Created date
- "Release Hold" button

### Data Needed
- Hold object

### Actions
- Release → Confirm → Release

---

## 124. Tax Documents

**Location:** /admin/compliance/tax
**Flow(s):** 149

### Components
- Tax year selector
- Documents:
  - Platform 1099 summary
  - Venue 1099 status
  - W-9 collection status
- Download buttons
- "Generate 1099s" button

### Data Needed
- Tax document status

### Actions
- Download → Get document
- Generate → Start generation process

---

## 125. 1099 Tracking

**Location:** /admin/compliance/tax/1099
**Flow(s):** 150

### Components
- Tax year selector
- 1099 recipients table:
  - Venue name
  - Tax ID status
  - Earnings
  - 1099 status (Generated, Sent, Not Required)
  - Actions
- Filter by status
- Bulk generate button
- Bulk send button

### Data Needed
- 1099 recipient list

### Actions
- Generate → Create 1099
- Send → Email 1099

---

## 126. W-9 Management

**Location:** /admin/compliance/tax/w9
**Flow(s):** 151

### Components
- W-9 status table:
  - Venue name
  - W-9 status (Received, Pending, Missing)
  - Received date
  - Actions
- Filter by status
- Send reminder button

### Data Needed
- W-9 status list

### Actions
- View W-9 → Open document
- Send reminder → Email

---

## 127. GDPR Requests

**Location:** /admin/compliance/gdpr
**Flow(s):** 152

### Components
- Pending requests:
  - ID
  - User
  - Type (Export, Deletion)
  - Submitted date
  - Deadline
  - Status
  - Actions
- Completed requests list
- Export button

### Data Needed
- GDPR requests

### Actions
- Tap row → Request detail
- Process → Handle request

---

## 128. CCPA Requests

**Location:** /admin/compliance/ccpa
**Flow(s):** 153

### Components
- Same structure as GDPR Requests

---

## 129. Data Export Request Detail

**Location:** /admin/compliance/requests/:id (export)
**Flow(s):** 154

### Components
- Request ID + Status
- User info
- Request type: Data Export
- Submitted date
- Deadline
- Data to export:
  - Account data
  - Order history
  - Preferences
- "Generate Export" button
- "Send to User" button
- "Mark Complete" button

### Data Needed
- Request object

### Actions
- Generate → Create export file
- Send → Email to user
- Complete → Mark done

---

## 130. Data Deletion Request Detail

**Location:** /admin/compliance/requests/:id (deletion)
**Flow(s):** 155

### Components
- Request ID + Status
- User info
- Request type: Data Deletion
- Submitted date
- Deadline
- Data to delete
- Data to retain (legal)
- "Process Deletion" button
- "Mark Complete" button

### Data Needed
- Request object

### Actions
- Process → Delete data
- Complete → Mark done

---

# Analytics Screens

---

## 131. Analytics Dashboard

**Location:** /admin/analytics
**Flow(s):** 156

### Components
- Header: "Analytics" + date range
- Quick stats:
  - Total users
  - Total events
  - Total revenue
  - Platform growth
- Key metrics charts
- Quick links to detailed analytics

### Data Needed
- Platform analytics summary

### Actions
- Change date range → Refresh
- Tap quick link → Navigate

### States
- Loading
- Default

---

## 132. Platform Metrics

**Location:** /admin/analytics/metrics
**Flow(s):** 157

### Components
- Key metrics:
  - DAU/MAU
  - Transactions per day
  - Revenue per day
  - Conversion rate
- Metrics over time charts
- Comparison to previous period
- Export button

### Data Needed
- Platform metrics

### States
- Loading
- Default

---

## 133. User Growth

**Location:** /admin/analytics/users
**Flow(s):** 158

### Components
- User growth chart
- Breakdown by type:
  - Fans
  - Venues
  - Artists
- New users per day/week/month
- Churn rate
- Geographic distribution

### Data Needed
- User growth data

### States
- Loading
- Default

---

## 134. Event Volume

**Location:** /admin/analytics/events
**Flow(s):** 159

### Components
- Events created over time
- Events by status
- Events by category
- Events by venue
- Geographic distribution

### Data Needed
- Event volume data

### States
- Loading
- Default

---

## 135. Transaction Volume

**Location:** /admin/analytics/transactions
**Flow(s):** 160

### Components
- Transactions over time
- Transaction types breakdown
- Average order value
- Peak hours/days

### Data Needed
- Transaction data

### States
- Loading
- Default

---

## 136. Revenue Analytics

**Location:** /admin/analytics/revenue
**Flow(s):** 161

### Components
- Platform revenue over time
- Revenue by source:
  - Primary fees
  - Resale fees
  - Other
- Revenue by venue tier
- Projections

### Data Needed
- Revenue data

### States
- Loading
- Default

---

## 137. Geographic Analytics

**Location:** /admin/analytics/geographic
**Flow(s):** 162

### Components
- Interactive map
- Users by location
- Events by location
- Revenue by location
- Growth by region

### Data Needed
- Geographic data

### States
- Loading
- Default

---

## 138. Funnel Analytics

**Location:** /admin/analytics/funnel
**Flow(s):** 163

### Components
- Funnel visualization:
  - Event view
  - Add to cart
  - Checkout started
  - Purchase complete
- Drop-off rates
- Funnel by device
- Funnel by traffic source

### Data Needed
- Funnel data

### States
- Loading
- Default

---

## 139. Cohort Analysis

**Location:** /admin/analytics/cohorts
**Flow(s):** 164

### Components
- Cohort type selector:
  - Signup date
  - First purchase date
  - First event attended
- Retention matrix
- Cohort comparison
- Export button

### Data Needed
- Cohort data

### States
- Loading
- Default

---

## 140. Custom Reports

**Location:** /admin/analytics/reports
**Flow(s):** 165

### Components
- Report builder:
  - Metrics selector
  - Dimensions selector
  - Filters
  - Visualization type
- Preview pane
- "Save Report" button
- "Run Report" button

### Data Needed
- Available metrics/dimensions

### Actions
- Build → Preview
- Save → Add to saved
- Run → Generate

---

## 141. Saved Reports

**Location:** /admin/analytics/reports/saved
**Flow(s):** 166

### Components
- Saved reports list:
  - Name
  - Created by
  - Last run
  - Schedule
  - Actions
- Run, Edit, Delete actions

### Data Needed
- Saved reports

### Actions
- Run → Generate
- Edit → Report builder
- Delete → Confirm

---

## 142. Schedule Report Modal

**Location:** /admin/analytics/reports (modal)
**Flow(s):** 167

### Components
- "Schedule Report" header
- Frequency selector
- Recipients
- Format
- "Save Schedule" button

---

## 143. Export Analytics

**Location:** /admin/analytics/export
**Flow(s):** 168

### Components
- Export options:
  - Report type
  - Date range
  - Format
- "Export" button

### Actions
- Export → Download

---

## 144. Real-Time Dashboard

**Location:** /admin/analytics/realtime
**Flow(s):** 169

### Components
- Live metrics:
  - Active users
  - Active events
  - Transactions in progress
  - Scans happening
- Real-time charts
- Live activity feed
- Auto-refresh indicator

### Data Needed
- Real-time data (websocket)

### States
- Connecting
- Live
- Disconnected

---

# Team Screens

---

## 145. Admin Team List

**Location:** /admin/team
**Flow(s):** (implied)

### Components
- Header: "Admin Team" + "Invite Admin" button
- Team table:
  - Avatar
  - Name
  - Email
  - Role
  - Last active
  - Status
  - Actions
- Filter by role

### Data Needed
- Admin team

### Actions
- Invite → Invite Admin
- Tap row → Admin Detail

---

## 146. Invite Admin

**Location:** /admin/team/invite
**Flow(s):** (implied)

### Components
- Header: "Invite Admin"
- Email input
- Name input
- Role selector
- "Send Invitation" button

### Actions
- Send → Email invitation

---

## 147. Admin Detail

**Location:** /admin/team/:id
**Flow(s):** (implied)

### Components
- Admin profile
- Role and permissions
- Activity log
- Edit and Remove buttons

### Data Needed
- Admin object

---

## 148. Edit Admin Permissions

**Location:** /admin/team/:id/permissions
**Flow(s):** (implied)

### Components
- Role selector
- Granular permissions grid
- "Save" button

### Actions
- Edit → Save

---

## 149. Remove Admin Modal

**Location:** /admin/team (modal)
**Flow(s):** (implied)

### Components
- Confirmation
- "Remove" button

---

## 150. Admin Roles

**Location:** /admin/team/roles
**Flow(s):** (implied)

### Components
- Roles list:
  - Super Admin
  - Admin
  - Support
  - Finance
  - Moderation
- Permissions per role
- "Create Role" button

### Data Needed
- Roles and permissions

### Actions
- Create → Create Role Modal
- Edit → Modal

---

## 151. Create Role Modal

**Location:** /admin/team/roles (modal)
**Flow(s):** (implied)

### Components
- Role name input
- Description input
- Permissions checkboxes
- "Create" button

---

## 152. Admin Audit Log

**Location:** /admin/team/audit
**Flow(s):** (implied)

### Components
- All admin actions log
- Filter by admin
- Filter by action type
- Filter by date
- Export button

### Data Needed
- Admin audit log

---

# Account Screens

---

## 153. My Profile

**Location:** /admin/account
**Flow(s):** 1

### Components
- Profile section:
  - Avatar
  - Name
  - Email
  - Role
- "Edit Profile" link
- "Change Password" link
- "2FA Settings" link
- "Activity Log" link

### Data Needed
- Current admin profile

### Actions
- Tap link → Navigate

---

## 154. Change Password

**Location:** /admin/account/password
**Flow(s):** 6

### Components
- Current password input
- New password input
- Confirm password input
- "Update Password" button

### Validation
- Strict password requirements for admin

---

## 155. My 2FA Settings

**Location:** /admin/account/2fa
**Flow(s):** 7

### Components
- 2FA status (required for admin)
- Regenerate backup codes
- View last used codes

---

## 156. My Activity Log

**Location:** /admin/account/activity
**Flow(s):** 8

### Components
- My actions log
- Login history
- IP addresses

### Data Needed
- Current admin's activity

---

# End of Admin Dashboard Screens

---

## Summary

| Section | Screens |
|---------|---------|
| Auth | 5 |
| Dashboard | 1 |
| Users - Fans | 13 |
| Users - Venues | 17 |
| Users - Artists | 12 |
| Events | 13 |
| Financials | 14 |
| Content Moderation | 10 |
| Support Tickets | 15 |
| Platform Settings | 18 |
| Compliance | 12 |
| Analytics | 14 |
| Team | 8 |
| Account | 4 |
| **Total** | **156** |

All 169 flows mapped to 156 screens.