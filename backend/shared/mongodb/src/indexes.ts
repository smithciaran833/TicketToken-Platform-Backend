import { Model, Document, IndexDefinition, IndexOptions } from 'mongoose';

/**
 * Index configuration interface
 */
export interface IndexConfig {
  fields: IndexDefinition;
  options?: IndexOptions;
}

/**
 * Ensure indexes exist on a model (idempotent)
 * @param model - Mongoose model
 * @param indexes - Array of index configurations
 * @returns Promise with created index names
 */
export async function ensureIndexes<T extends Document>(
  model: Model<T>,
  indexes: IndexConfig[]
): Promise<string[]> {
  const createdIndexes: string[] = [];

  try {
    for (const { fields, options = {} } of indexes) {
      const indexName = options.name || Object.keys(fields).join('_');
      await model.collection.createIndex(fields as any, options as any);
      createdIndexes.push(indexName);
      console.log(`[MongoDB] Created/verified index: ${indexName} on ${model.modelName}`);
    }

    return createdIndexes;
  } catch (error) {
    throw new Error(`Failed to ensure indexes: ${(error as Error).message}`);
  }
}

/**
 * Create a TTL (Time To Live) index
 * @param model - Mongoose model
 * @param field - Field name for TTL
 * @param expireAfterSeconds - Seconds after which documents expire
 * @returns Promise with index name
 */
export async function createTTLIndex<T extends Document>(
  model: Model<T>,
  field: string,
  expireAfterSeconds: number
): Promise<string> {
  try {
    const indexName = `${field}_ttl`;
    
    await model.collection.createIndex(
      { [field]: 1 },
      {
        expireAfterSeconds,
        name: indexName,
      }
    );

    console.log(
      `[MongoDB] Created TTL index '${indexName}' on ${model.modelName}.${field} (expires after ${expireAfterSeconds}s)`
    );

    return indexName;
  } catch (error) {
    throw new Error(`Failed to create TTL index: ${(error as Error).message}`);
  }
}

/**
 * Create a compound index (multiple fields)
 * @param model - Mongoose model
 * @param fields - Object with field names and sort order (1 or -1)
 * @param options - Index options
 * @returns Promise with index name
 */
export async function createCompoundIndex<T extends Document>(
  model: Model<T>,
  fields: Record<string, 1 | -1>,
  options: IndexOptions = {}
): Promise<string> {
  try {
    const indexName = options.name || Object.keys(fields).join('_');
    
    await model.collection.createIndex(fields, {
      ...options,
      name: indexName,
    } as any);

    console.log(`[MongoDB] Created compound index '${indexName}' on ${model.modelName}`);

    return indexName;
  } catch (error) {
    throw new Error(`Failed to create compound index: ${(error as Error).message}`);
  }
}

/**
 * Create a text index for full-text search
 * @param model - Mongoose model
 * @param fields - Fields to include in text index
 * @param options - Index options (weights, default_language, etc.)
 * @returns Promise with index name
 */
export async function createTextIndex<T extends Document>(
  model: Model<T>,
  fields: string | string[] | Record<string, 'text'>,
  options: IndexOptions = {}
): Promise<string> {
  try {
    let textIndexDef: Record<string, any>;

    if (typeof fields === 'string') {
      textIndexDef = { [fields]: 'text' };
    } else if (Array.isArray(fields)) {
      textIndexDef = fields.reduce((acc, field) => {
        acc[field] = 'text';
        return acc;
      }, {} as Record<string, string>);
    } else {
      textIndexDef = fields;
    }

    const indexName = options.name || 'text_index';

    await model.collection.createIndex(textIndexDef, {
      ...options,
      name: indexName,
    } as any);

    console.log(`[MongoDB] Created text index '${indexName}' on ${model.modelName}`);

    return indexName;
  } catch (error) {
    throw new Error(`Failed to create text index: ${(error as Error).message}`);
  }
}

/**
 * Create a 2dsphere index for geospatial queries
 * @param model - Mongoose model
 * @param field - Field containing GeoJSON data
 * @param options - Index options
 * @returns Promise with index name
 */
export async function create2dsphereIndex<T extends Document>(
  model: Model<T>,
  field: string,
  options: IndexOptions = {}
): Promise<string> {
  try {
    const indexName = options.name || `${field}_2dsphere`;

    await model.collection.createIndex(
      { [field]: '2dsphere' },
      {
        ...options,
        name: indexName,
      } as any
    );

    console.log(`[MongoDB] Created 2dsphere index '${indexName}' on ${model.modelName}.${field}`);

    return indexName;
  } catch (error) {
    throw new Error(`Failed to create 2dsphere index: ${(error as Error).message}`);
  }
}

/**
 * Create a unique index
 * @param model - Mongoose model
 * @param fields - Fields to include in unique index
 * @param options - Index options
 * @returns Promise with index name
 */
export async function createUniqueIndex<T extends Document>(
  model: Model<T>,
  fields: string | Record<string, 1 | -1>,
  options: IndexOptions = {}
): Promise<string> {
  try {
    const indexDef = typeof fields === 'string' ? { [fields]: 1 } : fields;
    const indexName = options.name || `${Object.keys(indexDef).join('_')}_unique`;

    await model.collection.createIndex(indexDef, {
      ...options,
      unique: true,
      name: indexName,
    });

    console.log(`[MongoDB] Created unique index '${indexName}' on ${model.modelName}`);

    return indexName;
  } catch (error) {
    throw new Error(`Failed to create unique index: ${(error as Error).message}`);
  }
}

