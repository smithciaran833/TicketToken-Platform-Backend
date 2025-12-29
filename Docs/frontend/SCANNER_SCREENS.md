# TicketToken — Scanner App Screens (Mobile)

Generated: 2024-12-28
Total Screens: 32
Platform: React Native (iOS/Android)

---

## Overview

The Scanner App is a dedicated mobile application for venue staff to scan tickets at entry points. It's designed for speed, reliability, and offline capability.

**Users:** Venue staff, security, box office workers, VIP hosts

**Key Features:**
- Fast QR code scanning
- Offline mode with sync
- Multiple scan modes (entry, exit, re-entry, VIP)
- Real-time attendance tracking
- Manual lookup for edge cases

---

## Navigation Structure

### Bottom Tabs (When in Event)
```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│    Scan     │  Attendance │   History   │   Settings  │
└─────────────┴─────────────┴─────────────┴─────────────┘
```

### Pre-Event Flow
```
Login → Select Event → Select Entry Point → Scanning Tabs
```

---

## Screen Index

### Auth (4 screens)
1. Login
2. Forgot Password
3. 2FA Verification
4. Select Venue (if multi-venue access)

### Event Selection (3 screens)
5. Today's Events
6. All Events
7. Select Entry Point

### Scanning (12 screens)
8. Scan Home
9. Scan Result Valid
10. Scan Result Invalid
11. Scan Result Already Scanned
12. Scan Result Wrong Entry
13. Scan Result VIP
14. Scan Result Add-On
15. Manual Lookup
16. Manual Lookup Result
17. Override Entry
18. Flag Attendee
19. Offline Mode Banner

### Attendance (4 screens)
20. Live Attendance
21. Zone Occupancy
22. Entry Point Stats
23. Capacity Alert

### History (3 screens)
24. Scan History
25. Scan Detail
26. Session Summary

### Settings (6 screens)
27. Settings Home
28. Scan Settings
29. Switch Entry Point
30. Switch Event
31. Account
32. About & Help

---

# Auth Screens

---

## 1. Login

**Location:** App launch (if not authenticated)
**Flow(s):** Staff login

### Components
- TicketToken Scanner logo
- "Staff Scanner" header
- Email input
- Password input
- "Log In" button
- "Forgot Password?" link
- Biometric login button (if enabled)
- App version number

### Data Needed
- None

### Actions
- Enter credentials → Validate → 2FA or Select Venue/Event
- Tap biometric → Authenticate → Select Event
- Tap "Forgot Password?" → Forgot Password

### States
- Default
- Loading
- Error (invalid credentials)
- Offline (show offline login if cached)

### Notes
- Supports biometric login after first successful login
- Can login offline if credentials cached

---

## 2. Forgot Password

**Location:** Auth > Forgot Password
**Flow(s):** Password reset

### Components
- Back button
- "Reset Password" header
- Email input
- "Send Reset Link" button
- Note: "Check your email for reset instructions"

### Data Needed
- None

### Actions
- Submit → Send email → Return to Login

### States
- Default
- Loading
- Success
- Error

---

## 3. 2FA Verification

**Location:** Auth > 2FA
**Flow(s):** Two-factor auth

### Components
- "Enter Code" header
- 6-digit code input
- "Verify" button
- "Resend Code" link
- "Use Backup Code" link

### Data Needed
- 2FA method

### Actions
- Enter code → Verify → Select Event

### States
- Default
- Verifying
- Error

---

## 4. Select Venue

**Location:** Auth > Select Venue
**Flow(s):** Multi-venue staff

### Components
- "Select Venue" header
- Venue list:
  - Venue logo
  - Venue name
  - Location
  - Events today badge
- Search input (if many venues)

### Data Needed
- User's accessible venues

### Actions
- Tap venue → Today's Events

### States
- Loading
- Default
- Single venue (skip this screen)

### Notes
- Only shown if staff has access to multiple venues

---

# Event Selection Screens

---

## 5. Today's Events

**Location:** Event Selection > Today
**Flow(s):** Event selection

### Components
- Header: "Today's Events" + date
- Events list:
  - Event image
  - Event name
  - Time (doors, start)
  - Status badge (Upcoming, Doors Open, In Progress, Ended)
  - Check-in progress (X / Y)
- "View All Events" link
- Pull to refresh
- Offline indicator (if offline)

### Data Needed
- Today's events for venue
- Check-in counts

### Actions
- Tap event → Select Entry Point
- Tap "View All" → All Events
- Pull → Refresh

### States
- Loading
- Default
- No events today
- Offline (cached data)

