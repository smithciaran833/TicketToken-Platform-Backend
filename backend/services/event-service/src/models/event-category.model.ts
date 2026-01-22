import { BaseModel } from './base.model';
import { Knex } from 'knex';

export interface IEventCategory {
  id?: string;
  tenant_id: string; // AUDIT FIX: Added tenant_id for tenant-specific categories
  parent_id?: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  color?: string;
  display_order?: number;
  is_active?: boolean;
  is_featured?: boolean;
  meta_title?: string;
  meta_description?: string;
  event_count?: number;
  created_at?: Date;
  updated_at?: Date;
}

export class EventCategoryModel extends BaseModel {
  constructor(db: Knex | Knex.Transaction) {
    super('event_categories', db);
  }

  /**
   * AUDIT FIX (MEDIUM): Added tenant_id parameter for proper isolation
   */
  async findBySlug(slug: string, tenantId: string): Promise<IEventCategory | null> {
    if (!tenantId) {
      throw new Error('tenant_id is required for findBySlug');
    }

    return this.db(this.tableName)
      .where({ slug, tenant_id: tenantId, is_active: true })
      .first();
  }

  /**
   * AUDIT FIX (MEDIUM): Added tenant_id parameter for proper isolation
   */
  async findTopLevel(tenantId: string): Promise<IEventCategory[]> {
    if (!tenantId) {
      throw new Error('tenant_id is required for findTopLevel');
    }

    return this.db(this.tableName)
      .where({ tenant_id: tenantId, is_active: true })
      .whereNull('parent_id')
      .orderBy('display_order', 'asc')
      .orderBy('name', 'asc');
  }

  /**
   * AUDIT FIX (MEDIUM): Added tenant_id parameter for proper isolation
   */
  async findByParentId(parentId: string, tenantId: string): Promise<IEventCategory[]> {
    if (!tenantId) {
      throw new Error('tenant_id is required for findByParentId');
    }

    return this.db(this.tableName)
      .where({ parent_id: parentId, tenant_id: tenantId, is_active: true })
      .orderBy('display_order', 'asc');
  }

  /**
   * AUDIT FIX (MEDIUM): Added tenant_id parameter for proper isolation
   */
  async findFeatured(tenantId: string): Promise<IEventCategory[]> {
    if (!tenantId) {
      throw new Error('tenant_id is required for findFeatured');
    }

    return this.db(this.tableName)
      .where({ tenant_id: tenantId, is_active: true, is_featured: true })
      .orderBy('display_order', 'asc')
      .limit(10);
  }

  /**
   * AUDIT FIX (MEDIUM): Added tenant_id parameter for proper isolation
   */
  async getCategoryTree(tenantId: string): Promise<any[]> {
    if (!tenantId) {
      throw new Error('tenant_id is required for getCategoryTree');
    }

    const categories = await this.db(this.tableName)
      .where({ tenant_id: tenantId, is_active: true })
      .orderBy('display_order', 'asc');

    const topLevel = categories.filter(c => !c.parent_id);

    return topLevel.map(parent => ({
      ...parent,
      children: categories.filter(c => c.parent_id === parent.id)
    }));
  }
}
