# TicketToken — Admin User Flows

Generated: 2024-12-28
Total Flows: 165
Total Steps: TBD

---

## Summary

| Section | Flows | Flow Numbers |
|---------|-------|--------------|
| Account | 11 | 1-11 |
| Dashboard | 16 | 12-27 |
| User Management - Fans | 13 | 28-40 |
| User Management - Venues | 17 | 41-57 |
| User Management - Artists | 16 | 58-73 |
| Event Oversight | 13 | 74-86 |
| Financial | 14 | 87-100 |
| Content Moderation | 10 | 101-110 |
| Support Tickets | 15 | 111-125 |
| Platform Settings | 18 | 126-143 |
| Compliance | 12 | 144-155 |
| Analytics | 14 | 156-169 |
| **Total** | **169** | |

---

## Flow Index

### Account (Flows 1-11)
1. Log In
2. Reset Password
3. Enable 2FA
4. Edit Profile
5. Invite Admin
6. Accept Admin Invite
7. Set Admin Permissions
8. Edit Admin Permissions
9. Remove Admin
10. Transfer Ownership
11. View Audit Log

### Dashboard (Flows 12-27)
12. View Dashboard
13. View Revenue Summary
14. View Revenue Breakdown
15. View Platform Fees Earned
16. View Venue Metrics
17. View Artist Metrics
18. View Fan Metrics
19. View Event Metrics
20. View Ticket Metrics
21. View Sales Velocity
22. View Top Venues
23. View Top Events
24. View Recent Activity
25. View Alerts
26. Acknowledge Alert
27. Customize Dashboard

### User Management - Fans (Flows 28-40)
28. View All Fans
29. Search Fans
30. Filter Fans
31. View Fan Profile
32. View Fan Activity
33. View Fan Tickets
34. View Fan Payment Methods
35. Edit Fan Account
36. Flag Fan
37. Suspend Fan Account
38. Unsuspend Fan Account
39. Delete Fan Account
40. Impersonate Fan

### User Management - Venues (Flows 41-57)
41. View All Venues
42. Search Venues
43. Filter Venues
44. View Venue Profile
45. View Venue Events
46. View Venue Sales
47. View Venue Payouts
48. View Venue Team
49. Send Venue Invite
50. View Onboarding Status
51. Edit Venue Account
52. View Venue Health
53. Flag Venue
54. Suspend Venue Account
55. Unsuspend Venue Account
56. Delete Venue Account
57. Impersonate Venue

### User Management - Artists (Flows 58-73)
58. View All Artists
59. Search Artists
60. Filter Artists
61. View Artist Profile
62. View Artist Events
63. View Artist Revenue
64. View Invited By
65. View Artist Team
66. Send Artist Invite
67. Link Artist to Event
68. Edit Artist Account
69. Flag Artist
70. Suspend Artist Account
71. Unsuspend Artist Account
72. Delete Artist Account
73. Impersonate Artist

### Event Oversight (Flows 74-86)
74. View All Events
75. Search Events
76. Filter Events
77. View Event Details
78. View Event Sales
79. View Event Resale Activity
80. View Event Refunds
81. View Event Issues
82. Create Event
83. Edit Event
84. Pause Event Sales
85. Resume Event Sales
86. Cancel Event

### Financial (Flows 87-100)
87. View Revenue Overview
88. View Revenue by Period
89. View Revenue by Venue
90. View Revenue by Event
91. View Platform Fees
92. View Resale Royalties
93. View Stripe Balance
94. View All Payouts
95. View Payout Details
96. View Failed Payouts
97. View Refund Activity
98. View Chargeback Activity
99. Set Venue Fee Rate
100. Export Financial Data

### Content Moderation (Flows 101-110)
101. View Moderation Queue
102. View Auto-Flagged Content
103. View User-Reported Content
104. View Venue-Reported Content
105. Review Flagged Item
106. Approve Content
107. Remove Content
108. Warn User
109. View Moderation History
110. Manage Auto-Moderation Rules

### Support Tickets (Flows 111-125)
111. View All Tickets
112. View Ticket Queue
113. Search Tickets
114. Filter Tickets
115. View Ticket Details
116. View User Context
117. Assign Ticket
118. Reply to Ticket
119. Add Internal Note
120. Escalate Ticket
121. Resolve Ticket
122. Reopen Ticket
123. View Ticket History
124. Use Canned Response
125. Manage Canned Responses

### Platform Settings (Flows 126-143)
126. View Platform Settings
127. Set Default Platform Fee
128. Set Default Resale Fee
129. Set Payout Schedule
130. Manage Ticket Types
131. Manage Event Categories
132. Manage Genres
133. Set Platform Policies
134. Manage Email Templates
135. Manage Feature Flags - System
136. Manage Feature Flags - Venue
137. Emergency Kill Switch
138. Set Maintenance Mode
139. Manage Platform Branding
140. Manage API Keys
141. Manage Webhooks
142. View Platform Logs
143. View Error Logs

### Compliance (Flows 144-155)
144. View Data Requests
145. Process Data Export
146. View Deletion Requests
147. Process Deletion Request
148. View Consent Records
149. Update Privacy Policy
150. Update Terms of Service
151. View Compliance Log
152. Set Legal Hold
153. Remove Legal Hold
154. View Venue Tax Documents
155. View 1099 Status

### Analytics (Flows 156-169)
156. View Platform Analytics
157. View Sales Analytics
158. View User Analytics
159. View Venue Analytics
160. View Artist Analytics
161. View Event Analytics
162. View Geographic Analytics
163. View Resale Analytics
164. Compare Periods
165. View Funnel Analytics
166. View Cohort Analysis
167. Create Custom Report
168. Save Custom Report
169. Export Analytics

---

# Account Flows

---

## Flow 1: Log In

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 1.1 | Navigate to admin portal | Website |
| 1.2 | Enter email | Email Input |
| 1.3 | Enter password | Password Input |
| 1.4 | Tap "Log In" | Submit Button |
| 1.5 | 2FA required | 2FA Screen |
| 1.6 | Enter 2FA code | Code Input |
| 1.7 | Handle success: go to dashboard | Dashboard |
| 1.8 | Handle error (wrong password) | Error State |
| 1.9 | Handle locked account | Locked State |
| 1.10 | "Forgot Password" link: Flow 2 | Link |

---

## Flow 2: Reset Password

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 2.1 | Tap "Forgot Password" | Link |
| 2.2 | Enter email | Email Input |
| 2.3 | Submit request | Loading State |
| 2.4 | Show "check your email" message | Confirmation |
| 2.5 | User opens email | External |
| 2.6 | Tap reset link | Email Link |
| 2.7 | Open reset password page | Reset Page |
| 2.8 | Enter new password | Password Input |
| 2.9 | Confirm new password | Password Input |
| 2.10 | Submit | Loading State |
| 2.11 | Handle success: go to login | Success |
| 2.12 | Handle error (link expired) | Error State |

---

## Flow 3: Enable 2FA

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 3.1 | Navigate to Settings then Security | Navigation |
| 3.2 | 2FA required for all admins | Requirement Note |
| 3.3 | Choose method (SMS, Authenticator) | Options |
| 3.4 | If SMS: verify phone number | Phone Verification |
| 3.5 | If Authenticator: display QR code | QR Display |
| 3.6 | Scan QR with authenticator app | External |
| 3.7 | Enter verification code | Code Input |
| 3.8 | Submit | Loading State |
| 3.9 | Handle success: 2FA enabled | Success |
| 3.10 | Display backup codes | Backup Codes |
| 3.11 | Prompt to save backup codes | Warning |
| 3.12 | Confirm codes saved | Checkbox |

---

## Flow 4: Edit Profile

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 4.1 | Navigate to Settings then Profile | Navigation |
| 4.2 | View current profile info | Profile Screen |
| 4.3 | Edit name | Text Input |
| 4.4 | Edit email (requires re-verification) | Email Input |
| 4.5 | Edit phone | Phone Input |
| 4.6 | Upload profile photo | Image Upload |
| 4.7 | Save changes | Save Button |
| 4.8 | Handle success | Success Toast |
| 4.9 | Handle error | Error State |

---

## Flow 5: Invite Admin

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 5.1 | Navigate to Settings then Team | Navigation |
| 5.2 | View admin list | Admin List |
| 5.3 | Tap "Invite Admin" | Button |
| 5.4 | Enter email address | Email Input |
| 5.5 | Enter name | Name Input |
| 5.6 | Set permissions | Permission Checkboxes |
| 5.7 | Permissions: Users, Events, Financials, Support, Settings, Full Access | Options |
| 5.8 | Add personal message (optional) | Text Input |
| 5.9 | Send invitation | Loading State |
| 5.10 | Handle success: invite sent | Success |
| 5.11 | Invite appears in pending list | Pending List |
| 5.12 | Resend invite option | Resend Button |
| 5.13 | Cancel invite option | Cancel Button |

---

## Flow 6: Accept Admin Invite

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 6.1 | Receive invite email | Email |
| 6.2 | Tap "Accept Invitation" link | Email Link |
| 6.3 | Open invite acceptance page | Website |
| 6.4 | Create password | Password Input |
| 6.5 | Confirm password | Password Input |
| 6.6 | Set up 2FA (required) | 2FA Flow |
| 6.7 | Accept terms | Checkbox |
| 6.8 | Submit | Loading State |
| 6.9 | Handle success: account created | Success |
| 6.10 | Redirect to admin dashboard | Dashboard |

---

## Flow 7: Set Admin Permissions

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 7.1 | Navigate to Settings then Team | Navigation |
| 7.2 | View admin list | Admin List |
| 7.3 | Tap admin | Selection |
| 7.4 | View admin details | Admin Detail |
| 7.5 | View current permissions | Permission List |
| 7.6 | Toggle: Users permission | Toggle |
| 7.7 | Toggle: Events permission | Toggle |
| 7.8 | Toggle: Financials permission | Toggle |
| 7.9 | Toggle: Support permission | Toggle |
| 7.10 | Toggle: Settings permission | Toggle |
| 7.11 | Toggle: Full Access | Toggle |
| 7.12 | Save changes | Save Button |
| 7.13 | Handle success | Success Toast |
| 7.14 | Admin notified of changes | Notification |
| 7.15 | Audit log entry created | Logging |

---

## Flow 8: Edit Admin Permissions

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 8.1 | Navigate to Settings then Team | Navigation |
| 8.2 | Tap admin | Selection |
| 8.3 | Tap "Edit Permissions" | Button |
| 8.4 | Modify permission toggles | Toggles |
| 8.5 | Save changes | Save Button |
| 8.6 | Handle success | Success Toast |
| 8.7 | Admin notified of changes | Notification |
| 8.8 | Audit log entry created | Logging |

---

## Flow 9: Remove Admin

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 9.1 | Navigate to Settings then Team | Navigation |
| 9.2 | Tap admin | Selection |
| 9.3 | Tap "Remove Admin" | Button |
| 9.4 | Cannot remove Owner | Validation |
| 9.5 | Cannot remove self | Validation |
| 9.6 | Confirm removal | Confirmation Dialog |
| 9.7 | Enter reason (optional) | Text Input |
| 9.8 | Submit removal | Loading State |
| 9.9 | Handle success: admin removed | Success |
| 9.10 | Admin loses access immediately | Access Revoked |
| 9.11 | Admin notified | Email |
| 9.12 | Audit log entry created | Logging |

---

## Flow 10: Transfer Ownership

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 10.1 | Navigate to Settings then Team | Navigation |
| 10.2 | Tap "Transfer Ownership" | Button |
| 10.3 | Only Owner can see this | Permission Check |
| 10.4 | Select new owner from admins | Admin Selector |
| 10.5 | Review what transfers | Info Display |
| 10.6 | Enter password to confirm | Password Input |
| 10.7 | Enter 2FA code to confirm | 2FA Input |
| 10.8 | Confirm transfer | Confirmation Dialog |
| 10.9 | Submit | Loading State |
| 10.10 | Handle success: ownership transferred | Success |
| 10.11 | You become regular admin | Role Change |
| 10.12 | New owner notified | Email |
| 10.13 | Audit log entry created | Logging |

---

## Flow 11: View Audit Log

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 11.1 | Navigate to Settings then Audit Log | Navigation |
| 11.2 | Load audit entries | Loading State |
| 11.3 | Display log entries | Log List |
| 11.4 | Each entry shows: date, admin, action, target, details | Log Entry |
| 11.5 | Filter by date range | Date Filter |
| 11.6 | Filter by admin | Admin Filter |
| 11.7 | Filter by action type | Action Filter |
| 11.8 | Search log | Search Input |
| 11.9 | View entry details | Detail Modal |
| 11.10 | Export audit log | Export Button |
| 11.11 | Audit log cannot be deleted | Security Note |

