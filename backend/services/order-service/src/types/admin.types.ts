// Admin Types for Customer Service Tools

// ============ Search Types ============
export interface OrderSearchFilters {
  query?: string;
  orderId?: string;
  customerEmail?: string;
  customerName?: string;
  customerPhone?: string;
  status?: string[];
  eventId?: string;
  venueId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  minAmount?: number;
  maxAmount?: number;
  paymentMethod?: string;
  hasNotes?: boolean;
  isFlagged?: boolean;
  hasFraudScore?: boolean;
  riskLevel?: FraudRiskLevel[];
}

export interface OrderSearchResult {
  orders: Array<{
    id: string;
    orderNumber: string;
    customerName: string;
    customerEmail: string;
    status: string;
    totalAmount: number;
    eventName: string;
    createdAt: Date;
    hasNotes: boolean;
    isFlagged: boolean;
    riskLevel?: FraudRiskLevel;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

export interface SavedSearch {
  id: string;
  tenantId: string;
  adminUserId: string;
  name: string;
  filters: OrderSearchFilters;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SearchHistory {
  id: string;
  tenantId: string;
  adminUserId: string;
  query: string;
  filters: OrderSearchFilters;
  resultsCount: number;
  createdAt: Date;
}

// ============ Admin Override Types ============
export enum AdminOverrideType {
  STATUS_CHANGE = 'STATUS_CHANGE',
  EXTEND_EXPIRATION = 'EXTEND_EXPIRATION',
  MANUAL_DISCOUNT = 'MANUAL_DISCOUNT',
  WAIVE_CANCELLATION_FEE = 'WAIVE_CANCELLATION_FEE',
  WAIVE_REFUND_FEE = 'WAIVE_REFUND_FEE',
  ADJUST_PRICE = 'ADJUST_PRICE',
  FORCE_CONFIRM = 'FORCE_CONFIRM',
  FORCE_CANCEL = 'FORCE_CANCEL'
}

export enum OverrideApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  AUTO_APPROVED = 'AUTO_APPROVED'
}

export interface AdminOverride {
  id: string;
  tenantId: string;
  orderId: string;
  adminUserId: string;
  overrideType: AdminOverrideType;
  originalValue: any;
  newValue: any;
  reason: string;
  approvalStatus: OverrideApprovalStatus;
  approvedBy?: string;
  approvedAt?: Date;
  rejectionReason?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApprovalWorkflow {
  id: string;
  tenantId: string;
  overrideType: AdminOverrideType;
  requiresApproval: boolean;
  minApprovalLevel: string;
  approvalTimeoutHours: number;
  notifyRoles: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface OverrideAuditLog {
  id: string;
  tenantId: string;
  overrideId: string;
  action: string;
  actorUserId: string;
  actorRole?: string;
  changes: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

// ============ Customer Notes Types ============
export enum OrderNoteType {
  CUSTOMER_INQUIRY = 'CUSTOMER_INQUIRY',
  ISSUE_REPORTED = 'ISSUE_REPORTED',
  RESOLUTION = 'RESOLUTION',
  VIP_MARKER = 'VIP_MARKER',
  FRAUD_SUSPICION = 'FRAUD_SUSPICION',
  PAYMENT_ISSUE = 'PAYMENT_ISSUE',
  DELIVERY_ISSUE = 'DELIVERY_ISSUE',
  GENERAL = 'GENERAL',
  INTERNAL_NOTE = 'INTERNAL_NOTE'
}

export interface OrderNote {
  id: string;
  tenantId: string;
  orderId: string;
  userId?: string;
  adminUserId: string;
  noteType: OrderNoteType;
  content: string;
  isInternal: boolean;
  isFlagged: boolean;
  tags: string[];
  attachments?: Array<{
    fileName: string;
    fileSize: number;
    fileType: string;
    url: string;
  }>;
  mentionedUsers?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerInteraction {
  id: string;
  tenantId: string;
  userId: string;
  orderId?: string;
  adminUserId: string;
  interactionType: string;
  channel: string;
  subject?: string;
  summary: string;
  durationSeconds?: number;
  resolutionStatus?: string;
  satisfactionScore?: number;
  ticketId?: string;
  ticketSystem?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface NoteTemplate {
  id: string;
  tenantId: string;
  name: string;
  noteType: OrderNoteType;
  contentTemplate: string;
  isActive: boolean;
  usageCount: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============ Fraud Detection Types ============
export enum FraudRiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export enum FraudDetectionMethod {
  VELOCITY_CHECK = 'VELOCITY_CHECK',
  DUPLICATE_ORDER = 'DUPLICATE_ORDER',
  GEO_ANOMALY = 'GEO_ANOMALY',
  PAYMENT_PATTERN = 'PAYMENT_PATTERN',
  DEVICE_FINGERPRINT = 'DEVICE_FINGERPRINT',
  BEHAVIORAL = 'BEHAVIORAL',
  EXTERNAL_SERVICE = 'EXTERNAL_SERVICE',
  MANUAL_REVIEW = 'MANUAL_REVIEW'
}

export interface FraudScore {
  id: string;
  tenantId: string;
  orderId: string;
  userId: string;
  score: number;
  riskLevel: FraudRiskLevel;
  factors: FraudFactor[];
  detectionMethods: FraudDetectionMethod[];
  isReviewed: boolean;
  reviewedBy?: string;
  reviewedAt?: Date;
  resolution?: string;
  resolutionNotes?: string;
  externalScores?: {
    stripeRadar?: number;
    sift?: number;
    maxMind?: any;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface FraudFactor {
  type: string;
  description: string;
  scoreImpact: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  details?: Record<string, any>;
}

export interface FraudRule {
  id: string;
  tenantId: string;
  name: string;
  ruleType: string;
  conditions: Record<string, any>;
  scoreImpact: number;
  isActive: boolean;
  priority: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BlockedEntity {
  id: string;
  tenantId: string;
  entityType: 'EMAIL' | 'IP' | 'PHONE' | 'CARD' | 'DEVICE' | 'USER';
  entityValue: string;
  blockReason: string;
  isPermanent: boolean;
  blockedUntil?: Date;
  blockedBy: string;
  unblockReason?: string;
  unblockedBy?: string;
  unblockedAt?: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface FraudAlert {
  id: string;
  tenantId: string;
  fraudScoreId: string;
  orderId: string;
  alertType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  isAcknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  actionsTaken?: Array<{action: string; timestamp: Date; userId: string}>;
  createdAt: Date;
}

export interface VelocityTracking {
  id: string;
  tenantId: string;
  userId: string;
  trackingKey: string;
  windowMinutes: number;
  orderCount: number;
  totalAmountCents: number;
  firstOrderAt: Date;
  lastOrderAt: Date;
  expiresAt: Date;
  createdAt: Date;
}

export interface FraudPattern {
  id: string;
  tenantId: string;
  patternType: string;
  patternSignature: string;
  occurrenceCount: number;
  affectedOrders: string[];
  affectedUsers: string[];
  confidenceScore: number;
  firstDetectedAt: Date;
  lastDetectedAt: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ============ Admin Permission Types ============
export enum AdminRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  SENIOR_MANAGER = 'SENIOR_MANAGER',
  MANAGER = 'MANAGER',
  SUPPORT = 'SUPPORT',
  VIEWER = 'VIEWER'
}

export interface AdminPermissions {
  canSearchOrders: boolean;
  canViewOrderDetails: boolean;
  canModifyOrders: boolean;
  canOverrideStatus: boolean;
  canWaiveFees: boolean;
  canApplyDiscounts: boolean;
  canAccessNotes: boolean;
  canFlagOrders: boolean;
  canReviewFraud: boolean;
  canBlockEntities: boolean;
  canApproveOverrides: boolean;
  canAccessAuditLogs: boolean;
}

export const ROLE_PERMISSIONS: Record<AdminRole, AdminPermissions> = {
  [AdminRole.SUPER_ADMIN]: {
    canSearchOrders: true,
    canViewOrderDetails: true,
    canModifyOrders: true,
    canOverrideStatus: true,
    canWaiveFees: true,
    canApplyDiscounts: true,
    canAccessNotes: true,
    canFlagOrders: true,
    canReviewFraud: true,
    canBlockEntities: true,
    canApproveOverrides: true,
    canAccessAuditLogs: true
  },
  [AdminRole.ADMIN]: {
    canSearchOrders: true,
    canViewOrderDetails: true,
    canModifyOrders: true,
    canOverrideStatus: true,
    canWaiveFees: true,
    canApplyDiscounts: true,
    canAccessNotes: true,
    canFlagOrders: true,
    canReviewFraud: true,
    canBlockEntities: true,
    canApproveOverrides: true,
    canAccessAuditLogs: true
  },
  [AdminRole.SENIOR_MANAGER]: {
    canSearchOrders: true,
    canViewOrderDetails: true,
    canModifyOrders: true,
    canOverrideStatus: true,
    canWaiveFees: true,
    canApplyDiscounts: true,
    canAccessNotes: true,
    canFlagOrders: true,
    canReviewFraud: true,
    canBlockEntities: false,
    canApproveOverrides: true,
    canAccessAuditLogs: true
  },
  [AdminRole.MANAGER]: {
    canSearchOrders: true,
    canViewOrderDetails: true,
    canModifyOrders: true,
    canOverrideStatus: true,
    canWaiveFees: true,
    canApplyDiscounts: false,
    canAccessNotes: true,
    canFlagOrders: true,
    canReviewFraud: true,
    canBlockEntities: false,
    canApproveOverrides: false,
    canAccessAuditLogs: false
  },
  [AdminRole.SUPPORT]: {
    canSearchOrders: true,
    canViewOrderDetails: true,
    canModifyOrders: false,
    canOverrideStatus: false,
    canWaiveFees: false,
    canApplyDiscounts: false,
    canAccessNotes: true,
    canFlagOrders: true,
    canReviewFraud: false,
    canBlockEntities: false,
    canApproveOverrides: false,
    canAccessAuditLogs: false
  },
  [AdminRole.VIEWER]: {
    canSearchOrders: true,
    canViewOrderDetails: true,
    canModifyOrders: false,
    canOverrideStatus: false,
    canWaiveFees: false,
    canApplyDiscounts: false,
    canAccessNotes: true,
    canFlagOrders: false,
    canReviewFraud: false,
    canBlockEntities: false,
    canApproveOverrides: false,
    canAccessAuditLogs: false
  }
};