---

## 6. All Events

**Location:** Event Selection > All Events
**Flow(s):** Event selection

### Components
- Header: "All Events" + back button
- Date filter/calendar
- Events list:
  - Grouped by date
  - Same card format as Today's Events
- Search input

### Data Needed
- All upcoming events

### Actions
- Select date → Filter
- Search → Filter
- Tap event → Select Entry Point

### States
- Loading
- Default
- Empty

---

## 7. Select Entry Point

**Location:** Event Selection > Entry Point
**Flow(s):** Entry point selection

### Components
- Header: "Select Entry Point"
- Event name display
- Entry points list:
  - Entry point name
  - Type icon (Main, VIP, Will Call, Accessible)
  - Current scanners count
  - Check-ins at this point
- "All Entry Points" option
- "Start Scanning" button (after selection)

### Data Needed
- Event entry points
- Scanner assignments

### Actions
- Tap entry point → Select
- Tap "Start Scanning" → Scan Home

### States
- Loading
- Default
- Selected

---

# Scanning Screens

---

## 8. Scan Home

**Location:** Scan Tab
**Flow(s):** Primary scanning

### Components
- Header:
  - Event name (truncated)
  - Entry point name
  - Mode badge (Entry, Exit, Re-Entry, VIP)
- Camera viewfinder (large, fullscreen option)
- Scan target overlay/guide
- Quick stats bar:
  - Scanned this session
  - Total check-ins
  - Capacity remaining
- Mode switcher (if multiple modes enabled)
- "Manual Lookup" button
- Flash toggle
- Sound toggle
- Last scan result (mini, dismissible)

### Data Needed
- Event info
- Entry point
- Scan stats
- Scan mode

### Actions
- Point camera at QR → Auto-scan → Show result
- Tap mode → Switch mode
- Tap manual → Manual Lookup
- Tap flash → Toggle
- Tap sound → Toggle

### States
- Ready to scan
- Processing
- Result overlay

### Notes
- Camera always active when on this screen
- Haptic feedback on scan
- Sound feedback (configurable)
- Works offline with cached ticket data

---

## 9. Scan Result Valid

**Location:** Scan Tab > Result Overlay
**Flow(s):** Valid ticket

### Components
- Green background
- Large checkmark animation
- "VALID" text
- Attendee name
- Ticket type
- Seat/section (if assigned)
- Entry time logged
- Auto-dismiss countdown (2s)
- "View Details" button
- "Flag" button

### Data Needed
- Ticket info
- Attendee info

### Actions
- Auto-dismiss → Ready to scan
- Tap "View Details" → Attendee detail modal
- Tap "Flag" → Flag Attendee

### States
- Success (auto-dismiss)

### Notes
- Haptic: success vibration
- Sound: success chime
- Auto-dismiss after 2 seconds

---

## 10. Scan Result Invalid

**Location:** Scan Tab > Result Overlay
**Flow(s):** Invalid ticket

### Components
- Red background
- Large X animation
- "INVALID" text
- Reason:
  - "Ticket not found"
  - "Wrong event"
  - "Ticket cancelled"
  - "Ticket refunded"
  - "Fraudulent ticket"
- "Override" button (if permitted)
- "Dismiss" button
- "Report Issue" button

### Data Needed
- Error reason

### Actions
- Tap "Override" → Override Entry
- Tap "Dismiss" → Ready to scan
- Tap "Report" → Report issue flow

### States
- Error (manual dismiss)

### Notes
- Haptic: error vibration
- Sound: error tone
- Does not auto-dismiss

---

## 11. Scan Result Already Scanned

**Location:** Scan Tab > Result Overlay
**Flow(s):** Duplicate scan

### Components
- Yellow/orange background
- Warning icon
- "ALREADY SCANNED" text
- Original scan info:
  - Time
  - Entry point
  - Scanned by
- Attendee name
- Photo (if available)
- "Override" button
- "Dismiss" button
- "View History" button

### Data Needed
- Original scan info
- Attendee info

### Actions
- Tap "Override" → Override Entry
- Tap "Dismiss" → Ready to scan
- Tap "View History" → Attendee scan history

### States
- Warning (manual dismiss)

### Notes
- Haptic: warning vibration
- Could be legitimate re-scan or attempted fraud
- Staff makes judgment call

---

## 12. Scan Result Wrong Entry

**Location:** Scan Tab > Result Overlay
**Flow(s):** Wrong entry point