---

# Dashboard Flows

---

## Flow 12: View Dashboard

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 12.1 | Log in or navigate to Dashboard | Navigation |
| 12.2 | Load dashboard data | Loading State |
| 12.3 | View command center | Dashboard Screen |
| 12.4 | Key metrics displayed | Metrics Grid |
| 12.5 | Charts and graphs displayed | Visualizations |
| 12.6 | Alerts section visible | Alerts Panel |
| 12.7 | Recent activity visible | Activity Feed |
| 12.8 | Refresh button | Refresh Button |
| 12.9 | Last updated timestamp | Timestamp |

---

## Flow 13: View Revenue Summary

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 13.1 | View revenue widget on dashboard | Widget |
| 13.2 | View today's revenue | Metric |
| 13.3 | View this week's revenue | Metric |
| 13.4 | View this month's revenue | Metric |
| 13.5 | View this year's revenue | Metric |
| 13.6 | View all-time revenue | Metric |
| 13.7 | Compare to previous period | Comparison |
| 13.8 | Tap for detailed breakdown | Navigation |

---

## Flow 14: View Revenue Breakdown

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 14.1 | From revenue summary, tap "Details" | Navigation |
| 14.2 | Load breakdown data | Loading State |
| 14.3 | View revenue by venue | Table/Chart |
| 14.4 | View revenue by event | Table/Chart |
| 14.5 | View revenue by ticket type | Table/Chart |
| 14.6 | View revenue by day/week/month | Chart |
| 14.7 | Filter by date range | Date Filter |
| 14.8 | Export data | Export Button |

---

## Flow 15: View Platform Fees Earned

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 15.1 | View platform fees widget on dashboard | Widget |
| 15.2 | View total fees earned | Metric |
| 15.3 | View fees by period | Period Selector |
| 15.4 | View fees from primary sales | Metric |
| 15.5 | View fees from resales | Metric |
| 15.6 | View fees by venue | Breakdown |
| 15.7 | Compare to previous period | Comparison |
| 15.8 | Tap for detailed breakdown | Navigation |

---

## Flow 16: View Venue Metrics

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 16.1 | View venue widget on dashboard | Widget |
| 16.2 | View total venues | Metric |
| 16.3 | View active venues | Metric |
| 16.4 | View new venues this period | Metric |
| 16.5 | View venues pending onboarding | Metric |
| 16.6 | Compare to previous period | Comparison |
| 16.7 | Tap for venue list | Navigation |

---

## Flow 17: View Artist Metrics

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 17.1 | View artist widget on dashboard | Widget |
| 17.2 | View total artists | Metric |
| 17.3 | View active artists | Metric |
| 17.4 | View new artists this period | Metric |
| 17.5 | Compare to previous period | Comparison |
| 17.6 | Tap for artist list | Navigation |

---

## Flow 18: View Fan Metrics

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 18.1 | View fan widget on dashboard | Widget |
| 18.2 | View total fans | Metric |
| 18.3 | View active fans | Metric |
| 18.4 | View new fans this period | Metric |
| 18.5 | Compare to previous period | Comparison |
| 18.6 | Tap for fan list | Navigation |

---

## Flow 19: View Event Metrics

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 19.1 | View event widget on dashboard | Widget |
| 19.2 | View total events | Metric |
| 19.3 | View upcoming events | Metric |
| 19.4 | View completed events | Metric |
| 19.5 | View cancelled events | Metric |
| 19.6 | Compare to previous period | Comparison |
| 19.7 | Tap for event list | Navigation |

---

## Flow 20: View Ticket Metrics

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 20.1 | View ticket widget on dashboard | Widget |
| 20.2 | View tickets sold this period | Metric |
| 20.3 | View ticket revenue | Metric |
| 20.4 | View refunds issued | Metric |
| 20.5 | View resale volume | Metric |
| 20.6 | Compare to previous period | Comparison |
| 20.7 | Tap for details | Navigation |

---

## Flow 21: View Sales Velocity

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 21.1 | View sales velocity widget on dashboard | Widget |
| 21.2 | View sales per day trend | Chart |
| 21.3 | View sales per week trend | Chart |
| 21.4 | Identify peaks and dips | Visual Indicators |
| 21.5 | Compare to previous period | Comparison Line |
| 21.6 | Tap for details | Navigation |

---

## Flow 22: View Top Venues

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 22.1 | View top venues widget on dashboard | Widget |
| 22.2 | View ranked list of venues | Ranked List |
| 22.3 | Ranked by revenue | Default Sort |
| 22.4 | Show venue name, revenue, tickets sold | List Item |
| 22.5 | Toggle sort: revenue, tickets, events | Sort Options |
| 22.6 | Tap venue for details | Navigation |

---

## Flow 23: View Top Events

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 23.1 | View top events widget on dashboard | Widget |
| 23.2 | View ranked list of events | Ranked List |
| 23.3 | Ranked by revenue | Default Sort |
| 23.4 | Show event name, venue, revenue, tickets sold | List Item |
| 23.5 | Toggle sort: revenue, tickets | Sort Options |
| 23.6 | Tap event for details | Navigation |

---

## Flow 24: View Recent Activity

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 24.1 | View activity feed on dashboard | Feed Panel |
| 24.2 | Shows recent signups | Activity Item |
| 24.3 | Shows recent events created | Activity Item |
| 24.4 | Shows recent sales | Activity Item |
| 24.5 | Shows recent refunds | Activity Item |
| 24.6 | Timestamp on each item | Timestamp |
| 24.7 | Tap item for details | Navigation |
| 24.8 | Refresh to see latest | Refresh Button |

---

## Flow 25: View Alerts

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 25.1 | View alerts panel on dashboard | Alerts Panel |
| 25.2 | Alert count badge | Badge |
| 25.3 | Alert types: payout failed, high refunds, system error, suspicious activity | Alert Types |
| 25.4 | Each alert shows: type, message, time, severity | Alert Item |
| 25.5 | Severity: info, warning, critical | Severity Levels |
| 25.6 | Critical alerts highlighted | Visual Highlight |
| 25.7 | Tap alert for details | Navigation |

---

## Flow 26: Acknowledge Alert

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 26.1 | View alert details | Alert Detail |
| 26.2 | Read alert information | Content |
| 26.3 | Take action if needed | Action Links |
| 26.4 | Tap "Acknowledge" | Button |
| 26.5 | Add note (optional) | Text Input |
| 26.6 | Alert marked as acknowledged | Status Update |
| 26.7 | Alert moves to history | List Update |
| 26.8 | Audit log entry created | Logging |

---

## Flow 27: Customize Dashboard

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 27.1 | Tap "Customize" on dashboard | Button |
| 27.2 | Enter edit mode | Edit Mode |
| 27.3 | View available widgets | Widget List |
| 27.4 | Drag widgets to rearrange | Drag Action |
| 27.5 | Toggle widgets on/off | Toggles |
| 27.6 | Resize widgets | Resize Handles |
| 27.7 | Save layout | Save Button |
| 27.8 | Cancel changes | Cancel Button |
| 27.9 | Reset to default | Reset Button |

---

# User Management - Fans Flows

---

## Flow 28: View All Fans

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 28.1 | Navigate to Users then Fans | Navigation |
| 28.2 | Load fan list | Loading State |
| 28.3 | Display fan table | Table View |
| 28.4 | Columns: Name, Email, Status, Signup Date, Activity | Columns |
| 28.5 | Pagination | Pagination |
| 28.6 | Sort by any column | Sort Action |
| 28.7 | Tap fan for details | Selection |

---

## Flow 29: Search Fans

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 29.1 | Tap search field | Search Focus |
| 29.2 | Enter search query | Text Input |
| 29.3 | Search by: name, email, phone | Search Scope |
| 29.4 | Submit search | Search Action |
| 29.5 | View matching results | Results List |
| 29.6 | No results state | Empty State |
| 29.7 | Clear search | Clear Button |

---

## Flow 30: Filter Fans

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 30.1 | Tap "Filter" | Button |
| 30.2 | Open filter panel | Filter Panel |
| 30.3 | Filter by status (Active, Suspended, Flagged) | Status Checkboxes |
| 30.4 | Filter by signup date | Date Range |
| 30.5 | Filter by last activity | Date Range |
| 30.6 | Apply filters | Apply Button |
| 30.7 | View active filter count | Badge |
| 30.8 | Clear all filters | Clear Button |

---

## Flow 31: View Fan Profile

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 31.1 | Tap fan from list | Navigation |
| 31.2 | Load fan profile | Loading State |
| 31.3 | View account info | Info Section |
| 31.4 | Name, email, phone | Fields |
| 31.5 | Signup date | Field |
| 31.6 | Last login | Field |
| 31.7 | Account status | Status Badge |
| 31.8 | Flags (if any) | Flag Badges |
| 31.9 | Quick actions | Action Buttons |

---

## Flow 32: View Fan Activity

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 32.1 | From fan profile, tap "Activity" | Tab |
| 32.2 | Load activity data | Loading State |
| 32.3 | View purchase history | Purchase List |
| 32.4 | View events attended | Event List |
| 32.5 | View resale activity | Resale List |
| 32.6 | View support tickets | Ticket List |
| 32.7 | Filter by date | Date Filter |
| 32.8 | Export activity | Export Button |

---

## Flow 33: View Fan Tickets

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 33.1 | From fan profile, tap "Tickets" | Tab |
| 33.2 | Load ticket data | Loading State |
| 33.3 | View current tickets | Current List |
| 33.4 | View past tickets | Past List |
| 33.5 | View transferred tickets | Transfer List |
| 33.6 | View resold tickets | Resale List |
| 33.7 | Tap ticket for details | Selection |

---

## Flow 34: View Fan Payment Methods

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 34.1 | From fan profile, tap "Payments" | Tab |
| 34.2 | Fetch from Stripe | Loading State |
| 34.3 | View saved payment methods | Payment List |
| 34.4 | Show: card type, last 4 digits, expiry | Card Info |
| 34.5 | Note: Full card info not accessible | Security Note |
| 34.6 | View recent transactions | Transaction List |

---

## Flow 35: Edit Fan Account

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 35.1 | From fan profile, tap "Edit" | Button |
| 35.2 | Enter edit mode | Edit Mode |
| 35.3 | Edit name | Text Input |
| 35.4 | Edit email | Email Input |
| 35.5 | Edit phone | Phone Input |
| 35.6 | Save changes | Save Button |
| 35.7 | Enter reason for edit | Text Input |
| 35.8 | Handle success | Success Toast |
| 35.9 | Audit log entry created | Logging |
| 35.10 | Fan notified of changes | Email |

---

## Flow 36: Flag Fan

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 36.1 | From fan profile, tap "Flag" | Button |
| 36.2 | Select flag reason | Reason Dropdown |
| 36.3 | Reasons: Suspicious activity, Fraud risk, Multiple accounts, Other | Options |
| 36.4 | Add notes | Text Input |
| 36.5 | Submit flag | Submit Button |
| 36.6 | Handle success | Success Toast |
| 36.7 | Flag badge appears on profile | Badge |
| 36.8 | Audit log entry created | Logging |
| 36.9 | Remove flag option | Remove Button |

---

## Flow 37: Suspend Fan Account

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 37.1 | From fan profile, tap "Suspend" | Button |
| 37.2 | Select suspension reason | Reason Dropdown |
| 37.3 | Reasons: TOS violation, Fraud, Abuse, Other | Options |
| 37.4 | Set suspension duration | Duration Selector |
| 37.5 | Options: 7 days, 30 days, Permanent | Options |
| 37.6 | Add notes | Text Input |
| 37.7 | Confirm suspension | Confirmation Dialog |
| 37.8 | Submit | Loading State |
| 37.9 | Handle success | Success Toast |
| 37.10 | Account suspended | Status Update |
| 37.11 | Fan cannot log in | Enforcement |
| 37.12 | Fan notified | Email |
| 37.13 | Audit log entry created | Logging |

---

## Flow 38: Unsuspend Fan Account

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 38.1 | From suspended fan profile, tap "Unsuspend" | Button |
| 38.2 | Add reason for unsuspension | Text Input |
| 38.3 | Confirm unsuspension | Confirmation Dialog |
| 38.4 | Submit | Loading State |
| 38.5 | Handle success | Success Toast |
| 38.6 | Account restored | Status Update |
| 38.7 | Fan can log in again | Enforcement |
| 38.8 | Fan notified | Email |
| 38.9 | Audit log entry created | Logging |

