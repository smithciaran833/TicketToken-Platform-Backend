import { BaseModel } from './base.model';
import { Knex } from 'knex';

export interface IEventCategory {
  id?: string;
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

  async findBySlug(slug: string): Promise<IEventCategory | null> {
    return this.db(this.tableName)
      .where({ slug, is_active: true })
      .first();
  }

  async findTopLevel(): Promise<IEventCategory[]> {
    return this.db(this.tableName)
      .whereNull('parent_id')
      .where({ is_active: true })
      .orderBy('display_order', 'asc')
      .orderBy('name', 'asc');
  }

  async findByParentId(parentId: string): Promise<IEventCategory[]> {
    return this.db(this.tableName)
      .where({ parent_id: parentId, is_active: true })
      .orderBy('display_order', 'asc');
  }

  async findFeatured(): Promise<IEventCategory[]> {
    return this.db(this.tableName)
      .where({ is_active: true, is_featured: true })
      .orderBy('display_order', 'asc')
      .limit(10);
  }

  async getCategoryTree(): Promise<any[]> {
    const categories = await this.db(this.tableName)
      .where({ is_active: true })
      .orderBy('display_order', 'asc');

    const topLevel = categories.filter(c => !c.parent_id);
    
    return topLevel.map(parent => ({
      ...parent,
      children: categories.filter(c => c.parent_id === parent.id)
    }));
  }
}
