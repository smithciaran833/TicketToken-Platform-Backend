# TicketToken — Frontend Tech Stack

Version: 1.0
Last Updated: 2024-12-28

---

## Overview

| App | Framework | Platform |
|-----|-----------|----------|
| Fan Web | React + Vite | Web |
| Fan Mobile | React Native + Expo | iOS/Android |
| Venue Dashboard | React + Vite | Web |
| Artist Dashboard | React + Vite | Web |
| Admin Dashboard | React + Vite | Web |
| Scanner App | React Native + Expo | iOS/Android |

---

## 1. Core Frameworks

### Web Apps
- **React 18** - UI framework
- **Vite** - Build tool (fast, modern)
- **TypeScript** - Type safety

### Mobile Apps
- **React Native** - Cross-platform mobile
- **Expo** - Development toolkit, easier builds
- **TypeScript** - Type safety

---

## 2. Routing

### Web
**React Router v6**
```bash
npm install react-router-dom
```

### Mobile
**React Navigation v6**
```bash
npm install @react-navigation/native @react-navigation/stack
```

### URL Structure (Web)
```
# Fan App
/                           # Home
/events                     # Browse events
/events/:slug               # Event detail
/checkout/:eventId          # Checkout
/my-tickets                 # My tickets (protected)
/my-tickets/:id             # Ticket detail (protected)
/orders                     # Order history (protected)
/settings                   # Settings (protected)
/login                      # Login
/signup                     # Sign up

# Venue Dashboard
/venue                      # Dashboard home
/venue/events               # Events list
/venue/events/new           # Create event
/venue/events/:id           # Event detail
/venue/events/:id/edit      # Edit event
/venue/scanning             # Scanning home
/venue/analytics            # Analytics
/venue/financials           # Financials
/venue/team                 # Team management
/venue/settings             # Settings

# Artist Dashboard
/artist                     # Dashboard home
/artist/profile             # Profile management
/artist/events              # Events
/artist/analytics           # Analytics
/artist/team                # Team
/artist/settings            # Settings

# Admin Dashboard
/admin                      # Dashboard home
/admin/users/fans           # Fan management
/admin/users/venues         # Venue management
/admin/users/artists        # Artist management
/admin/events               # Events
/admin/financials           # Financials
/admin/moderation           # Content moderation
/admin/support              # Support tickets
/admin/platform             # Platform settings
```

### Protected Routes
```tsx
// Redirect to login if not authenticated
// After login, redirect back to original destination

<Route path="/my-tickets" element={
  <ProtectedRoute>
    <MyTickets />
  </ProtectedRoute>
} />
```

---

## 3. State Management

**Zustand** - Simple, lightweight, modern
```bash
npm install zustand
```

### Why Zustand over Redux?
- Less boilerplate
- Easier to learn
- Good enough for most apps
- Can add Redux later if needed

### Store Structure
```
stores/
  useAuthStore.ts      # User, tokens, login state
  useCartStore.ts      # Cart items (Fan app)
  useUIStore.ts        # Modals, toasts, sidebar state
```

---

## 4. API Layer

### Data Fetching
**TanStack Query (React Query)** - Caching, loading states, error handling
```bash
npm install @tanstack/react-query
```

### HTTP Client
**Axios** - HTTP requests
```bash
npm install axios
```

### Structure
```
api/
  client.ts            # Axios instance with interceptors
  endpoints/
    events.ts          # Event API calls
    tickets.ts         # Ticket API calls
    auth.ts            # Auth API calls
    ...
```

### Pattern
```tsx
// api/endpoints/events.ts
export const getEvents = () => api.get('/events');
export const getEvent = (id: string) => api.get(`/events/${id}`);

// In component
const { data, isLoading, error } = useQuery({
  queryKey: ['events'],
  queryFn: getEvents
});
```

---

## 5. Project Structure

### Monorepo Setup

Using **Turborepo** for monorepo management:
```
tickettoken-frontend/
├── apps/
│   ├── fan-web/              # Fan website
│   ├── fan-mobile/           # Fan mobile app
│   ├── venue-dashboard/      # Venue dashboard
│   ├── artist-dashboard/     # Artist dashboard
│   ├── admin-dashboard/      # Admin dashboard
│   └── scanner-app/          # Scanner mobile app
├── packages/
│   ├── ui/                   # Shared UI components
│   ├── api/                  # Shared API client
│   ├── types/                # Shared TypeScript types
│   └── utils/                # Shared utilities
├── package.json
├── turbo.json
└── tsconfig.base.json
```

