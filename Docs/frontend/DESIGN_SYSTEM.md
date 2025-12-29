# TicketToken — Design System

Version: 1.0
Last Updated: 2024-12-28

---

## 1. Brand Identity

### Primary Brand Colors

| Name | Hex | Tailwind | Usage |
|------|-----|----------|-------|
| Purple Primary | `#9333ea` | `purple-600` | Primary actions, brand accent |
| Violet | `#7c3aed` | `violet-600` | Secondary brand accent |
| Blue | `#2563eb` | `blue-600` | Links, info states |
| Red Accent | `#dc2626` | `red-600` | Admin logo, alerts |

### Semantic Colors

| Purpose | Hex | Tailwind | Usage |
|---------|-----|----------|-------|
| Success | `#22c55e` | `green-500` | Valid, complete, healthy |
| Success Dark | `#16a34a` | `green-600` | Success hover/active |
| Warning | `#eab308` | `yellow-500` | Caution, pending |
| Error | `#ef4444` | `red-500` | Invalid, failed, critical |
| Info | `#3b82f6` | `blue-500` | Informational |

### Neutral Colors (Gray Scale)

| Name | Hex | Tailwind | Usage |
|------|-----|----------|-------|
| White | `#ffffff` | `white` | Backgrounds, cards |
| Gray 50 | `#f9fafb` | `gray-50` | Page backgrounds |
| Gray 100 | `#f3f4f6` | `gray-100` | Subtle backgrounds |
| Gray 200 | `#e5e7eb` | `gray-200` | Borders, dividers |
| Gray 300 | `#d1d5db` | `gray-300` | Disabled states |
| Gray 400 | `#9ca3af` | `gray-400` | Placeholder text |
| Gray 500 | `#6b7280` | `gray-500` | Secondary text |
| Gray 600 | `#4b5563` | `gray-600` | Body text |
| Gray 700 | `#374151` | `gray-700` | Headings |
| Gray 800 | `#1f2937` | `gray-800` | Dark backgrounds |
| Gray 900 | `#111827` | `gray-900` | Sidebar, dark UI |

### Gradients

| Name | Classes | Usage |
|------|---------|-------|
| Header | `from-blue-50 via-indigo-50 to-purple-50` | Page headers |
| Alert | `from-red-50 to-orange-50` | Alert sections |
| Performance | `from-green-50 to-emerald-50` | Stats/metrics |
| Activity | `from-purple-50 to-pink-50` | Activity feeds |

---

## 2. Typography

### Font Stack
```css
font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
```

### Type Scale

| Name | Size | Weight | Tailwind | Usage |
|------|------|--------|----------|-------|
| Display | 36px | Bold | `text-4xl font-bold` | Hero titles |
| H1 | 30px | Bold | `text-3xl font-bold` | Page titles |
| H2 | 24px | Bold | `text-2xl font-bold` | Section titles |
| H3 | 20px | Semibold | `text-xl font-semibold` | Card titles |
| H4 | 18px | Semibold | `text-lg font-semibold` | Subsection titles |
| Body | 16px | Normal | `text-base` | Body text |
| Body Small | 14px | Normal | `text-sm` | Secondary text |
| Caption | 12px | Medium | `text-xs font-medium` | Labels, captions |
| Tiny | 10px | Medium | `text-[10px] font-medium` | Badges, tags |

### Line Heights

| Usage | Tailwind |
|-------|----------|
| Headings | `leading-tight` |
| Body | `leading-normal` |
| Relaxed | `leading-relaxed` |

---

## 3. Spacing System

Using Tailwind's default 4px base unit:

| Name | Value | Tailwind | Usage |
|------|-------|----------|-------|
| 2xs | 4px | `1` | Tiny gaps |
| xs | 8px | `2` | Tight spacing |
| sm | 12px | `3` | Compact elements |
| md | 16px | `4` | Default spacing |
| lg | 24px | `6` | Section spacing |
| xl | 32px | `8` | Large gaps |
| 2xl | 48px | `12` | Section breaks |
| 3xl | 64px | `16` | Page sections |

### Standard Padding

| Component | Padding |
|-----------|---------|
| Page | `p-6` (24px) or `p-8` (32px) |
| Card | `p-4` (16px) or `p-6` (24px) |
| Button | `px-4 py-2` |
| Input | `px-3 py-2` |
| Badge | `px-2 py-1` |

---

## 4. Layout System

### Breakpoints

| Name | Min Width | Tailwind |
|------|-----------|----------|
| Mobile | 0px | (default) |
| Tablet | 640px | `sm:` |
| Tablet Large | 768px | `md:` |
| Desktop | 1024px | `lg:` |
| Desktop Large | 1280px | `xl:` |
| Wide | 1536px | `2xl:` |