### Components
- Yellow background
- Warning icon
- "WRONG ENTRY POINT" text
- Message: "This ticket is for [correct entry]"
- Attendee name
- Ticket type
- Directions to correct entry (if available)
- "Override & Allow" button
- "Redirect" button
- "Dismiss" button

### Data Needed
- Ticket info
- Correct entry point

### Actions
- Tap "Override" → Override Entry
- Tap "Redirect" → Show directions
- Tap "Dismiss" → Ready to scan

### States
- Warning (manual dismiss)

---

## 13. Scan Result VIP

**Location:** Scan Tab > Result Overlay
**Flow(s):** VIP ticket

### Components
- Gold/purple background
- Star/crown icon
- "VIP ACCESS" text
- Guest name (larger)
- VIP area access list
- Amenities included:
  - Drink tickets: X
  - Backstage: Yes/No
  - etc.
- "View Details" button
- Auto-dismiss countdown

### Data Needed
- VIP ticket info
- Amenities

### Actions
- Auto-dismiss → Ready to scan
- Tap "View Details" → VIP detail modal

### States
- Success (special VIP styling)

### Notes
- Special sound/haptic for VIP
- May trigger staff alert for VIP handling

---

## 14. Scan Result Add-On

**Location:** Scan Tab > Result Overlay
**Flow(s):** Add-on scan

### Components
- Blue background
- Add-on icon
- Add-on type:
  - "PARKING PASS"
  - "DRINK TICKET"
  - "MERCH VOUCHER"
  - etc.
- Redemption info:
  - "1 of 2 redeemed" (if limited)
- "Mark Redeemed" button
- "Cancel" button

### Data Needed
- Add-on info
- Redemption count

### Actions
- Tap "Mark Redeemed" → Redeem → Success
- Tap "Cancel" → Dismiss

### States
- Default
- Redeeming
- Redeemed

### Notes
- Some add-ons are single-use, some multi-use
- Shows remaining uses

---

## 15. Manual Lookup

**Location:** Scan Tab > Manual Lookup
**Flow(s):** Manual entry search

### Components
- Header: "Manual Lookup" + back button
- Search tabs:
  - Name
  - Email
  - Confirmation #
  - Phone
- Search input (auto-focus)
- Keyboard
- Recent lookups (if any)
- "Search" button

### Data Needed
- Recent lookups

### Actions
- Type → Enable search
- Tap "Search" → Manual Lookup Result
- Tap recent → Search that term

### States
- Default
- Searching

---

## 16. Manual Lookup Result

**Location:** Scan Tab > Manual Lookup > Result
**Flow(s):** Manual entry results

### Components
- Header: "Results" + back button
- Search query display
- Results list:
  - Attendee name
  - Ticket type
  - Status indicator (not checked in, checked in)
  - "Check In" button
- Empty state: "No results found"
- "Try Another Search" button

### Data Needed
- Search results

### Actions
- Tap "Check In" → Process check-in → Success
- Tap result row → Attendee detail
- Tap "Try Another" → Manual Lookup

### States
- Loading
- Results
- No results

---

## 17. Override Entry

**Location:** Scan Tab > Override (Modal)
**Flow(s):** Override entry

### Components
- "Override Entry" header
- Warning text: "This will allow entry despite the error"
- Override reason dropdown:
  - Technical issue
  - Customer service
  - VIP exception
  - Manager approval
  - Other
- Notes input (required if "Other")
- Manager PIN input (if required by venue)
- "Allow Entry" button
- "Cancel" button

### Data Needed
- Override reasons
- PIN requirement setting

### Actions
- Select reason → Enable button
- Enter PIN (if required) → Validate
- Tap "Allow Entry" → Log override → Valid result

### States
- Default
- Validating PIN
- Processing
- Error (wrong PIN)

### Notes
- All overrides logged with timestamp, reason, staff member
- Some venues require manager PIN for overrides

---

## 18. Flag Attendee

**Location:** Scan Tab > Flag (Modal)
**Flow(s):** Flag attendee

### Components
- "Flag Attendee" header
- Attendee info display
- Flag reason dropdown:
  - Security concern
  - Intoxicated
  - Underage
  - ID mismatch
  - Behavior issue
  - Other
- Notes input
- Priority:
  - Normal
  - Urgent (alerts security immediately)
- "Flag" button
- "Cancel" button

### Data Needed
- Attendee info

### Actions
- Select reason → Enable flag
- Tap "Flag" → Submit → Notify security (if urgent)

### States
- Default
- Submitting

### Notes
- Urgent flags send push notification to security staff
- Flagged attendees shown with indicator on future scans

---

## 19. Offline Mode Banner