---

## Flow 39: Delete Fan Account

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 39.1 | From fan profile, tap "Delete" | Button |
| 39.2 | Show warning | Warning Modal |
| 39.3 | Warning: This is permanent | Warning Text |
| 39.4 | Review data to be deleted | Data Summary |
| 39.5 | Enter reason for deletion | Text Input |
| 39.6 | Type "DELETE" to confirm | Confirmation Input |
| 39.7 | Submit | Loading State |
| 39.8 | Handle success | Success Toast |
| 39.9 | Account deleted | Deletion |
| 39.10 | Data removed per compliance | Data Removal |
| 39.11 | Audit log entry created | Logging |

---

## Flow 40: Impersonate Fan

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 40.1 | From fan profile, tap "Impersonate" | Button |
| 40.2 | Show impersonation warning | Warning Modal |
| 40.3 | Warning: Actions will be logged | Warning Text |
| 40.4 | Enter reason for impersonation | Text Input |
| 40.5 | Confirm | Confirm Button |
| 40.6 | Session opened as fan | New Session |
| 40.7 | Impersonation banner visible | Banner |
| 40.8 | View platform as fan sees it | Fan View |
| 40.9 | All actions logged | Logging |
| 40.10 | Tap "End Impersonation" to return | End Button |
| 40.11 | Return to admin dashboard | Navigation |
| 40.12 | Audit log entry created | Logging |

---

# User Management - Venues Flows

---

## Flow 41: View All Venues

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 41.1 | Navigate to Users then Venues | Navigation |
| 41.2 | Load venue list | Loading State |
| 41.3 | Display venue table | Table View |
| 41.4 | Columns: Name, Location, Status, Events, Revenue | Columns |
| 41.5 | Pagination | Pagination |
| 41.6 | Sort by any column | Sort Action |
| 41.7 | Tap venue for details | Selection |

---

## Flow 42: Search Venues

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 42.1 | Tap search field | Search Focus |
| 42.2 | Enter search query | Text Input |
| 42.3 | Search by: name, location, owner email | Search Scope |
| 42.4 | Submit search | Search Action |
| 42.5 | View matching results | Results List |
| 42.6 | No results state | Empty State |
| 42.7 | Clear search | Clear Button |

---

## Flow 43: Filter Venues

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 43.1 | Tap "Filter" | Button |
| 43.2 | Open filter panel | Filter Panel |
| 43.3 | Filter by status (Active, Suspended, Onboarding) | Status Checkboxes |
| 43.4 | Filter by signup date | Date Range |
| 43.5 | Filter by activity level | Activity Selector |
| 43.6 | Filter by health (Green, Yellow, Red) | Health Selector |
| 43.7 | Apply filters | Apply Button |
| 43.8 | View active filter count | Badge |
| 43.9 | Clear all filters | Clear Button |

---

## Flow 44: View Venue Profile

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 44.1 | Tap venue from list | Navigation |
| 44.2 | Load venue profile | Loading State |
| 44.3 | View account info | Info Section |
| 44.4 | Venue name, address | Fields |
| 44.5 | Owner name, email | Fields |
| 44.6 | Signup date | Field |
| 44.7 | Account status | Status Badge |
| 44.8 | Health indicator | Health Badge |
| 44.9 | Onboarding status | Progress Display |
| 44.10 | Quick actions | Action Buttons |

---

## Flow 45: View Venue Events

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 45.1 | From venue profile, tap "Events" | Tab |
| 45.2 | Load events data | Loading State |
| 45.3 | View upcoming events | Upcoming List |
| 45.4 | View past events | Past List |
| 45.5 | View cancelled events | Cancelled List |
| 45.6 | Each shows: name, date, tickets sold, revenue | List Item |
| 45.7 | Tap event for details | Selection |
| 45.8 | Export events | Export Button |

---

## Flow 46: View Venue Sales

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 46.1 | From venue profile, tap "Sales" | Tab |
| 46.2 | Load sales data | Loading State |
| 46.3 | View total revenue | Metric |
| 46.4 | View total tickets sold | Metric |
| 46.5 | View revenue over time | Chart |
| 46.6 | View sales by event | Table |
| 46.7 | View refund rate | Metric |
| 46.8 | Filter by date range | Date Filter |
| 46.9 | Export sales data | Export Button |

---

## Flow 47: View Venue Payouts

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 47.1 | From venue profile, tap "Payouts" | Tab |
| 47.2 | Load payout data | Loading State |
| 47.3 | View pending payouts | Pending List |
| 47.4 | View completed payouts | History List |
| 47.5 | View failed payouts | Failed List |
| 47.6 | Each shows: date, amount, status | List Item |
| 47.7 | Tap payout for details | Selection |
| 47.8 | Export payout data | Export Button |

---

## Flow 48: View Venue Team

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 48.1 | From venue profile, tap "Team" | Tab |
| 48.2 | Load team data | Loading State |
| 48.3 | View team members | Team List |
| 48.4 | Each shows: name, email, role, status | List Item |
| 48.5 | View owner | Owner Highlight |
| 48.6 | View permissions per member | Permissions |
| 48.7 | Tap member for details | Selection |

---

## Flow 49: Send Venue Invite

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 49.1 | Navigate to Users then Venues | Navigation |
| 49.2 | Tap "Invite Venue" | Button |
| 49.3 | Enter venue name | Text Input |
| 49.4 | Enter owner email | Email Input |
| 49.5 | Enter owner name | Text Input |
| 49.6 | Add personal message (optional) | Text Area |
| 49.7 | Set custom fee rate (optional) | Percentage Input |
| 49.8 | Send invitation | Send Button |
| 49.9 | Handle success | Success Toast |
| 49.10 | Invite email sent | Email |
| 49.11 | Venue appears in Onboarding status | List Update |
| 49.12 | Audit log entry created | Logging |

---

## Flow 50: View Onboarding Status

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 50.1 | From venue profile, view onboarding | Status Section |
| 50.2 | Step 1: Account Created | Checkbox |
| 50.3 | Step 2: Profile Complete | Checkbox |
| 50.4 | Step 3: Stripe Connected | Checkbox |
| 50.5 | Step 4: First Event Created | Checkbox |
| 50.6 | Step 5: First Ticket Sold | Checkbox |
| 50.7 | Overall progress percentage | Progress Bar |
| 50.8 | Stuck indicator (no progress in X days) | Warning |
| 50.9 | Contact venue option | Contact Button |

---

## Flow 51: Edit Venue Account

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 51.1 | From venue profile, tap "Edit" | Button |
| 51.2 | Enter edit mode | Edit Mode |
| 51.3 | Edit venue name | Text Input |
| 51.4 | Edit owner email | Email Input |
| 51.5 | Edit fee rate | Percentage Input |
| 51.6 | Save changes | Save Button |
| 51.7 | Enter reason for edit | Text Input |
| 51.8 | Handle success | Success Toast |
| 51.9 | Audit log entry created | Logging |
| 51.10 | Venue notified of changes | Email |

---

## Flow 52: View Venue Health

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 52.1 | From venue profile, view health | Health Section |
| 52.2 | Overall health indicator | Green/Yellow/Red |
| 52.3 | Refund rate | Metric |
| 52.4 | Payout success rate | Metric |
| 52.5 | Support ticket count | Metric |
| 52.6 | Days since last event | Metric |
| 52.7 | Flags trigger yellow/red status | Logic |
| 52.8 | Recommendations | Suggestions |

---

## Flow 53: Flag Venue

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 53.1 | From venue profile, tap "Flag" | Button |
| 53.2 | Select flag reason | Reason Dropdown |
| 53.3 | Reasons: High refunds, Payout issues, TOS concern, Other | Options |
| 53.4 | Add notes | Text Input |
| 53.5 | Submit flag | Submit Button |
| 53.6 | Handle success | Success Toast |
| 53.7 | Flag badge appears on profile | Badge |
| 53.8 | Audit log entry created | Logging |
| 53.9 | Remove flag option | Remove Button |

---

## Flow 54: Suspend Venue Account

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 54.1 | From venue profile, tap "Suspend" | Button |
| 54.2 | Show warning | Warning Modal |
| 54.3 | Warning: Active events affected | Warning Text |
| 54.4 | Select suspension reason | Reason Dropdown |
| 54.5 | Set suspension duration | Duration Selector |
| 54.6 | Add notes | Text Input |
| 54.7 | Confirm suspension | Confirmation Dialog |
| 54.8 | Submit | Loading State |
| 54.9 | Handle success | Success Toast |
| 54.10 | Account suspended | Status Update |
| 54.11 | Venue cannot access dashboard | Enforcement |
| 54.12 | Event sales paused | Enforcement |
| 54.13 | Venue notified | Email |
| 54.14 | Audit log entry created | Logging |

---

## Flow 55: Unsuspend Venue Account

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 55.1 | From suspended venue profile, tap "Unsuspend" | Button |
| 55.2 | Add reason for unsuspension | Text Input |
| 55.3 | Confirm unsuspension | Confirmation Dialog |
| 55.4 | Submit | Loading State |
| 55.5 | Handle success | Success Toast |
| 55.6 | Account restored | Status Update |
| 55.7 | Event sales resumed | Enforcement |
| 55.8 | Venue notified | Email |
| 55.9 | Audit log entry created | Logging |

---

## Flow 56: Delete Venue Account

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 56.1 | From venue profile, tap "Delete" | Button |
| 56.2 | Show warning | Warning Modal |
| 56.3 | Warning: All events, data deleted | Warning Text |
| 56.4 | Must resolve pending payouts first | Validation |
| 56.5 | Must cancel active events first | Validation |
| 56.6 | Enter reason for deletion | Text Input |
| 56.7 | Type "DELETE" to confirm | Confirmation Input |
| 56.8 | Submit | Loading State |
| 56.9 | Handle success | Success Toast |
| 56.10 | Account deleted | Deletion |
| 56.11 | Venue notified | Email |
| 56.12 | Audit log entry created | Logging |

---

## Flow 57: Impersonate Venue

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 57.1 | From venue profile, tap "Impersonate" | Button |
| 57.2 | Show impersonation warning | Warning Modal |
| 57.3 | Warning: Actions will be logged | Warning Text |
| 57.4 | Enter reason for impersonation | Text Input |
| 57.5 | Confirm | Confirm Button |
| 57.6 | Session opened as venue | New Session |
| 57.7 | Impersonation banner visible | Banner |
| 57.8 | View venue dashboard as they see it | Venue View |
| 57.9 | All actions logged | Logging |
| 57.10 | Tap "End Impersonation" to return | End Button |
| 57.11 | Return to admin dashboard | Navigation |
| 57.12 | Audit log entry created | Logging |


---

# User Management - Artists Flows

---

## Flow 58: View All Artists

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 58.1 | Navigate to Users then Artists | Navigation |
| 58.2 | Load artist list | Loading State |
| 58.3 | Display artist table | Table View |
| 58.4 | Columns: Name, Genre, Status, Events, Revenue | Columns |
| 58.5 | Pagination | Pagination |
| 58.6 | Sort by any column | Sort Action |
| 58.7 | Tap artist for details | Selection |

---

## Flow 59: Search Artists

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 59.1 | Tap search field | Search Focus |
| 59.2 | Enter search query | Text Input |
| 59.3 | Search by: name, genre, email | Search Scope |
| 59.4 | Submit search | Search Action |
| 59.5 | View matching results | Results List |
| 59.6 | No results state | Empty State |
| 59.7 | Clear search | Clear Button |

---

## Flow 60: Filter Artists

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 60.1 | Tap "Filter" | Button |
| 60.2 | Open filter panel | Filter Panel |
| 60.3 | Filter by status (Active, Suspended, Flagged) | Status Checkboxes |
| 60.4 | Filter by genre | Genre Dropdown |
| 60.5 | Filter by signup date | Date Range |
| 60.6 | Filter by activity level | Activity Selector |
| 60.7 | Apply filters | Apply Button |
| 60.8 | View active filter count | Badge |
| 60.9 | Clear all filters | Clear Button |

---

## Flow 61: View Artist Profile

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 61.1 | Tap artist from list | Navigation |
| 61.2 | Load artist profile | Loading State |
| 61.3 | View account info | Info Section |
| 61.4 | Artist name, genres | Fields |
| 61.5 | Owner name, email | Fields |
| 61.6 | Signup date | Field |
| 61.7 | Account status | Status Badge |
| 61.8 | Verification status | Verification Badge |
| 61.9 | Quick actions | Action Buttons |

