# TicketToken — Artist Dashboard Screens (Web)

Generated: 2024-12-28
Total Screens: 78
Total Flows: 98
Platform: React (Web)

---

## Navigation Structure

### Sidebar Navigation
```
┌──────────────────┬─────────────────────────────────────┐
│                  │                                     │
│  TicketToken     │                                     │
│                  │                                     │
│  Dashboard       │                                     │
│                  │                                     │
│  Profile         │         Page Content                │
│  Events          │                                     │
│  Analytics       │                                     │
│  Financials      │                                     │
│                  │                                     │
│  Followers       │                                     │
│  Team            │                                     │
│  Support         │                                     │
│                  │                                     │
│  ──────────────  │                                     │
│  Settings        │                                     │
│  [Artist Name ▼] │                                     │
└──────────────────┴─────────────────────────────────────┘
```

### Multi-Artist Support
- Artist switcher dropdown at bottom of sidebar (for managers managing multiple artists)
- Switch between artist accounts without logging out

---

## Screen Index

### Auth (8 screens)
1. Login
2. Forgot Password
3. Reset Password
4. Accept Invite
5. Verify Email
6. Onboarding Welcome
7. Profile Setup Wizard
8. 2FA Setup

### Dashboard (1 screen)
9. Dashboard Home

### Profile (12 screens)
10. Artist Profile
11. Edit Profile
12. Photos Gallery
13. Videos Gallery
14. Social Links
15. Streaming Links
16. Merch Links
17. Music Player Embed
18. Genres Selection
19. Booking Contact
20. Press Kit
21. Preview Profile

### Events (10 screens)
22. Events List
23. Event Detail
24. Event Sales
25. Event Resale Activity
26. Event Attendance
27. Guest List
28. Add Guest Modal
29. Edit Guest Modal
30. Contact Venue
31. Share Event

### Analytics (12 screens)
32. Analytics Dashboard
33. Total Fans Reached
34. Revenue Overview
35. Audience Demographics
36. Audience Locations
37. Geographic Map
38. Performance Over Time
39. Sales by Event
40. Sales by Venue
41. Sellout Rate
42. Fan Growth
43. Compare Events

### Financials (6 screens)
44. Financials Overview
45. Revenue by Event
46. Revenue by Venue
47. Resale Royalties
48. Export Reports
49. Financial Reports

### Followers (7 screens)
50. Followers Overview
51. Follower Growth
52. Follower Demographics
53. Follower Locations
54. Top Events for Followers
55. Announce to Followers
56. Export Follower Data

### Notifications (4 screens)
57. Notifications List
58. Notification Detail
59. Notification Settings
60. Notification History

### Team (7 screens)
61. Team List
62. Invite Team Member
63. Accept Team Invite
64. Team Member Detail
65. Edit Permissions
66. Remove Member Modal
67. Transfer Ownership

### Support (14 screens)
68. Help Center
69. Search Help
70. Help Article
71. Tutorial Videos
72. Contact Support
73. Live Chat
74. Submit Bug Report
75. Request Feature
76. Support Tickets
77. Support Ticket Detail
78. Terms of Service
79. Privacy Policy
80. Request Data Export
81. Platform Announcements

### Settings (5 screens)
82. Account Settings
83. Edit Account
84. Change Password
85. Security Settings
86. Notification Preferences

---

# Auth Screens

---

## 1. Login

**Location:** /login
**Flow(s):** 2

### Components
- TicketToken logo
- "Artist Dashboard" header
- Email input
- Password input
- "Remember me" checkbox
- "Log In" button
- "Forgot Password?" link
- "Don't have an account? Get invited by a venue" text

### Data Needed
- None

### Actions
- Enter credentials → Validate → Dashboard (or 2FA if enabled)
- Tap "Forgot Password?" → Forgot Password

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
**Flow(s):** 1, 8

### Components
- TicketToken logo
- "You've Been Invited" header
- Venue name that invited you
- Event name (if event-specific invite)
- Name input
- Password input
- Confirm password input
- Terms checkbox
- "Accept Invitation" button

### Data Needed
- Invite token
- Venue info
- Event info (if applicable)

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
- Artist name
- Progress steps indicator:
  1. Create Account ✓
  2. Set Up Profile
  3. Add Photos & Links
  4. Review & Publish
- "Get Started" button
- Skip option

### Data Needed
- Artist basic info
- Onboarding progress

### Actions
- Tap "Get Started" → Profile Setup Wizard
- Tap "Skip" → Dashboard (incomplete profile banner)

### States
- Default

---

## 7. Profile Setup Wizard

**Location:** /onboarding/profile
**Flow(s):** 15-20

### Components
- Progress bar
- Step 1: Basic Info
  - Artist/band name
  - Bio/description
  - Genres
- Step 2: Photos
  - Profile photo upload
  - Cover photo upload
  - Gallery photos
- Step 3: Links
  - Social media links
  - Streaming links
  - Website
- Step 4: Review
  - Preview profile
  - "Publish" button
- "Back" and "Next" buttons
- "Save & Exit" option

### Data Needed
- Current profile data

### Actions
- Complete steps → Progress
- Save & Exit → Save draft
- Publish → Make profile live