### Dashboard Layout (Venue, Artist, Admin)
```
┌─────────────────────────────────────────────────────┐
│ Sidebar (256px)    │ Main Content                   │
│ bg-gray-900        │ bg-gray-50                     │
│ fixed              │ lg:pl-64                       │
│ w-64               │                                │
│                    │ ┌─────────────────────────┐   │
│ Logo               │ │ Header                   │   │
│ Nav Items          │ └─────────────────────────┘   │
│ User Menu          │ ┌─────────────────────────┐   │
│                    │ │ Page Content             │   │
│                    │ │ p-6 or p-8               │   │
│                    │ └─────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### Fan App Layout (Mobile-First)
```
┌─────────────────────┐
│ Header (sticky)     │
│ h-16                │
├─────────────────────┤
│                     │
│ Main Content        │
│ pb-20 (for tab bar) │
│                     │
├─────────────────────┤
│ Bottom Tab Bar      │
│ fixed bottom        │
│ h-16                │
└─────────────────────┘
```

### Grid System

| Columns | Tailwind | Usage |
|---------|----------|-------|
| 1 | `grid-cols-1` | Mobile, forms |
| 2 | `grid-cols-2` | Stats, pairs |
| 3 | `grid-cols-3` | Cards |
| 4 | `grid-cols-4` | Dense grids |
| 6 | `grid-cols-6` | Complex layouts |
| 12 | `grid-cols-12` | Full control |

Responsive pattern:
```html
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
```

---

## 5. Components

### Buttons

#### Primary Button
```html
<button class="bg-purple-600 text-white px-4 py-2 rounded-lg font-medium
               hover:bg-purple-700 focus:ring-2 focus:ring-purple-500 focus:ring-offset-2
               disabled:opacity-50 disabled:cursor-not-allowed
               transition-colors">
  Button Text
</button>
```

#### Secondary Button
```html
<button class="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium
               hover:bg-gray-50 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2
               transition-colors">
  Button Text
</button>
```

#### Danger Button
```html
<button class="bg-red-600 text-white px-4 py-2 rounded-lg font-medium
               hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2
               transition-colors">
  Delete
</button>
```

#### Ghost Button
```html
<button class="text-gray-600 px-4 py-2 rounded-lg font-medium
               hover:bg-gray-100 transition-colors">
  Cancel
</button>
```

#### Button Sizes

| Size | Classes |
|------|---------|
| Small | `px-3 py-1.5 text-sm` |
| Medium | `px-4 py-2 text-sm` |
| Large | `px-6 py-3 text-base` |

---

### Cards

#### Basic Card
```html
<div class="bg-white rounded-lg border border-gray-200 shadow-sm">
  <div class="p-6">
    <!-- Content -->
  </div>
</div>
```

#### Interactive Card
```html
<div class="bg-white rounded-lg border border-gray-200 shadow-sm
            hover:shadow-md hover:border-gray-300 transition-all cursor-pointer">
  <div class="p-6">
    <!-- Content -->
  </div>
</div>
```

#### Card with Header
```html
<div class="bg-white rounded-lg border border-gray-200 shadow-sm">
  <div class="px-6 py-4 border-b border-gray-200">
    <h3 class="text-lg font-semibold text-gray-900">Card Title</h3>
  </div>
  <div class="p-6">
    <!-- Content -->
  </div>
</div>
```

---

### Form Inputs

#### Text Input
```html
<div>
  <label class="block text-sm font-medium text-gray-700 mb-1">
    Label
  </label>
  <input type="text"
         class="w-full px-3 py-2 border border-gray-300 rounded-lg
                focus:ring-2 focus:ring-purple-500 focus:border-purple-500
                placeholder:text-gray-400" 
         placeholder="Placeholder text" />
</div>
```

#### Input with Error
```html
<div>
  <label class="block text-sm font-medium text-gray-700 mb-1">Label</label>
  <input type="text"
         class="w-full px-3 py-2 border border-red-500 rounded-lg
                focus:ring-2 focus:ring-red-500 focus:border-red-500" />
  <p class="mt-1 text-sm text-red-600">Error message here</p>
</div>
```

#### Select
```html
<select class="w-full px-3 py-2 border border-gray-300 rounded-lg
               focus:ring-2 focus:ring-purple-500 focus:border-purple-500
               bg-white">
  <option>Option 1</option>
  <option>Option 2</option>
</select>
```

#### Textarea
```html
<textarea class="w-full px-3 py-2 border border-gray-300 rounded-lg
                 focus:ring-2 focus:ring-purple-500 focus:border-purple-500
                 resize-none" rows="4"></textarea>