### App Structure (each app)
```
src/
├── components/          # App-specific components
│   ├── common/          # Buttons, inputs, cards
│   ├── layout/          # Sidebar, header, footer
│   └── features/        # Feature-specific components
├── pages/               # Route pages
├── hooks/               # Custom hooks
├── stores/              # Zustand stores
├── api/                 # API calls (or import from packages/api)
├── utils/               # Helper functions
├── types/               # TypeScript types
├── assets/              # Images, fonts
├── styles/              # Global styles
├── App.tsx
└── main.tsx
```

---

## 6. Authentication

### Flow
1. User logs in → Backend returns access token + refresh token
2. Access token stored in memory (Zustand store)
3. Refresh token stored in httpOnly cookie (secure)
4. Access token sent with every API request
5. When access token expires, use refresh token to get new one
6. On logout, clear tokens and redirect to login

### Implementation
```tsx
// api/client.ts
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Try refresh token
      // If refresh fails, logout
    }
    return Promise.reject(error);
  }
);
```

---

## 7. Form Handling

**React Hook Form** - Form state management
**Zod** - Schema validation
```bash
npm install react-hook-form zod @hookform/resolvers
```

### Pattern
```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be 8+ characters'),
});

function LoginForm() {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema)
  });

  const onSubmit = (data) => {
    // Call API
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('email')} />
      {errors.email && <span>{errors.email.message}</span>}
      ...
    </form>
  );
}
```

---

## 8. Testing (Later)

### Unit & Integration
**Vitest** - Fast, Vite-native
```bash
npm install -D vitest @testing-library/react
```

### E2E
**Playwright** - Cross-browser testing
```bash
npm install -D @playwright/test
```

### Strategy
- Unit tests for utilities and hooks
- Integration tests for critical flows (checkout, login)
- E2E tests for happy paths
- Not blocking initial development

---

## 9. Build & Deploy

### Web Apps (AWS)

**Option A: S3 + CloudFront** (Static hosting)
- Build React app → Upload to S3 → CloudFront CDN
- Cheapest, simplest for static sites
- Good for dashboards

**Option B: AWS Amplify** (Managed hosting)
- Git push → Auto build → Auto deploy
- Preview deployments for PRs
- Easy SSL, custom domains

**Recommendation:** AWS Amplify for simplicity

### Mobile Apps

**Expo EAS** (Expo Application Services)
- Cloud builds for iOS/Android
- Over-the-air updates
- App store submissions
```bash
npm install -g eas-cli
eas build --platform all
eas submit --platform all
```

### CI/CD

**GitHub Actions**
```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm run build
      - run: aws s3 sync dist/ s3://bucket-name
```

---

## 10. Mobile Specifics

### Navigation
**React Navigation** with these navigators:
- Stack Navigator - Screen-to-screen
- Bottom Tab Navigator - Main tabs
- Drawer Navigator - Side menu (if needed)

### Native Features

| Feature | Library |
|---------|---------|
| Camera (Scanner) | expo-camera |
| Push Notifications | expo-notifications |
| Secure Storage | expo-secure-store |
| Biometrics | expo-local-authentication |
| Maps | react-native-maps |
| QR Code | expo-barcode-scanner |

### Offline Support (Scanner App)
- Cache ticket data locally with MMKV or AsyncStorage
- Queue scans when offline
- Sync when back online

---

## 11. Styling

**Tailwind CSS** (Web)
```bash
npm install -D tailwindcss postcss autoprefixer
```

**NativeWind** (React Native - Tailwind for mobile)
```bash
npm install nativewind
```

This allows same Tailwind classes across web and mobile.

---

## Summary

| Category | Choice |
|----------|--------|
| Web Framework | React + Vite + TypeScript |
| Mobile Framework | React Native + Expo |
| Routing (Web) | React Router v6 |
| Routing (Mobile) | React Navigation v6 |
| State | Zustand |
| Data Fetching | TanStack Query |
| HTTP Client | Axios |
| Forms | React Hook Form + Zod |
| Styling | Tailwind CSS / NativeWind |
| Monorepo | Turborepo |
| Testing | Vitest + Playwright |
| Web Hosting | AWS Amplify |
| Mobile Builds | Expo EAS |
| CI/CD | GitHub Actions |

---

## Next Steps

1. Initialize monorepo with Turborepo
2. Create shared packages (ui, api, types)
3. Set up first app (recommend: Fan Web or Venue Dashboard)
4. Build shared components from Design System
5. Connect to backend APIs