### States
- Step 1-4
- Saving
- Publishing

---

## 8. 2FA Setup

**Location:** /onboarding/security or /settings/security
**Flow(s):** 5

### Components
- Header: "Secure Your Account"
- 2FA explanation
- Method selector:
  - SMS
  - Authenticator app
- If SMS:
  - Phone number input
  - "Send Code" button
  - Code input
- If Authenticator:
  - QR code display
  - Manual code
  - Verification input
- Backup codes display
- "Complete Setup" button
- "Skip for Now" link

### Data Needed
- Phone number (if SMS)
- Authenticator secret

### Actions
- Select method → Show setup
- Verify code → Enable 2FA
- Skip → Dashboard (with reminder)

### States
- Method selection
- SMS verification
- Authenticator setup
- Backup codes
- Complete

---

# Dashboard Screen

---

## 9. Dashboard Home

**Location:** /dashboard
**Flow(s):** (overview)

### Components
- Header: "Dashboard" + date range selector
- Welcome message with artist name
- Profile completeness card (if incomplete)
- Quick stats cards:
  - Total Fans Reached (all time)
  - Revenue This Month
  - Upcoming Events count
  - Follower Count
- Upcoming events list (next 5)
- Recent activity feed:
  - New followers
  - Ticket sales milestones
  - Event completions
- Quick actions:
  - View Events
  - Check Analytics
  - Update Profile

### Data Needed
- Artist stats
- Upcoming events
- Activity feed
- Profile completeness

### Actions
- Change date range → Refresh stats
- Tap event → Event Detail
- Tap quick action → Navigate

### States
- Loading (skeleton)
- Default
- Empty (new artist, no events yet)

---

# Profile Screens

---

## 10. Artist Profile

**Location:** /profile
**Flow(s):** 15

### Components
- Header: "Profile" + "Edit" button + "Preview" button
- Profile completeness indicator
- Profile sections overview:
  - Basic Info (name, bio, genres)
  - Photos & Videos
  - Social Links
  - Streaming Links
  - Booking Info
  - Press Kit
- Each section shows:
  - Status (Complete, Incomplete)
  - "Edit" link
- "Preview Profile" button

### Data Needed
- Artist profile data
- Completeness status per section

### Actions
- Tap "Edit" → Edit Profile
- Tap section → Section edit page
- Tap "Preview" → Preview Profile

### States
- Loading
- Default

---

## 11. Edit Profile

**Location:** /profile/edit
**Flow(s):** 16

### Components
- Header: "Edit Profile"
- Artist/band name input
- Bio editor (rich text)
- Short bio input (for previews, 160 chars)
- Formation year input
- Origin location input
- "Save" button

### Data Needed
- Current profile data

### Actions
- Edit fields → Enable save
- Save → Apply changes

### States
- Default
- Saving
- Validation errors

---

## 12. Photos Gallery

**Location:** /profile/photos
**Flow(s):** 17

### Components
- Header: "Photos" + "Upload" button
- Profile photo section:
  - Current profile photo
  - "Change" button
  - Requirements note
- Cover photo section:
  - Current cover
  - "Change" button
  - Requirements note
- Gallery section:
  - Photo grid
  - Drag to reorder
  - Delete button per photo
  - Upload button
- Photo credits input per photo

### Data Needed
- Current photos

### Actions
- Upload → Add photo
- Drag → Reorder
- Delete → Remove photo
- Set credits → Save

### States
- Default
- Uploading
- Saving

---

## 13. Videos Gallery

**Location:** /profile/videos
**Flow(s):** 18

### Components
- Header: "Videos" + "Add Video" button
- Videos list:
  - Video thumbnail
  - Title
  - Source (YouTube, Vimeo)
  - Actions (Edit, Delete, Reorder)
- Add video form:
  - URL input
  - Title input
  - Description input
- Drag to reorder

### Data Needed
- Current videos

### Actions
- Add video URL → Validate → Add
- Reorder → Save order
- Delete → Remove

### States
- Default
- Adding
- Saving

---

## 14. Social Links

**Location:** /profile/social
**Flow(s):** 19

### Components
- Header: "Social Links"
- Social platform inputs:
  - Instagram URL
  - Facebook URL
  - Twitter/X URL
  - TikTok URL
  - YouTube URL
  - Snapchat URL
- Website URL
- Preview of how links display
- "Save" button

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

## 15. Streaming Links

**Location:** /profile/streaming
**Flow(s):** 20

### Components
- Header: "Streaming & Music Links"
- Streaming platform inputs:
  - Spotify artist URL
  - Apple Music URL
  - Amazon Music URL
  - SoundCloud URL
  - Bandcamp URL
  - YouTube Music URL
- "Featured Track" section:
  - Select track to embed
  - Embed preview
- "Save" button

### Data Needed
- Current streaming links

### Actions
- Enter URLs → Validate
- Select featured track → Update preview
- Save → Apply

### States
- Default
- Saving

---

## 16. Merch Links

**Location:** /profile/merch
**Flow(s):** 20

### Components
- Header: "Merchandise"
- Merch store URL input
- Featured merch items:
  - Item name
  - Item image
  - Item price
  - Item URL
  - "Add Item" button