```

#### Checkbox
```html
<label class="flex items-center gap-2 cursor-pointer">
  <input type="checkbox" 
         class="w-4 h-4 rounded border-gray-300 text-purple-600
                focus:ring-purple-500" />
  <span class="text-sm text-gray-700">Checkbox label</span>
</label>
```

#### Toggle Switch
```html
<button class="relative inline-flex h-6 w-11 items-center rounded-full
               bg-gray-200 transition-colors
               data-[checked]:bg-purple-600">
  <span class="inline-block h-4 w-4 transform rounded-full bg-white
               transition-transform translate-x-1
               data-[checked]:translate-x-6" />
</button>
```

---

### Status Badges
```html
<!-- Success/Active -->
<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium
             bg-green-100 text-green-700">
  Active
</span>

<!-- Warning -->
<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium
             bg-yellow-100 text-yellow-700">
  Pending
</span>

<!-- Error -->
<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium
             bg-red-100 text-red-700">
  Failed
</span>

<!-- Info -->
<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium
             bg-blue-100 text-blue-700">
  Info
</span>

<!-- Neutral -->
<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium
             bg-gray-100 text-gray-700">
  Draft
</span>
```

---

### Navigation

#### Sidebar (Dashboard)
```html
<aside class="fixed inset-y-0 left-0 w-64 bg-gray-900">
  <!-- Logo -->
  <div class="flex items-center h-16 px-6">
    <span class="text-xl font-bold text-white">TicketToken</span>
  </div>
  
  <!-- Navigation -->
  <nav class="px-3 py-4 space-y-1">
    <!-- Active Item -->
    <a href="#" class="flex items-center gap-3 px-3 py-2 rounded-lg
                       bg-purple-600 text-white">
      <HomeIcon class="w-5 h-5" />
      <span>Dashboard</span>
    </a>
    
    <!-- Inactive Item -->
    <a href="#" class="flex items-center gap-3 px-3 py-2 rounded-lg
                       text-gray-300 hover:bg-gray-800 hover:text-white
                       transition-colors">
      <CalendarIcon class="w-5 h-5" />
      <span>Events</span>
    </a>
  </nav>
</aside>
```

#### Bottom Tab Bar (Mobile)
```html
<nav class="fixed bottom-0 inset-x-0 h-16 bg-white border-t border-gray-200
            flex items-center justify-around px-4 safe-area-pb">
  <!-- Active Tab -->
  <a href="#" class="flex flex-col items-center gap-1 text-purple-600">
    <HomeIcon class="w-6 h-6" />
    <span class="text-xs font-medium">Home</span>
  </a>
  
  <!-- Inactive Tab -->
  <a href="#" class="flex flex-col items-center gap-1 text-gray-500">
    <SearchIcon class="w-6 h-6" />
    <span class="text-xs">Search</span>
  </a>
</nav>
```

---

### Modals
```html
<!-- Backdrop -->
<div class="fixed inset-0 bg-black/50 z-40" />

<!-- Modal -->
<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
  <div class="bg-white rounded-xl shadow-xl w-full max-w-md">
    <!-- Header -->
    <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200">
      <h2 class="text-lg font-semibold text-gray-900">Modal Title</h2>
      <button class="text-gray-400 hover:text-gray-600">
        <XIcon class="w-5 h-5" />
      </button>
    </div>
    
    <!-- Body -->
    <div class="px-6 py-4">
      <!-- Content -->
    </div>
    
    <!-- Footer -->
    <div class="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
      <button class="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">
        Cancel
      </button>
      <button class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
        Confirm
      </button>
    </div>
  </div>
</div>
```

---

### Tables
```html
<div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
  <table class="w-full">
    <thead class="bg-gray-50 border-b border-gray-200">
      <tr>
        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
          Name
        </th>
        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
          Status
        </th>
        <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
          Actions
        </th>
      </tr>
    </thead>
    <tbody class="divide-y divide-gray-200">
      <tr class="hover:bg-gray-50">
        <td class="px-6 py-4 text-sm text-gray-900">Item Name</td>
        <td class="px-6 py-4">
          <span class="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">
            Active
          </span>
        </td>
        <td class="px-6 py-4 text-right">
          <button class="text-gray-400 hover:text-gray-600">
            <MoreHorizontalIcon class="w-5 h-5" />
          </button>
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

---

