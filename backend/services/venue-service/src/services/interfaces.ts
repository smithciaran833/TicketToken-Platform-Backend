export interface IStaff {
  id: string;
  user_id: string;
  venue_id: string;
  role: string;
  // Add properties as needed
}

import { IVenue } from '../models/venue.model';
import { IIntegration } from '../models/integration.model';

// Layout interface
export interface ILayout {
  id: string;
  venue_id: string;
  name: string;
  sections: any[];
  total_capacity: number;
  is_default?: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
}


export interface IVenueService {
  createVenue(data: any, userId: string): Promise<IVenue>;
  getVenue(venueId: string): Promise<IVenue | null>;
  updateVenue(venueId: string, updates: any, userId: string): Promise<IVenue>;
  deleteVenue(venueId: string, userId: string): Promise<void>;
  listVenues(filters: any): Promise<IVenue[]>;
  addStaff(venueId: string, userId: string, role: string): Promise<IStaff>;
  updateStaff(venueId: string, staffId: string, updates: any): Promise<IStaff>;
  removeStaff(venueId: string, staffId: string): Promise<void>;
  isUserStaff(venueId: string, userId: string): Promise<boolean>;
}

export interface IIntegrationService {
  listIntegrations(venueId: string): Promise<IIntegration[]>;
  getIntegration(venueId: string, integrationId: string): Promise<IIntegration | null>;
  findByType(venueId: string, type: string): Promise<IIntegration | null>;
  connectIntegration(venueId: string, type: string, config: any, credentials: any): Promise<IIntegration>;
  updateIntegration(venueId: string, integrationId: string, updates: any): Promise<IIntegration>;
  disconnectIntegration(venueId: string, integrationId: string): Promise<void>;
  testIntegration(venueId: string, integrationId: string): Promise<{ success: boolean; message?: string }>;
  handleWebhook(type: string, headers: any, body: any): Promise<{ processed: boolean; events: any[] }>;
  syncData(venueId: string, integrationId: string): Promise<{ synced: number; errors: number }>;
}

export interface IOnboardingService {
  getOnboardingStatus(venueId: string): Promise<any>;
  completeStep(venueId: string, step: string, data?: any): Promise<void>;
  getSetupGuide(venueType: string): any;
}

export interface IComplianceService {
  getComplianceSettings(venueId: string): Promise<any>;
  updateComplianceSettings(venueId: string, settings: any): Promise<any>;
  generateComplianceReport(venueId: string): Promise<any>;
  checkCompliance(venueId: string): Promise<any>;
}

export interface IVerificationService {
  submitVerification(venueId: string, documents: any): Promise<any>;
  getVerificationStatus(venueId: string): Promise<any>;
  updateVerificationStatus(venueId: string, status: string, notes?: string): Promise<any>;
}

export interface ILayoutService {
  createLayout(venueId: string, data: any): Promise<ILayout>;
  getLayouts(venueId: string): Promise<ILayout[]>;
  getLayout(layoutId: string): Promise<ILayout | null>;
  updateLayout(layoutId: string, updates: any): Promise<ILayout>;
  deleteLayout(layoutId: string): Promise<void>;
  setDefaultLayout(venueId: string, layoutId: string): Promise<void>;
}