**Location:** All screens (banner overlay)
**Flow(s):** Offline operation

### Components
- Yellow banner at top of screen
- Offline icon
- "Offline Mode" text
- "X scans pending sync" count
- "Tap to retry connection" (if manual retry)

### Data Needed
- Connection status
- Pending sync count

### Actions
- Tap → Attempt reconnection

### States
- Offline (persistent banner)
- Syncing (when reconnected)
- Back online (banner dismisses)

### Notes
- Scanner continues to work offline
- Uses cached ticket database
- Syncs when connection restored
- Shows count of pending syncs

---

# Attendance Screens

---

## 20. Live Attendance

**Location:** Attendance Tab
**Flow(s):** Live attendance tracking

### Components
- Header: "Attendance"
- Event name
- Big numbers:
  - Checked In / Total Sold
  - Percentage
- Progress bar
- Check-ins over time chart (mini)
- By ticket type breakdown:
  - Type name
  - Checked in / sold
  - Progress bar
- Auto-refresh indicator
- "View by Zone" button
- "View by Entry" button

### Data Needed
- Real-time attendance data

### Actions
- Auto-refresh every 30s
- Tap "View by Zone" → Zone Occupancy
- Tap "View by Entry" → Entry Point Stats

### States
- Loading
- Default
- Offline (show cached data)

---

## 21. Zone Occupancy

**Location:** Attendance Tab > Zones
**Flow(s):** Zone tracking

### Components
- Header: "Zone Occupancy" + back button
- Zones list:
  - Zone name
  - Current / Capacity
  - Progress bar (color-coded: green/yellow/red)
  - Status indicator
- Venue map (if available)
- Capacity alert settings link

### Data Needed
- Zone occupancy data

### Actions
- Tap zone → Zone detail
- View map → Interactive zone map

### States
- Loading
- Default
- Alert (zone at capacity)

---

## 22. Entry Point Stats

**Location:** Attendance Tab > Entry Points
**Flow(s):** Entry point tracking

### Components
- Header: "Entry Points" + back button
- Entry points list:
  - Entry point name
  - Check-ins count
  - Active scanners
  - Avg scan time
- Your entry point highlighted

### Data Needed
- Entry point stats

### Actions
- View only (informational)

### States
- Loading
- Default

---

## 23. Capacity Alert

**Location:** Attendance Tab > Alert (Modal)
**Flow(s):** Capacity warnings

### Components
- Alert icon
- "Capacity Warning" header
- Zone/venue name
- Current occupancy
- Capacity limit
- Recommended action
- "Acknowledge" button
- "Dismiss" button
- Sound/vibration alert

### Data Needed
- Alert info

### Actions
- Acknowledge → Log acknowledgment
- Dismiss → Hide (with snooze)

### States
- Active alert

### Notes
- Triggered when zone/venue reaches threshold
- Configurable thresholds (80%, 90%, 100%)
- Sound and vibration alert

---

# History Screens

---

## 24. Scan History

**Location:** History Tab
**Flow(s):** Scan history

### Components
- Header: "History"
- Filter tabs: All, Valid, Invalid, Overrides
- Scan list:
  - Time
  - Attendee name
  - Result (Valid, Invalid, Override)
  - Ticket type
- Search input
- "Export" button (if permitted)
- Pull to refresh

### Data Needed
- Scan history (this session)

### Actions
- Tap tab → Filter
- Search → Filter by name
- Tap row → Scan Detail
- Export → Email/download

### States
- Loading
- Default
- Empty

---

## 25. Scan Detail

**Location:** History Tab > Scan Detail
**Flow(s):** Scan details

### Components
- Header: "Scan Details" + back button
- Result badge (Valid, Invalid, Override)
- Timestamp
- Attendee info:
  - Name
  - Email
  - Ticket type
  - Seat/section
- Scan info:
  - Entry point
  - Scanned by (you or other)
  - Device
- If override:
  - Reason
  - Notes
  - Approved by
- "Flag Attendee" button

### Data Needed
- Scan object

### Actions
- Tap "Flag" → Flag Attendee

### States
- Default

---

## 26. Session Summary

**Location:** History Tab > Session Summary (or end of session)
**Flow(s):** Session end

### Components
- Header: "Session Summary"
- Session duration
- Stats:
  - Total scans
  - Valid scans
  - Invalid scans
  - Overrides
  - Flags
- Avg scan time
- Scans over time chart
- "End Session" button
- "Continue Scanning" button

### Data Needed
- Session stats

### Actions
- Tap "End Session" → Confirm → Select Event screen
- Tap "Continue" → Scan Home