### Alerts / Toasts
```html
<!-- Success Alert -->
<div class="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
  <CheckCircleIcon class="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
  <div>
    <p class="text-sm font-medium text-green-800">Success!</p>
    <p class="text-sm text-green-700">Your changes have been saved.</p>
  </div>
</div>

<!-- Error Alert -->
<div class="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
  <AlertCircleIcon class="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
  <div>
    <p class="text-sm font-medium text-red-800">Error</p>
    <p class="text-sm text-red-700">Something went wrong. Please try again.</p>
  </div>
</div>

<!-- Warning Alert -->
<div class="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
  <AlertTriangleIcon class="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
  <div>
    <p class="text-sm font-medium text-yellow-800">Warning</p>
    <p class="text-sm text-yellow-700">Please review before proceeding.</p>
  </div>
</div>
```

---

## 6. Icons

### Library
**Lucide React** - https://lucide.dev

### Installation
```bash
npm install lucide-react
```

### Usage
```tsx
import { Home, Calendar, Users, Settings } from 'lucide-react';

<Home className="w-5 h-5" />
```

### Common Icons by Feature

| Feature | Icons |
|---------|-------|
| Navigation | `Home`, `Search`, `Calendar`, `Ticket`, `User`, `Settings` |
| Actions | `Plus`, `Edit`, `Trash2`, `Download`, `Upload`, `Share` |
| Status | `CheckCircle`, `XCircle`, `AlertCircle`, `AlertTriangle`, `Info` |
| Arrows | `ChevronLeft`, `ChevronRight`, `ChevronDown`, `ArrowRight` |
| Data | `BarChart2`, `TrendingUp`, `DollarSign`, `Users`, `Activity` |
| Events | `Calendar`, `Clock`, `MapPin`, `Music`, `Ticket` |
| Scanning | `QrCode`, `Scan`, `Camera`, `Check`, `X` |

### Icon Sizes

| Size | Class | Usage |
|------|-------|-------|
| XS | `w-4 h-4` | Inline with text |
| SM | `w-5 h-5` | Buttons, nav items |
| MD | `w-6 h-6` | Tab bar icons |
| LG | `w-8 h-8` | Feature icons |
| XL | `w-12 h-12` | Empty states |

---

## 7. Shadows & Elevation

| Level | Tailwind | Usage |
|-------|----------|-------|
| None | `shadow-none` | Flat elements |
| SM | `shadow-sm` | Cards, inputs |
| Default | `shadow` | Dropdowns |
| MD | `shadow-md` | Hover states |
| LG | `shadow-lg` | Modals |
| XL | `shadow-xl` | Popovers |

---

## 8. Border Radius

| Size | Tailwind | Usage |
|------|----------|-------|
| None | `rounded-none` | - |
| SM | `rounded` | Badges |
| Default | `rounded-md` | Inputs |
| LG | `rounded-lg` | Cards, buttons |
| XL | `rounded-xl` | Modals |
| Full | `rounded-full` | Avatars, pills |

---

## 9. Animations & Transitions

### Standard Transition
```html
<div class="transition-all duration-200 ease-in-out">
```

### Common Transitions

| Property | Class |
|----------|-------|
| All | `transition-all` |
| Colors | `transition-colors` |
| Opacity | `transition-opacity` |
| Transform | `transition-transform` |

### Duration

| Speed | Class |
|-------|-------|
| Fast | `duration-150` |
| Normal | `duration-200` |
| Slow | `duration-300` |

### Loading Spinner
```html
<div class="w-5 h-5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
```

---

## 10. App-Specific Themes

### Fan App (Light, Vibrant)
- Background: `bg-gray-50`
- Primary: `purple-600`
- Cards: White with subtle shadows
- Bottom nav with icons

### Venue Dashboard (Professional)
- Sidebar: `bg-gray-900`
- Background: `bg-gray-50`
- Primary: `purple-600`
- Data-heavy tables and charts

### Artist Dashboard (Creative)
- Sidebar: `bg-gray-900`
- Background: `bg-gray-50`
- Accent: Gradients for highlights
- Profile-focused layouts

### Admin Dashboard (Utilitarian)
- Sidebar: `bg-gray-900`
- Primary: `purple-600` with `red-600` accents
- Dense information display
- Status-heavy UI

### Scanner App (High Contrast)
- Large touch targets
- High contrast for outdoor use
- Green/Red for valid/invalid
- Minimal UI, maximum feedback

---

## 11. Responsive Patterns

### Hide/Show by Breakpoint
```html
<!-- Mobile only -->
<div class="block md:hidden">Mobile</div>

<!-- Desktop only -->
<div class="hidden md:block">Desktop</div>
```

### Stack to Row
```html
<div class="flex flex-col md:flex-row gap-4">
```

### Responsive Text
```html
<h1 class="text-2xl md:text-3xl lg:text-4xl">
```

### Responsive Padding
```html
<div class="p-4 md:p-6 lg:p-8">
```

