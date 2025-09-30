export interface Alert {
  id: string;
  venueId: string;
  name: string;
  description?: string;
  type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  conditions: AlertCondition[];
  actions: AlertAction[];
  schedule?: AlertSchedule;
  lastTriggered?: Date;
  triggerCount: number;
  enabled: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export enum AlertType {
  THRESHOLD = 'threshold',
  ANOMALY = 'anomaly',
  TREND = 'trend',
  COMPARISON = 'comparison',
  CUSTOM = 'custom',
}

export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

export enum AlertStatus {
  ACTIVE = 'active',
  TRIGGERED = 'triggered',
  RESOLVED = 'resolved',
  SNOOZED = 'snoozed',
  DISABLED = 'disabled',
}

export interface AlertCondition {
  id: string;
  metric: string;
  operator: ComparisonOperator;
  value: number;
  aggregation?: {
    method: 'sum' | 'avg' | 'min' | 'max' | 'count';
    period: number; // minutes
  };
  filters?: Array<{
    field: string;
    operator: string;
    value: any;
  }>;
}

export enum ComparisonOperator {
  EQUALS = 'equals',
  NOT_EQUALS = 'not_equals',
  GREATER_THAN = 'greater_than',
  LESS_THAN = 'less_than',
  GREATER_THAN_OR_EQUALS = 'greater_than_or_equals',
  LESS_THAN_OR_EQUALS = 'less_than_or_equals',
  BETWEEN = 'between',
  NOT_BETWEEN = 'not_between',
  CHANGE_PERCENT = 'change_percent',
}

export interface AlertAction {
  type: ActionType;
  config: ActionConfig;
  delay?: number; // minutes
  repeat?: {
    enabled: boolean;
    interval: number; // minutes
    maxCount?: number;
  };
}

export enum ActionType {
  EMAIL = 'email',
  SMS = 'sms',
  WEBHOOK = 'webhook',
  SLACK = 'slack',
  DASHBOARD = 'dashboard',
  LOG = 'log',
}

export interface ActionConfig {
  // Email action
  recipients?: string[];
  subject?: string;
  template?: string;
  
  // SMS action
  phoneNumbers?: string[];
  message?: string;
  
  // Webhook action
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  
  // Slack action
  channel?: string;
  webhookUrl?: string;
  
  // Dashboard action
  dashboardId?: string;
  widgetId?: string;
  highlight?: boolean;
}

export interface AlertSchedule {
  timezone: string;
  activeHours?: {
    start: string; // HH:MM
    end: string; // HH:MM
  };
  activeDays?: number[]; // 0-6 (Sunday-Saturday)
  excludeDates?: Date[];
}

export interface AlertInstance {
  id: string;
  alertId: string;
  triggeredAt: Date;
  resolvedAt?: Date;
  severity: AlertSeverity;
  status: 'active' | 'acknowledged' | 'resolved';
  triggerValues: Record<string, any>;
  message: string;
  actions: Array<{
    type: ActionType;
    status: 'pending' | 'sent' | 'failed';
    sentAt?: Date;
    error?: string;
  }>;
  acknowledgedBy?: string;
  notes?: string;
}

export interface AlertRule {
  id: string;
  name: string;
  category: string;
  description: string;
  defaultSeverity: AlertSeverity;
  requiredMetrics: string[];
  configSchema: any; // JSON Schema
  examples: Array<{
    name: string;
    config: any;
  }>;
}

export interface AlertSummary {
  venueId: string;
  period: {
    start: Date;
    end: Date;
  };
  totalAlerts: number;
  byStatus: Record<AlertStatus, number>;
  bySeverity: Record<AlertSeverity, number>;
  byType: Record<AlertType, number>;
  topAlerts: Array<{
    alertId: string;
    name: string;
    triggerCount: number;
  }>;
  averageResolutionTime: number; // minutes
  falsePositiveRate: number;
}

export interface AlertNotification {
  id: string;
  alertInstanceId: string;
  type: ActionType;
  recipient: string;
  status: 'pending' | 'sent' | 'failed' | 'bounced';
  sentAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
  error?: string;
  retryCount: number;
  maxRetries: number;
}
