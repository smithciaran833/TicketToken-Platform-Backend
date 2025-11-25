export interface Venue {
  id: string;
  name: string;
  tenant_id: string;
  ownerId: string;
  capacity?: number;
  address?: string;
  metadata?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export interface VenueAccessCheck {
  hasAccess: boolean;
  role?: string;
  permissions?: string[];
}

export interface VenueServiceErrorResponse {
  error: string;
  message: string;
  statusCode: number;
}