---

## 12. Accessibility

### Focus States
All interactive elements must have visible focus:
```html
focus:ring-2 focus:ring-purple-500 focus:ring-offset-2
```

### Color Contrast
- Text on white: minimum `gray-600` for body, `gray-900` for headings
- Text on dark: minimum `gray-300`
- Never rely on color alone for meaning

### Touch Targets
- Minimum 44x44px for mobile buttons
- Adequate spacing between clickable elements

### Screen Readers
```html
<!-- Visually hidden but accessible -->
<span class="sr-only">Close menu</span>

<!-- Skip link -->
<a href="#main" class="sr-only focus:not-sr-only">Skip to content</a>
```

---

## Summary

| Aspect | Specification |
|--------|---------------|
| Framework | Tailwind CSS |
| Font | Inter / System |
| Primary Color | Purple-600 (`#9333ea`) |
| Icons | Lucide React |
| Border Radius | `rounded-lg` default |
| Shadows | `shadow-sm` cards, `shadow-lg` modals |
| Sidebar Width | 256px (`w-64`) |
| Mobile Breakpoint | 768px (`md:`) |

---

## 13. Loading States

### Skeleton Screens

Use skeleton placeholders that match the shape of content being loaded.

#### Skeleton Base
```html
<div class="animate-pulse bg-gray-200 rounded" />
```

#### Text Skeleton
```html
<div class="space-y-2">
  <div class="h-4 bg-gray-200 rounded w-3/4 animate-pulse" />
  <div class="h-4 bg-gray-200 rounded w-1/2 animate-pulse" />
</div>
```

#### Card Skeleton
```html
<div class="bg-white rounded-lg border border-gray-200 p-6">
  <div class="animate-pulse space-y-4">
    <div class="h-4 bg-gray-200 rounded w-1/4" />
    <div class="h-8 bg-gray-200 rounded w-1/2" />
    <div class="h-4 bg-gray-200 rounded w-3/4" />
  </div>
</div>
```

#### Table Row Skeleton
```html
<tr class="animate-pulse">
  <td class="px-6 py-4"><div class="h-4 bg-gray-200 rounded w-24" /></td>
  <td class="px-6 py-4"><div class="h-4 bg-gray-200 rounded w-16" /></td>
  <td class="px-6 py-4"><div class="h-4 bg-gray-200 rounded w-20" /></td>
</tr>
```

#### Image Skeleton
```html
<div class="aspect-video bg-gray-200 rounded-lg animate-pulse" />
```

#### Avatar Skeleton
```html
<div class="w-10 h-10 bg-gray-200 rounded-full animate-pulse" />
```

### Spinner (for actions)

Use spinners for button loading states and quick operations:
```html
<div class="w-5 h-5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
```

#### Button with Loading
```html
<button class="bg-purple-600 text-white px-4 py-2 rounded-lg flex items-center gap-2" disabled>
  <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
  <span>Processing...</span>
</button>
```

---

## 14. Empty States

### Structure

Every empty state should have:
1. **Illustration** - SVG graphic (from undraw.co, Storyset, or AI-generated)
2. **Headline** - What's empty
3. **Description** - Why it's empty or what to do
4. **Action** - Primary CTA button (when applicable)

### Template
```html
<div class="flex flex-col items-center justify-center py-12 px-4 text-center">
  <!-- Illustration -->
  <img src="/illustrations/no-tickets.svg" alt="" class="w-48 h-48 mb-6" />
  
  <!-- Headline -->
  <h3 class="text-lg font-semibold text-gray-900 mb-2">
    No tickets yet
  </h3>
  
  <!-- Description -->
  <p class="text-sm text-gray-500 max-w-sm mb-6">
    When you purchase tickets, they'll appear here. Ready to find your next event?
  </p>
  
  <!-- Action -->
  <button class="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700">
    Browse Events
  </button>
</div>
```

### Empty State Messages

| Screen | Headline | Description | Action |
|--------|----------|-------------|--------|
| My Tickets | No tickets yet | Purchase tickets to see them here | Browse Events |
| Order History | No orders yet | Your purchase history will appear here | Browse Events |
| Saved Events | No saved events | Save events to find them easily later | Explore Events |
| Search Results | No results found | Try adjusting your filters or search term | Clear Filters |
| Event List (Venue) | No events yet | Create your first event to get started | Create Event |
| Transactions | No transactions | Transactions will appear when sales begin | - |
| Guest List | No guests added | Add guests to your event guest list | Add Guest |
| Notifications | All caught up! | No new notifications | - |

### Illustration Sources

