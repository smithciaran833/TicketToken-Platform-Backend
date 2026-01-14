# TicketToken — Artist User Flows

Generated: 2024-12-28
Total Flows: 98
Total Steps: TBD

---

## Summary

| Section | Flows | Flow Numbers |
|---------|-------|--------------|
| Account | 14 | 1-14 |
| Artist Profile | 18 | 15-32 |
| Events | 14 | 33-46 |
| Analytics | 15 | 47-61 |
| Financials | 6 | 62-67 |
| Notifications | 6 | 68-73 |
| Followers | 7 | 74-80 |
| Support | 18 | 81-98 |
| **Total** | **98** | |

---

## Flow Index

### Account (Flows 1-14)
1. Sign Up
2. Log In
3. Reset Password
4. Verify Email
5. Edit Profile
6. Enable 2FA
7. Invite Team Member
8. Accept Team Invite
9. Edit Team Permissions
10. Remove Team Member
11. View Audit Log
12. Transfer Ownership
13. Switch Between Artists
14. Delete Account

### Artist Profile (Flows 15-32)
15. Create Artist Profile
16. Upload Profile Photo
17. Upload Header Image
18. Upload Gallery Photos
19. Upload Videos
20. Add Social Links
21. Add Streaming Links
22. Embed Music Player
23. Add Website URL
24. Add Merch Store Link
25. Set Genres
26. Add Booking Contact
27. Upload Press Kit
28. Show/Hide Profile Sections
29. Preview Artist Page
30. Publish Artist Page
31. Claim Existing Artist
32. Verify Artist

### Events (Flows 33-46)
33. View My Events
34. Filter Events
35. View Event Details
36. View Event Sales
37. View Resale Activity
38. View Guest List
39. Add to Guest List
40. Edit Guest List Entry
41. Remove from Guest List
42. View Event Attendance
43. Contact Venue
44. Request Event Change
45. Share Event
46. Download Promo Assets

### Analytics (Flows 47-61)
47. View Dashboard
48. View Total Fans Reached
49. View Total Revenue
50. View Audience Demographics
51. View Audience Location
52. View Geospatial Map
53. View Performance Over Time
54. View Sales by Event
55. View Sales by Venue
56. View Sellout Rate
57. View Fan Growth
58. Compare Events
59. View Top Venues
60. Export Reports
61. Share Reports

### Financials (Flows 62-67)
62. View Revenue Overview
63. View Revenue by Event
64. View Revenue by Venue
65. View Resale Activity
66. Export Financial Reports
67. Share Financial Reports

### Notifications (Flows 68-73)
68. View Notifications
69. Notification Settings
70. Event Added Notification
71. Sales Milestone Notification
72. Event Completed Notification
73. New Follower Milestone

### Followers (Flows 74-80)
74. View Follower Count
75. View Follower Growth
76. View Follower Demographics
77. View Follower Locations
78. View Top Events for Followers
79. Announce to Followers
80. Export Follower Data

### Support (Flows 81-98)
81. Contact Support
82. Live Chat with Support
83. Schedule a Call
84. View Help Center
85. Search Help Articles
86. Watch Tutorial Videos
87. View Getting Started Guide
88. View Best Practices
89. Submit Bug Report
90. Request Feature
91. Submit Feedback
92. View Support Tickets
93. View Platform Status
94. View Platform Announcements
95. Subscribe to Updates
96. View Terms of Service
97. View Privacy Policy
98. Request Data Export

---

# Account Flows

---

## Flow 1: Sign Up

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 1.1 | Navigate to artist portal | Website |
| 1.2 | Tap "Create Account" or "Get Started" | Landing Page |
| 1.3 | Option: Sign up via venue invite link | Invite Flow |
| 1.4 | Option: Sign up independently | Standard Flow |
| 1.5 | Enter email | Email Input |
| 1.6 | Enter password | Password Input |
| 1.7 | Enter full name | Name Input |
| 1.8 | Enter artist/band name | Artist Input |
| 1.9 | Accept terms and privacy policy | Checkbox |
| 1.10 | Submit registration | Loading State |
| 1.11 | Handle success: go to email verification | Success |
| 1.12 | Handle error (email taken, weak password) | Error State |
| 1.13 | Verification email sent | Email Sent |

---

## Flow 2: Log In

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 2.1 | Navigate to artist portal | Website |
| 2.2 | Enter email | Email Input |
| 2.3 | Enter password | Password Input |
| 2.4 | Tap "Log In" | Submit Button |
| 2.5 | Handle 2FA if enabled | 2FA Screen |
| 2.6 | Enter 2FA code | Code Input |
| 2.7 | If multiple artists: select artist | Artist Selector |
| 2.8 | Handle success: go to dashboard | Dashboard |
| 2.9 | Handle error (wrong password) | Error State |
| 2.10 | Handle locked account | Locked State |
| 2.11 | "Forgot Password" link: Flow 3 | Link |

---

## Flow 3: Reset Password

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 3.1 | Tap "Forgot Password" | Link |
| 3.2 | Enter email | Email Input |
| 3.3 | Submit request | Loading State |
| 3.4 | Show "check your email" message | Confirmation |
| 3.5 | User opens email | External |
| 3.6 | Tap reset link | Email Link |
| 3.7 | Open reset password page | Reset Page |
| 3.8 | Enter new password | Password Input |
| 3.9 | Confirm new password | Password Input |
| 3.10 | Submit | Loading State |
| 3.11 | Handle success: go to login | Success |
| 3.12 | Handle error (link expired) | Error State |

---

## Flow 4: Verify Email

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 4.1 | After signup, show verification prompt | Verification Screen |
| 4.2 | User opens email | External |
| 4.3 | Tap verification link | Email Link |
| 4.4 | Open verification page | Website |
| 4.5 | Send token to backend | Loading State |
| 4.6 | Handle success: email verified | Success |
| 4.7 | Redirect to dashboard or onboarding | Navigation |
| 4.8 | Handle error (link expired) | Error State |
| 4.9 | Resend verification option | Resend Button |

---

## Flow 5: Edit Profile

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 5.1 | Navigate to Settings then Profile | Navigation |
| 5.2 | View current profile info | Profile Screen |
| 5.3 | Edit name | Text Input |
| 5.4 | Edit email (requires re-verification) | Email Input |
| 5.5 | Edit phone | Phone Input |
| 5.6 | Upload profile photo | Image Upload |
| 5.7 | Save changes | Save Button |
| 5.8 | Handle success | Success Toast |
| 5.9 | Handle error | Error State |

---