---

## Flow 62: View Artist Events

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 62.1 | From artist profile, tap "Events" | Tab |
| 62.2 | Load events data | Loading State |
| 62.3 | View upcoming events | Upcoming List |
| 62.4 | View past events | Past List |
| 62.5 | Each shows: name, venue, date, tickets sold | List Item |
| 62.6 | Tap event for details | Selection |
| 62.7 | Export events | Export Button |

---

## Flow 63: View Artist Revenue

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 63.1 | From artist profile, tap "Revenue" | Tab |
| 63.2 | Load revenue data | Loading State |
| 63.3 | View total revenue from events | Metric |
| 63.4 | View resale royalties | Metric |
| 63.5 | View revenue over time | Chart |
| 63.6 | View revenue by event | Table |
| 63.7 | View revenue by venue | Table |
| 63.8 | Filter by date range | Date Filter |
| 63.9 | Export revenue data | Export Button |

---

## Flow 64: View Invited By

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 64.1 | From artist profile, view "Invited By" | Section |
| 64.2 | View venue that sent invite | Venue Link |
| 64.3 | View invite date | Date Field |
| 64.4 | View event that triggered invite | Event Link |
| 64.5 | Tap venue for venue profile | Navigation |
| 64.6 | Tap event for event details | Navigation |

---

## Flow 65: View Artist Team

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 65.1 | From artist profile, tap "Team" | Tab |
| 65.2 | Load team data | Loading State |
| 65.3 | View team members | Team List |
| 65.4 | Each shows: name, email, role, permissions | List Item |
| 65.5 | View owner | Owner Highlight |
| 65.6 | Tap member for details | Selection |

---

## Flow 66: Send Artist Invite

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 66.1 | Navigate to Users then Artists | Navigation |
| 66.2 | Tap "Invite Artist" | Button |
| 66.3 | Enter artist name | Text Input |
| 66.4 | Enter artist email | Email Input |
| 66.5 | Select event to link (optional) | Event Dropdown |
| 66.6 | Add personal message (optional) | Text Area |
| 66.7 | Send invitation | Send Button |
| 66.8 | Handle success | Success Toast |
| 66.9 | Invite email sent | Email |
| 66.10 | Artist appears in pending list | List Update |
| 66.11 | Audit log entry created | Logging |

---

## Flow 67: Link Artist to Event

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 67.1 | From artist profile, tap "Link to Event" | Button |
| 67.2 | Search for event | Search Input |
| 67.3 | View matching events | Results List |
| 67.4 | Select event | Selection |
| 67.5 | Confirm link | Confirmation Dialog |
| 67.6 | Submit | Loading State |
| 67.7 | Handle success | Success Toast |
| 67.8 | Artist now appears on event | Link Created |
| 67.9 | Artist notified | Notification |
| 67.10 | Audit log entry created | Logging |

---

## Flow 68: Edit Artist Account

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 68.1 | From artist profile, tap "Edit" | Button |
| 68.2 | Enter edit mode | Edit Mode |
| 68.3 | Edit artist name | Text Input |
| 68.4 | Edit genres | Multi-Select |
| 68.5 | Edit owner email | Email Input |
| 68.6 | Save changes | Save Button |
| 68.7 | Enter reason for edit | Text Input |
| 68.8 | Handle success | Success Toast |
| 68.9 | Audit log entry created | Logging |
| 68.10 | Artist notified of changes | Email |

---

## Flow 69: Flag Artist

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 69.1 | From artist profile, tap "Flag" | Button |
| 69.2 | Select flag reason | Reason Dropdown |
| 69.3 | Reasons: Suspicious activity, Impersonation, TOS concern, Other | Options |
| 69.4 | Add notes | Text Input |
| 69.5 | Submit flag | Submit Button |
| 69.6 | Handle success | Success Toast |
| 69.7 | Flag badge appears on profile | Badge |
| 69.8 | Audit log entry created | Logging |
| 69.9 | Remove flag option | Remove Button |

---

## Flow 70: Suspend Artist Account

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 70.1 | From artist profile, tap "Suspend" | Button |
| 70.2 | Show warning | Warning Modal |
| 70.3 | Select suspension reason | Reason Dropdown |
| 70.4 | Set suspension duration | Duration Selector |
| 70.5 | Add notes | Text Input |
| 70.6 | Confirm suspension | Confirmation Dialog |
| 70.7 | Submit | Loading State |
| 70.8 | Handle success | Success Toast |
| 70.9 | Account suspended | Status Update |
| 70.10 | Artist cannot access dashboard | Enforcement |
| 70.11 | Artist notified | Email |
| 70.12 | Audit log entry created | Logging |

---

## Flow 71: Unsuspend Artist Account

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 71.1 | From suspended artist profile, tap "Unsuspend" | Button |
| 71.2 | Add reason for unsuspension | Text Input |
| 71.3 | Confirm unsuspension | Confirmation Dialog |
| 71.4 | Submit | Loading State |
| 71.5 | Handle success | Success Toast |
| 71.6 | Account restored | Status Update |
| 71.7 | Artist notified | Email |
| 71.8 | Audit log entry created | Logging |

---

## Flow 72: Delete Artist Account

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 72.1 | From artist profile, tap "Delete" | Button |
| 72.2 | Show warning | Warning Modal |
| 72.3 | Warning: All data deleted | Warning Text |
| 72.4 | Enter reason for deletion | Text Input |
| 72.5 | Type "DELETE" to confirm | Confirmation Input |
| 72.6 | Submit | Loading State |
| 72.7 | Handle success | Success Toast |
| 72.8 | Account deleted | Deletion |
| 72.9 | Artist notified | Email |
| 72.10 | Audit log entry created | Logging |

---

## Flow 73: Impersonate Artist

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 73.1 | From artist profile, tap "Impersonate" | Button |
| 73.2 | Show impersonation warning | Warning Modal |
| 73.3 | Warning: Actions will be logged | Warning Text |
| 73.4 | Enter reason for impersonation | Text Input |
| 73.5 | Confirm | Confirm Button |
| 73.6 | Session opened as artist | New Session |
| 73.7 | Impersonation banner visible | Banner |
| 73.8 | View artist dashboard as they see it | Artist View |
| 73.9 | All actions logged | Logging |
| 73.10 | Tap "End Impersonation" to return | End Button |
| 73.11 | Return to admin dashboard | Navigation |
| 73.12 | Audit log entry created | Logging |

---

# Event Oversight Flows

---

## Flow 74: View All Events

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 74.1 | Navigate to Events | Navigation |
| 74.2 | Load event list | Loading State |
| 74.3 | Display event table | Table View |
| 74.4 | Columns: Name, Venue, Date, Status, Tickets Sold, Revenue | Columns |
| 74.5 | Pagination | Pagination |
| 74.6 | Sort by any column | Sort Action |
| 74.7 | Tap event for details | Selection |

---

## Flow 75: Search Events

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 75.1 | Tap search field | Search Focus |
| 75.2 | Enter search query | Text Input |
| 75.3 | Search by: name, venue, artist, date | Search Scope |
| 75.4 | Submit search | Search Action |
| 75.5 | View matching results | Results List |
| 75.6 | No results state | Empty State |
| 75.7 | Clear search | Clear Button |

---

## Flow 76: Filter Events

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 76.1 | Tap "Filter" | Button |
| 76.2 | Open filter panel | Filter Panel |
| 76.3 | Filter by status (Draft, Published, Completed, Cancelled) | Status Checkboxes |
| 76.4 | Filter by date range | Date Range |
| 76.5 | Filter by venue | Venue Dropdown |
| 76.6 | Filter by category | Category Dropdown |
| 76.7 | Apply filters | Apply Button |
| 76.8 | View active filter count | Badge |
| 76.9 | Clear all filters | Clear Button |

---

## Flow 77: View Event Details

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 77.1 | Tap event from list | Navigation |
| 77.2 | Load event details | Loading State |
| 77.3 | View event info | Info Section |
| 77.4 | Name, date, time | Fields |
| 77.5 | Venue name and link | Venue Link |
| 77.6 | Artist(s) and links | Artist Links |
| 77.7 | Event status | Status Badge |
| 77.8 | Ticket types and prices | Ticket List |
| 77.9 | Event description | Description |
| 77.10 | Event image | Image Display |
| 77.11 | Quick actions | Action Buttons |

---

## Flow 78: View Event Sales

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 78.1 | From event details, tap "Sales" | Tab |
| 78.2 | Load sales data | Loading State |
| 78.3 | View total tickets sold | Metric |
| 78.4 | View total revenue | Metric |
| 78.5 | View tickets remaining | Metric |
| 78.6 | View sales by ticket type | Breakdown |
| 78.7 | View sales over time | Chart |
| 78.8 | View sales velocity | Metric |
| 78.9 | Export sales data | Export Button |

---

## Flow 79: View Event Resale Activity

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 79.1 | From event details, tap "Resale" | Tab |
| 79.2 | Load resale data | Loading State |
| 79.3 | View total resale volume | Metric |
| 79.4 | View active listings | Metric |
| 79.5 | View average resale price | Metric |
| 79.6 | View resale vs face value | Comparison |
| 79.7 | View platform royalties earned | Metric |
| 79.8 | View resale listings | Listing List |
| 79.9 | Export resale data | Export Button |

---

## Flow 80: View Event Refunds

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 80.1 | From event details, tap "Refunds" | Tab |
| 80.2 | Load refund data | Loading State |
| 80.3 | View total refunds issued | Metric |
| 80.4 | View refund rate | Percentage |
| 80.5 | View refunds by reason | Breakdown |
| 80.6 | View refund list | Refund List |
| 80.7 | Each shows: customer, amount, reason, date | List Item |
| 80.8 | Tap refund for details | Selection |
| 80.9 | Export refund data | Export Button |

---

## Flow 81: View Event Issues

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 81.1 | From event details, tap "Issues" | Tab |
| 81.2 | Load issues data | Loading State |
| 81.3 | View support tickets related to event | Ticket List |
| 81.4 | View flagged content | Flag List |
| 81.5 | View complaints | Complaint List |
| 81.6 | View chargebacks | Chargeback List |
| 81.7 | Tap issue for details | Selection |
| 81.8 | Issue count badge | Badge |

---

## Flow 82: Create Event

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 82.1 | Navigate to Events | Navigation |
| 82.2 | Tap "Create Event" | Button |
| 82.3 | Select venue | Venue Dropdown |
| 82.4 | Enter event name | Text Input |
| 82.5 | Select event category | Category Dropdown |
| 82.6 | Select event date | Date Picker |
| 82.7 | Select start time | Time Picker |
| 82.8 | Select end time | Time Picker |
| 82.9 | Select doors open time | Time Picker |
| 82.10 | Add event description | Text Area |
| 82.11 | Upload event image | Image Upload |
| 82.12 | Add ticket types | Ticket Builder |
| 82.13 | Set ticket prices | Price Inputs |
| 82.14 | Set ticket quantities | Quantity Inputs |
| 82.15 | Add artists (optional) | Artist Search |
| 82.16 | Save as draft | Save Draft Button |
| 82.17 | Publish event | Publish Button |
| 82.18 | Handle success | Success Toast |
| 82.19 | Audit log entry created | Logging |

---

## Flow 83: Edit Event

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 83.1 | From event details, tap "Edit" | Button |
| 83.2 | Enter edit mode | Edit Mode |
| 83.3 | Edit any event field | Form Fields |
| 83.4 | Warning if tickets already sold | Warning |
| 83.5 | Some fields locked after sales | Locked Fields |
| 83.6 | Save changes | Save Button |
| 83.7 | Enter reason for edit | Text Input |
| 83.8 | Handle success | Success Toast |
| 83.9 | Venue notified of changes | Notification |
| 83.10 | Audit log entry created | Logging |

---

## Flow 84: Pause Event Sales

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 84.1 | From event details, tap "Pause Sales" | Button |
| 84.2 | Show warning | Warning Modal |
| 84.3 | Warning: Customers cannot purchase | Warning Text |
| 84.4 | Select pause reason | Reason Dropdown |
| 84.5 | Reasons: Investigating issue, Venue request, Price error, Other | Options |
| 84.6 | Add notes | Text Input |
| 84.7 | Confirm pause | Confirmation Dialog |
| 84.8 | Submit | Loading State |
| 84.9 | Handle success | Success Toast |
| 84.10 | Event marked as paused | Status Update |
| 84.11 | Event page shows "Sales Paused" | Public Display |
| 84.12 | Venue notified | Notification |
| 84.13 | Audit log entry created | Logging |