- **undraw.co** - Free, customizable SVG illustrations
- **Storyset** - Free illustrations with animations
- **AI-generated** - Use Midjourney/DALL-E + vectorize

Customize illustration colors to match brand (`purple-600`).

---

## 15. Error Pages

### 404 - Not Found
```html
<div class="min-h-screen flex flex-col items-center justify-center px-4">
  <img src="/illustrations/404.svg" alt="" class="w-64 h-64 mb-8" />
  <h1 class="text-2xl font-bold text-gray-900 mb-2">Page not found</h1>
  <p class="text-gray-500 mb-6">The page you're looking for doesn't exist or has been moved.</p>
  <a href="/" class="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700">
    Go Home
  </a>
</div>
```

### 500 - Server Error
```html
<div class="min-h-screen flex flex-col items-center justify-center px-4">
  <img src="/illustrations/error.svg" alt="" class="w-64 h-64 mb-8" />
  <h1 class="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h1>
  <p class="text-gray-500 mb-6">We're working on it. Please try again later.</p>
  <button onclick="location.reload()" class="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700">
    Try Again
  </button>
</div>
```

### Offline (Mobile App)
```html
<div class="min-h-screen flex flex-col items-center justify-center px-4">
  <WifiOffIcon class="w-16 h-16 text-gray-400 mb-6" />
  <h1 class="text-2xl font-bold text-gray-900 mb-2">You're offline</h1>
  <p class="text-gray-500 mb-6">Check your connection and try again.</p>
  <button class="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700">
    Retry
  </button>
</div>
```

---

## 16. Charts & Data Visualization

### Library
**Recharts** - https://recharts.org
```bash
npm install recharts
```

### Chart Color Palette

| Index | Color | Hex | Usage |
|-------|-------|-----|-------|
| 1 | Purple | `#9333ea` | Primary metric |
| 2 | Blue | `#2563eb` | Secondary metric |
| 3 | Green | `#16a34a` | Positive/success |
| 4 | Orange | `#ea580c` | Tertiary |
| 5 | Pink | `#db2777` | Quaternary |
| 6 | Cyan | `#0891b2` | Additional |

### Chart Types & Usage

| Chart Type | Use For |
|------------|---------|
| Line | Trends over time (revenue, sales) |
| Area | Volume over time (cumulative) |
| Bar | Comparisons (by category, by venue) |
| Horizontal Bar | Rankings, leaderboards |
| Pie / Donut | Breakdowns (ticket types, demographics) |
| Stacked Bar | Composition over time |

### Standard Chart Styles

#### Line Chart
```tsx
<LineChart data={data}>
  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
  <XAxis dataKey="date" stroke="#6b7280" fontSize={12} />
  <YAxis stroke="#6b7280" fontSize={12} />
  <Tooltip 
    contentStyle={{ 
      backgroundColor: 'white', 
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
    }} 
  />
  <Line 
    type="monotone" 
    dataKey="revenue" 
    stroke="#9333ea" 
    strokeWidth={2}
    dot={false}
  />
</LineChart>
```

#### Bar Chart
```tsx
<BarChart data={data}>
  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
  <XAxis dataKey="name" stroke="#6b7280" fontSize={12} />
  <YAxis stroke="#6b7280" fontSize={12} />
  <Tooltip />
  <Bar dataKey="value" fill="#9333ea" radius={[4, 4, 0, 0]} />
</BarChart>
```

#### Donut Chart
```tsx
<PieChart>
  <Pie
    data={data}
    innerRadius={60}
    outerRadius={80}
    paddingAngle={2}
    dataKey="value"
  >
    {data.map((entry, index) => (
      <Cell key={index} fill={COLORS[index % COLORS.length]} />
    ))}
  </Pie>
  <Tooltip />
  <Legend />
</PieChart>
```

### Chart Responsiveness

Wrap charts in ResponsiveContainer:
```tsx
<ResponsiveContainer width="100%" height={300}>
  <LineChart data={data}>
    {/* ... */}
  </LineChart>
</ResponsiveContainer>
```

### Chart Card Pattern
```html
<div class="bg-white rounded-lg border border-gray-200 p-6">
  <div class="flex items-center justify-between mb-4">
    <h3 class="text-lg font-semibold text-gray-900">Revenue Over Time</h3>
    <select class="text-sm border border-gray-300 rounded-lg px-2 py-1">
      <option>Last 7 days</option>
      <option>Last 30 days</option>
      <option>Last 90 days</option>
    </select>
  </div>
  <div class="h-64">
    <!-- Chart goes here -->
  </div>
</div>
```

---

## 17. Dark Mode (Future)

Structure CSS to support dark mode later using Tailwind's `dark:` prefix.