## Flow 6: Enable 2FA

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 6.1 | Navigate to Settings then Security | Navigation |
| 6.2 | Tap "Enable Two-Factor Authentication" | Button |
| 6.3 | Choose method (SMS, Authenticator) | Options |
| 6.4 | If SMS: verify phone number | Phone Verification |
| 6.5 | If Authenticator: display QR code | QR Display |
| 6.6 | Scan QR with authenticator app | External |
| 6.7 | Enter verification code | Code Input |
| 6.8 | Submit | Loading State |
| 6.9 | Handle success: 2FA enabled | Success |
| 6.10 | Display backup codes | Backup Codes |
| 6.11 | Prompt to save backup codes | Warning |
| 6.12 | Confirm codes saved | Checkbox |

---

## Flow 7: Invite Team Member

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 7.1 | Navigate to Settings then Team | Navigation |
| 7.2 | View team member list | Team List |
| 7.3 | Tap "Invite Member" | Button |
| 7.4 | Enter email address | Email Input |
| 7.5 | Enter name | Name Input |
| 7.6 | Set permissions | Permission Checkboxes |
| 7.7 | Permissions: Edit Profile, View Analytics, View Financials, Manage Guest List, Message Venues | Options |
| 7.8 | Add personal message (optional) | Text Input |
| 7.9 | Send invitation | Loading State |
| 7.10 | Handle success: invite sent | Success |
| 7.11 | Invite appears in pending list | Pending List |
| 7.12 | Resend invite option | Resend Button |
| 7.13 | Cancel invite option | Cancel Button |

---

## Flow 8: Accept Team Invite

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 8.1 | Receive invite email | Email |
| 8.2 | Tap "Accept Invitation" link | Email Link |
| 8.3 | Open invite acceptance page | Website |
| 8.4 | If no account: create account | Signup Flow |
| 8.5 | If has account: log in | Login Flow |
| 8.6 | Review artist and permissions | Review Screen |
| 8.7 | Accept invitation | Accept Button |
| 8.8 | Handle success: added to team | Success |
| 8.9 | Artist appears in their dashboard | Dashboard Update |
| 8.10 | Decline invitation option | Decline Button |

---

## Flow 9: Edit Team Permissions

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 9.1 | Navigate to Settings then Team | Navigation |
| 9.2 | View team member list | Team List |
| 9.3 | Tap team member | Selection |
| 9.4 | View member details | Member Detail |
| 9.5 | Tap "Edit Permissions" | Button |
| 9.6 | View permission checkboxes | Permission List |
| 9.7 | Toggle individual permissions | Toggles |
| 9.8 | Save changes | Save Button |
| 9.9 | Handle success | Success Toast |
| 9.10 | Member notified of changes | Notification |

---

## Flow 10: Remove Team Member

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 10.1 | Navigate to Settings then Team | Navigation |
| 10.2 | Tap team member | Selection |
| 10.3 | Tap "Remove from Team" | Button |
| 10.4 | Confirm removal | Confirmation Dialog |
| 10.5 | Submit removal | Loading State |
| 10.6 | Handle success: member removed | Success |
| 10.7 | Member loses access immediately | Access Revoked |
| 10.8 | Member notified | Email |
| 10.9 | Cannot remove self | Validation |
| 10.10 | Cannot remove owner | Validation |

---

## Flow 11: View Audit Log

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 11.1 | Navigate to Settings then Audit Log | Navigation |
| 11.2 | Load audit entries | Loading State |
| 11.3 | Display log entries | Log List |
| 11.4 | Each entry shows: date, user, action, details | Log Entry |
| 11.5 | Filter by date range | Date Filter |
| 11.6 | Filter by user | User Filter |
| 11.7 | Filter by action type | Action Filter |
| 11.8 | Search log | Search Input |
| 11.9 | View entry details | Detail Modal |
| 11.10 | Export audit log | Export Button |

---

## Flow 12: Transfer Ownership

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 12.1 | Navigate to Settings then Team | Navigation |
| 12.2 | Tap "Transfer Ownership" | Button |
| 12.3 | Select new owner from team | Member Selector |
| 12.4 | Review what transfers | Info Display |
| 12.5 | Enter password to confirm | Password Input |
| 12.6 | Confirm transfer | Confirmation Dialog |
| 12.7 | Submit | Loading State |
| 12.8 | Handle success: ownership transferred | Success |
| 12.9 | You remain on team with reduced permissions | Role Change |
| 12.10 | New owner notified | Email |
| 12.11 | Audit log entry created | Logging |

---

## Flow 13: Switch Between Artists

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 13.1 | View artist selector in header | Artist Dropdown |
| 13.2 | Tap current artist name | Dropdown Trigger |
| 13.3 | View list of artists you have access to | Artist List |
| 13.4 | Select different artist | Selection |
| 13.5 | Dashboard refreshes with new artist data | Refresh |
| 13.6 | All navigation now scoped to selected artist | Context Change |
| 13.7 | Permissions may differ per artist | Permission Note |

---

## Flow 14: Delete Account

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 14.1 | Navigate to Settings then Account | Navigation |
| 14.2 | Tap "Delete Account" | Button |
| 14.3 | Show warning: what will be deleted | Warning Modal |
| 14.4 | Must transfer ownership first if owner | Validation |
| 14.5 | Enter password | Password Input |
| 14.6 | Type "DELETE" to confirm | Text Input |
| 14.7 | Submit deletion | Loading State |
| 14.8 | Handle success: account deleted | Success |
| 14.9 | Logged out | Logout |
| 14.10 | Confirmation email | Email |

---

# Artist Profile Flows

---

## Flow 15: Create Artist Profile

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 15.1 | After signup or from Settings | Navigation |
| 15.2 | Enter artist/band name | Text Input |
| 15.3 | Enter short bio (tagline) | Text Input |
| 15.4 | Enter full bio | Text Area |
| 15.5 | Select primary genre | Genre Dropdown |
| 15.6 | Select additional genres | Multi-Select |
| 15.7 | Select artist type (Solo, Band, DJ, etc.) | Type Dropdown |
| 15.8 | Save profile | Save Button |
| 15.9 | Handle success | Success Toast |
| 15.10 | Prompt to continue setup | Next Steps |

---

## Flow 16: Upload Profile Photo

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 16.1 | Navigate to Artist Profile then Photos | Navigation |
| 16.2 | View current profile photo | Photo Display |
| 16.3 | Tap "Upload" or "Change" | Button |
| 16.4 | Select file from computer | File Picker |
| 16.5 | Crop/adjust photo | Image Cropper |
| 16.6 | Preview at different sizes | Preview |
| 16.7 | Save photo | Save Button |
| 16.8 | Handle upload progress | Progress Bar |
| 16.9 | Handle success | Success Toast |
| 16.10 | Handle error (file too large, wrong format) | Error State |

---

## Flow 17: Upload Header Image

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 17.1 | Navigate to Artist Profile then Photos | Navigation |
| 17.2 | View current header image | Header Display |
| 17.3 | Tap "Upload" or "Change" | Button |
| 17.4 | Select file from computer | File Picker |
| 17.5 | View recommended dimensions | Info Text |
| 17.6 | Crop/adjust image | Image Cropper |
| 17.7 | Preview on desktop and mobile | Preview |
| 17.8 | Save header | Save Button |
| 17.9 | Handle success | Success Toast |
| 17.10 | Handle error | Error State |