---

## Flow 85: Resume Event Sales

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 85.1 | From paused event, tap "Resume Sales" | Button |
| 85.2 | Add reason for resuming | Text Input |
| 85.3 | Confirm resume | Confirmation Dialog |
| 85.4 | Submit | Loading State |
| 85.5 | Handle success | Success Toast |
| 85.6 | Event sales active again | Status Update |
| 85.7 | Venue notified | Notification |
| 85.8 | Audit log entry created | Logging |

---

## Flow 86: Cancel Event

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 86.1 | From event details, tap "Cancel Event" | Button |
| 86.2 | Show serious warning | Warning Modal |
| 86.3 | Warning: All tickets will be refunded | Warning Text |
| 86.4 | View impact summary | Impact Display |
| 86.5 | Tickets to refund count | Metric |
| 86.6 | Revenue to refund | Metric |
| 86.7 | Select cancellation reason | Reason Dropdown |
| 86.8 | Add notes | Text Input |
| 86.9 | Type "CANCEL" to confirm | Confirmation Input |
| 86.10 | Submit | Loading State |
| 86.11 | Handle success | Success Toast |
| 86.12 | Event marked as cancelled | Status Update |
| 86.13 | Refunds initiated by venue | Refund Note |
| 86.14 | Venue notified | Notification |
| 86.15 | Ticket holders notified | Notifications |
| 86.16 | Audit log entry created | Logging |

---

# Financial Flows

---

## Flow 87: View Revenue Overview

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 87.1 | Navigate to Financials | Navigation |
| 87.2 | Load financial data | Loading State |
| 87.3 | View total platform revenue | Metric |
| 87.4 | View revenue today | Metric |
| 87.5 | View revenue this week | Metric |
| 87.6 | View revenue this month | Metric |
| 87.7 | View revenue this year | Metric |
| 87.8 | View revenue trend chart | Chart |
| 87.9 | Compare to previous period | Comparison |
| 87.10 | Refresh data | Refresh Button |

---

## Flow 88: View Revenue by Period

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 88.1 | From Financials, select "By Period" | Tab |
| 88.2 | Select period type | Period Selector |
| 88.3 | Options: Daily, Weekly, Monthly, Yearly | Options |
| 88.4 | View revenue table | Table |
| 88.5 | Each row: period, revenue, tickets, fees | Columns |
| 88.6 | View trend chart | Chart |
| 88.7 | Select date range | Date Range |
| 88.8 | Export data | Export Button |

---

## Flow 89: View Revenue by Venue

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 89.1 | From Financials, select "By Venue" | Tab |
| 89.2 | Load venue revenue data | Loading State |
| 89.3 | View venue table | Table |
| 89.4 | Columns: Venue, Revenue, Tickets, Fees, Events | Columns |
| 89.5 | Sort by any column | Sort Action |
| 89.6 | Filter by date range | Date Filter |
| 89.7 | Tap venue for details | Navigation |
| 89.8 | Export data | Export Button |

---

## Flow 90: View Revenue by Event

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 90.1 | From Financials, select "By Event" | Tab |
| 90.2 | Load event revenue data | Loading State |
| 90.3 | View event table | Table |
| 90.4 | Columns: Event, Venue, Date, Revenue, Tickets, Fees | Columns |
| 90.5 | Sort by any column | Sort Action |
| 90.6 | Filter by date range | Date Filter |
| 90.7 | Filter by venue | Venue Filter |
| 90.8 | Tap event for details | Navigation |
| 90.9 | Export data | Export Button |

---

## Flow 91: View Platform Fees

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 91.1 | From Financials, select "Platform Fees" | Tab |
| 91.2 | Load fees data | Loading State |
| 91.3 | View total fees earned | Metric |
| 91.4 | View fees from primary sales | Metric |
| 91.5 | View fees from resales | Metric |
| 91.6 | View fees over time | Chart |
| 91.7 | View fees by venue | Table |
| 91.8 | View fees by event | Table |
| 91.9 | Filter by date range | Date Filter |
| 91.10 | Export data | Export Button |

---

## Flow 92: View Resale Royalties

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 92.1 | From Financials, select "Resale Royalties" | Tab |
| 92.2 | Load royalty data | Loading State |
| 92.3 | View total royalties earned | Metric |
| 92.4 | View royalties over time | Chart |
| 92.5 | View royalties by event | Table |
| 92.6 | View royalties by venue | Table |
| 92.7 | View resale volume | Metric |
| 92.8 | Filter by date range | Date Filter |
| 92.9 | Export data | Export Button |

---

## Flow 93: View Stripe Balance

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 93.1 | From Financials, view "Stripe Balance" | Widget |
| 93.2 | Fetch balance from Stripe | Loading State |
| 93.3 | View available balance | Metric |
| 93.4 | View pending balance | Metric |
| 93.5 | View next payout date | Date |
| 93.6 | Link to Stripe dashboard | External Link |
| 93.7 | Refresh balance | Refresh Button |

---

## Flow 94: View All Payouts

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 94.1 | From Financials, select "Payouts" | Tab |
| 94.2 | Load payout data | Loading State |
| 94.3 | View all payouts table | Table |
| 94.4 | Columns: Venue, Amount, Status, Date | Columns |
| 94.5 | Filter by status (Pending, Completed, Failed) | Status Filter |
| 94.6 | Filter by venue | Venue Filter |
| 94.7 | Filter by date range | Date Filter |
| 94.8 | Sort by any column | Sort Action |
| 94.9 | Tap payout for details | Selection |
| 94.10 | Export data | Export Button |

---

## Flow 95: View Payout Details

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 95.1 | Tap payout from list | Navigation |
| 95.2 | Load payout details | Loading State |
| 95.3 | View payout summary | Summary |
| 95.4 | Venue name | Field |
| 95.5 | Payout amount | Field |
| 95.6 | Payout date | Field |
| 95.7 | Payout status | Status Badge |
| 95.8 | Bank account (last 4) | Field |
| 95.9 | View transactions included | Transaction List |
| 95.10 | View fees deducted | Fees Breakdown |
| 95.11 | View Stripe payout ID | ID Field |
| 95.12 | Link to Stripe | External Link |

---

## Flow 96: View Failed Payouts

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 96.1 | From Payouts, filter by "Failed" | Filter |
| 96.2 | View failed payouts list | Failed List |
| 96.3 | Each shows: venue, amount, failure reason, date | List Item |
| 96.4 | Tap payout for details | Selection |
| 96.5 | View failure reason | Reason Display |
| 96.6 | View venue contact | Contact Info |
| 96.7 | Contact venue option | Contact Button |
| 96.8 | View retry status | Retry Status |

---

## Flow 97: View Refund Activity

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 97.1 | From Financials, select "Refunds" | Tab |
| 97.2 | Load refund data | Loading State |
| 97.3 | View total refunds | Metric |
| 97.4 | View refund rate | Percentage |
| 97.5 | View refunds over time | Chart |
| 97.6 | View refunds by venue | Table |
| 97.7 | View refunds by event | Table |
| 97.8 | View refund list | Refund List |
| 97.9 | Filter by date range | Date Filter |
| 97.10 | Filter by venue | Venue Filter |
| 97.11 | Export data | Export Button |

---

## Flow 98: View Chargeback Activity

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 98.1 | From Financials, select "Chargebacks" | Tab |
| 98.2 | Load chargeback data | Loading State |
| 98.3 | View total chargebacks | Metric |
| 98.4 | View chargeback rate | Percentage |
| 98.5 | View chargebacks by status | Breakdown |
| 98.6 | Statuses: Open, Won, Lost | Statuses |
| 98.7 | View chargeback list | Chargeback List |
| 98.8 | Each shows: venue, event, amount, status, deadline | List Item |
| 98.9 | Tap chargeback for details | Selection |
| 98.10 | Filter by status | Status Filter |
| 98.11 | Filter by date range | Date Filter |
| 98.12 | Export data | Export Button |

---

## Flow 99: Set Venue Fee Rate

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 99.1 | From venue profile or Financials | Navigation |
| 99.2 | Tap "Set Fee Rate" | Button |
| 99.3 | View current fee rate | Current Display |
| 99.4 | Enter new fee percentage | Percentage Input |
| 99.5 | Preview impact | Preview |
| 99.6 | Add reason for change | Text Input |
| 99.7 | Set effective date | Date Picker |
| 99.8 | Save changes | Save Button |
| 99.9 | Handle success | Success Toast |
| 99.10 | Venue notified | Notification |
| 99.11 | Audit log entry created | Logging |

---

## Flow 100: Export Financial Data

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 100.1 | From any Financials view, tap "Export" | Button |
| 100.2 | Select data to export | Data Checkboxes |
| 100.3 | Options: Revenue, Fees, Payouts, Refunds, All | Options |
| 100.4 | Select date range | Date Range Picker |
| 100.5 | Select format (CSV, Excel, PDF) | Format Selector |
| 100.6 | Generate export | Generate Button |
| 100.7 | Download file | Download |
| 100.8 | Handle success | Success Toast |

---

# Content Moderation Flows

---

## Flow 101: View Moderation Queue

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 101.1 | Navigate to Moderation | Navigation |
| 101.2 | Load moderation queue | Loading State |
| 101.3 | View queued items | Queue List |
| 101.4 | Queue count badge | Badge |
| 101.5 | Each shows: content type, snippet, flag reason, date | List Item |
| 101.6 | Sort by date (oldest first) | Default Sort |
| 101.7 | Sort by severity | Sort Option |
| 101.8 | Tap item for review | Selection |

---

## Flow 102: View Auto-Flagged Content

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 102.1 | From Moderation, select "Auto-Flagged" | Tab |
| 102.2 | Load auto-flagged items | Loading State |
| 102.3 | View flagged by system | Flag List |
| 102.4 | Each shows: content, rule triggered, date | List Item |
| 102.5 | Rules: slurs, spam, links, contact info | Rule Types |
| 102.6 | Tap item for review | Selection |

---

## Flow 103: View User-Reported Content

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 103.1 | From Moderation, select "User Reports" | Tab |
| 103.2 | Load user-reported items | Loading State |
| 103.3 | View reported by users | Report List |
| 103.4 | Each shows: content, reporter, reason, date | List Item |
| 103.5 | View report count per item | Count Badge |
| 103.6 | Tap item for review | Selection |

---

## Flow 104: View Venue-Reported Content

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 104.1 | From Moderation, select "Venue Reports" | Tab |
| 104.2 | Load venue-reported items | Loading State |
| 104.3 | View reported by venues | Report List |
| 104.4 | Typically: fan reviews venues dispute | Content Type |
| 104.5 | Each shows: content, venue, reason, date | List Item |
| 104.6 | Tap item for review | Selection |

---

## Flow 105: Review Flagged Item

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 105.1 | Tap flagged item from queue | Navigation |
| 105.2 | Load item details | Loading State |
| 105.3 | View full content | Content Display |
| 105.4 | View content type (review, bio, description) | Type Badge |
| 105.5 | View author | Author Link |
| 105.6 | View flag reason | Reason Display |
| 105.7 | View flag source (auto, user, venue) | Source Display |
| 105.8 | View author history | History Link |
| 105.9 | View previous violations | Violation Count |
| 105.10 | Action buttons | Action Buttons |

---

## Flow 106: Approve Content

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 106.1 | From review screen, tap "Approve" | Button |
| 106.2 | Content marked as approved | Status Update |
| 106.3 | Flag dismissed | Flag Removed |
| 106.4 | Content remains visible | Enforcement |
| 106.5 | Handle success | Success Toast |
| 106.6 | Audit log entry created | Logging |
| 106.7 | Next item in queue loads | Auto-Advance |

---

## Flow 107: Remove Content

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 107.1 | From review screen, tap "Remove" | Button |
| 107.2 | Select removal reason | Reason Dropdown |
| 107.3 | Reasons: TOS violation, Hate speech, Spam, False info, Other | Options |
| 107.4 | Add notes | Text Input |
| 107.5 | Confirm removal | Confirmation Dialog |
| 107.6 | Submit | Loading State |
| 107.7 | Content removed | Removal |
| 107.8 | Author notified | Notification |
| 107.9 | Strike added to author account | Strike System |
| 107.10 | Handle success | Success Toast |
| 107.11 | Audit log entry created | Logging |
| 107.12 | Next item in queue loads | Auto-Advance |

---

