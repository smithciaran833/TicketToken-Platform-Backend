# Auth-Service Architecture

## C4 Context Diagram
```
┌─────────────────────────────────────────────────────────────────┐
│                         TicketToken Platform                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Fan App  │  │  Venue   │  │  Admin   │  │   Other Services │  │
│  │ (Mobile) │  │Dashboard │  │  Portal  │  │                  │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘  │
│       │             │             │                  │            │
│       └─────────────┴──────┬──────┴──────────────────┘            │
│                            │                                       │
│                     ┌──────▼──────┐                                │
│                     │ API Gateway │                                │
│                     └──────┬──────┘                                │
│                            │                                       │
│                     ┌──────▼──────┐                                │
│                     │Auth Service │◄──── You Are Here              │
│                     └──────┬──────┘                                │
│                            │                                       │
│              ┌─────────────┼─────────────┐                         │
│              │             │             │                         │
│        ┌─────▼─────┐ ┌─────▼─────┐ ┌─────▼─────┐                   │
│        │PostgreSQL │ │   Redis   │ │  Secrets  │                   │
│        │  (RLS)    │ │  (Cache)  │ │  Manager  │                   │
│        └───────────┘ └───────────┘ └───────────┘                   │
└─────────────────────────────────────────────────────────────────┘

External:
┌───────────┐  ┌───────────┐  ┌───────────┐
│  Google   │  │   Apple   │  │  Resend   │
│  OAuth    │  │  Sign-In  │  │  (Email)  │
└───────────┘  └───────────┘  └───────────┘
```

## Container Diagram
```
Auth Service Container
├── Fastify HTTP Server (Port 3001)
│   ├── /auth/* - Public auth endpoints
│   ├── /auth/internal/* - S2S endpoints
│   └── /health/* - Health probes
│
├── Services Layer
│   ├── AuthService - Registration, login, password
│   ├── JWTService - Token generation, validation
│   ├── MFAService - TOTP, backup codes
│   ├── OAuthService - Google, Apple, GitHub
│   └── AuditService - Security event logging
│
├── Data Layer
│   ├── PostgreSQL - Users, sessions, audit logs
│   └── Redis - Tokens, rate limits, cache
│
└── External Integrations
    ├── Secrets Manager - JWT keys, OAuth secrets
    ├── Email Provider - Verification, reset emails
    └── OAuth Providers - Social login
```

## Data Flow: Login
```
Client → API Gateway → Auth Service
                           │
                           ├─► PostgreSQL: Fetch user
                           ├─► bcrypt: Verify password
                           ├─► Redis: Check rate limits
                           ├─► JWTService: Generate tokens
                           ├─► Redis: Store refresh token
                           ├─► PostgreSQL: Create session
                           └─► AuditService: Log event
                           │
Client ◄─── Tokens ◄───────┘
```