---

## Flow 18: Upload Gallery Photos

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 18.1 | Navigate to Artist Profile then Photos | Navigation |
| 18.2 | View photo gallery | Photo Grid |
| 18.3 | Tap "Add Photos" | Button |
| 18.4 | Select multiple files | File Picker |
| 18.5 | Upload progress | Progress Bar |
| 18.6 | Preview uploaded photos | Preview |
| 18.7 | Add caption to photo | Text Input |
| 18.8 | Reorder photos (drag and drop) | Drag Action |
| 18.9 | Delete photo | Delete Button |
| 18.10 | Confirm delete | Confirmation |
| 18.11 | Save changes | Save Button |

---

## Flow 19: Upload Videos

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 19.1 | Navigate to Artist Profile then Videos | Navigation |
| 19.2 | View current videos | Video List |
| 19.3 | Tap "Add Video" | Button |
| 19.4 | Option: Upload file | File Upload |
| 19.5 | Option: Paste YouTube/Vimeo URL | URL Input |
| 19.6 | If upload: show progress | Progress Bar |
| 19.7 | If URL: validate and fetch thumbnail | Loading State |
| 19.8 | Add video title | Text Input |
| 19.9 | Add video description | Text Input |
| 19.10 | Set as featured video | Toggle |
| 19.11 | Reorder videos | Drag Action |
| 19.12 | Delete video | Delete Button |
| 19.13 | Save changes | Save Button |

---

## Flow 20: Add Social Links

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 20.1 | Navigate to Artist Profile then Social | Navigation |
| 20.2 | View current social links | Link List |
| 20.3 | Add Instagram URL | URL Input |
| 20.4 | Add Twitter/X URL | URL Input |
| 20.5 | Add TikTok URL | URL Input |
| 20.6 | Add Facebook URL | URL Input |
| 20.7 | Add YouTube URL | URL Input |
| 20.8 | Validate URL format | Validation |
| 20.9 | Save changes | Save Button |
| 20.10 | Handle success | Success Toast |
| 20.11 | Links display on artist page | Preview |

---

## Flow 21: Add Streaming Links

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 21.1 | Navigate to Artist Profile then Music | Navigation |
| 21.2 | View current streaming links | Link List |
| 21.3 | Add Spotify artist URL | URL Input |
| 21.4 | Add Apple Music URL | URL Input |
| 21.5 | Add SoundCloud URL | URL Input |
| 21.6 | Add Bandcamp URL | URL Input |
| 21.7 | Add other streaming URL | URL Input |
| 21.8 | Validate URL format | Validation |
| 21.9 | Save changes | Save Button |
| 21.10 | Handle success | Success Toast |

---

## Flow 22: Embed Music Player

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 22.1 | Navigate to Artist Profile then Music | Navigation |
| 22.2 | View embed section | Section |
| 22.3 | Select embed type (Spotify, SoundCloud) | Type Selector |
| 22.4 | Paste embed URL or track/playlist ID | URL Input |
| 22.5 | Fetch embed preview | Loading State |
| 22.6 | Preview player on profile | Preview |
| 22.7 | Select player size | Size Options |
| 22.8 | Save embed | Save Button |
| 22.9 | Handle invalid URL | Error State |
| 22.10 | Remove embed | Remove Button |

---

## Flow 23: Add Website URL

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 23.1 | Navigate to Artist Profile then Links | Navigation |
| 23.2 | Enter website URL | URL Input |
| 23.3 | Validate URL format | Validation |
| 23.4 | Save changes | Save Button |
| 23.5 | Handle success | Success Toast |
| 23.6 | Website displays on artist page | Preview |

---

## Flow 24: Add Merch Store Link

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 24.1 | Navigate to Artist Profile then Links | Navigation |
| 24.2 | Enter merch store URL | URL Input |
| 24.3 | Validate URL format | Validation |
| 24.4 | Add store name (optional) | Text Input |
| 24.5 | Save changes | Save Button |
| 24.6 | Handle success | Success Toast |
| 24.7 | Merch link displays on artist page | Preview |

---

## Flow 25: Set Genres

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 25.1 | Navigate to Artist Profile then About | Navigation |
| 25.2 | View genres section | Section |
| 25.3 | Select primary genre | Genre Dropdown |
| 25.4 | Select secondary genres (up to 3) | Multi-Select |
| 25.5 | Search for genre | Search Input |
| 25.6 | Request new genre if not found | Request Link |
| 25.7 | Save changes | Save Button |
| 25.8 | Handle success | Success Toast |
| 25.9 | Genres display on artist page | Preview |

---

## Flow 26: Add Booking Contact

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 26.1 | Navigate to Artist Profile then Booking | Navigation |
| 26.2 | Toggle "Show Booking Contact" | Toggle |
| 26.3 | Enter booking email | Email Input |
| 26.4 | Enter booking phone (optional) | Phone Input |
| 26.5 | Enter booking agent name (optional) | Text Input |
| 26.6 | Enter booking notes | Text Area |
| 26.7 | Save changes | Save Button |
| 26.8 | Handle success | Success Toast |
| 26.9 | Booking info visible to venues | Privacy Note |

---

## Flow 27: Upload Press Kit

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 27.1 | Navigate to Artist Profile then Press Kit | Navigation |
| 27.2 | View current press kit | Kit Display |
| 27.3 | Upload high-res photos | File Upload |
| 27.4 | Upload logo files | File Upload |
| 27.5 | Upload bio document | File Upload |
| 27.6 | Upload stage rider (optional) | File Upload |
| 27.7 | Upload tech rider (optional) | File Upload |
| 27.8 | Set download permissions (Public, Venues Only) | Permission Selector |
| 27.9 | Save press kit | Save Button |
| 27.10 | Handle success | Success Toast |
| 27.11 | Generate press kit download link | Link Display |

---

## Flow 28: Show/Hide Profile Sections

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 28.1 | Navigate to Artist Profile then Display | Navigation |
| 28.2 | View profile sections | Section List |
| 28.3 | Toggle: Show bio | Toggle |
| 28.4 | Toggle: Show photos | Toggle |
| 28.5 | Toggle: Show videos | Toggle |
| 28.6 | Toggle: Show music player | Toggle |
| 28.7 | Toggle: Show upcoming events | Toggle |
| 28.8 | Toggle: Show booking contact | Toggle |
| 28.9 | Toggle: Show social links | Toggle |
| 28.10 | Reorder sections | Drag Action |
| 28.11 | Save changes | Save Button |
| 28.12 | Preview changes | Preview Button |

---