## Flow 108: Warn User

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 108.1 | From review screen, tap "Warn" | Button |
| 108.2 | Content stays visible | No Removal |
| 108.3 | Select warning type | Warning Type |
| 108.4 | Add warning message | Text Input |
| 108.5 | Send warning | Send Button |
| 108.6 | User notified | Notification |
| 108.7 | Warning logged on account | Account Note |
| 108.8 | Handle success | Success Toast |
| 108.9 | Audit log entry created | Logging |

---

## Flow 109: View Moderation History

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 109.1 | From Moderation, select "History" | Tab |
| 109.2 | Load moderation history | Loading State |
| 109.3 | View all moderation decisions | History List |
| 109.4 | Each shows: content, decision, admin, date | List Item |
| 109.5 | Filter by decision (Approved, Removed, Warned) | Decision Filter |
| 109.6 | Filter by admin | Admin Filter |
| 109.7 | Filter by date range | Date Filter |
| 109.8 | Search history | Search Input |
| 109.9 | Tap item for details | Selection |
| 109.10 | Export history | Export Button |

---

## Flow 110: Manage Auto-Moderation Rules

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 110.1 | From Moderation, select "Rules" | Tab |
| 110.2 | Load current rules | Loading State |
| 110.3 | View active rules | Rules List |
| 110.4 | Each shows: rule type, pattern, action | List Item |
| 110.5 | Add new rule | Add Button |
| 110.6 | Select rule type | Type Dropdown |
| 110.7 | Types: Keyword, Pattern, Link, Contact Info | Types |
| 110.8 | Enter pattern/keywords | Text Input |
| 110.9 | Set action (Flag, Auto-Remove) | Action Selector |
| 110.10 | Save rule | Save Button |
| 110.11 | Edit existing rule | Edit Button |
| 110.12 | Disable rule | Disable Toggle |
| 110.13 | Delete rule | Delete Button |
| 110.14 | Test rule | Test Button |
| 110.15 | Audit log entry created | Logging |


---

# Support Tickets Flows

---

## Flow 111: View All Tickets

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 111.1 | Navigate to Support | Navigation |
| 111.2 | Load ticket list | Loading State |
| 111.3 | Display ticket table | Table View |
| 111.4 | Columns: ID, Subject, User, Status, Priority, Date | Columns |
| 111.5 | Pagination | Pagination |
| 111.6 | Sort by any column | Sort Action |
| 111.7 | Tap ticket for details | Selection |

---

## Flow 112: View Ticket Queue

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 112.1 | From Support, select "Queue" | Tab |
| 112.2 | Load unassigned/open tickets | Loading State |
| 112.3 | View tickets needing attention | Queue List |
| 112.4 | Queue count badge | Badge |
| 112.5 | Sorted by oldest first | Default Sort |
| 112.6 | High priority highlighted | Visual Highlight |
| 112.7 | Tap ticket to claim/view | Selection |

---

## Flow 113: Search Tickets

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 113.1 | Tap search field | Search Focus |
| 113.2 | Enter search query | Text Input |
| 113.3 | Search by: ticket ID, subject, user email, user name | Search Scope |
| 113.4 | Submit search | Search Action |
| 113.5 | View matching results | Results List |
| 113.6 | No results state | Empty State |
| 113.7 | Clear search | Clear Button |

---

## Flow 114: Filter Tickets

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 114.1 | Tap "Filter" | Button |
| 114.2 | Open filter panel | Filter Panel |
| 114.3 | Filter by status (Open, Pending, Resolved, Closed) | Status Checkboxes |
| 114.4 | Filter by priority (Low, Medium, High, Urgent) | Priority Checkboxes |
| 114.5 | Filter by user type (Fan, Venue, Artist) | User Type Checkboxes |
| 114.6 | Filter by assigned admin | Admin Dropdown |
| 114.7 | Filter by date range | Date Range |
| 114.8 | Apply filters | Apply Button |
| 114.9 | View active filter count | Badge |
| 114.10 | Clear all filters | Clear Button |

---

## Flow 115: View Ticket Details

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 115.1 | Tap ticket from list | Navigation |
| 115.2 | Load ticket details | Loading State |
| 115.3 | View ticket header | Header Section |
| 115.4 | Ticket ID | Field |
| 115.5 | Subject | Field |
| 115.6 | Status | Status Badge |
| 115.7 | Priority | Priority Badge |
| 115.8 | Assigned admin | Field |
| 115.9 | Created date | Field |
| 115.10 | View conversation thread | Thread Display |
| 115.11 | User messages | Message Bubbles |
| 115.12 | Admin replies | Reply Bubbles |
| 115.13 | Internal notes (admin only) | Note Bubbles |
| 115.14 | Attachments | Attachment List |
| 115.15 | Action buttons | Action Buttons |

---

## Flow 116: View User Context

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 116.1 | From ticket details, view sidebar | Sidebar |
| 116.2 | Load user context | Loading State |
| 116.3 | View user profile summary | Profile Card |
| 116.4 | User type (Fan, Venue, Artist) | Type Badge |
| 116.5 | Account status | Status Badge |
| 116.6 | View recent activity | Activity List |
| 116.7 | View recent purchases/events | Context List |
| 116.8 | View previous tickets | Ticket History |
| 116.9 | Link to full profile | Profile Link |
| 116.10 | Impersonate user option | Impersonate Button |

---

## Flow 117: Assign Ticket

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 117.1 | From ticket details, tap "Assign" | Button |
| 117.2 | View admin list | Admin Dropdown |
| 117.3 | Select admin | Selection |
| 117.4 | Or assign to self | Self Option |
| 117.5 | Confirm assignment | Confirm Button |
| 117.6 | Handle success | Success Toast |
| 117.7 | Assigned admin notified | Notification |
| 117.8 | Ticket updated | Status Update |
| 117.9 | Audit log entry created | Logging |

---

## Flow 118: Reply to Ticket

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 118.1 | From ticket details, view reply box | Reply Section |
| 118.2 | Type reply message | Text Area |
| 118.3 | Format text (optional) | Formatting Tools |
| 118.4 | Attach files (optional) | Attachment Button |
| 118.5 | Insert canned response (optional) | Canned Button |
| 118.6 | Preview reply | Preview Button |
| 118.7 | Send reply | Send Button |
| 118.8 | Handle success | Success Toast |
| 118.9 | Reply added to thread | Thread Update |
| 118.10 | User notified via email | Email Sent |
| 118.11 | Ticket status updates | Status Update |

---

## Flow 119: Add Internal Note

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 119.1 | From ticket details, tap "Add Note" | Button |
| 119.2 | Type internal note | Text Area |
| 119.3 | Note visible to admins only | Privacy Note |
| 119.4 | Save note | Save Button |
| 119.5 | Handle success | Success Toast |
| 119.6 | Note added to thread | Thread Update |
| 119.7 | Note styled differently | Visual Distinction |
| 119.8 | User does not see note | Privacy Enforcement |

---

## Flow 120: Escalate Ticket

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 120.1 | From ticket details, tap "Escalate" | Button |
| 120.2 | Select escalation reason | Reason Dropdown |
| 120.3 | Reasons: Complex issue, VIP customer, Legal concern, Urgent | Options |
| 120.4 | Select escalation target | Target Dropdown |
| 120.5 | Targets: Senior admin, Owner, Specific admin | Options |
| 120.6 | Add escalation notes | Text Area |
| 120.7 | Confirm escalation | Confirm Button |
| 120.8 | Handle success | Success Toast |
| 120.9 | Priority increased | Priority Update |
| 120.10 | Target admin notified | Notification |
| 120.11 | Escalation logged | Logging |

---

## Flow 121: Resolve Ticket

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 121.1 | From ticket details, tap "Resolve" | Button |
| 121.2 | Select resolution type | Type Dropdown |
| 121.3 | Types: Solved, Answered, Won't fix, Duplicate | Types |
| 121.4 | Add resolution notes | Text Area |
| 121.5 | Confirm resolution | Confirm Button |
| 121.6 | Handle success | Success Toast |
| 121.7 | Ticket marked as resolved | Status Update |
| 121.8 | User notified | Email |
| 121.9 | Satisfaction survey sent (optional) | Survey |
| 121.10 | Audit log entry created | Logging |

---

## Flow 122: Reopen Ticket

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 122.1 | From resolved ticket, tap "Reopen" | Button |
| 122.2 | Add reason for reopening | Text Input |
| 122.3 | Confirm reopen | Confirm Button |
| 122.4 | Handle success | Success Toast |
| 122.5 | Ticket status changes to Open | Status Update |
| 122.6 | Assigned admin notified | Notification |
| 122.7 | Audit log entry created | Logging |

---

## Flow 123: View Ticket History

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 123.1 | From ticket details, tap "History" | Tab |
| 123.2 | Load ticket history | Loading State |
| 123.3 | View all previous tickets from user | Ticket List |
| 123.4 | Each shows: ID, subject, status, date | List Item |
| 123.5 | View patterns | Pattern Indicators |
| 123.6 | Tap ticket for details | Navigation |
| 123.7 | Total ticket count | Count Display |

---

## Flow 124: Use Canned Response

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 124.1 | From reply box, tap "Canned" | Button |
| 124.2 | View canned responses | Response List |
| 124.3 | Search responses | Search Input |
| 124.4 | Filter by category | Category Filter |
| 124.5 | Preview response | Preview |
| 124.6 | Select response | Selection |
| 124.7 | Response inserted into reply | Auto-Fill |
| 124.8 | Edit before sending | Editing |
| 124.9 | Send reply | Send Button |

---

## Flow 125: Manage Canned Responses

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 125.1 | Navigate to Support then Canned Responses | Navigation |
| 125.2 | Load canned responses | Loading State |
| 125.3 | View response list | Response List |
| 125.4 | Tap "Add Response" | Button |
| 125.5 | Enter response title | Text Input |
| 125.6 | Select category | Category Dropdown |
| 125.7 | Enter response content | Text Area |
| 125.8 | Add placeholders (user name, etc.) | Placeholder Tools |
| 125.9 | Save response | Save Button |
| 125.10 | Edit existing response | Edit Button |
| 125.11 | Delete response | Delete Button |
| 125.12 | Reorder responses | Drag Action |

---

# Platform Settings Flows

---

## Flow 126: View Platform Settings

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 126.1 | Navigate to Settings | Navigation |
| 126.2 | Load settings | Loading State |
| 126.3 | View settings categories | Category List |
| 126.4 | Categories: Fees, Payouts, Content, Features, Branding, API | Categories |
| 126.5 | Tap category for settings | Navigation |

---

## Flow 127: Set Default Platform Fee

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 127.1 | Navigate to Settings then Fees | Navigation |
| 127.2 | View current default fee | Current Display |
| 127.3 | Enter new fee percentage | Percentage Input |
| 127.4 | Preview impact | Preview |
| 127.5 | Note: applies to new venues | Note |
| 127.6 | Existing venues keep their rate | Note |
| 127.7 | Save changes | Save Button |
| 127.8 | Handle success | Success Toast |
| 127.9 | Audit log entry created | Logging |

---

## Flow 128: Set Default Resale Fee

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 128.1 | Navigate to Settings then Fees | Navigation |
| 128.2 | View current resale fee | Current Display |
| 128.3 | Enter new resale percentage | Percentage Input |
| 128.4 | Preview impact | Preview |
| 128.5 | Save changes | Save Button |
| 128.6 | Handle success | Success Toast |
| 128.7 | Audit log entry created | Logging |

---

## Flow 129: Set Payout Schedule

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 129.1 | Navigate to Settings then Payouts | Navigation |
| 129.2 | View current payout schedule | Current Display |
| 129.3 | Select payout frequency | Frequency Dropdown |
| 129.4 | Options: Daily, Weekly, Monthly | Options |
| 129.5 | If weekly: select day | Day Selector |
| 129.6 | Set minimum payout amount | Amount Input |
| 129.7 | Note: managed via Stripe | Stripe Note |
| 129.8 | Save changes | Save Button |
| 129.9 | Handle success | Success Toast |
| 129.10 | Audit log entry created | Logging |

---

## Flow 130: Manage Ticket Types

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 130.1 | Navigate to Settings then Content | Navigation |
| 130.2 | View ticket types section | Section |
| 130.3 | View default ticket types | Type List |
| 130.4 | Types: General Admission, VIP, Early Bird, etc. | Default Types |
| 130.5 | Add new type | Add Button |
| 130.6 | Enter type name | Text Input |
| 130.7 | Enter type description | Text Area |
| 130.8 | Save type | Save Button |
| 130.9 | Edit existing type | Edit Button |
| 130.10 | Disable type | Disable Toggle |
| 130.11 | Delete type (if unused) | Delete Button |

