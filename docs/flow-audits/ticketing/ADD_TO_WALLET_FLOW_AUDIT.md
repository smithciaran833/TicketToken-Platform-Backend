# ADD TO APPLE/GOOGLE WALLET FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Add Ticket to Apple Wallet / Google Wallet |

---

## Executive Summary

**DEAD CODE - Service exists, never called**

| Component | Status |
|-----------|--------|
| WalletPassService | ✅ Exists |
| Apple Pass structure | ✅ Defined (mock) |
| Google Pass structure | ✅ Defined (mock) |
| Pass signing (Apple) | ❌ Not implemented (returns mock) |
| Pass signing (Google) | ❌ Not implemented (returns unsigned JWT) |
| sendTicketConfirmation orchestrator | ✅ Exists |
| Integration with ticket purchase | ❌ Never called |
| API endpoint for passes | ❌ Not implemented |

**Bottom Line:** The `WalletPassService` exists in notification-service with Apple and Google Wallet pass generation logic, and `NotificationOrchestrator.sendTicketConfirmation()` uses it. However, **nothing calls this method** - it's dead code. The pass generation also returns mock/unsigned data, not production-ready passes.

---

## What Exists (Dead Code)

### 1. WalletPassService

**File:** `backend/services/notification-service/src/services/wallet-pass.service.ts`

**Methods:**
- `generateApplePass(data)` - Returns pass JSON structure (not signed .pkpass)
- `generateGooglePass(data)` - Returns unsigned JWT URL
- `generatePassQRCode(ticketId)` - Generates QR code data URL

### 2. Apple Pass Structure (Mock)
```typescript
const pass = {
  formatVersion: 1,
  passTypeIdentifier: process.env.APPLE_PASS_TYPE_ID || 'pass.com.tickettoken',
  serialNumber: data.ticketId,
  teamIdentifier: process.env.APPLE_TEAM_ID || 'ABCDE12345',
  organizationName: 'TicketToken',
  description: `Ticket for ${data.eventName}`,
  
  eventTicket: {
    primaryFields: [{ key: 'event', label: 'EVENT', value: data.eventName }],
    secondaryFields: [
      { key: 'loc', label: 'VENUE', value: data.venueName },
      { key: 'date', label: 'DATE', value: formattedDate },
    ],
    // ... more fields
  },
  
  barcode: {
    format: 'PKBarcodeFormatQR',
    message: data.qrCodeData,
    messageEncoding: 'iso-8859-1',
  },
};

// Returns JSON, NOT a signed .pkpass file
return Buffer.from(JSON.stringify(pass));
```

### 3. Google Pass Structure (Mock)
```typescript
const jwt = {
  iss: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  aud: 'google',
  typ: 'savetowallet',
  payload: {
    eventTicketObjects: [{
      id: `${process.env.GOOGLE_ISSUER_ID}.${data.ticketId}`,
      ticketHolderName: data.customerName,
      barcode: { type: 'QR_CODE', value: data.qrCodeData },
      // ... more fields
    }],
  },
};

// Returns unsigned URL - won't work with Google
const token = Buffer.from(JSON.stringify(jwt)).toString('base64url');
return `https://pay.google.com/gp/v/save/${token}`;
```

### 4. NotificationOrchestrator.sendTicketConfirmation()

**File:** `backend/services/notification-service/src/services/notification-orchestrator.ts`
```typescript
async sendTicketConfirmation(data: {...}) {
  // Generate wallet passes
  const qrCode = await walletPassService.generatePassQRCode(data.ticketId);
  const googlePassUrl = await walletPassService.generateGooglePass(passData);
  
  // Apple pass commented out
  // const _applePass = await walletPassService.generateApplePass(passData);
  
  // Rich media buttons commented out
  // const richMedia = { buttons: [...] };
  
  await notificationService.send({
    template: 'purchase_confirmation',
    data: {
      qrCode,
      applePassUrl: `${process.env.API_URL}/passes/apple/${data.ticketId}`,
      googlePassUrl,
    },
  });
}
```

**Problem:** This method is never called by any service.

---

## What's Missing

### 1. No Integration with Purchase Flow
```bash
# Search for callers
rg "sendTicketConfirmation|notificationOrchestrator" backend/services/ --type ts -l | grep -v notification-service
# Result: NOTHING
```

### 2. No API Endpoints for Passes

Expected but not implemented:
```
GET /api/v1/passes/apple/:ticketId  → Returns .pkpass file
GET /api/v1/passes/google/:ticketId → Redirects to Google Wallet
```

### 3. No Pass Signing

**Apple Wallet requires:**
- Apple Developer certificate
- Pass Type ID certificate
- Manifest signing with PKCS#7
- .pkpass ZIP archive creation

**Google Wallet requires:**
- Google Cloud service account
- JWT signing with RS256
- Event ticket class setup in Google Pay Console

---

## To Make This Work

### P3 - Complete Wallet Pass Implementation

| Task | Effort |
|------|--------|
| Set up Apple Developer certificates | 0.5 day |
| Implement proper .pkpass signing | 1 day |
| Set up Google Wallet API credentials | 0.5 day |
| Implement proper JWT signing | 0.5 day |
| Create API endpoints for pass download | 0.5 day |
| Call sendTicketConfirmation from purchase flow | 0.5 day |
| Create pass update on ticket transfer | 1 day |
| **Total** | **4-5 days** |

### Integration Point

In `ticket-service` or `order-service`, after successful purchase:
```typescript
// After payment confirmed
await notificationOrchestrator.sendTicketConfirmation({
  ticketId,
  customerId,
  customerEmail,
  customerName,
  eventName,
  venueName,
  venueAddress,
  eventDate,
  seatInfo,
});
```

---

## Files Involved

| File | Status |
|------|--------|
| `notification-service/src/services/wallet-pass.service.ts` | ✅ Exists (mock) |
| `notification-service/src/services/notification-orchestrator.ts` | ✅ Exists (dead code) |
| `notification-service/src/routes/` | ❌ No pass endpoints |
| `ticket-service/src/` | ❌ No integration |

---

## Related Documents

- `NOTIFICATION_FLOW_AUDIT.md` - Notification service (events not published)
- `PRIMARY_PURCHASE_FLOW_AUDIT.md` - Where integration should happen
- `VIEW_SINGLE_TICKET_QR_FLOW_AUDIT.md` - QR code generation