## Flow 29: Preview Artist Page

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 29.1 | From Artist Profile, tap "Preview" | Button |
| 29.2 | Open preview in new tab | New Tab |
| 29.3 | View artist page as fans see it | Preview |
| 29.4 | See all enabled sections | Full Page |
| 29.5 | Test links and navigation | Interaction |
| 29.6 | Mobile preview option | Device Toggle |
| 29.7 | Desktop preview option | Device Toggle |
| 29.8 | Close preview | Close Button |

---

## Flow 30: Publish Artist Page

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 30.1 | From Artist Profile, view publish status | Status Display |
| 30.2 | If unpublished: "Publish" button | Button |
| 30.3 | Check required fields completed | Validation |
| 30.4 | Required: name, one photo, bio | Requirements |
| 30.5 | Missing fields shown | Error List |
| 30.6 | Confirm publish | Confirmation |
| 30.7 | Submit | Loading State |
| 30.8 | Handle success: artist live | Success |
| 30.9 | Artist searchable by fans | Live |
| 30.10 | If published: "Unpublish" option | Button |
| 30.11 | Confirm unpublish | Confirmation |
| 30.12 | Artist hidden from search | Hidden |

---

## Flow 31: Claim Existing Artist

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 31.1 | Search for your artist name | Search Input |
| 31.2 | Find unclaimed artist profile | Search Results |
| 31.3 | Tap "Claim This Profile" | Button |
| 31.4 | Submit verification | Verification Flow |
| 31.5 | Option: Link social media account | OAuth |
| 31.6 | Option: Email from official domain | Email Verify |
| 31.7 | Option: Submit documentation | File Upload |
| 31.8 | Request submitted for review | Pending State |
| 31.9 | Admin reviews claim | Admin Review |
| 31.10 | Handle approved: profile linked to account | Success |
| 31.11 | Handle denied: reason provided | Denied State |
| 31.12 | Appeal option | Appeal Button |

---

## Flow 32: Verify Artist

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 32.1 | Navigate to Artist Profile then Verification | Navigation |
| 32.2 | View verification status | Status Display |
| 32.3 | View verification benefits | Benefits List |
| 32.4 | Tap "Get Verified" | Button |
| 32.5 | Submit social media links | URL Inputs |
| 32.6 | Submit streaming profile links | URL Inputs |
| 32.7 | Minimum follower/listener threshold | Requirements |
| 32.8 | Submit request | Submit Button |
| 32.9 | Request pending review | Pending State |
| 32.10 | Handle approved: verification badge | Success |
| 32.11 | Badge displays on profile | Badge Display |
| 32.12 | Handle denied: reason provided | Denied State |

---

# Events Flows

---

## Flow 33: View My Events

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 33.1 | Navigate to Events | Navigation |
| 33.2 | Load events | Loading State |
| 33.3 | View events list | Event List |
| 33.4 | Tabs: Upcoming, Past, All | Tab Bar |
| 33.5 | Each event shows: name, date, venue, status | Event Card |
| 33.6 | Show ticket sales summary | Sales Badge |
| 33.7 | Sort by date | Sort Default |
| 33.8 | Empty state if no events | Empty State |
| 33.9 | Tap event for details | Selection |

---

## Flow 34: Filter Events

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 34.1 | From Events list | Context |
| 34.2 | Tap "Filter" | Button |
| 34.3 | Filter by date range | Date Picker |
| 34.4 | Filter by venue | Venue Dropdown |
| 34.5 | Filter by status (Upcoming, Completed, Cancelled) | Status Checkboxes |
| 34.6 | Apply filters | Apply Button |
| 34.7 | View active filter count | Badge |
| 34.8 | Clear filters | Clear Button |

---

## Flow 35: View Event Details

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 35.1 | Tap event from list | Navigation |
| 35.2 | Load event details | Loading State |
| 35.3 | View event name | Title |
| 35.4 | View date and time | Date/Time |
| 35.5 | View venue name and address | Venue Info |
| 35.6 | View your billing position (headliner, support) | Billing Info |
| 35.7 | View event image | Image |
| 35.8 | View event description | Description |
| 35.9 | View ticket types and prices | Ticket Info |
| 35.10 | View sales summary | Sales Summary |
| 35.11 | Quick actions: Sales, Guest List, Share | Action Buttons |

---

## Flow 36: View Event Sales

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 36.1 | From event detail, tap "Sales" | Navigation |
| 36.2 | Load sales data | Loading State |
| 36.3 | View total tickets sold | Metric |
| 36.4 | View total revenue | Metric |
| 36.5 | View tickets remaining | Metric |
| 36.6 | View sales by ticket type | Breakdown |
| 36.7 | View sales over time | Chart |
| 36.8 | View sellout percentage | Progress Bar |
| 36.9 | Export sales data | Export Button |

---

## Flow 37: View Resale Activity

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 37.1 | From event detail, tap "Resale" | Navigation |
| 37.2 | Load resale data | Loading State |
| 37.3 | View total resale volume | Metric |
| 37.4 | View average resale price | Metric |
| 37.5 | View your royalties earned | Metric |
| 37.6 | View active listings count | Metric |
| 37.7 | View resale price over time | Chart |
| 37.8 | View resale vs face value comparison | Comparison |
| 37.9 | Export resale data | Export Button |

---

## Flow 38: View Guest List

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 38.1 | From event detail, tap "Guest List" | Navigation |
| 38.2 | Load guest list | Loading State |
| 38.3 | View your guest list allocation | Allocation Display |
| 38.4 | View used vs available | Progress Bar |
| 38.5 | View guest list entries | Guest List |
| 38.6 | Each shows: name, plus-ones, status | List Item |
| 38.7 | Search guests | Search Input |
| 38.8 | Export guest list | Export Button |

---

## Flow 39: Add to Guest List

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 39.1 | From guest list, tap "Add Guest" | Button |
| 39.2 | Check remaining allocation | Validation |
| 39.3 | If none remaining: show error | Error State |
| 39.4 | Enter guest name | Name Input |
| 39.5 | Enter guest email | Email Input |
| 39.6 | Set plus-ones (0-4) | Number Selector |
| 39.7 | Add notes (optional) | Text Input |
| 39.8 | Save guest | Save Button |
| 39.9 | Handle success | Success Toast |
| 39.10 | Guest receives confirmation email | Email Sent |
| 39.11 | Allocation updated | Count Update |

---

## Flow 40: Edit Guest List Entry

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 40.1 | From guest list, tap guest | Selection |
| 40.2 | View guest details | Detail View |
| 40.3 | Edit guest name | Name Input |
| 40.4 | Edit plus-ones | Number Selector |
| 40.5 | Edit notes | Text Input |
| 40.6 | Save changes | Save Button |
| 40.7 | Handle success | Success Toast |
| 40.8 | Guest notified of changes | Email |

---

