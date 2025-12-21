# @shared/mongodb

Shared MongoDB utilities library for the TicketToken platform. Provides centralized connection management, CRUD operations, schema validation, and index management for MongoDB/Mongoose.

## Features

✅ **Connection Management** - Robust connection handling with retry logic and health checks  
✅ **CRUD Operations** - Type-safe operations with pagination, transactions, and bulk writes  
✅ **Schema Validation** - Comprehensive validation utilities and JSON schema builders  
✅ **Index Management** - Easy index creation, management, and common patterns  
✅ **Type Safety** - Full TypeScript support with extensive type definitions  
✅ **Production Ready** - Error handling, logging, and graceful shutdown

## Installation

```bash
# This is a workspace package, install dependencies in the workspace root
cd backend/shared/mongodb
npm install
```

## Quick Start

```typescript
import { createMongoConnection, insertOne, findMany } from '@shared/mongodb';

// Create connection
const connection = await createMongoConnection(
  process.env.MONGODB_URI || 'mongodb://localhost:27017/tickettoken'
);

// Use with Mongoose models
const VenueModel = connection.model('Venue', venueSchema);

// Insert document
const newVenue = await insertOne(VenueModel, {
  name: 'Madison Square Garden',
  capacity: 20000,
  location: 'New York, NY'
});

// Find with pagination
const venues = await findMany(VenueModel, 
  { status: 'active' },
  { page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' }
);
```

## Connection Management

### Basic Connection

```typescript
import { createMongoConnection, healthCheck, gracefulShutdown } from '@shared/mongodb';

// Create connection with retry logic
const connection = await createMongoConnection(
  'mongodb://localhost:27017/tickettoken',
  {
    maxPoolSize: 10,
    minPoolSize: 2,
    retryWrites: true,
  }
);

// Health check
const isHealthy = await healthCheck(connection);

// Graceful shutdown
await gracefulShutdown(connection);
```

### Multiple Connections

```typescript
import { createMultipleConnections, closeMultipleConnections } from '@shared/mongodb';

const connections = await createMultipleConnections([
  {
    name: 'content',
    uri: 'mongodb://localhost:27017/content',
  },
  {
    name: 'analytics',
    uri: 'mongodb://localhost:27017/analytics',
  }
]);

// Access connections
const contentDb = connections.content;
const analyticsDb = connections.analytics;

// Close all
await closeMultipleConnections(connections);
```

## CRUD Operations

### Insert Operations

```typescript
import { insertOne, insertMany } from '@shared/mongodb';

// Insert single document
const doc = await insertOne(Model, {
  name: 'Example',
  status: 'active'
});

// Insert multiple documents
const docs = await insertMany(Model, [
  { name: 'Doc 1' },
  { name: 'Doc 2' }
]);
```

### Find Operations

```typescript
import { findOne, findMany, findAll, findByIds } from '@shared/mongodb';

// Find one
const doc = await findOne(Model, { _id: id });

// Find many with pagination
const result = await findMany(Model, 
  { status: 'published' },
  {
    page: 1,
    limit: 20,
    sortBy: 'createdAt',
    sortOrder: 'desc',
    populate: 'author',
    select: 'title content createdAt'
  }
);

// Access results
console.log(result.data); // Array of documents
console.log(result.pagination); // { page, limit, total, totalPages, hasMore }

// Find all (no pagination)
const allDocs = await findAll(Model, { status: 'active' });

// Find by IDs
const docs = await findByIds(Model, ['id1', 'id2', 'id3']);
```

### Update Operations

```typescript
import { updateOne, updateMany, upsertOne, incrementField } from '@shared/mongodb';

// Update one
const updated = await updateOne(
  Model,
  { _id: id },
  { $set: { status: 'published' } }
);

// Update many
const result = await updateMany(
  Model,
  { status: 'draft' },
  { $set: { reviewed: true } }
);
console.log(result.modifiedCount);

// Upsert (update or insert)
const doc = await upsertOne(
  Model,
  { email: 'user@example.com' },
  { $set: { name: 'John', lastSeen: new Date() } }
);

// Increment field
await incrementField(Model, { _id: id }, 'viewCount', 1);
```