### Setup (tailwind.config.js)
```js
module.exports = {
  darkMode: 'class', // or 'media' for system preference
  // ...
}
```

### Pattern
```html
<div class="bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
```

### Key Dark Mode Mappings (for future)

| Light | Dark |
|-------|------|
| `bg-white` | `dark:bg-gray-900` |
| `bg-gray-50` | `dark:bg-gray-800` |
| `text-gray-900` | `dark:text-white` |
| `text-gray-600` | `dark:text-gray-300` |
| `border-gray-200` | `dark:border-gray-700` |

Not implementing now, but code should use these patterns for easy future addition.

---

## 13. Loading States

### Skeleton Screens

Use skeleton placeholders that match the shape of content being loaded.

#### Skeleton Base
```html
<div class="animate-pulse bg-gray-200 rounded" />
```

#### Text Skeleton
```html
<div class="space-y-2">
  <div class="h-4 bg-gray-200 rounded w-3/4 animate-pulse" />
  <div class="h-4 bg-gray-200 rounded w-1/2 animate-pulse" />
</div>
```

#### Card Skeleton
```html
<div class="bg-white rounded-lg border border-gray-200 p-6">
  <div class="animate-pulse space-y-4">
    <div class="h-4 bg-gray-200 rounded w-1/4" />
    <div class="h-8 bg-gray-200 rounded w-1/2" />
    <div class="h-4 bg-gray-200 rounded w-3/4" />
  </div>
</div>
```

#### Table Row Skeleton
```html
<tr class="animate-pulse">
  <td class="px-6 py-4"><div class="h-4 bg-gray-200 rounded w-24" /></td>
  <td class="px-6 py-4"><div class="h-4 bg-gray-200 rounded w-16" /></td>
  <td class="px-6 py-4"><div class="h-4 bg-gray-200 rounded w-20" /></td>
</tr>
```

#### Image Skeleton
```html
<div class="aspect-video bg-gray-200 rounded-lg animate-pulse" />
```

#### Avatar Skeleton
```html
<div class="w-10 h-10 bg-gray-200 rounded-full animate-pulse" />
```

### Spinner (for actions)

Use spinners for button loading states and quick operations:
```html
<div class="w-5 h-5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
```

#### Button with Loading
```html
<button class="bg-purple-600 text-white px-4 py-2 rounded-lg flex items-center gap-2" disabled>
  <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
  <span>Processing...</span>
</button>
```

---

## 14. Empty States

### Structure

Every empty state should have:
1. **Illustration** - SVG graphic (from undraw.co, Storyset, or AI-generated)
2. **Headline** - What's empty
3. **Description** - Why it's empty or what to do
4. **Action** - Primary CTA button (when applicable)

### Template
```html
<div class="flex flex-col items-center justify-center py-12 px-4 text-center">
  <!-- Illustration -->
  <img src="/illustrations/no-tickets.svg" alt="" class="w-48 h-48 mb-6" />
  
  <!-- Headline -->
  <h3 class="text-lg font-semibold text-gray-900 mb-2">
    No tickets yet
  </h3>
  
  <!-- Description -->
  <p class="text-sm text-gray-500 max-w-sm mb-6">
    When you purchase tickets, they'll appear here. Ready to find your next event?
  </p>
  
  <!-- Action -->
  <button class="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700">
    Browse Events
  </button>
</div>
```

### Empty State Messages

| Screen | Headline | Description | Action |
|--------|----------|-------------|--------|
| My Tickets | No tickets yet | Purchase tickets to see them here | Browse Events |
| Order History | No orders yet | Your purchase history will appear here | Browse Events |
| Saved Events | No saved events | Save events to find them easily later | Explore Events |
| Search Results | No results found | Try adjusting your filters or search term | Clear Filters |
| Event List (Venue) | No events yet | Create your first event to get started | Create Event |
| Transactions | No transactions | Transactions will appear when sales begin | - |
| Guest List | No guests added | Add guests to your event guest list | Add Guest |
| Notifications | All caught up! | No new notifications | - |

### Illustration Sources

- **undraw.co** - Free, customizable SVG illustrations
- **Storyset** - Free illustrations with animations
- **AI-generated** - Use Midjourney/DALL-E + vectorize

Customize illustration colors to match brand (`purple-600`).

---

## 15. Error Pages

### 404 - Not Found
```html
<div class="min-h-screen flex flex-col items-center justify-center px-4">
  <img src="/illustrations/404.svg" alt="" class="w-64 h-64 mb-8" />
  <h1 class="text-2xl font-bold text-gray-900 mb-2">Page not found</h1>
  <p class="text-gray-500 mb-6">The page you're looking for doesn't exist or has been moved.</p>
  <a href="/" class="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700">
    Go Home
  </a>
</div>
```