- Merch store integrations:
  - Shopify connect
  - Big Cartel connect
  - Custom URL
- "Save" button

### Data Needed
- Current merch links

### Actions
- Enter store URL → Validate
- Add featured item → Modal
- Connect integration → OAuth flow
- Save → Apply

### States
- Default
- Saving

---

## 17. Music Player Embed

**Location:** /profile/music
**Flow(s):** 21

### Components
- Header: "Music Player"
- Embed source selector:
  - Spotify
  - Apple Music
  - SoundCloud
  - Bandcamp
- Embed type:
  - Single track
  - Album
  - Playlist
- URL/ID input
- Preview player
- Display options:
  - Compact/Full
  - Theme (light/dark)
- "Save" button

### Data Needed
- Current embed settings

### Actions
- Select source → Show options
- Enter URL → Generate preview
- Save → Apply

### States
- Default
- Loading preview
- Saving

---

## 18. Genres Selection

**Location:** /profile/genres
**Flow(s):** 22

### Components
- Header: "Genres"
- Primary genre dropdown
- Secondary genres (multi-select, max 3)
- Subgenres (based on primary)
- Genre tags display
- "Save" button

### Data Needed
- Available genres
- Current selections

### Actions
- Select genres → Update tags
- Save → Apply

### States
- Default
- Saving

---

## 19. Booking Contact

**Location:** /profile/booking
**Flow(s):** 23

### Components
- Header: "Booking Information"
- Booking contact section:
  - Contact name
  - Email
  - Phone
  - Company/agency
- Booking inquiry form toggle
- Inquiry form settings:
  - Required fields
  - Custom questions
- Calendar/availability link input
- "Save" button

### Data Needed
- Current booking info

### Actions
- Edit fields → Save
- Toggle inquiry form → Configure

### States
- Default
- Saving

---

## 20. Press Kit

**Location:** /profile/press
**Flow(s):** 24

### Components
- Header: "Press Kit"
- Press bio (longer, formal)
- High-res photos section:
  - Photo uploads
  - Download links for press
- Logo files section:
  - Logo uploads (various formats)
- Press quotes/reviews:
  - Quote text
  - Source
  - Date
  - "Add Quote" button
- Stage plot upload
- Tech rider upload
- "Download Full Press Kit" button
- "Save" button

### Data Needed
- Press kit materials

### Actions
- Upload files → Add to kit
- Add quote → Modal
- Download → Generate zip
- Save → Apply

### States
- Default
- Uploading
- Saving

---

## 21. Preview Profile

**Location:** /profile/preview
**Flow(s):** 25, 26

### Components
- Header: "Preview" + "Edit" button + "Publish" button
- Device toggle: Desktop, Tablet, Mobile
- Profile as fans see it:
  - Cover photo
  - Profile photo
  - Artist name
  - Bio
  - Music player
  - Upcoming events
  - Photos
  - Videos
  - Social links
  - Streaming links

### Data Needed
- Complete profile data

### Actions
- Toggle device → Change preview
- Tap "Edit" → Edit Profile
- Tap "Publish" → Publish confirmation

### States
- Loading
- Default
- Unpublished changes

---

# Events Screens

---

## 22. Events List

**Location:** /events
**Flow(s):** 33

### Components
- Header: "Events"
- Tabs: All, Upcoming, Past
- Filter by venue dropdown
- Sort dropdown (Date, Sales)
- Events table:
  - Event image
  - Event name
  - Date
  - Venue
  - Your ticket allocation
  - Tickets sold
  - Status
- Empty state per tab

### Data Needed
- Events where artist is performing

### Actions
- Tap tab → Filter
- Filter by venue → Update list
- Tap event → Event Detail

### States
- Loading
- Default
- Empty (no events)

### Notes
- Artists don't create events; venues add them to events
- Artists see events they've been added to

---

## 23. Event Detail

**Location:** /events/:id
**Flow(s):** 34

### Components
- Header: Event name + Status badge
- Event image
- Event info:
  - Date and time
  - Venue name (link)
  - Venue address
  - Your billing (Headliner, Support, etc.)
- Quick stats:
  - Total tickets sold
  - Revenue (view only)
  - Check-ins (if past)
- Tabs:
  - Overview
  - Sales
  - Guest List
  - Resale
- "Contact Venue" button
- "Share Event" button

### Data Needed
- Event object
- Artist's role/allocation
- Sales data

### Actions
- Tap tab → Switch view
- Tap venue → Venue detail modal
- Tap "Contact Venue" → Contact Venue
- Tap "Share Event" → Share Event

### States
- Loading
- Default
- Event cancelled
- Event passed

---

## 24. Event Sales

**Location:** /events/:id/sales
**Flow(s):** 35

### Components
- Header: "Sales"
- Sales summary:
  - Total tickets sold
  - Tickets remaining
  - Sell-through rate
  - Revenue (display only)
- Sales over time chart
- Sales by ticket type breakdown
- Daily sales table
- Note: "Revenue is for your records. Payments are handled between you and the venue."

### Data Needed
- Event sales data

### Actions
- View data (read-only)

### States
- Loading
- Default

### Notes
- Artists see revenue data but don't receive payouts through platform