/**
 * Create a sparse index (only indexes documents that have the field)
 * @param model - Mongoose model
 * @param field - Field to index
 * @param options - Index options
 * @returns Promise with index name
 */
export async function createSparseIndex<T extends Document>(
  model: Model<T>,
  field: string,
  options: IndexOptions = {}
): Promise<string> {
  try {
    const indexName = options.name || `${field}_sparse`;

    await model.collection.createIndex(
      { [field]: 1 },
      {
        ...options,
        sparse: true,
        name: indexName,
      } as any
    );

    console.log(`[MongoDB] Created sparse index '${indexName}' on ${model.modelName}.${field}`);

    return indexName;
  } catch (error) {
    throw new Error(`Failed to create sparse index: ${(error as Error).message}`);
  }
}

/**
 * Create a partial index (only indexes documents matching a filter)
 * @param model - Mongoose model
 * @param fields - Fields to index
 * @param filter - Filter expression for partial index
 * @param options - Index options
 * @returns Promise with index name
 */
export async function createPartialIndex<T extends Document>(
  model: Model<T>,
  fields: Record<string, 1 | -1>,
  filter: Record<string, any>,
  options: IndexOptions = {}
): Promise<string> {
  try {
    const indexName = options.name || `${Object.keys(fields).join('_')}_partial`;

    await model.collection.createIndex(fields, {
      ...options,
      partialFilterExpression: filter,
      name: indexName,
    } as any);

    console.log(`[MongoDB] Created partial index '${indexName}' on ${model.modelName}`);

    return indexName;
  } catch (error) {
    throw new Error(`Failed to create partial index: ${(error as Error).message}`);
  }
}

/**
 * Drop an index by name
 * @param model - Mongoose model
 * @param indexName - Name of index to drop
 */
export async function dropIndex<T extends Document>(
  model: Model<T>,
  indexName: string
): Promise<void> {
  try {
    await model.collection.dropIndex(indexName);
    console.log(`[MongoDB] Dropped index '${indexName}' from ${model.modelName}`);
  } catch (error) {
    throw new Error(`Failed to drop index: ${(error as Error).message}`);
  }
}

/**
 * Drop all indexes except _id
 * @param model - Mongoose model
 */
export async function dropAllIndexes<T extends Document>(model: Model<T>): Promise<void> {
  try {
    await model.collection.dropIndexes();
    console.log(`[MongoDB] Dropped all indexes from ${model.modelName}`);
  } catch (error) {
    throw new Error(`Failed to drop all indexes: ${(error as Error).message}`);
  }
}

/**
 * List all indexes on a model
 * @param model - Mongoose model
 * @returns Promise with array of index information
 */
export async function listIndexes<T extends Document>(
  model: Model<T>
): Promise<any[]> {
  try {
    const indexes = await model.collection.listIndexes().toArray();
    return indexes;
  } catch (error) {
    throw new Error(`Failed to list indexes: ${(error as Error).message}`);
  }
}


/**
 * Check if an index exists
 * @param model - Mongoose model
 * @param indexName - Name of index to check
 * @returns Promise with boolean
 */
export async function indexExists<T extends Document>(
  model: Model<T>,
  indexName: string
): Promise<boolean> {
  try {
    const indexes = await model.collection.listIndexes().toArray();
    return indexes.some((index: any) => index.name === indexName);
  } catch (error) {
    throw new Error(`Failed to check index existence: ${(error as Error).message}`);
  }
}

/**
 * Common index patterns for content collections
 */
export const CommonIndexes = {
  /**
   * Timestamp indexes for sorting by creation/update time
   */
  timestamps: (): IndexConfig[] => [
    { fields: { createdAt: -1 } },
    { fields: { updatedAt: -1 } },
  ],

  /**
   * Status index for filtering by status
   */
  status: (): IndexConfig => ({
    fields: { status: 1 },
  }),

  /**
   * Compound status + timestamp index
   */
  statusWithTime: (): IndexConfig => ({
    fields: { status: 1, createdAt: -1 },
  }),

  /**
   * User reference index
   */
  userId: (): IndexConfig => ({
    fields: { userId: 1 },
  }),

  /**
   * Target reference for user content (reviews, ratings, etc.)
   */
  target: (): IndexConfig[] => [
    { fields: { targetType: 1, targetId: 1 } },
    { fields: { targetType: 1, targetId: 1, status: 1 } },
  ],

  /**
   * Featured content index
   */
  featured: (): IndexConfig => ({
    fields: { featured: 1, status: 1, displayOrder: 1 },
  }),

  /**
   * Soft delete index
   */
  softDelete: (field = 'deletedAt'): IndexConfig => ({
    fields: { [field]: 1 },
    options: { sparse: true },
  }),

  /**
   * Full-text search index
   */
  textSearch: (fields: string[]): IndexConfig => ({
    fields: fields.reduce((acc, field) => {
      acc[field] = 'text' as any;
      return acc;
    }, {} as Record<string, any>),
    options: { name: 'text_search_index' },
  }),
};
