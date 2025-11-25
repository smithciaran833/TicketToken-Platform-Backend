# Analytics Service: Express to Fastify Migration Plan

## Backup Location
All original files backed up to: `src_backup/`

## Files That Need Changes

### 1. Main Entry Points (3 files)
- ✅ `src/app.ts` - Convert to Fastify app builder
- ⏳ `src/server.ts` - Update to use Fastify app
- ⏳ `src/index.ts` - Update startup logic

### 2. Routes (14 files) - Convert Express Router to Fastify Plugin
All routes need conversion from:
```typescript
import { Router } from 'express';
const router = Router();
router.get('/path', controller.method);
export { router };
```

To:
```typescript
import { FastifyInstance } from 'fastify';
export default async function routes(app: FastifyInstance) {
  app.get('/path', controller.method);
}
```

Files:
- ⏳ alerts.routes.ts
- ⏳ analytics.routes.ts
- ⏳ campaign.routes.ts
- ⏳ customer.routes.ts
- ⏳ dashboard.routes.ts
- ⏳ export.routes.ts
- ⏳ health.routes.ts
- ⏳ insights.routes.ts
- ⏳ metrics.routes.ts
- ⏳ prediction.routes.ts
- ⏳ realtime.routes.ts
- ⏳ reports.routes.ts
- ⏳ widget.routes.ts
- ⏳ index.ts (may be removed)

### 3. Controllers (15 files) - Update Request/Response Types
Convert from:
```typescript
import { Request, Response } from 'express';
async method(req: Request, res: Response) {
  res.json({ data });
}
```

To:
```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
async method(request: FastifyRequest, reply: FastifyReply) {
  return reply.send({ data });
}
```

Files:
- ⏳ alerts.controller.ts
- ⏳ analytics.controller.ts
- ⏳ base.controller.ts
- ⏳ campaign.controller.ts
- ⏳ customer.controller.ts
- ⏳ dashboard.controller.ts
- ⏳ export.controller.ts
- ⏳ health.controller.ts
- ⏳ insights.controller.ts
- ⏳ metrics.controller.ts
- ⏳ prediction.controller.ts
- ⏳ realtime.controller.ts
- ⏳ reports.controller.ts
- ⏳ widget.controller.ts
- ⏳ index.ts

### 4. Middleware (6 files) - Convert to Fastify Hooks/Decorators
Convert Express middleware to Fastify:
- Express middleware: `(req, res, next) => {}`
- Fastify hooks: `preHandler`, `onRequest`, etc.

Files:
- ⏳ auth.middleware.ts - Convert to Fastify hook
- ⏳ auth.ts - Convert to Fastify decorator
- ⏳ error-handler.ts - Use Fastify setErrorHandler
- ⏳ rate-limit.middleware.ts - Use @fastify/rate-limit
- ⏳ validation.middleware.ts - Convert to Fastify preValidation
- ⏳ validation.ts - Convert to Fastify schemas

## Key Differences: Express vs Fastify

### Request/Response
- Express: `req`, `res`, `next`
- Fastify: `request`, `reply`

### Response Methods
- Express: `res.json()`, `res.status().send()`
- Fastify: `reply.send()`, `reply.code().send()`

### Middleware
- Express: `app.use(middleware)`
- Fastify: `app.addHook('preHandler', hook)` or decorators

### Route Registration
- Express: `app.use('/prefix', router)`
- Fastify: `app.register(plugin, { prefix: '/prefix' })`

### Error Handling
- Express: Custom error middleware
- Fastify: `app.setErrorHandler()`

## Package.json Changes Needed
Remove Express packages:
- express
- express-rate-limit
- express-validator
- morgan
- cors (express version)
- helmet (express version)

Add Fastify packages:
- fastify
- @fastify/cors
- @fastify/helmet
- @fastify/rate-limit
- @fastify/jwt (if needed)
- @fastify/swagger (optional)

## Migration Strategy
1. ✅ Create new app.ts with Fastify
2. Convert one route + controller as a template
3. Use that template to convert remaining routes/controllers
4. Convert middleware to hooks
5. Update server.ts and index.ts
6. Test each endpoint
7. Remove Express dependencies

## Current Status
- ✅ Database migrations completed
- ✅ Models updated to use new table names
- ✅ Backup created
- ✅ New Fastify app.ts created
- ⏳ Routes conversion
- ⏳ Controllers conversion
- ⏳ Middleware conversion
