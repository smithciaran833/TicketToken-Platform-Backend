# Sub-Processor Documentation
## Order Service - Third-Party Data Processors

**Last Updated:** 2024-12-28
**Review Frequency:** Quarterly

---

## Overview

This document lists all sub-processors that receive personal data from the order-service, as required by GDPR Article 28 and for contractual transparency.

---

## Active Sub-Processors

### 1. Stripe, Inc.

| Field | Details |
|-------|---------|
| **Purpose** | Payment processing, refunds, dispute handling |
| **Data Shared** | Name, email, payment method tokens, order amounts |
| **Location** | United States |
| **DPA Status** | Signed (Stripe DPA) |
| **Certifications** | PCI DSS Level 1, SOC 2 Type II |
| **Website** | https://stripe.com |
| **Contact** | privacy@stripe.com |

**Safeguards:**
- EU-US Data Privacy Framework certified
- Standard Contractual Clauses in place
- Payment details tokenized, not stored locally

---

### 2. Amazon Web Services (AWS)

| Field | Details |
|-------|---------|
| **Purpose** | Infrastructure hosting, database, caching |
| **Data Shared** | All order data (encrypted) |
| **Location** | US-East-1 (primary), EU-West-1 (EU customers) |
| **DPA Status** | AWS DPA accepted |
| **Certifications** | SOC 1/2/3, ISO 27001, PCI DSS |
| **Website** | https://aws.amazon.com |

**Safeguards:**
- Encryption at rest (AES-256)
- VPC isolation
- AWS GDPR compliance

---

### 3. SendGrid (Twilio)

| Field | Details |
|-------|---------|
| **Purpose** | Transactional email delivery |
| **Data Shared** | Email addresses, order confirmations |
| **Location** | United States |
| **DPA Status** | Twilio DPA signed |
| **Certifications** | SOC 2 Type II, ISO 27001 |
| **Website** | https://sendgrid.com |

**Safeguards:**
- TLS encryption
- Limited data retention
- EU processing available

---

### 4. Twilio (SMS)

| Field | Details |
|-------|---------|
| **Purpose** | SMS notifications |
| **Data Shared** | Phone numbers, notification content |
| **Location** | United States |
| **DPA Status** | Signed |
| **Certifications** | SOC 2 Type II |
| **Website** | https://twilio.com |

**Safeguards:**
- Message content not logged
- Minimal retention

---

## Pending Sub-Processors

*None at this time*

---

## Recently Removed

| Processor | Removal Date | Reason |
|-----------|--------------|--------|
| *None* | - | - |

---

## Sub-Processor Change Notification

Customers are notified of sub-processor changes via:
1. Email notification (30 days advance)
2. Updates to this document
3. In-app notification (for material changes)

**Objection Period:** 30 days from notification

---

## Review Log

| Date | Reviewer | Changes |
|------|----------|---------|
| 2024-12-28 | DPO | Initial documentation |
| - | - | - |

---

## Contact

For questions about sub-processors:
- **Email:** privacy@tickettoken.com
- **DPO:** dpo@tickettoken.com