## Flow 41: Remove from Guest List

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 41.1 | From guest list, tap guest | Selection |
| 41.2 | Tap "Remove" | Button |
| 41.3 | Confirm removal | Confirmation Dialog |
| 41.4 | Submit | Loading State |
| 41.5 | Handle success | Success Toast |
| 41.6 | Guest removed | List Update |
| 41.7 | Allocation restored | Count Update |
| 41.8 | Guest notified | Email |

---

## Flow 42: View Event Attendance

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 42.1 | From event detail, tap "Attendance" | Navigation |
| 42.2 | Load attendance data | Loading State |
| 42.3 | View total checked in | Metric |
| 42.4 | View check-in rate | Percentage |
| 42.5 | View no-shows | Metric |
| 42.6 | View check-in over time | Chart |
| 42.7 | View guest list check-ins | Guest Check-ins |
| 42.8 | Export attendance data | Export Button |

---

## Flow 43: Contact Venue

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 43.1 | From event detail, tap "Contact Venue" | Button |
| 43.2 | Open message composer | Message Screen |
| 43.3 | Pre-filled: event name, venue | Auto-Fill |
| 43.4 | Select message topic | Topic Dropdown |
| 43.5 | Topics: Guest List, Event Details, Technical, Other | Options |
| 43.6 | Write message | Text Area |
| 43.7 | Attach files (optional) | Attachment |
| 43.8 | Send message | Send Button |
| 43.9 | Handle success | Success Toast |
| 43.10 | View message history with venue | History Link |

---

## Flow 44: Request Event Change

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 44.1 | From event detail, tap "Request Change" | Button |
| 44.2 | Select change type | Type Dropdown |
| 44.3 | Types: Wrong photo, Wrong bio, Billing order, Other | Options |
| 44.4 | Describe requested change | Text Area |
| 44.5 | Attach correct asset (if photo) | File Upload |
| 44.6 | Submit request | Submit Button |
| 44.7 | Request sent to venue | Success |
| 44.8 | Handle success | Success Toast |
| 44.9 | Track request status | Status Display |

---

## Flow 45: Share Event

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 45.1 | From event detail, tap "Share" | Button |
| 45.2 | View share options | Share Modal |
| 45.3 | Copy event URL | Copy Button |
| 45.4 | Share to Instagram | Instagram Button |
| 45.5 | Share to Twitter | Twitter Button |
| 45.6 | Share to Facebook | Facebook Button |
| 45.7 | Share via email | Email Button |
| 45.8 | Download promo image | Download Button |
| 45.9 | Handle success | Success Toast |

---

## Flow 46: Download Promo Assets

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 46.1 | From event detail, tap "Promo Assets" | Button |
| 46.2 | View available assets | Asset List |
| 46.3 | Event flyer/poster | Asset Option |
| 46.4 | Social media sized images (Story, Square, Banner) | Asset Options |
| 46.5 | Select assets to download | Checkboxes |
| 46.6 | Download as ZIP | Download Button |
| 46.7 | Handle download | Download Progress |
| 46.8 | Share directly to social | Share Options |

---

# Analytics Flows

---

## Flow 47: View Dashboard

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 47.1 | Navigate to Analytics | Navigation |
| 47.2 | Load dashboard | Loading State |
| 47.3 | View key metrics overview | Metrics Grid |
| 47.4 | Total fans reached (all time) | Metric Card |
| 47.5 | Total events | Metric Card |
| 47.6 | Total revenue generated | Metric Card |
| 47.7 | Average attendance | Metric Card |
| 47.8 | Recent activity feed | Activity List |
| 47.9 | Date range selector | Date Picker |
| 47.10 | Quick links to detailed reports | Links |

---

## Flow 48: View Total Fans Reached

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 48.1 | From dashboard or tap metric | Navigation |
| 48.2 | Load fan data | Loading State |
| 48.3 | View total unique attendees | Metric |
| 48.4 | View fans over time | Chart |
| 48.5 | View fans by event | Table |
| 48.6 | View repeat fans percentage | Metric |
| 48.7 | Filter by date range | Date Filter |
| 48.8 | Export data | Export Button |

---

## Flow 49: View Total Revenue

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 49.1 | From dashboard or tap metric | Navigation |
| 49.2 | Load revenue data | Loading State |
| 49.3 | View total ticket revenue | Metric |
| 49.4 | View revenue over time | Chart |
| 49.5 | View revenue by event | Table |
| 49.6 | View revenue by venue | Table |
| 49.7 | View average ticket price | Metric |
| 49.8 | Filter by date range | Date Filter |
| 49.9 | Export data | Export Button |

---

## Flow 50: View Audience Demographics

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 50.1 | Navigate to Analytics then Audience | Navigation |
| 50.2 | Load demographic data | Loading State |
| 50.3 | View age distribution | Chart |
| 50.4 | View gender distribution (if available) | Chart |
| 50.5 | View new vs returning fans | Chart |
| 50.6 | Filter by event | Event Filter |
| 50.7 | Filter by date range | Date Filter |
| 50.8 | Note: based on available data | Disclaimer |
| 50.9 | Export data | Export Button |

---

## Flow 51: View Audience Location

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 51.1 | Navigate to Analytics then Audience | Navigation |
| 51.2 | Select "Location" tab | Tab |
| 51.3 | Load location data | Loading State |
| 51.4 | View fans by city | Table |
| 51.5 | View fans by state/region | Table |
| 51.6 | View fans by country | Table |
| 51.7 | Filter by event | Event Filter |
| 51.8 | View on map: Flow 52 | Map Link |
| 51.9 | Export data | Export Button |

---

## Flow 52: View Geospatial Map

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 52.1 | From Audience Location, tap "View Map" | Navigation |
| 52.2 | Load map visualization | Loading State |
| 52.3 | Display map with fan locations | Map View |
| 52.4 | Heat map of fan density | Heat Map |
| 52.5 | Cluster markers for zoom levels | Clustering |
| 52.6 | Zoom and pan map | Gestures |
| 52.7 | Toggle heat map / markers | View Toggle |
| 52.8 | Filter by event | Event Filter |
| 52.9 | Identify potential tour markets | Insights |
| 52.10 | Export map image | Export Button |

---

## Flow 53: View Performance Over Time

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 53.1 | Navigate to Analytics then Trends | Navigation |
| 53.2 | Load trend data | Loading State |
| 53.3 | View attendance over time | Chart |
| 53.4 | View revenue over time | Chart |
| 53.5 | View events over time | Chart |
| 53.6 | Toggle metrics | Metric Selector |
| 53.7 | Granularity: Monthly, Quarterly, Yearly | Granularity Toggle |
| 53.8 | Identify growth trends | Trend Indicators |
| 53.9 | Export data | Export Button |

---

