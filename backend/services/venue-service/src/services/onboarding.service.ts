import { VenueService } from './venue.service';
import { IntegrationModel } from '../models/integration.model';
import { LayoutModel } from '../models/layout.model';
import { StaffModel } from '../models/staff.model';
import { Knex } from 'knex';

export class OnboardingService {
  private venueService: VenueService;
  private integrationModel: IntegrationModel;
  private layoutModel: LayoutModel;
  private staffModel: StaffModel;
  private db: Knex;
  private logger: any;

  constructor(dependencies: {
    venueService: VenueService;
    db: Knex;
    logger: any;
  }) {
    this.venueService = dependencies.venueService;
    this.db = dependencies.db;
    this.logger = dependencies.logger;
    this.integrationModel = new IntegrationModel(this.db);
    this.layoutModel = new LayoutModel(this.db);
    this.staffModel = new StaffModel(this.db);
  }

  async getOnboardingStatus(venueId: string): Promise<any> {
    const steps = await this.getOnboardingSteps(venueId);
    const completedSteps = steps.filter((s: any) => s.completed).length;
    const totalSteps = steps.length;

    return {
      venueId,
      progress: Math.round((completedSteps / totalSteps) * 100),
      completedSteps,
      totalSteps,
      steps,
      status: completedSteps === totalSteps ? 'completed' : 'in_progress'
    };
  }

  private async getOnboardingSteps(venueId: string): Promise<any[]> {
    return [
      {
        id: 'basic_info',
        name: 'Basic Information',
        description: 'Venue name, type, and capacity',
        completed: await this.hasBasicInfo(venueId),
        required: true
      },
      {
        id: 'address',
        name: 'Address',
        description: 'Venue location details',
        completed: await this.hasAddress(venueId),
        required: true
      },
      {
        id: 'layout',
        name: 'Seating Layout',
        description: 'Configure venue seating arrangement',
        completed: await this.hasLayout(venueId),
        required: false
      },
      {
        id: 'payment',
        name: 'Payment Integration',
        description: 'Connect payment processor',
        completed: await this.hasPaymentIntegration(venueId),
        required: true
      },
      {
        id: 'staff',
        name: 'Staff Members',
        description: 'Add team members',
        completed: await this.hasStaff(venueId),
        required: false
      }
    ];
  }

  private async hasBasicInfo(venueId: string): Promise<boolean> {
    const venue = await this.db('venues').where({ id: venueId }).first();
    return !!(venue && venue.name && venue.venue_type && venue.max_capacity);
  }

  private async hasAddress(venueId: string): Promise<boolean> {
    const venue = await this.db('venues').where({ id: venueId }).first();
    if (!venue || !venue.address) return false;
    const address = venue.address;
    return !!(address.street && address.city && address.state && address.zipCode);
  }

  private async hasLayout(venueId: string): Promise<boolean> {
    const layouts = await this.layoutModel.findByVenue(venueId);
    return layouts.length > 0;
  }

  private async hasPaymentIntegration(venueId: string): Promise<boolean> {
    const integrations = await this.integrationModel.findByVenue(venueId);
    return integrations.some((i: any) => i.type === 'stripe' || i.type === 'square');
  }

  private async hasStaff(venueId: string): Promise<boolean> {
    const staffCount = await this.db('venue_staff')
      .where({ venue_id: venueId })
      .whereNull('deleted_at')
      .count('* as count')
      .first();
    return parseInt(String(staffCount?.count || '0'), 10) > 1;
  }

  async completeStep(venueId: string, stepId: string, data: any): Promise<void> {
    switch (stepId) {
      case 'basic_info':
        await this.updateBasicInfo(venueId, data);
        break;
      case 'address':
        await this.updateAddress(venueId, data);
        break;
      case 'layout':
        await this.createLayout(venueId, data);
        break;
      case 'payment':
        await this.createPaymentIntegration(venueId, data);
        break;
      case 'staff':
        await this.addStaffMember(venueId, data);
        break;
      default:
        throw new Error(`Unknown onboarding step: ${stepId}`);
    }
  }

  private async updateBasicInfo(venueId: string, data: any): Promise<void> {
    await this.db('venues').where({ id: venueId }).update({
      name: data.name,
      type: data.venue_type,
      capacity: data.max_capacity,
      updated_at: new Date()
    });
  }

  private async updateAddress(venueId: string, data: any): Promise<void> {
    await this.db('venues').where({ id: venueId }).update({
      address: data,
      updated_at: new Date()
    });
  }

  private async createLayout(venueId: string, data: any): Promise<void> {
    await this.layoutModel.create({
      venue_id: venueId,
      name: data.name,
      type: data.venue_type,
      sections: data.sections,
      capacity: data.max_capacity,
      is_default: true
    });
  }

  private async createPaymentIntegration(venueId: string, data: any): Promise<void> {
    await this.integrationModel.create({
      venue_id: venueId,
      type: data.venue_type,
      config: data.config,
      is_active: true
    });
  }

  private async addStaffMember(venueId: string, data: any): Promise<void> {
    await this.staffModel.addStaffMember({
      venue_id: venueId,
      user_id: data.userId,
      role: data.role,
      permissions: data.permissions || []
    });
  }
}
