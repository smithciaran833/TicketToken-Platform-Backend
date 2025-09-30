import { WidgetConfig } from './widget.types';
import { AuditInfo } from './common.types';

export interface Dashboard extends AuditInfo {
  id: string;
  venueId: string;
  name: string;
  description?: string;
  isDefault: boolean;
  isPublic: boolean;
  layout: DashboardLayout;
  widgets: WidgetConfig[];
  filters: DashboardFilter[];
  settings: DashboardSettings;
  permissions: DashboardPermissions;
  tags?: string[];
}

export interface DashboardLayout {
  type: 'grid' | 'freeform' | 'responsive';
  columns: number;
  rows?: number;
  gap?: number;
  padding?: number;
  breakpoints?: Array<{
    size: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    columns: number;
  }>;
}

export interface DashboardFilter {
  id: string;
  name: string;
  field: string;
  type: 'date_range' | 'select' | 'multi_select' | 'search';
  defaultValue?: any;
  options?: Array<{
    value: string;
    label: string;
  }>;
  isGlobal: boolean;
  appliesTo?: string[]; // widget IDs
}

export interface DashboardSettings {
  theme: 'light' | 'dark' | 'auto';
  refreshInterval?: number; // in seconds
  timezone?: string;
  dateFormat?: string;
  numberFormat?: string;
  currency?: string;
  animations: boolean;
  showFilters: boolean;
  showToolbar: boolean;
  fullscreenEnabled: boolean;
}

export interface DashboardPermissions {
  ownerId: string;
  public: boolean;
  sharedWith: Array<{
    userId?: string;
    roleId?: string;
    permission: 'view' | 'edit' | 'admin';
  }>;
}

export interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  thumbnail?: string;
  layout: DashboardLayout;
  widgets: Partial<WidgetConfig>[];
  industries?: string[];
  tags?: string[];
  popularity: number;
}

export interface DashboardSnapshot {
  id: string;
  dashboardId: string;
  name: string;
  description?: string;
  data: Record<string, any>;
  createdAt: Date;
  expiresAt?: Date;
  shareToken?: string;
  accessCount: number;
}

export interface DashboardExport {
  format: 'pdf' | 'png' | 'csv' | 'excel';
  dashboardId: string;
  includeData: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
  widgets?: string[]; // specific widget IDs to export
  settings?: {
    paperSize?: 'A4' | 'Letter' | 'Legal';
    orientation?: 'portrait' | 'landscape';
    quality?: 'low' | 'medium' | 'high';
  };
}