---

## 25. Event Resale Activity

**Location:** /events/:id/resale
**Flow(s):** 36

### Components
- Header: "Resale Activity"
- Resale summary:
  - Active listings
  - Tickets resold
  - Average resale price
  - Your resale royalty (if applicable)
- Resale over time chart
- Price comparison (face value vs resale)
- Note about royalties

### Data Needed
- Event resale data

### Actions
- View data (read-only)

### States
- Loading
- Default
- No resale activity

---

## 26. Event Attendance

**Location:** /events/:id/attendance
**Flow(s):** 37

### Components
- Header: "Attendance"
- Attendance summary:
  - Total check-ins
  - No-shows
  - Attendance rate
- Check-in timeline chart
- Check-ins by entry point
- Note: Available after event

### Data Needed
- Event attendance data

### Actions
- View data (read-only)

### States
- Loading
- Default
- Event not yet occurred
- No data

---

## 27. Guest List

**Location:** /events/:id/guests
**Flow(s):** 38, 39, 40

### Components
- Header: "Guest List" + "Add Guest" button
- Guest allocation:
  - Your allocation: X guests
  - Used: Y guests
  - Remaining: Z guests
- Guest list table:
  - Name
  - Email
  - Tickets
  - Status (Confirmed, Checked In)
  - Added by
  - Actions
- Export button

### Data Needed
- Artist's guest allocation
- Guest list entries

### Actions
- Tap "Add Guest" → Add Guest Modal
- Tap guest → Edit Guest Modal
- Tap actions → Edit, Remove
- Export → Download CSV

### States
- Loading
- Default
- Empty
- Allocation full

### Notes
- Artists can only manage guests within their allocation
- Venue controls total guest list

---

## 28. Add Guest Modal

**Location:** /events/:id/guests (modal)
**Flow(s):** 39

### Components
- "Add Guest" header
- Name input
- Email input
- Number of tickets (within allocation)
- Notes input
- "Add Guest" button
- "Cancel" button

### Data Needed
- Remaining allocation

### Actions
- Complete form → Add → Close modal

### States
- Default
- Adding
- Error (over allocation)

### Validation
- Name: required
- Email: required, valid format
- Tickets: within remaining allocation

---

## 29. Edit Guest Modal

**Location:** /events/:id/guests (modal)
**Flow(s):** 40

### Components
- "Edit Guest" header
- Name input (pre-filled)
- Email input (pre-filled)
- Number of tickets
- Notes input
- "Save" button
- "Remove Guest" button (destructive)
- "Cancel" button

### Data Needed
- Guest entry

### Actions
- Edit fields → Save
- Remove → Confirm → Remove

### States
- Default
- Saving
- Removing

---

## 30. Contact Venue

**Location:** /events/:id/contact (modal)
**Flow(s):** 41

### Components
- "Contact Venue" header
- Venue name display
- Venue contact info:
  - Contact person
  - Email
  - Phone
- Or: Send message form:
  - Subject dropdown (General, Guest List, Technical, Other)
  - Message input
  - "Send" button

### Data Needed
- Venue contact info

### Actions
- Tap email → Open email client
- Tap phone → Open dialer
- Send message → Deliver through platform

### States
- Default
- Sending
- Sent

---

## 31. Share Event

**Location:** /events/:id/share (modal)
**Flow(s):** 43

### Components
- "Share Event" header
- Event preview card
- Share options:
  - Copy link
  - Facebook
  - Twitter
  - Instagram
  - Email
- Custom message input
- "Share" button per platform

### Data Needed
- Event share URL
- Event preview data

### Actions
- Copy link → Copy to clipboard
- Tap platform → Open share dialog

### States
- Default

---

# Analytics Screens

---

## 32. Analytics Dashboard

**Location:** /analytics
**Flow(s):** 47

### Components
- Header: "Analytics" + date range selector
- Quick stats cards:
  - Total Fans Reached
  - Total Revenue (view only)
  - Total Events
  - Follower Count
- Fans reached over time chart
- Top performing events list
- Audience snapshot:
  - Top locations
  - Age breakdown
- Quick links to detailed analytics

### Data Needed
- Aggregated analytics

### Actions
- Change date range → Refresh
- Tap event → Event Detail
- Tap quick link → Navigate

### States
- Loading
- Default
- No data yet

---

## 33. Total Fans Reached

**Location:** /analytics/fans
**Flow(s):** 48

### Components
- Header: "Fans Reached"
- Date range selector
- Total fans reached (big number)
- Fans reached over time chart
- Fans by event breakdown
- Fans by venue breakdown
- Unique vs repeat fans
- Export button

### Data Needed
- Fans reached data

### Actions
- Change date range → Update
- Export → Download

### States
- Loading
- Default

---

## 34. Revenue Overview

**Location:** /analytics/revenue
**Flow(s):** 49

### Components
- Header: "Revenue Overview"
- Date range selector
- Total revenue (big number)
- Note: "This is ticket revenue from your events. Payments are handled between you and venues."
- Revenue over time chart
- Revenue by event table
- Revenue by venue table
- Resale royalties section
- Export button

### Data Needed
- Revenue data