## Flow 54: View Sales by Event

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 54.1 | Navigate to Analytics then Sales | Navigation |
| 54.2 | Select "By Event" view | View Toggle |
| 54.3 | Load sales data | Loading State |
| 54.4 | View events table | Table |
| 54.5 | Columns: Event, Date, Venue, Sold, Revenue | Columns |
| 54.6 | Sort by any column | Sort Action |
| 54.7 | Filter by date range | Date Filter |
| 54.8 | Tap event for details | Navigation |
| 54.9 | Export data | Export Button |

---

## Flow 55: View Sales by Venue

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 55.1 | Navigate to Analytics then Sales | Navigation |
| 55.2 | Select "By Venue" view | View Toggle |
| 55.3 | Load sales data | Loading State |
| 55.4 | View venues table | Table |
| 55.5 | Columns: Venue, Events, Total Sold, Total Revenue | Columns |
| 55.6 | Sort by any column | Sort Action |
| 55.7 | Filter by date range | Date Filter |
| 55.8 | Tap venue for event breakdown | Navigation |
| 55.9 | Export data | Export Button |

---

## Flow 56: View Sellout Rate

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 56.1 | Navigate to Analytics then Performance | Navigation |
| 56.2 | Load performance data | Loading State |
| 56.3 | View overall sellout rate | Percentage |
| 56.4 | View sellout rate over time | Chart |
| 56.5 | View sellout rate by venue | Table |
| 56.6 | View events that sold out | Event List |
| 56.7 | Average time to sellout | Metric |
| 56.8 | Filter by date range | Date Filter |
| 56.9 | Export data | Export Button |

---

## Flow 57: View Fan Growth

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 57.1 | Navigate to Analytics then Fans | Navigation |
| 57.2 | Load fan growth data | Loading State |
| 57.3 | View new fans per event | Chart |
| 57.4 | View cumulative fan count | Chart |
| 57.5 | View fan acquisition rate | Metric |
| 57.6 | View which events drove most new fans | Table |
| 57.7 | Filter by date range | Date Filter |
| 57.8 | Export data | Export Button |

---

## Flow 58: Compare Events

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 58.1 | Navigate to Analytics then Compare | Navigation |
| 58.2 | Select first event | Event Selector |
| 58.3 | Select second event | Event Selector |
| 58.4 | Load comparison data | Loading State |
| 58.5 | View side-by-side metrics | Comparison Table |
| 58.6 | Metrics: attendance, revenue, sellout rate | Rows |
| 58.7 | View sales curve comparison | Chart |
| 58.8 | Highlight differences | Visual Indicators |
| 58.9 | Add more events to compare | Add Button |
| 58.10 | Export comparison | Export Button |

---

## Flow 59: View Top Venues

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 59.1 | Navigate to Analytics then Venues | Navigation |
| 59.2 | Load venue data | Loading State |
| 59.3 | View venues ranked by performance | Ranked List |
| 59.4 | Metrics: total fans, revenue, sellout rate | Columns |
| 59.5 | Sort by different metrics | Sort Selector |
| 59.6 | View venue details | Tap Action |
| 59.7 | See all events at venue | Event List |
| 59.8 | Filter by date range | Date Filter |
| 59.9 | Export data | Export Button |

---

## Flow 60: Export Reports

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 60.1 | From any analytics view | Context |
| 60.2 | Tap "Export" | Button |
| 60.3 | Select format (CSV, Excel, PDF) | Format Selector |
| 60.4 | Select date range | Date Range |
| 60.5 | Select data to include | Data Checkboxes |
| 60.6 | Generate export | Generate Button |
| 60.7 | Download file | Download |
| 60.8 | Or email file | Email Option |
| 60.9 | Handle success | Success Toast |

---

## Flow 61: Share Reports

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 61.1 | From any analytics view | Context |
| 61.2 | Tap "Share" | Button |
| 61.3 | Select share method | Options |
| 61.4 | Enter recipient emails | Email Input |
| 61.5 | Add message (optional) | Text Input |
| 61.6 | Select format | Format Selector |
| 61.7 | Send report | Send Button |
| 61.8 | Handle success | Success Toast |
| 61.9 | Generate shareable link | Link Option |
| 61.10 | Set link expiration | Expiration Selector |

---

# Financials Flows

---

## Flow 62: View Revenue Overview

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 62.1 | Navigate to Financials | Navigation |
| 62.2 | Load revenue data | Loading State |
| 62.3 | View total revenue from your events | Metric |
| 62.4 | View revenue over time | Chart |
| 62.5 | View resale royalties earned | Metric |
| 62.6 | Date range selector | Date Picker |
| 62.7 | Note: Payments handled by venue | Disclaimer |

---

## Flow 63: View Revenue by Event

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 63.1 | From Financials, select "By Event" | View Toggle |
| 63.2 | Load event revenue data | Loading State |
| 63.3 | View events table | Table |
| 63.4 | Columns: Event, Date, Tickets Sold, Revenue, Resale Royalties | Columns |
| 63.5 | Sort by any column | Sort Action |
| 63.6 | Filter by date range | Date Filter |
| 63.7 | Tap event for details | Navigation |
| 63.8 | Export data | Export Button |

---

## Flow 64: View Revenue by Venue

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 64.1 | From Financials, select "By Venue" | View Toggle |
| 64.2 | Load venue revenue data | Loading State |
| 64.3 | View venues table | Table |
| 64.4 | Columns: Venue, Events, Total Revenue, Resale Royalties | Columns |
| 64.5 | Sort by any column | Sort Action |
| 64.6 | Filter by date range | Date Filter |
| 64.7 | Tap venue for breakdown | Navigation |
| 64.8 | Export data | Export Button |

---

## Flow 65: View Resale Activity

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 65.1 | From Financials, select "Resale" | Navigation |
| 65.2 | Load resale data | Loading State |
| 65.3 | View total resale volume | Metric |
| 65.4 | View total royalties earned | Metric |
| 65.5 | View resale by event | Table |
| 65.6 | View average resale price vs face value | Comparison |
| 65.7 | View resale over time | Chart |
| 65.8 | Filter by date range | Date Filter |
| 65.9 | Export data | Export Button |

---

## Flow 66: Export Financial Reports

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 66.1 | From Financials, tap "Export" | Button |
| 66.2 | Select data to export | Data Checkboxes |
| 66.3 | Options: Revenue, Resale, All | Options |
| 66.4 | Select date range | Date Range Picker |
| 66.5 | Select format (CSV, Excel, PDF) | Format Selector |
| 66.6 | Generate export | Generate Button |
| 66.7 | Download file | Download |
| 66.8 | Handle success | Success Toast |

---

## Flow 67: Share Financial Reports

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 67.1 | From Financials, tap "Share" | Button |
| 67.2 | Enter recipient emails | Email Input |
| 67.3 | Recipients: manager, label, accountant | Use Cases |
| 67.4 | Add message (optional) | Text Input |
| 67.5 | Select format | Format Selector |
| 67.6 | Send report | Send Button |
| 67.7 | Handle success | Success Toast |

