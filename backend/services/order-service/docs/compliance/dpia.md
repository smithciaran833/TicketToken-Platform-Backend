# Data Protection Impact Assessment (DPIA)
## Order Service - GDPR Article 35 Compliance

**Assessment Date:** 2024-12-28
**Assessor:** Data Protection Officer
**Status:** Approved

---

## 1. Processing Description

### 1.1 Nature of Processing
The order-service processes personal data to:
- Create and manage ticket orders
- Process payments via third-party processors
- Handle refund requests
- Detect fraudulent transactions
- Communicate with customers about orders

### 1.2 Scope
- **Data Volume:** ~100,000 orders/month
- **Data Subjects:** Event attendees, ticket purchasers
- **Geographic Scope:** Global, primarily US/EU

### 1.3 Context
- B2C ticket marketplace
- Integration with payment processors
- Multi-tenant architecture serving venues/organizers

---

## 2. Necessity and Proportionality

### 2.1 Lawful Basis
| Processing | Legal Basis |
|------------|-------------|
| Order processing | Contract performance |
| Payment processing | Contract performance |
| Fraud detection | Legitimate interest |
| Marketing (optional) | Consent |

### 2.2 Data Minimization
- Only essential data collected for each purpose
- Payment details not stored (tokenized by Stripe)
- Anonymization after retention period

### 2.3 Retention Limits
| Data Type | Retention | Justification |
|-----------|-----------|---------------|
| Order records | 7 years | Legal/tax requirements |
| Fraud signals | 2 years | Detection patterns |
| Communication logs | 3 years | Dispute resolution |

---

## 3. Risk Assessment

### 3.1 Identified Risks

| Risk | Likelihood | Impact | Score |
|------|------------|--------|-------|
| Data breach | Medium | High | HIGH |
| Unauthorized access | Low | High | MEDIUM |
| Cross-tenant data leak | Low | Critical | HIGH |
| Third-party breach | Medium | High | HIGH |

### 3.2 Risk Details

#### R1: Data Breach
- **Cause:** SQL injection, misconfiguration, insider threat
- **Impact:** PII exposure, regulatory fines, reputation damage
- **Mitigation:** 
  - Input validation
  - Parameterized queries
  - Encryption at rest
  - Access logging

#### R2: Unauthorized Access
- **Cause:** Weak authentication, stolen credentials
- **Impact:** Unauthorized order access, fraud
- **Mitigation:**
  - JWT with short expiry
  - Rate limiting
  - Multi-factor auth (planned)

#### R3: Cross-Tenant Data Leak
- **Cause:** RLS bypass, query bugs
- **Impact:** Tenant data exposure
- **Mitigation:**
  - Row-level security
  - Tenant isolation testing
  - Query audit

#### R4: Third-Party Breach
- **Cause:** Stripe or other processor compromise
- **Impact:** Payment data exposure
- **Mitigation:**
  - PCI compliance
  - Token-only storage
  - Vendor security reviews

---

## 4. Measures to Address Risks

### 4.1 Technical Measures
- [x] Encryption at rest (AES-256)
- [x] Encryption in transit (TLS 1.3)
- [x] Parameterized queries
- [x] Input validation
- [x] Rate limiting
- [x] Row-level security
- [x] Audit logging
- [ ] Multi-factor authentication (Q2 2025)

### 4.2 Organizational Measures
- [x] Access control policies
- [x] Security training
- [x] Incident response plan
- [x] Vendor security reviews
- [ ] Annual penetration testing (scheduled)

---

## 5. Consultation

### 5.1 Stakeholders Consulted
- Engineering team
- Legal/Compliance
- Customer Support
- External DPO

### 5.2 Data Subject Input
- Privacy notice reviewed
- Opt-out mechanisms verified

---

## 6. Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| DPO | [Name] | 2024-12-28 | Approved |
| Engineering Lead | [Name] | 2024-12-28 | Approved |
| Legal | [Name] | 2024-12-28 | Approved |

---

## 7. Review Schedule
- **Next Review:** 2025-06-28
- **Trigger Events:** 
  - New processing activities
  - Significant system changes
  - Security incidents
  - Regulatory changes