### Actions
- Change date range → Update
- Export → Download

### States
- Loading
- Default

### Notes
- Revenue shown for artist's reference/negotiation
- Artist doesn't receive payouts through platform

---

## 35. Audience Demographics

**Location:** /analytics/demographics
**Flow(s):** 50

### Components
- Header: "Audience Demographics"
- Date range selector
- Age distribution chart
- Gender distribution chart
- New vs returning fans
- Fan segments
- Export button

### Data Needed
- Demographic data

### Actions
- Change date range → Update
- Export → Download

### States
- Loading
- Default
- Limited data

---

## 36. Audience Locations

**Location:** /analytics/locations
**Flow(s):** 51

### Components
- Header: "Audience Locations"
- Date range selector
- Top cities list
- Top states/regions list
- Top countries list
- Distance analysis:
  - Average distance traveled
  - Local vs travel %
- Export button

### Data Needed
- Location data

### Actions
- Change date range → Update
- Export → Download

### States
- Loading
- Default

---

## 37. Geographic Map

**Location:** /analytics/map
**Flow(s):** 52

### Components
- Header: "Geographic Map"
- Interactive map:
  - Heat map of fans
  - Cluster markers
  - Zoom controls
- Filter by event
- Filter by time period
- Legend
- Export button

### Data Needed
- Geographic fan data

### Actions
- Interact with map → View details
- Filter → Update map
- Export → Download image

### States
- Loading
- Default

---

## 38. Performance Over Time

**Location:** /analytics/performance
**Flow(s):** 53

### Components
- Header: "Performance Over Time"
- Date range selector
- Metric selector:
  - Tickets sold
  - Revenue
  - Fans reached
  - Sellout rate
- Line chart with selected metric
- Comparison to previous period toggle
- Trend indicators
- Export button

### Data Needed
- Historical performance data

### Actions
- Select metric → Update chart
- Toggle comparison → Show overlay
- Export → Download

### States
- Loading
- Default

---

## 39. Sales by Event

**Location:** /analytics/events
**Flow(s):** 54

### Components
- Header: "Sales by Event"
- Date range selector
- Events table:
  - Event name
  - Date
  - Venue
  - Tickets sold
  - Revenue
  - Sellout %
  - Attendance %
- Sort by any column
- Bar chart comparison
- Export button

### Data Needed
- Per-event sales data

### Actions
- Sort → Reorder
- Tap event → Event Detail
- Export → Download

### States
- Loading
- Default

---

## 40. Sales by Venue

**Location:** /analytics/venues
**Flow(s):** 55

### Components
- Header: "Sales by Venue"
- Date range selector
- Venues table:
  - Venue name
  - Location
  - Events count
  - Total tickets
  - Total revenue
  - Avg sellout %
- Sort by any column
- Bar chart comparison
- Export button

### Data Needed
- Per-venue sales data

### Actions
- Sort → Reorder
- Tap venue → Venue events list
- Export → Download

### States
- Loading
- Default

---

## 41. Sellout Rate

**Location:** /analytics/sellout
**Flow(s):** 56

### Components
- Header: "Sellout Rate"
- Overall sellout rate (big number)
- Sellout rate over time chart
- Sellout by venue breakdown
- Sellout by ticket price breakdown
- Events that sold out list
- Events below target list

### Data Needed
- Sellout data

### Actions
- View data
- Tap event → Event Detail

### States
- Loading
- Default

---

## 42. Fan Growth

**Location:** /analytics/growth
**Flow(s):** 57

### Components
- Header: "Fan Growth"
- Date range selector
- New fans this period
- Growth rate %
- Fan growth over time chart
- Source of new fans:
  - Events
  - Profile visits
  - Follows
- Retention rate
- Export button

### Data Needed
- Fan growth data

### Actions
- Change date range → Update
- Export → Download

### States
- Loading
- Default

---

## 43. Compare Events

**Location:** /analytics/compare
**Flow(s):** 58

### Components
- Header: "Compare Events"
- Event selector (multi-select, up to 5)
- Comparison table:
  - Metric
  - Event 1
  - Event 2
  - etc.
- Metrics compared:
  - Tickets sold
  - Revenue
  - Sellout %
  - Attendance %
  - Resale activity
- Side-by-side charts
- Export button

### Data Needed
- Selected events data

### Actions
- Select events → Generate comparison
- Export → Download

### States
- Select events
- Comparing
- Results

---

# Financials Screens

---

## 44. Financials Overview

**Location:** /financials
**Flow(s):** 62

### Components
- Header: "Financials"
- Important note banner: "Revenue data is for your records. TicketToken does not process payments to artists. Payments are handled directly between you and venues."
- Date range selector
- Summary cards:
  - Total Revenue (all events)
  - Resale Royalties Earned
  - Events Count
- Revenue over time chart
- Top events by revenue
- Quick links:
  - By Event
  - By Venue
  - Resale Royalties

### Data Needed
- Financial summary

### Actions
- Change date range → Update
- Tap event → Event revenue detail
- Tap quick link → Navigate

### States
- Loading
- Default

---

## 45. Revenue by Event

**Location:** /financials/events
**Flow(s):** 63

