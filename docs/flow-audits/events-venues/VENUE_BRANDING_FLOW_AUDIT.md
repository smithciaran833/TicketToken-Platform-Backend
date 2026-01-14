# VENUE BRANDING FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Venue Branding / White-Label |

---

## Executive Summary

**WORKING - Full white-label branding system**

| Component | Status |
|-----------|--------|
| Get branding by venue | ✅ Working |
| Get branding by domain | ✅ Working |
| Update branding | ✅ Working |
| Generate CSS variables | ✅ Working |
| Pricing tiers | ✅ Working |
| Tier upgrade/downgrade | ✅ Working |
| Tier history | ✅ Working |
| Color validation | ✅ Working |
| Tier-gated features | ✅ Working |

**Bottom Line:** Complete white-label system allowing venues to customize colors, fonts, logos, email templates, and ticket designs. Tier-gated (requires white-label or enterprise tier).

---

## API Endpoints

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/branding/:venueId` | GET | Get branding | ✅ Working |
| `/branding/domain/:domain` | GET | Get by domain | ✅ Working |
| `/branding/:venueId` | PUT | Update branding | ✅ Working |
| `/branding/:venueId/css` | GET | Get CSS vars | ✅ Working |
| `/branding/pricing/tiers` | GET | List tiers | ✅ Working |
| `/branding/:venueId/tier` | POST | Change tier | ✅ Working |
| `/branding/:venueId/tier/history` | GET | Tier history | ✅ Working |

---

## Branding Configuration
```typescript
interface BrandingConfig {
  // Colors
  primaryColor: string;       // Main brand color
  secondaryColor: string;     // Secondary color
  accentColor: string;        // Accent/highlight color
  textColor: string;          // Text color
  backgroundColor: string;    // Background color
  
  // Typography
  fontFamily: string;         // Body font
  headingFont: string;        // Heading font
  
  // Logos & Images
  logoUrl: string;            // Primary logo
  logoDarkUrl: string;        // Logo for dark backgrounds
  faviconUrl: string;         // Favicon
  emailHeaderImage: string;   // Email header
  ticketBackgroundImage: string;  // Ticket background
  
  // Custom CSS
  customCss: string;          // Additional CSS
  
  // Email Settings
  emailFromName: string;      // Email sender name
  emailReplyTo: string;       // Reply-to address
  emailFooterText: string;    // Email footer
  
  // Ticket Settings
  ticketHeaderText: string;   // Ticket header
  ticketFooterText: string;   // Ticket footer
  
  // Social/SEO
  ogImageUrl: string;         // Open Graph image
  ogDescription: string;      // OG description
}
```

---

## CSS Generation
```typescript
generateCssVariables(branding: any): string {
  return `
    :root {
      --brand-primary: ${branding.primary_color || '#667eea'};
      --brand-secondary: ${branding.secondary_color || '#764ba2'};
      --brand-accent: ${branding.accent_color || '#f093fb'};
      --brand-text: ${branding.text_color || '#333333'};
      --brand-background: ${branding.background_color || '#ffffff'};
      --brand-font: ${branding.font_family || 'Inter'}, sans-serif;
      --brand-heading-font: ${branding.heading_font || 'Inter'}, sans-serif;
    }
    ${branding.custom_css || ''}
  `;
}
```

---

## Pricing Tiers

| Tier | Features |
|------|----------|
| Standard | No branding customization |
| White-Label | Full branding, custom domain |
| Enterprise | Everything + custom integrations |

### Tier Change
```typescript
async changeTier(venueId: string, newTier: string, changedBy: string, reason?: string) {
  // Update venue tier
  await db('venues').update({
    pricing_tier: newTier,
    hide_platform_branding: tierConfig.hide_platform_branding
  });
  
  // Record in history
  await db('venue_tier_history').insert({
    venue_id: venueId,
    from_tier: oldTier,
    to_tier: newTier,
    reason,
    changed_by: changedBy
  });
  
  // If downgrading, suspend custom domain
  if (newTier === 'standard') {
    await db('custom_domains').update({ status: 'suspended' });
  }
}
```

---

## Tier Enforcement
```typescript
async upsertBranding(config: BrandingConfig) {
  // Check if venue has white-label tier
  if (venue.pricing_tier === 'standard') {
    throw new Error('Branding customization requires white-label or enterprise tier');
  }
  
  // Proceed with branding update...
}
```

---

## Default Branding

When no custom branding is set:
```typescript
{
  primary_color: '#667eea',
  secondary_color: '#764ba2',
  accent_color: '#f093fb',
  text_color: '#333333',
  background_color: '#ffffff',
  font_family: 'Inter',
  email_from_name: 'TicketToken',
  email_footer_text: 'Powered by TicketToken'
}
```

---

## Files Involved

| File | Purpose |
|------|---------|
| `venue-service/src/routes/branding.routes.ts` | Routes |
| `venue-service/src/services/branding.service.ts` | Implementation |

---

## Related Documents

- `CUSTOM_DOMAINS_FLOW_AUDIT.md` - Domain management
- `VENUE_SETTINGS_FLOW_AUDIT.md` - Venue config
- `NOTIFICATION_TEMPLATES_FLOW_AUDIT.md` - Email branding
