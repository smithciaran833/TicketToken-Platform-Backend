# Records of Processing Activities (ROPA)
## Order Service - GDPR Article 30 Compliance

**Last Updated:** 2024-12-28
**Data Controller:** TicketToken Inc.
**DPO Contact:** dpo@tickettoken.com

---

## 1. Processing Activity: Order Management

| Field | Details |
|-------|---------|
| **Purpose** | Process ticket purchases, manage order lifecycle |
| **Legal Basis** | Contract performance (Article 6(1)(b)) |
| **Data Subjects** | Customers, Event Attendees |
| **Categories of Data** | Name, email, order history, payment references |
| **Recipients** | Payment processors (Stripe), Event organizers |
| **Transfers** | US (Stripe), as needed for event fulfillment |
| **Retention** | 7 years (financial records requirement) |
| **Security Measures** | Encryption, access controls, audit logging |

---

## 2. Processing Activity: Refund Processing

| Field | Details |
|-------|---------|
| **Purpose** | Process refund requests, verify eligibility |
| **Legal Basis** | Contract performance, Legal obligation |
| **Data Subjects** | Customers requesting refunds |
| **Categories of Data** | Order details, refund reason, communication records |
| **Recipients** | Payment processors, Event organizers |
| **Transfers** | US (Stripe) |
| **Retention** | 7 years |
| **Security Measures** | Encryption, audit trails, access controls |

---

## 3. Processing Activity: Fraud Detection

| Field | Details |
|-------|---------|
| **Purpose** | Detect and prevent fraudulent transactions |
| **Legal Basis** | Legitimate interest (Article 6(1)(f)) |
| **Data Subjects** | All customers |
| **Categories of Data** | Transaction patterns, IP addresses, device info |
| **Recipients** | Internal fraud team |
| **Transfers** | None |
| **Retention** | 2 years |
| **Security Measures** | Anonymization where possible, access controls |

---

## 4. Processing Activity: Dispute Handling

| Field | Details |
|-------|---------|
| **Purpose** | Handle chargebacks and payment disputes |
| **Legal Basis** | Legal obligation, Legitimate interest |
| **Data Subjects** | Customers with disputes |
| **Categories of Data** | Order details, evidence, communication records |
| **Recipients** | Payment processors, Card networks |
| **Transfers** | US (Stripe, card networks) |
| **Retention** | 7 years |
| **Security Measures** | Encryption, audit trails |

---

## 5. Data Flows
```
Customer → Order Service → Database (encrypted)
                        → Payment Service → Stripe
                        → Notification Service → Email/SMS
                        → Event Service → Event organizer
```

---

## 6. Technical & Organizational Measures

- **Encryption:** AES-256 at rest, TLS 1.3 in transit
- **Access Control:** Role-based, JWT authentication
- **Audit Logging:** All data access logged
- **Multi-tenancy:** Row-level security isolation
- **Backups:** Daily encrypted backups, 30-day retention

---

## 7. Data Subject Rights Procedures

| Right | Procedure |
|-------|-----------|
| Access | Export via admin API within 30 days |
| Rectification | Update via user profile or support request |
| Erasure | Anonymization after retention period |
| Portability | JSON export available |
| Objection | Contact DPO, processing review |

---

## Review Schedule
- Quarterly review by Data Protection team
- Annual audit by external assessor