---

# Notifications Flows

---

## Flow 68: View Notifications

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 68.1 | Tap notification bell icon | Navigation |
| 68.2 | Load notifications | Loading State |
| 68.3 | Display notification list | Notification List |
| 68.4 | Empty state if no notifications | Empty State |
| 68.5 | Show unread count badge | Badge |
| 68.6 | Unread visually distinct | Unread Style |
| 68.7 | Each shows: icon, title, message, time | Notification Item |
| 68.8 | Tap notification for details | Navigation |
| 68.9 | Mark as read on tap | Auto Mark Read |
| 68.10 | Mark all as read | Bulk Action |
| 68.11 | Delete notification | Delete Action |

---

## Flow 69: Notification Settings

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 69.1 | Navigate to Settings then Notifications | Navigation |
| 69.2 | Load current settings | Loading State |
| 69.3 | View notification preferences | Settings Form |
| 69.4 | Toggle: Event added notifications | Toggle |
| 69.5 | Toggle: Sales milestone notifications | Toggle |
| 69.6 | Toggle: Event completed notifications | Toggle |
| 69.7 | Toggle: Follower milestone notifications | Toggle |
| 69.8 | Toggle: Venue messages | Toggle |
| 69.9 | Email preferences | Email Section |
| 69.10 | Push preferences | Push Section |
| 69.11 | Save changes | Save Button |
| 69.12 | Handle success | Success Toast |

---

## Flow 70: Event Added Notification

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 70.1 | Venue adds artist to event | Trigger |
| 70.2 | Push notification sent | Push |
| 70.3 | Email notification sent | Email |
| 70.4 | Notification content: event name, venue, date | Content |
| 70.5 | Tap notification: go to event | Deep Link |
| 70.6 | Review event details | Event Detail |
| 70.7 | Option to contact venue | Action |

---

## Flow 71: Sales Milestone Notification

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 71.1 | Event hits milestone (50%, 75%, sold out) | Trigger |
| 71.2 | Push notification sent | Push |
| 71.3 | Notification content: event name, milestone | Content |
| 71.4 | Tap notification: go to event sales | Deep Link |
| 71.5 | View sales details | Sales Detail |

---

## Flow 72: Event Completed Notification

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 72.1 | Event ends | Trigger |
| 72.2 | Post-event summary generated | Backend |
| 72.3 | Push notification sent | Push |
| 72.4 | Email summary sent | Email |
| 72.5 | Notification content: event name, final stats | Content |
| 72.6 | Tap notification: go to event analytics | Deep Link |
| 72.7 | View attendance, revenue, demographics | Analytics |

---

## Flow 73: New Follower Milestone

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 73.1 | Hit follower milestone (100, 500, 1000, etc.) | Trigger |
| 73.2 | Push notification sent | Push |
| 73.3 | Notification content: milestone reached | Content |
| 73.4 | Tap notification: go to followers | Deep Link |
| 73.5 | View follower analytics | Followers Screen |

---

# Followers Flows

---

## Flow 74: View Follower Count

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 74.1 | Navigate to Followers | Navigation |
| 74.2 | Load follower data | Loading State |
| 74.3 | View total follower count | Metric |
| 74.4 | View count displayed on profile | Note |
| 74.5 | Compare to last period | Comparison |

---

## Flow 75: View Follower Growth

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 75.1 | From Followers, select "Growth" | View Toggle |
| 75.2 | Load growth data | Loading State |
| 75.3 | View followers over time | Chart |
| 75.4 | View new followers per period | Chart |
| 75.5 | Identify growth spikes | Visual Indicators |
| 75.6 | Correlate with events | Event Markers |
| 75.7 | Date range selector | Date Picker |
| 75.8 | Export data | Export Button |

---

## Flow 76: View Follower Demographics

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 76.1 | From Followers, select "Demographics" | View Toggle |
| 76.2 | Load demographic data | Loading State |
| 76.3 | View age distribution | Chart |
| 76.4 | View gender distribution | Chart |
| 76.5 | Note: based on available data | Disclaimer |
| 76.6 | Export data | Export Button |

---

## Flow 77: View Follower Locations

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 77.1 | From Followers, select "Locations" | View Toggle |
| 77.2 | Load location data | Loading State |
| 77.3 | View followers by city | Table |
| 77.4 | View followers by region | Table |
| 77.5 | View map visualization | Map |
| 77.6 | Identify potential tour markets | Insights |
| 77.7 | Export data | Export Button |

---

## Flow 78: View Top Events for Followers

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 78.1 | From Followers, select "Acquisition" | View Toggle |
| 78.2 | Load acquisition data | Loading State |
| 78.3 | View events ranked by new followers | Table |
| 78.4 | Columns: Event, Date, New Followers | Columns |
| 78.5 | Identify what drives follows | Insights |
| 78.6 | Filter by date range | Date Filter |
| 78.7 | Export data | Export Button |

---

## Flow 79: Announce to Followers

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 79.1 | From Followers, tap "Announce" | Button |
| 79.2 | Select announcement type | Type Selector |
| 79.3 | Types: New Event, General Update | Options |
| 79.4 | If New Event: select event | Event Selector |
| 79.5 | Write announcement message | Text Area |
| 79.6 | Character limit displayed | Counter |
| 79.7 | Preview announcement | Preview |
| 79.8 | Select channels (Push, Email) | Channel Checkboxes |
| 79.9 | Send announcement | Send Button |
| 79.10 | Handle success | Success Toast |
| 79.11 | View send stats | Stats Display |

---

## Flow 80: Export Follower Data

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 80.1 | From Followers, tap "Export" | Button |
| 80.2 | Select data to export | Data Checkboxes |
| 80.3 | Options: Counts, Demographics, Locations | Options |
| 80.4 | Select date range | Date Range Picker |
| 80.5 | Select format (CSV, Excel) | Format Selector |
| 80.6 | Generate export | Generate Button |
| 80.7 | Download file | Download |
| 80.8 | Handle success | Success Toast |
| 80.9 | Note: No personal fan data exported | Privacy Note |

---

# Support Flows

---

## Flow 81: Contact Support

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 81.1 | Navigate to Help then Contact Support | Navigation |
| 81.2 | View contact options | Options Screen |
| 81.3 | Option: Live Chat | Option Card |
| 81.4 | Option: Email | Option Card |
| 81.5 | Option: Schedule Call | Option Card |
| 81.6 | View support hours | Hours Display |
| 81.7 | Select preferred option | Selection |

---

## Flow 82: Live Chat with Support

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 82.1 | Tap "Live Chat" | Button |
| 82.2 | Chat widget opens | Chat Window |
| 82.3 | View queue position | Queue Display |
| 82.4 | Connected to agent | Connected State |
| 82.5 | Exchange messages | Chat Interface |
| 82.6 | Attach files | Attachment Button |
| 82.7 | End chat | End Button |
| 82.8 | Rate experience | Rating Prompt |
| 82.9 | Transcript emailed | Email |