### Delete Operations

```typescript
import { deleteOne, deleteMany } from '@shared/mongodb';

// Delete one
const deleted = await deleteOne(Model, { _id: id });

// Delete many
const result = await deleteMany(Model, { status: 'archived' });
console.log(result.deletedCount);
```

### Array Operations

```typescript
import { pushToArray, pullFromArray } from '@shared/mongodb';

// Push to array
await pushToArray(
  Model,
  { _id: id },
  'tags',
  'new-tag'
);

// Pull from array
await pullFromArray(
  Model,
  { _id: id },
  'tags',
  'old-tag'
);
```

### Aggregations

```typescript
import { aggregate } from '@shared/mongodb';

const results = await aggregate(Model, [
  { $match: { status: 'published' } },
  { $group: { _id: '$category', count: { $sum: 1 } } },
  { $sort: { count: -1 } }
]);
```

### Transactions

```typescript
import { withTransaction } from '@shared/mongodb';

const result = await withTransaction(connection, async (session) => {
  // All operations use the session
  const venue = await insertOne(VenueModel, venueData, session);
  const content = await insertOne(ContentModel, contentData, session);
  
  return { venue, content };
});
```

## Schema Validation

### Built-in Validators

```typescript
import {
  validateEmail,
  validateUrl,
  validateObjectId,
  validateDateRange,
  validateNumberRange,
  validateStringLength
} from '@shared/mongodb';

// Email validation
if (!validateEmail('user@example.com')) {
  throw new Error('Invalid email');
}

// Date range validation
const result = validateDateRange(startDate, endDate, { maxDays: 30 });
if (!result.valid) {
  console.error(result.error);
}

// Number range
const numResult = validateNumberRange(value, 1, 100);
```

### Object Validation

```typescript
import { validateObject, validateRequired, validateStringLength } from '@shared/mongodb';

const result = validateObject(userData, {
  name: [
    (v) => validateRequired(v, 'name'),
    (v) => validateStringLength(v, 2, 50)
  ],
  email: [
    (v) => validateRequired(v, 'email'),
    (v) => validateEmail(v) ? { valid: true } : { valid: false, error: 'Invalid email' }
  ]
});

if (!result.valid) {
  console.error(result.errors); // { field: ['error1', 'error2'] }
}
```

### JSON Schema Builder

```typescript
import { buildMongoJsonSchema, SchemaProperties } from '@shared/mongodb';

const schema = buildMongoJsonSchema({
  required: ['name', 'email'],
  properties: {
    name: SchemaProperties.string({ minLength: 2, maxLength: 100 }),
    email: SchemaProperties.email(),
    age: SchemaProperties.number({ minimum: 0, maximum: 150 }),
    tags: SchemaProperties.array(SchemaProperties.string(), { maxItems: 10 }),
    role: SchemaProperties.enum(['admin', 'user', 'guest'])
  }
});
```

## Index Management

### Create Indexes

```typescript
import {
  ensureIndexes,
  createCompoundIndex,
  createTextIndex,
  createTTLIndex,
  createUniqueIndex
} from '@shared/mongodb';

// Ensure indexes exist (idempotent)
await ensureIndexes(Model, [
  { fields: { status: 1, createdAt: -1 } },
  { fields: { userId: 1 } },
  { fields: { email: 1 }, options: { unique: true } }
]);

// Compound index
await createCompoundIndex(Model, {
  venueId: 1,
  status: 1,
  publishedAt: -1
});

// Text search index
await createTextIndex(Model, ['title', 'description']);

// TTL index (auto-delete after 30 days)
await createTTLIndex(Model, 'expiresAt', 30 * 24 * 60 * 60);

// Unique index
await createUniqueIndex(Model, 'email');
```

### Common Index Patterns

```typescript
import { CommonIndexes } from '@shared/mongodb';

// Timestamp indexes
await ensureIndexes(Model, CommonIndexes.timestamps());

// Status with time
await ensureIndexes(Model, [CommonIndexes.statusWithTime()]);

// User content target indexes
await ensureIndexes(Model, CommonIndexes.target());

// Featured content
await ensureIndexes(Model, [CommonIndexes.featured()]);

// Text search
await ensureIndexes(Model, [CommonIndexes.textSearch(['title', 'body'])]);
```

