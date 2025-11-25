# PHASE 1 - CRITICAL VENUE OPERATIONS 🏟️

**Priority:** HIGHEST - Do these first  
**Time Estimate:** 6-8 hours  
**Goal:** Test core venue CRUD and management

---

## TEST FILES TO CREATE

### 1. `venue-crud.test.ts` ⭐ MOST IMPORTANT
**Venue lifecycle operations**
- Create venue with all required fields
- Get venue by ID
- List all venues (pagination)
- Update venue details
- Update venue location
- Update venue capacity
- Soft delete venue
- Restore deleted venue
- Permanent delete venue
- Search venues by name/location
- Filter venues by capacity/features

**Files Tested:**
- controllers/venues.controller.ts
- services/venue.service.ts
- models/venue.model.ts
- schemas/venue.schema.ts

---

### 2. `venue-validation.test.ts`
**Input validation**
- Required fields validation
- Max capacity must be positive
- Address validation
- City/state/zip validation
- Country code validation
- Phone number format
- Email format
- URL validation (website)
- Coordinates validation (lat/long)
- Name length limits
- Description length limits

**Files Tested:**
- schemas/venue.schema.ts
- middleware/validation.middleware.ts
- controllers/venues.controller.ts

---

### 3. `staff-management.test.ts`
**Venue staff operations**
- Add staff member to venue
- List venue staff
- Update staff role
- Update staff permissions
- Remove staff from venue
- Staff access control
- Multiple venues per staff
- Staff invitation flow
- Staff acceptance/rejection

**Files Tested:**
- models/staff.model.ts
- services/venue.service.ts
- controllers/venues.controller.ts

---

### 4. `venue-settings.test.ts`
**Venue configuration**
- Get venue settings
- Update general settings
- Update operational hours
- Update booking settings
- Update pricing defaults
- Update notification preferences
- Update accessibility features
- Settings validation
- Settings history/audit

**Files Tested:**
- controllers/settings.controller.ts
- models/settings.model.ts
- schemas/settings.schema.ts

---

### 5. `venue-layout.test.ts`
**Seating and layout**
- Create venue layout
- Define sections
- Define rows and seats
- Update seat availability
- Mark seats as accessible
- VIP sections
- General admission areas
- Standing room capacity
- Layout visualization data

**Files Tested:**
- models/layout.model.ts
- services/venue.service.ts

---

### 6. `venue-authorization.test.ts`
**Access control**
- Admin can create venues
- Venue manager can update own venue
- Venue manager cannot update other venues
- Staff can view venue
- Staff cannot delete venue
- User cannot create venues
- Role-based permissions
- Tenant isolation

**Files Tested:**
- middleware/auth.middleware.ts
- All controllers (auth checks)

---

## SUCCESS CRITERIA

- ✅ All 6 test files created
- ✅ Venue CRUD working perfectly
- ✅ Validation catching bad inputs
- ✅ Staff management functional
- ✅ Settings properly managed
- ✅ Layout system working
- ✅ Authorization enforced