---

## Flow 131: Manage Event Categories

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 131.1 | Navigate to Settings then Content | Navigation |
| 131.2 | View event categories section | Section |
| 131.3 | View current categories | Category List |
| 131.4 | Categories: Music, Sports, Comedy, Theater, etc. | Categories |
| 131.5 | Add new category | Add Button |
| 131.6 | Enter category name | Text Input |
| 131.7 | Upload category icon | Icon Upload |
| 131.8 | Save category | Save Button |
| 131.9 | Edit existing category | Edit Button |
| 131.10 | Reorder categories | Drag Action |
| 131.11 | Disable category | Disable Toggle |
| 131.12 | Delete category (if unused) | Delete Button |

---

## Flow 132: Manage Genres

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 132.1 | Navigate to Settings then Content | Navigation |
| 132.2 | View genres section | Section |
| 132.3 | View current genres | Genre List |
| 132.4 | Genres: Rock, Hip Hop, Electronic, Jazz, etc. | Genres |
| 132.5 | Add new genre | Add Button |
| 132.6 | Enter genre name | Text Input |
| 132.7 | Set parent genre (optional) | Parent Dropdown |
| 132.8 | Save genre | Save Button |
| 132.9 | Edit existing genre | Edit Button |
| 132.10 | Merge genres | Merge Button |
| 132.11 | Delete genre (if unused) | Delete Button |

---

## Flow 133: Set Platform Policies

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 133.1 | Navigate to Settings then Policies | Navigation |
| 133.2 | View policy sections | Section List |
| 133.3 | Sections: Refund, Privacy, Terms, Community | Sections |
| 133.4 | Select policy to edit | Selection |
| 133.5 | View current policy text | Text Display |
| 133.6 | Edit policy | Rich Text Editor |
| 133.7 | Preview changes | Preview Button |
| 133.8 | Save as draft | Save Draft |
| 133.9 | Publish policy | Publish Button |
| 133.10 | View version history | History Button |
| 133.11 | Revert to previous version | Revert Button |
| 133.12 | Audit log entry created | Logging |

---

## Flow 134: Manage Email Templates

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 134.1 | Navigate to Settings then Emails | Navigation |
| 134.2 | View email template list | Template List |
| 134.3 | Templates: Welcome, Purchase Confirmation, Ticket Delivery, etc. | Templates |
| 134.4 | Select template to edit | Selection |
| 134.5 | View current template | Template Display |
| 134.6 | Edit subject line | Text Input |
| 134.7 | Edit email body | Rich Text Editor |
| 134.8 | Insert placeholders | Placeholder Tools |
| 134.9 | Placeholders: user name, event name, ticket details | Placeholders |
| 134.10 | Preview email | Preview Button |
| 134.11 | Send test email | Test Button |
| 134.12 | Save template | Save Button |
| 134.13 | Reset to default | Reset Button |

---

## Flow 135: Manage Feature Flags - System

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 135.1 | Navigate to Settings then Features | Navigation |
| 135.2 | View system feature flags | Flag List |
| 135.3 | Each shows: feature name, status, description | List Item |
| 135.4 | Toggle feature on/off | Toggle |
| 135.5 | Features: Resale marketplace, Guest checkout, Social login, etc. | Features |
| 135.6 | Warning for critical features | Warning |
| 135.7 | Confirm toggle | Confirmation |
| 135.8 | Handle success | Success Toast |
| 135.9 | Audit log entry created | Logging |
| 135.10 | Changes take effect immediately | Enforcement |

---

## Flow 136: Manage Feature Flags - Venue

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 136.1 | Navigate to Settings then Features then Per-Venue | Navigation |
| 136.2 | Search for venue | Search Input |
| 136.3 | Select venue | Selection |
| 136.4 | View venue feature overrides | Override List |
| 136.5 | Toggle features for this venue | Toggles |
| 136.6 | Use for beta testing | Use Case |
| 136.7 | Use for custom agreements | Use Case |
| 136.8 | Save changes | Save Button |
| 136.9 | Handle success | Success Toast |
| 136.10 | Audit log entry created | Logging |

---

## Flow 137: Emergency Kill Switch

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 137.1 | Navigate to Settings then Emergency | Navigation |
| 137.2 | View kill switch options | Options List |
| 137.3 | Option: Pause all sales | Toggle |
| 137.4 | Option: Pause all signups | Toggle |
| 137.5 | Option: Pause resale marketplace | Toggle |
| 137.6 | Option: Pause all payouts | Toggle |
| 137.7 | Select option | Selection |
| 137.8 | Show serious warning | Warning Modal |
| 137.9 | Enter reason | Text Input |
| 137.10 | Enter password to confirm | Password Input |
| 137.11 | Confirm action | Confirmation |
| 137.12 | Submit | Loading State |
| 137.13 | Handle success | Success Toast |
| 137.14 | System function paused | Enforcement |
| 137.15 | Alert sent to all admins | Notification |
| 137.16 | Audit log entry created | Logging |
| 137.17 | Resume button available | Resume Button |

---

## Flow 138: Set Maintenance Mode

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 138.1 | Navigate to Settings then Maintenance | Navigation |
| 138.2 | View maintenance mode status | Status Display |
| 138.3 | Toggle maintenance mode | Toggle |
| 138.4 | Enter maintenance message | Text Area |
| 138.5 | Set expected end time | DateTime Picker |
| 138.6 | Preview maintenance page | Preview Button |
| 138.7 | Confirm activation | Confirmation |
| 138.8 | Submit | Loading State |
| 138.9 | Handle success | Success Toast |
| 138.10 | Platform shows maintenance page | Public Display |
| 138.11 | Admins can still access | Admin Access |
| 138.12 | Audit log entry created | Logging |

---

## Flow 139: Manage Platform Branding

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 139.1 | Navigate to Settings then Branding | Navigation |
| 139.2 | View current branding | Current Display |
| 139.3 | Upload logo | Logo Upload |
| 139.4 | Upload favicon | Favicon Upload |
| 139.5 | Set primary color | Color Picker |
| 139.6 | Set secondary color | Color Picker |
| 139.7 | Set email header image | Image Upload |
| 139.8 | Set email footer text | Text Input |
| 139.9 | Preview branding | Preview Button |
| 139.10 | Save changes | Save Button |
| 139.11 | Handle success | Success Toast |
| 139.12 | Branding updates across platform | Propagation |

---

## Flow 140: Manage API Keys

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 140.1 | Navigate to Settings then API | Navigation |
| 140.2 | View connected services | Service List |
| 140.3 | Services: Stripe, Email provider, SMS provider, etc. | Services |
| 140.4 | Select service | Selection |
| 140.5 | View current key status | Status Display |
| 140.6 | Key shows masked | Security |
| 140.7 | Update API key | Update Button |
| 140.8 | Enter new key | Key Input |
| 140.9 | Test connection | Test Button |
| 140.10 | Save changes | Save Button |
| 140.11 | Handle success | Success Toast |
| 140.12 | Audit log entry created | Logging |

---

## Flow 141: Manage Webhooks

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 141.1 | Navigate to Settings then Webhooks | Navigation |
| 141.2 | View webhook list | Webhook List |
| 141.3 | Each shows: URL, events, status | List Item |
| 141.4 | Add new webhook | Add Button |
| 141.5 | Enter webhook URL | URL Input |
| 141.6 | Select events to send | Event Checkboxes |
| 141.7 | Events: ticket.purchased, event.created, etc. | Events |
| 141.8 | Generate signing secret | Generate Button |
| 141.9 | Save webhook | Save Button |
| 141.10 | Test webhook | Test Button |
| 141.11 | View webhook logs | Logs Button |
| 141.12 | Disable webhook | Disable Toggle |
| 141.13 | Delete webhook | Delete Button |

---

## Flow 142: View Platform Logs

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 142.1 | Navigate to Settings then Logs | Navigation |
| 142.2 | Load platform logs | Loading State |
| 142.3 | View log entries | Log List |
| 142.4 | Each shows: timestamp, level, service, message | Log Entry |
| 142.5 | Filter by level (Info, Warning, Error) | Level Filter |
| 142.6 | Filter by service | Service Filter |
| 142.7 | Filter by date range | Date Filter |
| 142.8 | Search logs | Search Input |
| 142.9 | View log details | Detail Modal |
| 142.10 | Export logs | Export Button |

---

## Flow 143: View Error Logs

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 143.1 | Navigate to Settings then Logs then Errors | Navigation |
| 143.2 | Load error logs | Loading State |
| 143.3 | View error entries | Error List |
| 143.4 | Each shows: timestamp, error type, message, count | Error Entry |
| 143.5 | Group by error type | Grouping |
| 143.6 | View error frequency | Frequency Chart |
| 143.7 | Tap error for details | Selection |
| 143.8 | View stack trace | Stack Trace |
| 143.9 | View affected users | User List |
| 143.10 | Mark as resolved | Resolve Button |
| 143.11 | Export errors | Export Button |

---

# Compliance Flows

---

## Flow 144: View Data Requests

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 144.1 | Navigate to Compliance then Data Requests | Navigation |
| 144.2 | Load data requests | Loading State |
| 144.3 | View request list | Request List |
| 144.4 | Each shows: user, type, status, date, deadline | List Item |
| 144.5 | Types: Export, Deletion | Types |
| 144.6 | Filter by type | Type Filter |
| 144.7 | Filter by status | Status Filter |
| 144.8 | Tap request for details | Selection |
| 144.9 | View deadline countdown | Deadline Display |

---

## Flow 145: Process Data Export

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 145.1 | From data request, tap "Process" | Button |
| 145.2 | View user data to export | Data Summary |
| 145.3 | Data includes: profile, purchases, activity | Data Categories |
| 145.4 | Generate export | Generate Button |
| 145.5 | Export processing | Loading State |
| 145.6 | Export complete | Complete State |
| 145.7 | Review export file | Review Button |
| 145.8 | Send to user | Send Button |
| 145.9 | User notified with download link | Email |
| 145.10 | Request marked complete | Status Update |
| 145.11 | Audit log entry created | Logging |

---

## Flow 146: View Deletion Requests

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 146.1 | From Compliance, select "Deletion Requests" | Tab |
| 146.2 | Load deletion requests | Loading State |
| 146.3 | View pending deletions | Request List |
| 146.4 | Each shows: user, status, request date, deadline | List Item |
| 146.5 | View legal hold status | Hold Badge |
| 146.6 | Tap request for details | Selection |

---

## Flow 147: Process Deletion Request

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 147.1 | From deletion request, tap "Process" | Button |
| 147.2 | Check for legal holds | Validation |
| 147.3 | If hold: cannot delete | Block |
| 147.4 | View data to be deleted | Data Summary |
| 147.5 | View data to be retained (legal requirement) | Retention List |
| 147.6 | Confirm deletion | Confirmation Dialog |
| 147.7 | Enter reason | Text Input |
| 147.8 | Submit | Loading State |
| 147.9 | Data deleted | Deletion |
| 147.10 | User notified | Email |
| 147.11 | Request marked complete | Status Update |
| 147.12 | Audit log entry created | Logging |

---

## Flow 148: View Consent Records

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 148.1 | Navigate to Compliance then Consent | Navigation |
| 148.2 | Load consent records | Loading State |
| 148.3 | View consent summary | Summary |
| 148.4 | Total users consented | Metric |
| 148.5 | Consent by type | Breakdown |
| 148.6 | Types: Terms, Privacy, Marketing | Types |
| 148.7 | Search user consent | Search Input |
| 148.8 | View user's consent history | User Consent |
| 148.9 | Timestamp of each consent | Timestamps |
| 148.10 | Export consent records | Export Button |

---

## Flow 149: Update Privacy Policy

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 149.1 | Navigate to Compliance then Policies | Navigation |
| 149.2 | Select "Privacy Policy" | Selection |
| 149.3 | View current policy | Policy Display |
| 149.4 | View version history | History Button |
| 149.5 | Edit policy | Edit Button |
| 149.6 | Rich text editor | Editor |
| 149.7 | Preview changes | Preview Button |
| 149.8 | Save as draft | Save Draft |
| 149.9 | Publish policy | Publish Button |
| 149.10 | Set effective date | Date Picker |
| 149.11 | Require re-consent | Toggle |
| 149.12 | Notify users | Toggle |
| 149.13 | Handle success | Success Toast |
| 149.14 | Audit log entry created | Logging |

