import { Model, Document, FilterQuery, UpdateQuery, QueryOptions, ClientSession } from 'mongoose';
import { PaginatedResult, PaginationOptions, QueryOptions as CustomQueryOptions } from './types';

/**
 * Insert a single document
 * @param model - Mongoose model
 * @param data - Document data
 * @param session - Optional session for transactions
 * @returns Promise with created document
 */
export async function insertOne<T extends Document>(
  model: Model<T>,
  data: Partial<T>,
  session?: ClientSession
): Promise<T> {
  try {
    const document = new model(data);
    await document.save({ session });
    return document;
  } catch (error) {
    throw new Error(`Failed to insert document: ${(error as Error).message}`);
  }
}

/**
 * Insert multiple documents
 * @param model - Mongoose model
 * @param data - Array of document data
 * @param session - Optional session for transactions
 * @returns Promise with array of created documents
 */
export async function insertMany<T extends Document>(
  model: Model<T>,
  data: Partial<T>[],
  session?: ClientSession
): Promise<T[]> {
  try {
    const documents = await model.insertMany(data, { session });
    return documents as unknown as T[];
  } catch (error) {
    throw new Error(`Failed to insert documents: ${(error as Error).message}`);
  }
}

/**
 * Find a single document
 * @param model - Mongoose model
 * @param filter - Query filter
 * @param options - Query options (populate, select, etc.)
 * @returns Promise with document or null
 */
export async function findOne<T extends Document>(
  model: Model<T>,
  filter: FilterQuery<T>,
  options?: QueryOptions
): Promise<T | null> {
  try {
    let query = model.findOne(filter);

    if (options) {
      if (options.select) query = query.select(options.select);
      if (options.populate) query = query.populate(options.populate as any);
      if (options.lean) query = query.lean() as any;
    }

    return await query.exec();
  } catch (error) {
    throw new Error(`Failed to find document: ${(error as Error).message}`);
  }
}

/**
 * Find multiple documents with pagination
 * @param model - Mongoose model
 * @param filter - Query filter
 * @param options - Pagination and query options
 * @returns Promise with paginated results
 */