### Components
- Header: "Revenue by Event"
- Date range selector
- Events table:
  - Event name
  - Date
  - Venue
  - Tickets sold
  - Ticket revenue
  - Resale royalties
  - Total
- Sort by any column
- Export button

### Data Needed
- Per-event revenue

### Actions
- Sort → Reorder
- Tap event → Event Detail
- Export → Download

### States
- Loading
- Default

---

## 46. Revenue by Venue

**Location:** /financials/venues
**Flow(s):** 64

### Components
- Header: "Revenue by Venue"
- Date range selector
- Venues table:
  - Venue name
  - Location
  - Events count
  - Total tickets
  - Total revenue
- Sort by any column
- Export button

### Data Needed
- Per-venue revenue

### Actions
- Sort → Reorder
- Export → Download

### States
- Loading
- Default

---

## 47. Resale Royalties

**Location:** /financials/resale
**Flow(s):** 65

### Components
- Header: "Resale Royalties"
- Date range selector
- How resale royalties work explanation
- Total royalties earned
- Royalties over time chart
- Royalties by event table
- Note: "Resale royalties are paid by venues. Contact your venue for payment details."
- Export button

### Data Needed
- Resale royalty data

### Actions
- Change date range → Update
- Export → Download

### States
- Loading
- Default
- No resale royalties

---

## 48. Export Reports

**Location:** /financials/export
**Flow(s):** 66

### Components
- Header: "Export Reports"
- Report type selector:
  - Full financial summary
  - Revenue by event
  - Revenue by venue
  - Resale royalties
- Date range picker
- Format selector (CSV, Excel, PDF)
- "Generate Report" button
- Recent exports list

### Data Needed
- Report options
- Recent exports

### Actions
- Select options → Generate → Download

### States
- Default
- Generating
- Ready to download

---

## 49. Financial Reports

**Location:** /financials/reports
**Flow(s):** 67

### Components
- Header: "Financial Reports"
- Pre-built reports:
  - Monthly summary
  - Quarterly summary
  - Annual summary
  - Tax year summary
- Custom report builder link
- Report list with download buttons

### Data Needed
- Available reports

### Actions
- Download report → Get file
- Build custom → Export Reports

### States
- Loading
- Default

---

# Followers Screens

---

## 50. Followers Overview

**Location:** /followers
**Flow(s):** 74

### Components
- Header: "Followers"
- Total followers count (big number)
- Growth this period
- Quick stats:
  - New followers
  - Unfollows
  - Net growth
- Follower growth chart (mini)
- Quick links:
  - Growth details
  - Demographics
  - Locations
  - Announce

### Data Needed
- Follower summary

### Actions
- Tap quick link → Navigate

### States
- Loading
- Default

---

## 51. Follower Growth

**Location:** /followers/growth
**Flow(s):** 75

### Components
- Header: "Follower Growth"
- Date range selector
- Growth chart (line)
- New followers vs unfollows
- Growth rate
- Milestones reached
- Source of new followers:
  - Events
  - Profile
  - Search
  - Social

### Data Needed
- Follower growth data

### Actions
- Change date range → Update

### States
- Loading
- Default

---

## 52. Follower Demographics

**Location:** /followers/demographics
**Flow(s):** 76

### Components
- Header: "Follower Demographics"
- Age distribution chart
- Gender distribution chart
- Language breakdown
- Export button

### Data Needed
- Demographic data

### Actions
- Export → Download

### States
- Loading
- Default
- Limited data

---

## 53. Follower Locations

**Location:** /followers/locations
**Flow(s):** 77

### Components
- Header: "Follower Locations"
- Map view toggle
- Top cities list
- Top states/regions list
- Top countries list
- Export button

### Data Needed
- Location data

### Actions
- Toggle map → Show map
- Export → Download

### States
- Loading
- Default

---

## 54. Top Events for Followers

**Location:** /followers/events
**Flow(s):** 78

### Components
- Header: "Top Events for Followers"
- Events ranked by follower attendance:
  - Event name
  - Date
  - Followers who attended
  - % of attendees who are followers
- Insights about follower engagement

### Data Needed
- Event follower data

### Actions
- Tap event → Event Detail

### States
- Loading
- Default

---

## 55. Announce to Followers

**Location:** /followers/announce
**Flow(s):** 79

### Components
- Header: "Announce to Followers"
- Announcement form:
  - Subject line
  - Message content (rich text)
  - Image attachment (optional)
  - Link (optional)
- Preview pane
- Follower count display
- "Send Announcement" button
- Past announcements list

### Data Needed
- Follower count
- Past announcements

### Actions
- Compose message → Preview
- Send → Deliver to followers

### States
- Composing
- Previewing
- Sending
- Sent

---

## 56. Export Follower Data

**Location:** /followers/export
**Flow(s):** 80

### Components
- Header: "Export Follower Data"
- Data included:
  - Follower count
  - Growth over time
  - Demographics
  - Locations
- Note: "Individual follower information is not exported to protect fan privacy."
- Format selector (CSV, PDF)
- "Export" button

### Data Needed
- Export options

### Actions
- Select format → Export → Download

### States
- Default
- Exporting
- Ready

---

# Notifications Screens

---