### Index Management

```typescript
import { listIndexes, dropIndex, getIndexStats, rebuildIndexes } from '@shared/mongodb';

// List all indexes
const indexes = await listIndexes(Model);

// Drop specific index
await dropIndex(Model, 'email_1');

// Get index statistics
const stats = await getIndexStats(Model);

// Rebuild all indexes
await rebuildIndexes(Model);
```

## Type Definitions

The library includes comprehensive TypeScript types for all content collections:

```typescript
import type {
  VenueContent,
  EventContent,
  UserContent,
  MarketingContent,
  RatingSummary,
  PaginatedResult
} from '@shared/mongodb';

// Use in your code
const venue: VenueContent = { /* ... */ };
const ratings: RatingSummary = { /* ... */ };
```

## Environment Variables

```env
MONGODB_URI=mongodb://user:pass@localhost:27017/dbname?authSource=admin
MONGODB_DATABASE=tickettoken_content
MONGODB_POOL_SIZE=10
```

## Best Practices

### 1. Connection Reuse

```typescript
// ✅ Good - Create once, reuse
export const mongoConnection = await createMongoConnection(uri);

// ❌ Bad - Creating new connections
async function handler() {
  const conn = await createMongoConnection(uri); // New connection every time
}
```

### 2. Use Transactions for Related Operations

```typescript
// ✅ Good - Atomic operations
await withTransaction(connection, async (session) => {
  await insertOne(Model1, data1, session);
  await insertOne(Model2, data2, session);
});

// ❌ Bad - Non-atomic
await insertOne(Model1, data1);
await insertOne(Model2, data2); // Might fail leaving inconsistent state
```

### 3. Use Pagination

```typescript
// ✅ Good - Paginated results
const result = await findMany(Model, filter, { page: 1, limit: 20 });

// ❌ Bad - Loading all documents
const all = await findAll(Model, {}); // Could return millions of docs
```

### 4. Create Indexes for Queries

```typescript
// If you frequently query by status and createdAt
await createCompoundIndex(Model, { status: 1, createdAt: -1 });
```

### 5. Handle Errors

```typescript
try {
  const doc = await insertOne(Model, data);
} catch (error) {
  console.error('Failed to insert document:', error);
  // Handle error appropriately
}
```

## Error Handling

All operations throw descriptive errors:

```typescript
import { insertOne } from '@shared/mongodb';

try {
  await insertOne(Model, invalidData);
} catch (error) {
  console.error(error.message); // "Failed to insert document: validation failed"
}
```

## Testing

```typescript
import { createMongoConnection, gracefulShutdown } from '@shared/mongodb';

let connection;

beforeAll(async () => {
  connection = await createMongoConnection('mongodb://localhost:27017/test');
});

afterAll(async () => {
  await gracefulShutdown(connection);
});

test('should insert document', async () => {
  const doc = await insertOne(Model, { name: 'Test' });
  expect(doc.name).toBe('Test');
});
```

## Migration from Old Code

### Before (Direct Mongoose)

```typescript
const venue = new VenueModel({ name: 'Test' });
await venue.save();

const venues = await VenueModel.find({ status: 'active' })
  .skip(0)
  .limit(20)
  .sort({ createdAt: -1 });
```

### After (Using Library)

```typescript
import { insertOne, findMany } from '@shared/mongodb';

const venue = await insertOne(VenueModel, { name: 'Test' });

const result = await findMany(
  VenueModel,
  { status: 'active' },
  { page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' }
);
```

## Contributing

When adding new utilities:

1. Add implementation to appropriate module (connection, operations, etc.)
2. Export from `src/index.ts`
3. Add TypeScript types to `src/types.ts`
4. Update this README with examples
5. Add unit tests

## License

MIT - TicketToken Platform

## Support

For issues or questions, please contact the platform team or create an issue in the repository.