---

## Flow 83: Schedule a Call

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 83.1 | Tap "Schedule Call" | Button |
| 83.2 | Select date | Date Picker |
| 83.3 | Select time slot | Time Slots |
| 83.4 | Enter topic | Text Area |
| 83.5 | Enter callback number | Phone Input |
| 83.6 | Confirm booking | Confirm Button |
| 83.7 | Calendar invite sent | Email |
| 83.8 | Handle success | Success Toast |

---

## Flow 84: View Help Center

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 84.1 | Navigate to Help then Help Center | Navigation |
| 84.2 | View help categories | Category Grid |
| 84.3 | Categories: Getting Started, Profile, Events, Analytics | Categories |
| 84.4 | Tap category to browse | Navigation |
| 84.5 | View articles in category | Article List |
| 84.6 | Search help center | Search Input |
| 84.7 | View popular articles | Popular Section |

---

## Flow 85: Search Help Articles

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 85.1 | Tap search in Help Center | Search Focus |
| 85.2 | Enter search query | Text Input |
| 85.3 | View suggestions | Suggestions |
| 85.4 | Submit search | Search Action |
| 85.5 | View matching articles | Results List |
| 85.6 | No results: suggest contact support | Empty State |
| 85.7 | Tap article to read | Selection |
| 85.8 | Article helpful feedback | Feedback Prompt |

---

## Flow 86: Watch Tutorial Videos

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 86.1 | Navigate to Help then Tutorials | Navigation |
| 86.2 | View video library | Video Grid |
| 86.3 | Categories: Profile Setup, Analytics, Guest Lists | Categories |
| 86.4 | Tap video to play | Selection |
| 86.5 | Video player opens | Video Player |
| 86.6 | Playback controls | Controls |
| 86.7 | Related videos | Related Section |

---

## Flow 87: View Getting Started Guide

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 87.1 | Navigate to Help then Getting Started | Navigation |
| 87.2 | View onboarding checklist | Checklist |
| 87.3 | Steps: Complete profile, Add photos, Link streaming | Steps |
| 87.4 | Completed steps checked | Progress |
| 87.5 | Tap step for guidance | Selection |
| 87.6 | View instructions | Guide View |
| 87.7 | Mark as complete | Completion Button |
| 87.8 | Progress percentage | Progress Display |

---

## Flow 88: View Best Practices

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 88.1 | Navigate to Help then Best Practices | Navigation |
| 88.2 | View topics | Topic List |
| 88.3 | Topics: Growing Followers, Promoting Events, Using Analytics | Topics |
| 88.4 | Tap topic to read | Selection |
| 88.5 | View recommendations | Article View |
| 88.6 | Actionable tips | Tips List |

---

## Flow 89: Submit Bug Report

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 89.1 | Navigate to Help then Report Bug | Navigation |
| 89.2 | Enter bug title | Text Input |
| 89.3 | Describe the bug | Text Area |
| 89.4 | Steps to reproduce | Text Area |
| 89.5 | Attach screenshots | File Upload |
| 89.6 | Browser/device info auto-captured | Auto-Fill |
| 89.7 | Submit report | Submit Button |
| 89.8 | Bug ticket created | Ticket ID |
| 89.9 | Handle success | Success Toast |

---

## Flow 90: Request Feature

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 90.1 | Navigate to Help then Feature Requests | Navigation |
| 90.2 | View existing requests | Request List |
| 90.3 | Tap "New Request" | Button |
| 90.4 | Enter feature title | Text Input |
| 90.5 | Describe the feature | Text Area |
| 90.6 | Explain use case | Text Area |
| 90.7 | Submit request | Submit Button |
| 90.8 | Handle success | Success Toast |

---

## Flow 91: Submit Feedback

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 91.1 | Navigate to Help then Feedback | Navigation |
| 91.2 | Select feedback type | Type Selector |
| 91.3 | Enter feedback | Text Area |
| 91.4 | Rate experience (optional) | Star Rating |
| 91.5 | Submit feedback | Submit Button |
| 91.6 | Handle success | Success Toast |

---

## Flow 92: View Support Tickets

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 92.1 | Navigate to Help then My Tickets | Navigation |
| 92.2 | View ticket list | Ticket List |
| 92.3 | Each shows: ID, subject, status, date | List Item |
| 92.4 | Filter by status | Status Filter |
| 92.5 | Tap ticket to view | Selection |
| 92.6 | View conversation | Conversation View |
| 92.7 | Add reply | Reply Button |
| 92.8 | Close ticket | Close Button |

---

## Flow 93: View Platform Status

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 93.1 | Navigate to Help then System Status | Navigation |
| 93.2 | View overall status | Status Badge |
| 93.3 | View component status | Component List |
| 93.4 | View incident history | Incident List |
| 93.5 | View uptime percentage | Uptime Display |
| 93.6 | Subscribe to updates | Subscribe Button |

---

## Flow 94: View Platform Announcements

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 94.1 | Navigate to Help then Announcements | Navigation |
| 94.2 | View announcement list | Announcement List |
| 94.3 | Each shows: date, title, category | List Item |
| 94.4 | Tap to read full announcement | Selection |
| 94.5 | Mark as read | Read Status |

---

## Flow 95: Subscribe to Updates

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 95.1 | Navigate to Help then Notifications | Navigation |
| 95.2 | Toggle: Platform announcements | Toggle |
| 95.3 | Toggle: New feature alerts | Toggle |
| 95.4 | Toggle: Maintenance notifications | Toggle |
| 95.5 | Select channel: Email, Push | Channel Selector |
| 95.6 | Save preferences | Save Button |
| 95.7 | Handle success | Success Toast |

---

## Flow 96: View Terms of Service

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 96.1 | Navigate to Help then Legal then Terms | Navigation |
| 96.2 | View terms document | Document View |
| 96.3 | Scroll through content | Scroll |
| 96.4 | Download PDF | Download Button |

---

## Flow 97: View Privacy Policy

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 97.1 | Navigate to Help then Legal then Privacy | Navigation |
| 97.2 | View privacy policy | Document View |
| 97.3 | Scroll through content | Scroll |
| 97.4 | Download PDF | Download Button |

---

## Flow 98: Request Data Export

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 98.1 | Navigate to Settings then Privacy | Navigation |
| 98.2 | Tap "Export My Data" | Button |
| 98.3 | Select data categories | Checkboxes |
| 98.4 | Select format | Format Selector |
| 98.5 | Submit request | Submit Button |
| 98.6 | Request queued | Queued State |
| 98.7 | Email when ready | Email Notice |
| 98.8 | Download link provided | Download |
| 98.9 | Link expires after X days | Expiry Note |

---

# End of Artist User Flows

