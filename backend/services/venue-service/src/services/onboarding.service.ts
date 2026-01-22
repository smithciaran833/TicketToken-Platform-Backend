import { VenueService } from './venue.service';
import { IntegrationModel } from '../models/integration.model';
import { LayoutModel } from '../models/layout.model';
import { StaffModel } from '../models/staff.model';
import { Knex } from 'knex';

/**
 * SECURITY FIX: OnboardingService with tenant validation
 * - All public methods now require tenantId parameter
 * - Validates tenant context before any operations
 * - Pattern follows venue-operations.service.ts (GOLD STANDARD)
 */
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

  /**
   * SECURITY FIX: Validate tenant context (copied from venue-operations.service.ts)
   */
  private validateTenantContext(tenantId: string): void {
    if (!tenantId) {
      throw new Error('Tenant context required for onboarding operations');
    }
    // UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(tenantId)) {
      throw new Error('Invalid tenant ID format');
    }
  }

  /**
   * SECURITY FIX: Verify venue belongs to tenant
   */
  private async verifyVenueOwnership(venueId: string, tenantId: string): Promise<void> {
    const venue = await this.db('venues')
      .where({ id: venueId, tenant_id: tenantId })
      .whereNull('deleted_at')
      .first();

    if (!venue) {
      throw new Error('Venue not found or access denied');
    }
  }

  async getOnboardingStatus(venueId: string, tenantId: string): Promise<any> {
    this.validateTenantContext(tenantId);
    await this.verifyVenueOwnership(venueId, tenantId);
    const steps = await this.getOnboardingSteps(venueId, tenantId);
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

  private async getOnboardingSteps(venueId: string, tenantId: string): Promise<any[]> {
    return [
      {
        id: 'basic_info',
        name: 'Basic Information',
        description: 'Venue name, type, and capacity',
        completed: await this.hasBasicInfo(venueId, tenantId),
        required: true
      },
      {
        id: 'address',
        name: 'Address',
        description: 'Venue location details',
        completed: await this.hasAddress(venueId, tenantId),
        required: true
      },
      {
        id: 'layout',
        name: 'Seating Layout',
        description: 'Configure venue seating arrangement',
        completed: await this.hasLayout(venueId, tenantId),
        required: false
      },
      {
        id: 'payment',
        name: 'Payment Integration',
        description: 'Connect payment processor',
        completed: await this.hasPaymentIntegration(venueId, tenantId),
        required: true
      },
      {
        id: 'staff',
        name: 'Staff Members',
        description: 'Add team members',
        completed: await this.hasStaff(venueId, tenantId),
        required: false
      }
    ];
  }

  private async hasBasicInfo(venueId: string, tenantId: string): Promise<boolean> {
    const venue = await this.db('venues')
      .where({ id: venueId, tenant_id: tenantId })
      .whereNull('deleted_at')
      .first();
    return !!(venue && venue.name && venue.venue_type && venue.max_capacity);
  }

  private async hasAddress(venueId: string, tenantId: string): Promise<boolean> {
    const venue = await this.db('venues')
      .where({ id: venueId, tenant_id: tenantId })
      .whereNull('deleted_at')
      .first();
    if (!venue) return false;
    return !!(venue.address_line1 && venue.city && venue.state_province && venue.postal_code);
  }

  private async hasLayout(venueId: string, tenantId: string): Promise<boolean> {
    const layouts = await this.layoutModel.findByVenue(venueId);
    return layouts.length > 0;
  }

  private async hasPaymentIntegration(venueId: string, tenantId: string): Promise<boolean> {
    const integrations = await this.integrationModel.findByVenue(venueId);
    return integrations.some((i: any) => i.integration_type === 'stripe' || i.integration_type === 'square');
  }

  private async hasStaff(venueId: string, tenantId: string): Promise<boolean> {
    // First verify venue ownership
    await this.verifyVenueOwnership(venueId, tenantId);

    const staffCount = await this.db('venue_staff')
      .where({ venue_id: venueId, is_active: true })
      .count('* as count')
      .first();
    return parseInt(String(staffCount?.count || '0'), 10) > 1;
  }

  /**
   * PHASE 2 FIX: Wrapped in transaction to ensure atomicity
   * If any operation fails, all changes are rolled back
   */
  async completeStep(venueId: string, tenantId: string, stepId: string, data: any): Promise<void> {
    this.validateTenantContext(tenantId);
    await this.verifyVenueOwnership(venueId, tenantId);

    // Validate stepId
    const validSteps = ['basic_info', 'address', 'layout', 'payment', 'staff'];
    if (!validSteps.includes(stepId)) {
      throw new Error(`Unknown onboarding step: ${stepId}. Must be one of: ${validSteps.join(', ')}`);
    }

    // PHASE 2 FIX: Use transaction for multi-step operations
    await this.db.transaction(async (trx) => {
      switch (stepId) {
        case 'basic_info':
          await this.updateBasicInfo(venueId, tenantId, data, trx);
          break;
        case 'address':
          await this.updateAddress(venueId, tenantId, data, trx);
          break;
        case 'layout':
          await this.createLayout(venueId, tenantId, data, trx);
          break;
        case 'payment':
          await this.createPaymentIntegration(venueId, tenantId, data, trx);
          break;
        case 'staff':
          await this.addStaffMember(venueId, tenantId, data, trx);
          break;
      }
    });
  }

  /**
   * PHASE 2 FIX: Accept transaction parameter for atomic operations
   * INTEGRATION FIX: Handle both field name variations (type/venue_type, capacity/max_capacity)
   */
  private async updateBasicInfo(venueId: string, tenantId: string, data: any, trx: Knex.Transaction): Promise<void> {
    // Normalize field names - accept both variations
    const venueType = data.venue_type || data.type;
    const capacity = data.max_capacity || data.capacity;

    if (!data.name || !venueType || !capacity) {
      throw new Error('Missing required fields: name, type/venue_type, and capacity/max_capacity are required');
    }

    await trx('venues')
      .where({ id: venueId, tenant_id: tenantId })
      .update({
        name: data.name,
        venue_type: venueType,
        max_capacity: capacity,
        updated_at: new Date()
      });
  }

  /**
   * PHASE 2 FIX: Accept transaction parameter for atomic operations
   * INTEGRATION FIX: Handle both nested and flat address formats
   */
  private async updateAddress(venueId: string, tenantId: string, data: any, trx: Knex.Transaction): Promise<void> {
    // Handle nested address object or flat fields
    const addressData = data.address || data;
    
    const street = addressData.street || addressData.address_line1 || data.street || data.address_line1;
    const city = addressData.city || data.city;
    const state = addressData.state || addressData.state_province || data.state || data.state_province;
    const zipCode = addressData.zipCode || addressData.postal_code || data.zipCode || data.postal_code;

    if (!street || !city || !state || !zipCode) {
      throw new Error('Missing required address fields: street, city, state, and zipCode are required');
    }

    await trx('venues')
      .where({ id: venueId, tenant_id: tenantId })
      .update({
        address_line1: street,
        address_line2: addressData.address_line2 || data.address_line2 || null,
        city,
        state_province: state,
        postal_code: zipCode,
        country_code: addressData.country || addressData.country_code || data.country || data.country_code || 'US',
        updated_at: new Date()
      });
  }

  /**
   * PHASE 2 FIX: Accept transaction parameter for atomic operations
   * FIX #1: Properly serialize sections as JSON string for PostgreSQL json column
   */
  private async createLayout(venueId: string, tenantId: string, data: any, trx: Knex.Transaction): Promise<void> {
    const capacity = data.max_capacity || data.capacity;

    if (!data.name || !capacity) {
      throw new Error('Missing required fields: name and capacity are required');
    }

    // FIX #1: Serialize sections to JSON string for PostgreSQL json column
    let sectionsJson = null;
    if (data.sections && Array.isArray(data.sections) && data.sections.length > 0) {
      sectionsJson = JSON.stringify(data.sections);
    }

    // Create new model instance with transaction
    const layoutModel = new LayoutModel(trx);
    await layoutModel.create({
      venue_id: venueId,
      name: data.name,
      type: data.type || 'general_admission',
      sections: sectionsJson,  // Pass as JSON string
      capacity: capacity,
      is_default: true
    });
  }

  /**
   * PHASE 2 FIX: Accept transaction parameter for atomic operations
   * INTEGRATION FIX: Validate integration type and handle field variations
   */
  private async createPaymentIntegration(venueId: string, tenantId: string, data: any, trx: Knex.Transaction): Promise<void> {
    const validTypes = ['stripe', 'square'];
    
    if (!data.type) {
      throw new Error('Integration type is required');
    }

    if (!validTypes.includes(data.type)) {
      throw new Error(`Invalid integration type: ${data.type}. Must be one of: ${validTypes.join(', ')}`);
    }

    // Create new model instance with transaction
    const integrationModel = new IntegrationModel(trx);
    await integrationModel.create({
      venue_id: venueId,
      integration_type: data.type,
      config_data: data.config || data.config_data || {},
      is_active: true
    });
  }

  /**
   * PHASE 2 FIX: Accept transaction parameter for atomic operations
   * INTEGRATION FIX: Handle userId field variations and validate staff limits
   */
  private async addStaffMember(venueId: string, tenantId: string, data: any, trx: Knex.Transaction): Promise<void> {
    const userId = data.userId || data.user_id;
    
    if (!userId || !data.role) {
      throw new Error('Missing required fields: userId and role are required');
    }

    // Check staff limit (default 50)
    const maxStaff = parseInt(process.env.MAX_STAFF_PER_VENUE || '50', 10);
    const currentStaffCount = await trx('venue_staff')
      .where({ venue_id: venueId, is_active: true })
      .count('* as count')
      .first();
    
    const count = parseInt(String(currentStaffCount?.count || '0'), 10);
    if (count >= maxStaff) {
      throw new Error(`Staff limit reached. Maximum ${maxStaff} staff members allowed per venue.`);
    }

    // Create new model instance with transaction
    const staffModel = new StaffModel(trx);
    await staffModel.addStaffMember({
      venue_id: venueId,
      user_id: userId,
      role: data.role,
      permissions: data.permissions || this.getDefaultPermissionsForRole(data.role)
    });
  }

  /**
   * Get default permissions for a role
   */
  private getDefaultPermissionsForRole(role: string): string[] {
    const permissionMap: Record<string, string[]> = {
      owner: ['*'],
      manager: ['venues:read', 'venues:write', 'events:read', 'events:write', 'staff:read', 'tickets:read'],
      box_office: ['tickets:read', 'tickets:write', 'tickets:validate'],
      door_staff: ['tickets:validate', 'tickets:scan'],
      viewer: ['venues:read', 'events:read']
    };

    return permissionMap[role] || [];
  }
}
