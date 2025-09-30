import { MetricType, DateRange } from './common.types';

export enum WidgetType {
  // Real-time widgets
  LIVE_SALES_COUNTER = 'live_sales_counter',
  LIVE_REVENUE_COUNTER = 'live_revenue_counter',
  LIVE_ATTENDANCE_GAUGE = 'live_attendance_gauge',
  CAPACITY_TRACKER = 'capacity_tracker',
  
  // Chart widgets
  LINE_CHART = 'line_chart',
  BAR_CHART = 'bar_chart',
  PIE_CHART = 'pie_chart',
  AREA_CHART = 'area_chart',
  HEATMAP = 'heatmap',
  
  // KPI widgets
  KPI_CARD = 'kpi_card',
  COMPARISON_CARD = 'comparison_card',
  TREND_CARD = 'trend_card',
  
  // Table widgets
  DATA_TABLE = 'data_table',
  LEADERBOARD = 'leaderboard',
  
  // Custom widgets
  CUSTOM_METRIC = 'custom_metric',
  CUSTOM_VISUALIZATION = 'custom_visualization',
}

export interface WidgetConfig {
  id: string;
  type: WidgetType;
  title: string;
  description?: string;
  metrics: MetricType[];
  dateRange?: DateRange;
  refreshInterval?: number; // in seconds
  size: WidgetSize;
  position: WidgetPosition;
  settings: WidgetSettings;
  filters?: WidgetFilter[];
}

export interface WidgetSize {
  width: number; // grid units
  height: number; // grid units
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
}

export interface WidgetPosition {
  x: number;
  y: number;
}

export interface WidgetSettings {
  colors?: string[];
  showLegend?: boolean;
  showGrid?: boolean;
  showTooltip?: boolean;
  showDataLabels?: boolean;
  animation?: boolean;
  customStyles?: Record<string, any>;
  thresholds?: Array<{
    value: number;
    color: string;
    label?: string;
  }>;
}

export interface WidgetFilter {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'between';
  value: any;
}

export interface WidgetData {
  widgetId: string;
  timestamp: Date;
  data: any; // Specific to widget type
  metadata?: Record<string, any>;
}

export interface RealTimeWidgetData extends WidgetData {
  currentValue: number;
  previousValue: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'stable';
  sparkline?: number[];
}

export interface ChartWidgetData extends WidgetData {
  series: Array<{
    name: string;
    data: Array<{
      x: string | number | Date;
      y: number;
      metadata?: any;
    }>;
  }>;
  categories?: string[];
}

export interface TableWidgetData extends WidgetData {
  columns: Array<{
    key: string;
    label: string;
    type: 'string' | 'number' | 'date' | 'boolean';
    sortable?: boolean;
    format?: string;
  }>;
  rows: Array<Record<string, any>>;
  pagination?: {
    total: number;
    page: number;
    pageSize: number;
  };
}

export interface WidgetUpdate {
  widgetId: string;
  data: WidgetData;
  timestamp: Date;
}

export interface WidgetSubscription {
  widgetId: string;
  userId: string;
  config: WidgetConfig;
  lastUpdate?: Date;
  status: 'active' | 'paused' | 'error';
}