### States
- Default

---

# Settings Screens

---

## 27. Settings Home

**Location:** Settings Tab
**Flow(s):** Settings

### Components
- Header: "Settings"
- Current event display
- Current entry point display
- Settings list:
  - Scan Settings
  - Switch Entry Point
  - Switch Event
  - Account
  - About & Help
- "End Session" button
- App version

### Data Needed
- Current event/entry
- User info

### Actions
- Tap setting → Navigate
- Tap "End Session" → Confirm → Select Event

### States
- Default

---

## 28. Scan Settings

**Location:** Settings Tab > Scan Settings
**Flow(s):** Scan configuration

### Components
- Header: "Scan Settings" + back button
- Camera settings:
  - Default flash (on/off/auto)
  - Scan sound (on/off)
  - Scan vibration (on/off)
- Scan behavior:
  - Auto-dismiss valid scans (on/off)
  - Auto-dismiss delay (1s, 2s, 3s)
  - Continuous scan mode (on/off)
- Display settings:
  - Show attendee photo (on/off)
  - Show ticket details (on/off)
- "Save" button (or auto-save)

### Data Needed
- Current settings

### Actions
- Toggle options → Save automatically

### States
- Default

---

## 29. Switch Entry Point

**Location:** Settings Tab > Switch Entry Point
**Flow(s):** Change entry point

### Components
- Header: "Switch Entry Point" + back button
- Current entry point (highlighted)
- Entry points list:
  - Entry point name
  - Type
  - Scanners count
- "Switch" button (after selection)

### Data Needed
- Entry points for current event

### Actions
- Select entry point → Switch → Return to Scan Home

### States
- Default
- Switching

### Notes
- Ends current scan session
- Starts new session at new entry point

---

## 30. Switch Event

**Location:** Settings Tab > Switch Event
**Flow(s):** Change event

### Components
- Header: "Switch Event" + back button
- Current event (highlighted)
- Today's events list
- "View All Events" link

### Data Needed
- Today's events

### Actions
- Tap event → Confirm → Select Entry Point

### States
- Default
- Switching

### Notes
- Ends current session
- Returns to entry point selection

---

## 31. Account

**Location:** Settings Tab > Account
**Flow(s):** Account settings

### Components
- Header: "Account" + back button
- Profile section:
  - Name
  - Email
  - Role
  - Venue
- "Change Password" button
- Biometric login toggle
- "Log Out" button
- "Log Out of All Devices" button

### Data Needed
- User profile

### Actions
- Toggle biometric → Update
- Tap "Log Out" → Confirm → Login screen

### States
- Default

---

## 32. About & Help

**Location:** Settings Tab > About & Help
**Flow(s):** Help and info

### Components
- Header: "About & Help" + back button
- App info:
  - Version
  - Build number
  - Last updated
- Help section:
  - How to scan
  - Troubleshooting
  - FAQ
- Support:
  - Contact support button
  - Report bug button
- Legal:
  - Terms of Service
  - Privacy Policy
- "Check for Updates" button
- Debug info (hidden, tap version 5 times)

### Data Needed
- App version info

### Actions
- Tap help article → Show article
- Tap contact → Open support
- Check updates → Check app store

### States
- Default

---

# End of Scanner App Screens

---

## Summary

| Section | Screens |
|---------|---------|
| Auth | 4 |
| Event Selection | 3 |
| Scanning | 12 |
| Attendance | 4 |
| History | 3 |
| Settings | 6 |
| **Total** | **32** |

---

## Key Features Summary

### Speed Optimizations
- Camera always ready on scan screen
- Auto-dismiss valid scans
- Minimal UI during active scanning
- Local ticket database for instant validation

### Offline Capability
- Full offline scanning with cached data
- Queue scans for sync when online
- Visual indicator of offline status
- Automatic sync on reconnection

### Security
- Biometric login option
- Session-based authentication
- All actions logged
- Manager PIN for overrides (optional)

### Usability
- Large touch targets
- High contrast for outdoor visibility
- Sound and haptic feedback
- One-handed operation

---

## Technical Notes

### Data Caching
- Download full ticket database for event before scanning
- Incremental updates every 5 minutes when online
- Store pending scans locally if offline
- Sync queue processes automatically

### Camera
- Use native camera APIs for speed
- Support both front and back cameras
- Auto-focus on QR code region
- Low-light enhancement

### Connectivity
- Graceful offline degradation
- Background sync when possible
- Push notifications for alerts
- WebSocket for real-time updates (when online)