### 500 - Server Error
```html
<div class="min-h-screen flex flex-col items-center justify-center px-4">
  <img src="/illustrations/error.svg" alt="" class="w-64 h-64 mb-8" />
  <h1 class="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h1>
  <p class="text-gray-500 mb-6">We're working on it. Please try again later.</p>
  <button onclick="location.reload()" class="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700">
    Try Again
  </button>
</div>
```

### Offline (Mobile App)
```html
<div class="min-h-screen flex flex-col items-center justify-center px-4">
  <WifiOffIcon class="w-16 h-16 text-gray-400 mb-6" />
  <h1 class="text-2xl font-bold text-gray-900 mb-2">You're offline</h1>
  <p class="text-gray-500 mb-6">Check your connection and try again.</p>
  <button class="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700">
    Retry
  </button>
</div>
```

---

## 16. Charts & Data Visualization

### Library
**Recharts** - https://recharts.org
```bash
npm install recharts
```

### Chart Color Palette

| Index | Color | Hex | Usage |
|-------|-------|-----|-------|
| 1 | Purple | `#9333ea` | Primary metric |
| 2 | Blue | `#2563eb` | Secondary metric |
| 3 | Green | `#16a34a` | Positive/success |
| 4 | Orange | `#ea580c` | Tertiary |
| 5 | Pink | `#db2777` | Quaternary |
| 6 | Cyan | `#0891b2` | Additional |

### Chart Types & Usage

| Chart Type | Use For |
|------------|---------|
| Line | Trends over time (revenue, sales) |
| Area | Volume over time (cumulative) |
| Bar | Comparisons (by category, by venue) |
| Horizontal Bar | Rankings, leaderboards |
| Pie / Donut | Breakdowns (ticket types, demographics) |
| Stacked Bar | Composition over time |

### Standard Chart Styles

#### Line Chart
```tsx
<LineChart data={data}>
  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
  <XAxis dataKey="date" stroke="#6b7280" fontSize={12} />
  <YAxis stroke="#6b7280" fontSize={12} />
  <Tooltip 
    contentStyle={{ 
      backgroundColor: 'white', 
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
    }} 
  />
  <Line 
    type="monotone" 
    dataKey="revenue" 
    stroke="#9333ea" 
    strokeWidth={2}
    dot={false}
  />
</LineChart>
```

#### Bar Chart
```tsx
<BarChart data={data}>
  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
  <XAxis dataKey="name" stroke="#6b7280" fontSize={12} />
  <YAxis stroke="#6b7280" fontSize={12} />
  <Tooltip />
  <Bar dataKey="value" fill="#9333ea" radius={[4, 4, 0, 0]} />
</BarChart>
```

#### Donut Chart
```tsx
<PieChart>
  <Pie
    data={data}
    innerRadius={60}
    outerRadius={80}
    paddingAngle={2}
    dataKey="value"
  >
    {data.map((entry, index) => (
      <Cell key={index} fill={COLORS[index % COLORS.length]} />
    ))}
  </Pie>
  <Tooltip />
  <Legend />
</PieChart>
```

### Chart Responsiveness

Wrap charts in ResponsiveContainer:
```tsx
<ResponsiveContainer width="100%" height={300}>
  <LineChart data={data}>
    {/* ... */}
  </LineChart>
</ResponsiveContainer>
```

### Chart Card Pattern
```html
<div class="bg-white rounded-lg border border-gray-200 p-6">
  <div class="flex items-center justify-between mb-4">
    <h3 class="text-lg font-semibold text-gray-900">Revenue Over Time</h3>
    <select class="text-sm border border-gray-300 rounded-lg px-2 py-1">
      <option>Last 7 days</option>
      <option>Last 30 days</option>
      <option>Last 90 days</option>
    </select>
  </div>
  <div class="h-64">
    <!-- Chart goes here -->
  </div>
</div>
```

---

## 17. Dark Mode (Future)

Structure CSS to support dark mode later using Tailwind's `dark:` prefix.

### Setup (tailwind.config.js)
```js
module.exports = {
  darkMode: 'class', // or 'media' for system preference
  // ...
}
```

### Pattern
```html
<div class="bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
```

### Key Dark Mode Mappings (for future)

| Light | Dark |
|-------|------|
| `bg-white` | `dark:bg-gray-900` |
| `bg-gray-50` | `dark:bg-gray-800` |
| `text-gray-900` | `dark:text-white` |
| `text-gray-600` | `dark:text-gray-300` |
| `border-gray-200` | `dark:border-gray-700` |

Not implementing now, but code should use these patterns for easy future addition.