## 57. Notifications List

**Location:** /notifications
**Flow(s):** 68

### Components
- Header: "Notifications"
- Notification tabs: All, Unread
- Notifications list:
  - Icon by type
  - Title
  - Description
  - Time
  - Read/unread indicator
- Mark all read button
- Empty state

### Data Needed
- Notifications

### Actions
- Tap notification → Notification Detail or navigate
- Mark all read → Update

### States
- Loading
- Default
- Empty

---

## 58. Notification Detail

**Location:** /notifications/:id
**Flow(s):** 68

### Components
- Back button
- Notification title
- Full message
- Related item link (event, etc.)
- Timestamp
- Action button (if applicable)

### Data Needed
- Notification object

### Actions
- Tap related item → Navigate
- Tap action → Execute

### States
- Default

---

## 59. Notification Settings

**Location:** /notifications/settings
**Flow(s):** 69

### Components
- Header: "Notification Settings"
- Email notifications:
  - Event added to
  - Sales milestones
  - Event completed
  - New followers
  - Platform updates
- Push notifications (if app):
  - Same categories
- Frequency:
  - Immediate
  - Daily digest
  - Weekly digest
- "Save" button

### Data Needed
- Current settings

### Actions
- Toggle options → Save

### States
- Default
- Saving

---

## 60. Notification History

**Location:** /notifications/history
**Flow(s):** 70-73

### Components
- Header: "Notification History"
- Date range selector
- Filter by type
- Notifications table:
  - Date
  - Type
  - Title
  - Status (Read/Unread)

### Data Needed
- Notification history

### Actions
- Filter → Update
- Tap notification → Detail

### States
- Loading
- Default

---

# Team Screens

---

## 61. Team List

**Location:** /team
**Flow(s):** 7

### Components
- Header: "Team" + "Invite Member" button
- Team members table:
  - Avatar
  - Name
  - Email
  - Role
  - Status
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

## 62. Invite Team Member

**Location:** /team/invite
**Flow(s):** 8

### Components
- Header: "Invite Team Member"
- Email input
- Name input (optional)
- Role selector:
  - Owner
  - Admin
  - Manager (view analytics, manage guests)
  - View Only
- Permissions panel (if custom)
- Personal message input
- "Send Invitation" button

### Data Needed
- Available roles

### Actions
- Select role → Show permissions
- Send → Invite sent

### States
- Default
- Sending
- Sent

---

## 63. Accept Team Invite

**Location:** /team/invite/:token
**Flow(s):** 9

### Components
- Same as Accept Invite (Screen 4) but for team

---

## 64. Team Member Detail

**Location:** /team/:id
**Flow(s):** 10

### Components
- Header: Member name
- Profile section:
  - Avatar
  - Name
  - Email
  - Role badge
  - Status badge
- Permissions summary
- Activity section:
  - Last login
  - Recent actions
- "Edit" button
- "Remove" button (not for owner)

### Data Needed
- Team member object

### Actions
- Edit → Edit Permissions
- Remove → Remove Member Modal

### States
- Loading
- Default

---

## 65. Edit Permissions

**Location:** /team/:id/permissions
**Flow(s):** 10

### Components
- Header: "Edit Permissions"
- Member info display
- Role selector
- Permissions grid:
  - Profile (View, Edit)
  - Events (View, Manage Guests)
  - Analytics (View, Export)
  - Financials (View, Export)
  - Followers (View, Announce)
  - Team (View, Manage)
- "Save" button

### Data Needed
- Member permissions

### Actions
- Change role → Update permissions
- Save → Apply

### States
- Default
- Saving

---

## 66. Remove Member Modal

**Location:** /team (modal)
**Flow(s):** 11

### Components
- "Remove Team Member" header
- Warning message
- Member name display
- "Remove Member" button (destructive)
- "Cancel" button

### Data Needed
- Member info

### Actions
- Remove → Remove access

### States
- Default
- Removing

---

## 67. Transfer Ownership

**Location:** /team/transfer
**Flow(s):** 12

### Components
- Header: "Transfer Ownership"
- Warning message
- New owner selector (from existing members)
- Password confirmation
- "Transfer Ownership" button
- "Cancel" button

### Data Needed
- Eligible members

### Actions
- Select new owner → Enable button
- Confirm → Transfer

### States
- Default
- Confirming
- Transferred

---

# Support Screens

---

## 68. Help Center

**Location:** /support
**Flow(s):** 81

### Components
- Header: "Help Center"
- Search input
- Categories:
  - Getting Started
  - Profile
  - Events
  - Analytics
  - Guest Lists
- Popular articles
- Contact support card

### Data Needed
- Help categories
- Popular articles

### Actions
- Search → Search Help
- Tap category → Article list
- Tap article → Help Article

### States
- Loading
- Default

---

## 69. Search Help

**Location:** /support/search
**Flow(s):** 82

### Components
- Search input (auto-focus)
- Results list
- No results state

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

## 70. Help Article

**Location:** /support/articles/:id
**Flow(s):** 83

### Components
- Breadcrumb
- Article title
- Content
- "Was this helpful?" feedback
- Related articles
- Contact support link

### Data Needed
- Article object