---

## Flow 150: Update Terms of Service

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 150.1 | Navigate to Compliance then Policies | Navigation |
| 150.2 | Select "Terms of Service" | Selection |
| 150.3 | View current terms | Terms Display |
| 150.4 | View version history | History Button |
| 150.5 | Edit terms | Edit Button |
| 150.6 | Rich text editor | Editor |
| 150.7 | Preview changes | Preview Button |
| 150.8 | Save as draft | Save Draft |
| 150.9 | Publish terms | Publish Button |
| 150.10 | Set effective date | Date Picker |
| 150.11 | Require re-consent | Toggle |
| 150.12 | Notify users | Toggle |
| 150.13 | Handle success | Success Toast |
| 150.14 | Audit log entry created | Logging |

---

## Flow 151: View Compliance Log

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 151.1 | Navigate to Compliance then Log | Navigation |
| 151.2 | Load compliance log | Loading State |
| 151.3 | View all compliance actions | Log List |
| 151.4 | Each shows: date, admin, action, target, notes | Log Entry |
| 151.5 | Actions: export, deletion, policy update, hold | Actions |
| 151.6 | Filter by action type | Action Filter |
| 151.7 | Filter by date range | Date Filter |
| 151.8 | Search log | Search Input |
| 151.9 | Export log | Export Button |
| 151.10 | Log is immutable | Security Note |

---

## Flow 152: Set Legal Hold

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 152.1 | Navigate to Compliance then Legal Holds | Navigation |
| 152.2 | Tap "New Hold" | Button |
| 152.3 | Search for user | Search Input |
| 152.4 | Select user | Selection |
| 152.5 | Enter hold reason | Text Area |
| 152.6 | Enter case/reference number | Text Input |
| 152.7 | Set hold expiration (optional) | Date Picker |
| 152.8 | Confirm hold | Confirmation |
| 152.9 | Submit | Loading State |
| 152.10 | Handle success | Success Toast |
| 152.11 | User data protected from deletion | Enforcement |
| 152.12 | Audit log entry created | Logging |

---

## Flow 153: Remove Legal Hold

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 153.1 | Navigate to Compliance then Legal Holds | Navigation |
| 153.2 | View active holds | Hold List |
| 153.3 | Select hold to remove | Selection |
| 153.4 | Tap "Remove Hold" | Button |
| 153.5 | Enter reason for removal | Text Input |
| 153.6 | Enter authorization | Text Input |
| 153.7 | Confirm removal | Confirmation |
| 153.8 | Submit | Loading State |
| 153.9 | Handle success | Success Toast |
| 153.10 | User data no longer protected | Enforcement |
| 153.11 | Pending deletions can proceed | Process |
| 153.12 | Audit log entry created | Logging |

---

## Flow 154: View Venue Tax Documents

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 154.1 | Navigate to Compliance then Tax Documents | Navigation |
| 154.2 | Load venue tax documents | Loading State |
| 154.3 | View venues with W-9 on file | Venue List |
| 154.4 | View venues missing W-9 | Missing List |
| 154.5 | Search venue | Search Input |
| 154.6 | View venue W-9 | Document View |
| 154.7 | Document stored securely | Security Note |
| 154.8 | Download document | Download Button |
| 154.9 | Request updated W-9 | Request Button |
| 154.10 | Export list | Export Button |

---

## Flow 155: View 1099 Status

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 155.1 | Navigate to Compliance then Tax Documents | Navigation |
| 155.2 | Select "1099 Status" | Tab |
| 155.3 | Load 1099 data | Loading State |
| 155.4 | View venues requiring 1099 | Venue List |
| 155.5 | Threshold: $600+ in payouts | Threshold Note |
| 155.6 | View 1099 generation status | Status Column |
| 155.7 | Statuses: Pending, Generated, Sent | Statuses |
| 155.8 | Managed via Stripe | Stripe Note |
| 155.9 | Link to Stripe dashboard | External Link |
| 155.10 | Export list | Export Button |

---

# Analytics Flows

---

## Flow 156: View Platform Analytics

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 156.1 | Navigate to Analytics | Navigation |
| 156.2 | Load analytics data | Loading State |
| 156.3 | View analytics dashboard | Dashboard |
| 156.4 | Key metrics overview | Metrics Grid |
| 156.5 | Charts and visualizations | Charts |
| 156.6 | Date range selector | Date Picker |
| 156.7 | Refresh data | Refresh Button |
| 156.8 | Quick links to detailed reports | Links |

---

## Flow 157: View Sales Analytics

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 157.1 | From Analytics, select "Sales" | Tab |
| 157.2 | Load sales data | Loading State |
| 157.3 | View total tickets sold | Metric |
| 157.4 | View total revenue | Metric |
| 157.5 | View sales over time | Chart |
| 157.6 | View sales by venue | Table |
| 157.7 | View sales by event | Table |
| 157.8 | View sales by ticket type | Breakdown |
| 157.9 | View average order value | Metric |
| 157.10 | Filter by date range | Date Filter |
| 157.11 | Export data | Export Button |

---

## Flow 158: View User Analytics

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 158.1 | From Analytics, select "Users" | Tab |
| 158.2 | Load user data | Loading State |
| 158.3 | View total users | Metric |
| 158.4 | View users by type (Fan, Venue, Artist) | Breakdown |
| 158.5 | View signups over time | Chart |
| 158.6 | View active users | Metric |
| 158.7 | View retention rate | Metric |
| 158.8 | View churn rate | Metric |
| 158.9 | Filter by date range | Date Filter |
| 158.10 | Export data | Export Button |

---

## Flow 159: View Venue Analytics

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 159.1 | From Analytics, select "Venues" | Tab |
| 159.2 | Load venue data | Loading State |
| 159.3 | View total venues | Metric |
| 159.4 | View active venues | Metric |
| 159.5 | View venue growth over time | Chart |
| 159.6 | View venues by performance | Ranked List |
| 159.7 | View average revenue per venue | Metric |
| 159.8 | View venue onboarding completion | Metric |
| 159.9 | Filter by date range | Date Filter |
| 159.10 | Export data | Export Button |

---

## Flow 160: View Artist Analytics

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 160.1 | From Analytics, select "Artists" | Tab |
| 160.2 | Load artist data | Loading State |
| 160.3 | View total artists | Metric |
| 160.4 | View active artists | Metric |
| 160.5 | View artist signups over time | Chart |
| 160.6 | View artists by event count | Ranked List |
| 160.7 | View average revenue per artist | Metric |
| 160.8 | Filter by date range | Date Filter |
| 160.9 | Export data | Export Button |

---

## Flow 161: View Event Analytics

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 161.1 | From Analytics, select "Events" | Tab |
| 161.2 | Load event data | Loading State |
| 161.3 | View total events | Metric |
| 161.4 | View events by status | Breakdown |
| 161.5 | View events over time | Chart |
| 161.6 | View average attendance | Metric |
| 161.7 | View sellout rate | Metric |
| 161.8 | View cancellation rate | Metric |
| 161.9 | View events by category | Breakdown |
| 161.10 | Filter by date range | Date Filter |
| 161.11 | Export data | Export Button |

---

## Flow 162: View Geographic Analytics

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 162.1 | From Analytics, select "Geographic" | Tab |
| 162.2 | Load geographic data | Loading State |
| 162.3 | View sales by city | Table |
| 162.4 | View sales by state/region | Table |
| 162.5 | View sales by country | Table |
| 162.6 | View map visualization | Map |
| 162.7 | Heat map of activity | Heat Map |
| 162.8 | Zoom and pan | Gestures |
| 162.9 | Filter by date range | Date Filter |
| 162.10 | Export data | Export Button |

---

## Flow 163: View Resale Analytics

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 163.1 | From Analytics, select "Resale" | Tab |
| 163.2 | Load resale data | Loading State |
| 163.3 | View total resale volume | Metric |
| 163.4 | View platform royalties | Metric |
| 163.5 | View average resale price | Metric |
| 163.6 | View resale vs face value | Comparison |
| 163.7 | View resale activity over time | Chart |
| 163.8 | View resale by event | Table |
| 163.9 | View resale by venue | Table |
| 163.10 | Filter by date range | Date Filter |
| 163.11 | Export data | Export Button |

---

## Flow 164: Compare Periods

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 164.1 | From any analytics view, tap "Compare" | Button |
| 164.2 | Select comparison type | Type Selector |
| 164.3 | Types: This vs last month, This vs last year, Custom | Types |
| 164.4 | If custom: select two periods | Date Pickers |
| 164.5 | Load comparison data | Loading State |
| 164.6 | View side-by-side metrics | Comparison Table |
| 164.7 | View percent change | Change Indicators |
| 164.8 | View trend lines | Comparison Chart |
| 164.9 | Green for growth, red for decline | Color Coding |
| 164.10 | Export comparison | Export Button |

---

## Flow 165: View Funnel Analytics

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 165.1 | From Analytics, select "Funnels" | Tab |
| 165.2 | Load funnel data | Loading State |
| 165.3 | View purchase funnel | Funnel Visualization |
| 165.4 | Stages: View Event, Start Checkout, Complete Purchase | Stages |
| 165.5 | View drop-off at each stage | Drop-off Metrics |
| 165.6 | View conversion rate | Percentage |
| 165.7 | Compare funnels over time | Comparison |
| 165.8 | View funnel by device | Device Breakdown |
| 165.9 | Filter by date range | Date Filter |
| 165.10 | Export data | Export Button |

---

## Flow 166: View Cohort Analysis

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 166.1 | From Analytics, select "Cohorts" | Tab |
| 166.2 | Load cohort data | Loading State |
| 166.3 | View cohort grid | Cohort Grid |
| 166.4 | Rows: signup month | Row Labels |
| 166.5 | Columns: months since signup | Column Labels |
| 166.6 | Cells: retention percentage | Cell Values |
| 166.7 | Color coded by retention | Color Coding |
| 166.8 | Select metric: purchases, logins, revenue | Metric Selector |
| 166.9 | View trends | Trend Indicators |
| 166.10 | Export data | Export Button |

---

## Flow 167: Create Custom Report

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 167.1 | From Analytics, tap "Custom Report" | Button |
| 167.2 | Select data source | Source Selector |
| 167.3 | Sources: Sales, Users, Events, Venues | Sources |
| 167.4 | Select metrics | Metric Checkboxes |
| 167.5 | Select dimensions | Dimension Checkboxes |
| 167.6 | Add filters | Filter Builder |
| 167.7 | Select visualization type | Chart Selector |
| 167.8 | Types: Table, Bar, Line, Pie | Chart Types |
| 167.9 | Preview report | Preview |
| 167.10 | Run report | Run Button |
| 167.11 | View results | Results Display |
| 167.12 | Save report | Save Button |

---

## Flow 168: Save Custom Report

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 168.1 | From custom report, tap "Save" | Button |
| 168.2 | Enter report name | Text Input |
| 168.3 | Enter description | Text Area |
| 168.4 | Select visibility | Visibility Selector |
| 168.5 | Options: Just me, All admins | Options |
| 168.6 | Save report | Save Button |
| 168.7 | Handle success | Success Toast |
| 168.8 | Report appears in saved list | List Update |
| 168.9 | Access from "My Reports" | Navigation |

---

## Flow 169: Export Analytics

| Step | What Happens | Screen/State |
|------|--------------|--------------|
| 169.1 | From any analytics view, tap "Export" | Button |
| 169.2 | Select data to export | Data Selector |
| 169.3 | Select date range | Date Range Picker |
| 169.4 | Select format (CSV, Excel, PDF) | Format Selector |
| 169.5 | Include charts (PDF only) | Toggle |
| 169.6 | Generate export | Generate Button |
| 169.7 | Download file | Download |
| 169.8 | Handle success | Success Toast |

---

# End of Admin User Flows

---

## Summary Statistics

| Section | Flows | Flow Numbers |
|---------|-------|--------------|
| Account | 11 | 1-11 |
| Dashboard | 16 | 12-27 |
| User Management - Fans | 13 | 28-40 |
| User Management - Venues | 17 | 41-57 |
| User Management - Artists | 16 | 58-73 |
| Event Oversight | 13 | 74-86 |
| Financial | 14 | 87-100 |
| Content Moderation | 10 | 101-110 |
| Support Tickets | 15 | 111-125 |
| Platform Settings | 18 | 126-143 |
| Compliance | 12 | 144-155 |
| Analytics | 14 | 156-169 |
| **Total** | **169** | |

**Total Steps: ~1,800+**