export async function findMany<T extends Document>(
  model: Model<T>,
  filter: FilterQuery<T>,
  options: CustomQueryOptions = {}
): Promise<PaginatedResult<T>> {
  try {
    const page = options.page || 1;
    const limit = options.limit || 20;
    const skip = (page - 1) * limit;

    // Build query
    let query = model.find(filter);

    // Apply sorting
    if (options.sortBy) {
      const sortOrder = options.sortOrder === 'desc' ? -1 : 1;
      query = query.sort({ [options.sortBy]: sortOrder });
    }

    // Apply select and populate
    if (options.select) query = query.select(options.select);
    if (options.populate) query = query.populate(options.populate);

    // Execute query with pagination
    const [documents, total] = await Promise.all([
      query.skip(skip).limit(limit).exec(),
      model.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: documents,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    };
  } catch (error) {
    throw new Error(`Failed to find documents: ${(error as Error).message}`);
  }
}

/**
 * Find all documents (without pagination)
 * @param model - Mongoose model
 * @param filter - Query filter
 * @param options - Query options
 * @returns Promise with array of documents
 */
export async function findAll<T extends Document>(
  model: Model<T>,
  filter: FilterQuery<T> = {},
  options?: QueryOptions
): Promise<T[]> {
  try {
    let query = model.find(filter);

    if (options) {
      if (options.sort) query = query.sort(options.sort);
      if (options.select) query = query.select(options.select);
      if (options.populate) query = query.populate(options.populate as any);
      if (options.limit) query = query.limit(options.limit);
      if (options.lean) query = query.lean() as any;
    }

    return await query.exec();
  } catch (error) {
    throw new Error(`Failed to find all documents: ${(error as Error).message}`);
  }
}

/**
 * Update a single document
 * @param model - Mongoose model
 * @param filter - Query filter
 * @param update - Update operations
 * @param options - Update options
 * @returns Promise with updated document or null
 */
export async function updateOne<T extends Document>(
  model: Model<T>,
  filter: FilterQuery<T>,
  update: UpdateQuery<T>,
  options: QueryOptions & { session?: ClientSession } = {}
): Promise<T | null> {
  try {
    const defaultOptions = {
      new: true, // Return updated document
      runValidators: true, // Run schema validators
      ...options,
    };

    return await model.findOneAndUpdate(filter, update, defaultOptions).exec();
  } catch (error) {
    throw new Error(`Failed to update document: ${(error as Error).message}`);
  }
}

/**
 * Update multiple documents
 * @param model - Mongoose model
 * @param filter - Query filter
 * @param update - Update operations
 * @param session - Optional session for transactions
 * @returns Promise with update result
 */
export async function updateMany<T extends Document>(
  model: Model<T>,
  filter: FilterQuery<T>,
  update: UpdateQuery<T>,
  session?: ClientSession
): Promise<{ modifiedCount: number; matchedCount: number }> {
  try {
    const result = await model.updateMany(filter, update, { session }).exec();
    return {
      modifiedCount: result.modifiedCount,
      matchedCount: result.matchedCount,
    };
  } catch (error) {
    throw new Error(`Failed to update documents: ${(error as Error).message}`);
  }
}

/**
 * Delete a single document
 * @param model - Mongoose model
 * @param filter - Query filter
 * @param session - Optional session for transactions
 * @returns Promise with deleted document or null
 */
export async function deleteOne<T extends Document>(
  model: Model<T>,
  filter: FilterQuery<T>,
  session?: ClientSession
): Promise<T | null> {
  try {
    return await model.findOneAndDelete(filter, { session }).exec();
  } catch (error) {
    throw new Error(`Failed to delete document: ${(error as Error).message}`);
  }
}

/**
 * Delete multiple documents
 * @param model - Mongoose model
 * @param filter - Query filter
 * @param session - Optional session for transactions
 * @returns Promise with deletion result
 */
export async function deleteMany<T extends Document>(
  model: Model<T>,
  filter: FilterQuery<T>,
  session?: ClientSession
): Promise<{ deletedCount: number }> {
  try {
    const result = await model.deleteMany(filter, { session }).exec();
    return {
      deletedCount: result.deletedCount || 0,
    };
  } catch (error) {
    throw new Error(`Failed to delete documents: ${(error as Error).message}`);
  }
}

/**
 * Count documents matching filter
 * @param model - Mongoose model
 * @param filter - Query filter
 * @returns Promise with document count
 */
export async function count<T extends Document>(
  model: Model<T>,
  filter: FilterQuery<T> = {}
): Promise<number> {
  try {
    return await model.countDocuments(filter).exec();
  } catch (error) {
    throw new Error(`Failed to count documents: ${(error as Error).message}`);
  }
}

/**
 * Check if documents exist matching filter
 * @param model - Mongoose model
 * @param filter - Query filter
 * @returns Promise with boolean
 */
export async function exists<T extends Document>(
  model: Model<T>,
  filter: FilterQuery<T>
): Promise<boolean> {
  try {
    const doc = await model.exists(filter);
    return doc !== null;
  } catch (error) {
    throw new Error(`Failed to check existence: ${(error as Error).message}`);
  }
}

/**
 * Execute an aggregation pipeline
 * @param model - Mongoose model
 * @param pipeline - Aggregation pipeline
 * @param options - Aggregation options
 * @returns Promise with aggregation results
 */
export async function aggregate<T extends Document, R = any>(
  model: Model<T>,
  pipeline: any[],
  options?: any
): Promise<R[]> {
  try {
    return await model.aggregate(pipeline, options).exec();
  } catch (error) {
    throw new Error(`Failed to execute aggregation: ${(error as Error).message}`);
  }
}

/**
 * Execute operations within a transaction
 * @param connection - Mongoose connection
 * @param callback - Transaction callback function
 * @returns Promise with callback result
 */
export async function withTransaction<T>(
  connection: any,
  callback: (session: ClientSession) => Promise<T>
): Promise<T> {
  const session = await connection.startSession();
  
  try {
    session.startTransaction();
    
    const result = await callback(session);
    
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    throw new Error(`Transaction failed: ${(error as Error).message}`);
  } finally {
    session.endSession();
  }
}

/**
 * Bulk write operations
 * @param model - Mongoose model
 * @param operations - Array of bulk operations
 * @param session - Optional session for transactions
 * @returns Promise with bulk write result
 */
export async function bulkWrite<T extends Document>(
  model: Model<T>,
  operations: any[],
  session?: ClientSession
): Promise<{
  insertedCount: number;
  modifiedCount: number;
  deletedCount: number;
  upsertedCount: number;
}> {
  try {
    const result = await model.bulkWrite(operations, { session });
    
    return {
      insertedCount: result.insertedCount || 0,
      modifiedCount: result.modifiedCount || 0,
      deletedCount: result.deletedCount || 0,
      upsertedCount: result.upsertedCount || 0,
    };
  } catch (error) {
    throw new Error(`Bulk write failed: ${(error as Error).message}`);
  }
}

/**
 * Find documents by IDs
 * @param model - Mongoose model
 * @param ids - Array of document IDs
 * @param options - Query options
 * @returns Promise with array of documents
 */
export async function findByIds<T extends Document>(
  model: Model<T>,
  ids: string[],
  options?: QueryOptions
): Promise<T[]> {
  try {
    let query = model.find({ _id: { $in: ids } } as FilterQuery<T>);

    if (options) {
      if (options.select) query = query.select(options.select);
      if (options.populate) query = query.populate(options.populate as any);
      if (options.sort) query = query.sort(options.sort);
    }

    return await query.exec();
  } catch (error) {
    throw new Error(`Failed to find documents by IDs: ${(error as Error).message}`);
  }
}

/**
 * Find one and upsert (update or insert)
 * @param model - Mongoose model
 * @param filter - Query filter
 * @param update - Update operations
 * @param session - Optional session for transactions
 * @returns Promise with upserted document
 */
export async function upsertOne<T extends Document>(
  model: Model<T>,
  filter: FilterQuery<T>,
  update: UpdateQuery<T>,
  session?: ClientSession
): Promise<T> {
  try {
    const options = {
      upsert: true,
      new: true,
      runValidators: true,
      session,
    };

    const document = await model.findOneAndUpdate(filter, update, options).exec();
    
    if (!document) {
      throw new Error('Upsert operation failed to return document');
    }

    return document;
  } catch (error) {
    throw new Error(`Failed to upsert document: ${(error as Error).message}`);
  }
}

/**
 * Increment a numeric field
 * @param model - Mongoose model
 * @param filter - Query filter
 * @param field - Field to increment
 * @param amount - Amount to increment by (default: 1)
 * @param session - Optional session for transactions
 * @returns Promise with updated document
 */
export async function incrementField<T extends Document>(
  model: Model<T>,
  filter: FilterQuery<T>,
  field: string,
  amount: number = 1,
  session?: ClientSession
): Promise<T | null> {
  try {
    const update = { $inc: { [field]: amount } } as UpdateQuery<T>;
    
    return await model.findOneAndUpdate(
      filter,
      update,
      { new: true, session }
    ).exec();
  } catch (error) {
    throw new Error(`Failed to increment field: ${(error as Error).message}`);
  }
}

/**
 * Push item to array field
 * @param model - Mongoose model
 * @param filter - Query filter
 * @param field - Array field name
 * @param item - Item to push
 * @param session - Optional session for transactions
 * @returns Promise with updated document
 */
export async function pushToArray<T extends Document>(
  model: Model<T>,
  filter: FilterQuery<T>,
  field: string,
  item: any,
  session?: ClientSession
): Promise<T | null> {
  try {
    const update = { $push: { [field]: item } } as UpdateQuery<T>;
    
    return await model.findOneAndUpdate(
      filter,
      update,
      { new: true, session }
    ).exec();
  } catch (error) {
    throw new Error(`Failed to push to array: ${(error as Error).message}`);
  }
}

/**
 * Pull item from array field
 * @param model - Mongoose model
 * @param filter - Query filter
 * @param field - Array field name
 * @param condition - Condition for items to remove
 * @param session - Optional session for transactions
 * @returns Promise with updated document
 */
export async function pullFromArray<T extends Document>(
  model: Model<T>,
  filter: FilterQuery<T>,
  field: string,
  condition: any,
  session?: ClientSession
): Promise<T | null> {
  try {
    const update = { $pull: { [field]: condition } } as UpdateQuery<T>;
    
    return await model.findOneAndUpdate(
      filter,
      update,
      { new: true, session }
    ).exec();
  } catch (error) {
    throw new Error(`Failed to pull from array: ${(error as Error).message}`);
  }
}