### Actions
- Feedback → Submit
- Tap related → Navigate

### States
- Loading
- Default

---

## 71. Tutorial Videos

**Location:** /support/tutorials
**Flow(s):** 84

### Components
- Header: "Tutorial Videos"
- Video categories
- Video grid with thumbnails
- Video player modal

### Data Needed
- Video list

### Actions
- Tap video → Play

### States
- Loading
- Default

---

## 72. Contact Support

**Location:** /support/contact
**Flow(s):** 85

### Components
- Header: "Contact Support"
- Contact options:
  - Live Chat
  - Email
- Issue category selector
- Description input
- "Submit" button

### Data Needed
- Support availability

### Actions
- Select channel → Show form
- Submit → Create ticket

### States
- Default
- Submitting
- Submitted

---

## 73. Live Chat

**Location:** /support/chat
**Flow(s):** 86

### Components
- Chat window
- Messages
- Input
- Send button
- End chat button

### Data Needed
- Chat session

### Actions
- Send message → Deliver
- End chat → Confirm

### States
- Connecting
- Active
- Ended

---

## 74. Submit Bug Report

**Location:** /support/bug-report
**Flow(s):** 89

### Components
- Header: "Report a Bug"
- Bug title input
- Steps to reproduce
- Expected behavior
- Actual behavior
- Screenshots upload
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

## 75. Request Feature

**Location:** /support/feature-request
**Flow(s):** 90

### Components
- Header: "Request a Feature"
- Feature title
- Description
- Use case
- "Submit" button

### Data Needed
- None

### Actions
- Submit → Create request

### States
- Default
- Submitting
- Submitted

---

## 76. Support Tickets

**Location:** /support/tickets
**Flow(s):** 93

### Components
- Header: "Your Tickets"
- Tabs: All, Open, Resolved
- Tickets list
- "New Ticket" button

### Data Needed
- Support tickets

### Actions
- Tap ticket → Support Ticket Detail
- New ticket → Contact Support

### States
- Loading
- Default
- Empty

---

## 77. Support Ticket Detail

**Location:** /support/tickets/:id
**Flow(s):** 93

### Components
- Ticket number + status
- Conversation thread
- Reply input
- "Send" button

### Data Needed
- Ticket object

### Actions
- Reply → Send

### States
- Loading
- Default

---

## 78. Terms of Service

**Location:** /support/legal/terms
**Flow(s):** 94

### Components
- Header: "Terms of Service"
- Terms content
- Download button

### Data Needed
- Terms content

### Actions
- Download → Get PDF

### States
- Loading
- Default

---

## 79. Privacy Policy

**Location:** /support/legal/privacy
**Flow(s):** 95

### Components
- Header: "Privacy Policy"
- Policy content
- Download button

### Data Needed
- Policy content

### Actions
- Download → Get PDF

### States
- Loading
- Default

---

## 80. Request Data Export

**Location:** /support/data-export
**Flow(s):** 96

### Components
- Header: "Export Your Data"
- Explanation
- Data included list
- "Request Export" button
- Processing time note

### Data Needed
- Export status

### Actions
- Request → Submit

### States
- Default
- Requested
- Ready to download

---

## 81. Platform Announcements

**Location:** /support/announcements
**Flow(s):** 97

### Components
- Header: "Platform Announcements"
- Announcements list
- Filter by type

### Data Needed
- Announcements

### Actions
- Tap announcement → Expand

### States
- Loading
- Default

---

# Settings Screens

---

## 82. Account Settings

**Location:** /settings
**Flow(s):** 5

### Components
- Header: "Settings"
- Settings navigation:
  - Profile
  - Password
  - Security
  - Notifications
- Account info display

### Data Needed
- Account info

### Actions
- Tap section → Navigate

### States
- Default

---

## 83. Edit Account

**Location:** /settings/account
**Flow(s):** 5

### Components
- Header: "Account"
- Name input
- Email input
- Phone input
- Timezone selector
- "Save" button

### Data Needed
- User profile

### Actions
- Edit fields → Save

### States
- Default
- Saving

---

## 84. Change Password

**Location:** /settings/password
**Flow(s):** 6

### Components
- Header: "Change Password"
- Current password input
- New password input
- Confirm password input
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

---

## 85. Security Settings

**Location:** /settings/security
**Flow(s):** 5

### Components
- Header: "Security"
- 2FA status and setup
- Active sessions list
- "Log Out All Devices" button
- Recent login activity

### Data Needed
- 2FA status
- Sessions
- Login history

### Actions
- Enable 2FA → 2FA Setup
- Log out all → Confirm

### States
- Default

---

## 86. Notification Preferences

**Location:** /settings/notifications
**Flow(s):** 69

### Components
- Same as Notification Settings (Screen 59)

---

# End of Artist Dashboard Screens

---

## Summary

| Section | Screens |
|---------|---------|
| Auth | 8 |
| Dashboard | 1 |
| Profile | 12 |
| Events | 10 |
| Analytics | 12 |
| Financials | 6 |
| Followers | 7 |
| Notifications | 4 |
| Team | 7 |
| Support | 14 |
| Settings | 5 |
| **Total** | **86** |

All 98 flows mapped to 86 screens.