# INVOICE GENERATION FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Invoice / Receipt Generation |

---

## Executive Summary

**NOT IMPLEMENTED - No invoice or receipt generation**

| Component | Status |
|-----------|--------|
| Invoice generation | ❌ Not implemented |
| Receipt generation | ❌ Not implemented |
| PDF invoice download | ❌ Not implemented |
| Email receipt after purchase | ❌ Not implemented |
| Invoice numbering | ❌ Not implemented |
| Tax invoice compliance | ❌ Not implemented |
| QuickBooks invoice sync | ⚠️ Schema exists in integration-service |

**Bottom Line:** There is no invoice or receipt generation functionality. After a purchase, users receive tickets but no formal receipt or invoice. The integration-service has QuickBooks sync schemas that reference invoices, but no actual invoice generation exists.

---

## What Exists

### QuickBooks Integration Schema

**File:** `backend/services/integration-service/src/services/providers/quickbooks-sync.service.ts`

References to invoice syncing with QuickBooks exist, but this is for syncing externally-created invoices, not generating them.

---

## What's Missing

### 1. Invoice Table
```sql
-- NOT IMPLEMENTED
CREATE TABLE invoices (
  id UUID PRIMARY KEY,
  invoice_number VARCHAR(50) UNIQUE,
  order_id UUID REFERENCES orders(id),
  user_id UUID REFERENCES users(id),
  venue_id UUID REFERENCES venues(id),
  tenant_id UUID,
  
  subtotal INTEGER,  -- cents
  tax_amount INTEGER,
  total_amount INTEGER,
  currency VARCHAR(3),
  
  billing_name VARCHAR(255),
  billing_email VARCHAR(255),
  billing_address JSONB,
  
  issued_at TIMESTAMP DEFAULT NOW(),
  due_at TIMESTAMP,
  paid_at TIMESTAMP,
  
  pdf_url VARCHAR(500),
  status VARCHAR(20)  -- 'draft', 'issued', 'paid', 'void'
);
```

### 2. Invoice Generation Service
```typescript
// NOT IMPLEMENTED
class InvoiceService {
  async generateInvoice(orderId: string): Promise<Invoice> {
    // 1. Get order details
    // 2. Generate invoice number (sequential)
    // 3. Calculate line items, taxes
    // 4. Create invoice record
    // 5. Generate PDF
    // 6. Store in S3/storage
    // 7. Return invoice with download URL
  }
  
  async emailInvoice(invoiceId: string): Promise<void> {
    // Send invoice PDF via email
  }
  
  async getInvoicePDF(invoiceId: string): Promise<Buffer> {
    // Return PDF buffer
  }
}
```

### 3. API Endpoints

Expected but not implemented:
```
GET  /api/v1/orders/:orderId/invoice     - Get/generate invoice
GET  /api/v1/invoices/:invoiceId         - Get invoice details
GET  /api/v1/invoices/:invoiceId/pdf     - Download PDF
POST /api/v1/invoices/:invoiceId/email   - Email invoice
GET  /api/v1/users/me/invoices           - List user's invoices
```

### 4. Email Receipt After Purchase

Purchase confirmation email should include receipt details or PDF attachment.

---

## Impact

| Area | Impact |
|------|--------|
| User experience | No proof of purchase |
| Business customers | Cannot expense tickets |
| Tax compliance | No tax invoices for VAT/GST |
| Accounting | Manual reconciliation needed |
| Refunds | No document trail |

---

## Recommendations

### P2 - Implement Invoice Generation

| Task | Effort |
|------|--------|
| Create invoices table | 0.25 day |
| Invoice numbering system | 0.25 day |
| Invoice generation service | 1 day |
| PDF generation (PDFKit/Puppeteer) | 1 day |
| API endpoints | 0.5 day |
| Email integration | 0.5 day |
| Auto-generate on purchase | 0.5 day |
| **Total** | **4 days** |

---

## Related Documents

- `PRIMARY_PURCHASE_FLOW_AUDIT.md` - Where invoice should be generated
- `ORDER_HISTORY_FLOW_AUDIT.md` - Where invoices should be accessible
- `TAX_CALCULATION_REPORTING_FLOW_AUDIT.md` - Tax amounts for invoices
