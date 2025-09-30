import { BaseModel } from './base.model';
import { Knex } from 'knex';

export interface IVenue {
  id?: string;
  created_by?: string;
  name: string;
  slug: string;
  type: 'comedy_club' | 'theater' | 'arena' | 'stadium' | 'other';
  capacity?: number;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
  settings?: Record<string, any>;
  onboarding?: Record<string, boolean>;
  onboarding_status: 'pending' | 'in_progress' | 'completed';
  is_active?: boolean;
  created_at?: Date;
  updated_at?: Date;
  deleted_at?: Date;
}

export class VenueModel extends BaseModel {
  constructor(db: Knex | Knex.Transaction) {
    super('venues', db);
  }

  async findBySlug(slug: string): Promise<IVenue | null> {
    const venue = await this.db('venues')
      .where({ slug })
      .whereNull('deleted_at')
      .first();

    if (venue) {
      return this.transformFromDb(venue);
    }
    return null;
  }

  async findById(id: string): Promise<IVenue | null> {
    const venue = await super.findById(id);
    if (venue) {
      return this.transformFromDb(venue);
    }
    return null;
  }

  async createWithDefaults(venueData: Partial<IVenue>): Promise<IVenue> {
    // Only generate slug if not provided
    const slug = venueData.slug || this.generateSlug(venueData.name || '');

    const venue: Partial<IVenue> = {
      ...venueData,
      slug,
      settings: {
        general: {
          timezone: 'America/New_York',
          currency: 'USD',
          language: 'en',
        },
        ticketing: {
          allowRefunds: true,
          refundWindow: 24,
          maxTicketsPerOrder: 10,
          requirePhoneNumber: false,
        },
        notifications: {
          emailEnabled: true,
          smsEnabled: false,
        },
        ...venueData.settings,
      },
      onboarding_status: 'pending',
      is_active: true,
    };

    const dbData = this.transformForDb(venue);
    const created = await this.create(dbData);
    return this.transformFromDb(created);
  }

  async updateOnboardingStatus(venueId: string, status: IVenue['onboarding_status']): Promise<boolean> {
    const result = await this.update(venueId, { onboarding_status: status });
    return !!result;
  }

  async getActiveVenues(options: any = {}): Promise<IVenue[]> {
    const venues = await this.findAll({ is_active: true }, options);
    return venues.map((v: any) => this.transformFromDb(v));
  }

  async getVenuesByType(type: IVenue['type'], options: any = {}): Promise<IVenue[]> {
    const venues = await this.findAll({ type, is_active: true }, options);
    return venues.map((v: any) => this.transformFromDb(v));
  }

  async searchVenues(searchTerm: string, options: any = {}): Promise<IVenue[]> {
    const {
      limit = 20,
      offset = 0,
      type,
      city,
      state,
      sort_by = 'name',
      sort_order = 'asc'
    } = options;

    let query = this.db('venues')
      .whereNull('deleted_at')
      .where('is_active', true);

    if (searchTerm) {
      query = query.where(function(this: any) {
        this.where('name', 'ilike', `%${searchTerm}%`)
          .orWhere('city', 'ilike', `%${searchTerm}%`);
      });
    }

    if (type) {
      query = query.where('type', type);
    }

    if (city) {
      query = query.where('city', 'ilike', city);
    }

    if (state) {
      query = query.where('state', 'ilike', state);
    }

    const sortColumn = sort_by === 'created_at' ? 'created_at' :
                      sort_by === 'capacity' ? 'capacity' : 'name';
    query = query.orderBy(sortColumn, sort_order);

    const venues = await query.limit(limit).offset(offset);
    return venues.map((v: any) => this.transformFromDb(v));
  }

  async getVenueStats(venueId: string): Promise<any> {
    const venue = await this.findById(venueId);
    if (!venue) return null;

    return {
      venue,
      stats: {
        totalEvents: 0,
        totalTicketsSold: 0,
        totalRevenue: 0,
        activeStaff: 0,
      },
    };
  }

  private transformForDb(venueData: Partial<IVenue>): any {
    const { address, ...rest } = venueData;
    const dbData: any = {
      ...rest
    };
    if (address) {
      dbData.address = address;
      dbData.city = address.city;
      dbData.state = address.state;
      dbData.zip_code = address.zipCode;
      dbData.country = address.country || 'US';
    }
    return dbData;
  }

  private transformFromDb(dbVenue: any): IVenue {
    if (!dbVenue) return dbVenue;

    const { city, state, zip_code, country, address, ...rest } = dbVenue;

    const venueAddress = address || {
      street: '',
      city: city || '',
      state: state || '',
      zipCode: zip_code || '',
      country: country || 'US'
    };

    if (!venueAddress.city) venueAddress.city = city || '';
    if (!venueAddress.state) venueAddress.state = state || '';
    if (!venueAddress.zipCode) venueAddress.zipCode = zip_code || '';
    if (!venueAddress.country) venueAddress.country = country || 'US';

    return {
      ...rest,
      address: venueAddress
    };
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
}
