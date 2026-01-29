/**
 * GROUP PAYMENT SERIALIZER - Single Source of Truth for Safe Group Payment Data
 *
 * SECURITY: This file defines the ONLY fields that are safe to return to clients.
 * All controllers MUST use this serializer before returning group payment data.
 *
 * PRIVACY CONCERNS:
 * - Member emails should only be visible to the organizer
 * - Payment method details should NEVER be exposed
 * - Internal payment IDs should be filtered
 *
 * NEVER ADD TO PUBLIC FIELDS:
 * - payment_id (internal reference)
 * - payment_method details
 * - full email addresses (except to organizer)
 *
 * Pattern for controllers:
 * 1. Import serializers from '../serializers/group-payment.serializer'
 * 2. Use serializeGroupPayment() for organizer views
 * 3. Use serializeGroupPaymentMember() for member's own view
 * 4. Use serializeGroupPaymentPublic() for participant views (non-organizer)
 */

/**
 * SAFE_GROUP_PAYMENT_FIELDS - Fields safe for organizer view
 */
export const SAFE_GROUP_PAYMENT_FIELDS = [
  'id',
  'tenant_id',
  'organizer_id',
  'event_id',
  'total_amount',
  'status',
  'expires_at',
  'completed_at',
  'cancelled_at',
  'created_at',
  'updated_at',
] as const;

/**
 * SAFE_GROUP_MEMBER_FIELDS - Fields safe for member views
 */
export const SAFE_GROUP_MEMBER_FIELDS = [
  'id',
  'tenant_id',
  'group_payment_id',
  'name',
  'amount_due',
  'ticket_count',
  'paid',
  'paid_at',
  'status',
  'created_at',
  'updated_at',
] as const;

/**
 * Fields that should NEVER be returned
 */
export const FORBIDDEN_GROUP_PAYMENT_FIELDS = [
  // HIGH RISK - Internal payment tracking
  'payment_id',

  // HIGH RISK - Internal business logic
  'ticket_selections', // Contains pricing details
  'cancellation_reason', // Internal tracking

  // MEDIUM RISK - Privacy
  'user_id', // For members, don't expose user IDs
  'email',   // Only organizer should see emails
  'reminders_sent', // Internal tracking
] as const;

// =============================================================================
// TYPES
// =============================================================================

/**
 * Type for safely serialized group payment (organizer view)
 */
export type SafeGroupPayment = {
  id: string;
  tenantId: string;
  organizerId: string;
  eventId: string;
  totalAmount: number;
  status: string;
  expiresAt: Date | string;
  completedAt?: Date | string | null;
  cancelledAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  memberCount?: number;
  paidCount?: number;
};

/**
 * Type for group member (organizer view - includes email)
 */
export type SafeGroupMemberOrganizer = {
  id: string;
  groupPaymentId: string;
  name: string;
  email: string; // Organizer can see emails
  amountDue: number;
  ticketCount: number;
  paid: boolean;
  paidAt?: Date | string | null;
  status: string;
};

/**
 * Type for group member (participant view - no email)
 */
export type SafeGroupMemberPublic = {
  id: string;
  groupPaymentId: string;
  name: string;
  // Note: email intentionally excluded for privacy
  amountDue: number;
  ticketCount: number;
  paid: boolean;
  status: string;
};

/**
 * Type for own member view
 */
export type SafeGroupMemberSelf = SafeGroupMemberPublic & {
  email: string; // Users can see their own email
  paidAt?: Date | string | null;
};

// =============================================================================
// GROUP PAYMENT SERIALIZERS
// =============================================================================

/**
 * Serializes a group payment for organizer view.
 * Includes member counts.
 */
export function serializeGroupPayment(
  payment: Record<string, any>,
  members?: Record<string, any>[]
): SafeGroupPayment {
  if (!payment) {
    throw new Error('Cannot serialize null or undefined group payment');
  }

  const paidCount = members ? members.filter(m => m.paid).length : undefined;

  return {
    id: payment.id,
    tenantId: payment.tenant_id,
    organizerId: payment.organizer_id,
    eventId: payment.event_id,
    totalAmount: typeof payment.total_amount === 'string'
      ? parseInt(payment.total_amount, 10)
      : payment.total_amount,
    status: payment.status,
    expiresAt: payment.expires_at,
    completedAt: payment.completed_at ?? null,
    cancelledAt: payment.cancelled_at ?? null,
    createdAt: payment.created_at,
    updatedAt: payment.updated_at,
    memberCount: members?.length,
    paidCount,
  };
}

/**
 * Serializes a group payment for public/participant view.
 * Less detail than organizer view.
 */
export function serializeGroupPaymentPublic(payment: Record<string, any>): Pick<
  SafeGroupPayment,
  'id' | 'eventId' | 'totalAmount' | 'status' | 'expiresAt'
> {
  if (!payment) {
    throw new Error('Cannot serialize null or undefined group payment');
  }

  return {
    id: payment.id,
    eventId: payment.event_id,
    totalAmount: typeof payment.total_amount === 'string'
      ? parseInt(payment.total_amount, 10)
      : payment.total_amount,
    status: payment.status,
    expiresAt: payment.expires_at,
  };
}

// =============================================================================
// GROUP MEMBER SERIALIZERS
// =============================================================================

/**
 * Serializes a group member for ORGANIZER view.
 * Includes email so organizer can contact members.
 */
export function serializeGroupMemberOrganizer(member: Record<string, any>): SafeGroupMemberOrganizer {
  if (!member) {
    throw new Error('Cannot serialize null or undefined group member');
  }

  return {
    id: member.id,
    groupPaymentId: member.group_payment_id,
    name: member.name,
    email: member.email, // Organizer can see email
    amountDue: typeof member.amount_due === 'string'
      ? parseInt(member.amount_due, 10)
      : member.amount_due,
    ticketCount: member.ticket_count,
    paid: member.paid ?? false,
    paidAt: member.paid_at ?? null,
    status: member.status || (member.paid ? 'paid' : 'pending'),
  };
}

/**
 * Serializes multiple group members for organizer view.
 */
export function serializeGroupMembersOrganizer(members: Record<string, any>[]): SafeGroupMemberOrganizer[] {
  if (!members) {
    return [];
  }
  return members.map(serializeGroupMemberOrganizer);
}

/**
 * Serializes a group member for PUBLIC/participant view.
 * Email is hidden for privacy.
 */
export function serializeGroupMemberPublic(member: Record<string, any>): SafeGroupMemberPublic {
  if (!member) {
    throw new Error('Cannot serialize null or undefined group member');
  }

  return {
    id: member.id,
    groupPaymentId: member.group_payment_id,
    name: member.name,
    // email intentionally excluded
    amountDue: typeof member.amount_due === 'string'
      ? parseInt(member.amount_due, 10)
      : member.amount_due,
    ticketCount: member.ticket_count,
    paid: member.paid ?? false,
    status: member.status || (member.paid ? 'paid' : 'pending'),
  };
}

/**
 * Serializes multiple group members for public view.
 */
export function serializeGroupMembersPublic(members: Record<string, any>[]): SafeGroupMemberPublic[] {
  if (!members) {
    return [];
  }
  return members.map(serializeGroupMemberPublic);
}

/**
 * Serializes a group member for their OWN view.
 * Includes their own email and payment timestamp.
 */
export function serializeGroupMemberSelf(member: Record<string, any>): SafeGroupMemberSelf {
  if (!member) {
    throw new Error('Cannot serialize null or undefined group member');
  }

  return {
    id: member.id,
    groupPaymentId: member.group_payment_id,
    name: member.name,
    email: member.email, // User can see their own email
    amountDue: typeof member.amount_due === 'string'
      ? parseInt(member.amount_due, 10)
      : member.amount_due,
    ticketCount: member.ticket_count,
    paid: member.paid ?? false,
    paidAt: member.paid_at ?? null,
    status: member.status || (member.paid ? 'paid' : 'pending'),
  };
}

// =============================================================================
// COMBINED SERIALIZERS
// =============================================================================

/**
 * Serializes a group payment with members for organizer view.
 */
export function serializeGroupPaymentWithMembers(
  payment: Record<string, any>,
  members: Record<string, any>[]
): SafeGroupPayment & { members: SafeGroupMemberOrganizer[] } {
  return {
    ...serializeGroupPayment(payment, members),
    members: serializeGroupMembersOrganizer(members),
  };
}

/**
 * Serializes group payment status summary.
 */
export function serializeGroupPaymentStatus(
  payment: Record<string, any>,
  members: Record<string, any>[]
): {
  id: string;
  status: string;
  totalAmount: number;
  collectedAmount: number;
  memberCount: number;
  paidCount: number;
  pendingCount: number;
} {
  if (!payment) {
    throw new Error('Cannot serialize null or undefined group payment');
  }

  const paidMembers = members?.filter(m => m.paid) || [];
  const collectedAmount = paidMembers.reduce(
    (sum, m) => sum + (typeof m.amount_due === 'string' ? parseInt(m.amount_due, 10) : m.amount_due),
    0
  );

  return {
    id: payment.id,
    status: payment.status,
    totalAmount: typeof payment.total_amount === 'string'
      ? parseInt(payment.total_amount, 10)
      : payment.total_amount,
    collectedAmount,
    memberCount: members?.length || 0,
    paidCount: paidMembers.length,
    pendingCount: (members?.length || 0) - paidMembers.length,
  };
}

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Validates that a response object contains no forbidden fields.
 */
export function findForbiddenGroupPaymentFields(obj: Record<string, any>): string[] {
  const found: string[] = [];

  for (const field of FORBIDDEN_GROUP_PAYMENT_FIELDS) {
    if (field in obj && obj[field] !== undefined) {
      found.push(field);
    }
  }

  const camelCaseForbidden = [
    'paymentId',
    'ticketSelections',
    'cancellationReason',
    'userId',
    'remindersSent',
  ];

  for (const field of camelCaseForbidden) {
    if (field in obj && obj[field] !== undefined) {
      found.push(field);
    }
  }

  return found;
}

/**
 * Check if email is forbidden in a public member response.
 */
export function findForbiddenMemberFieldsPublic(obj: Record<string, any>): string[] {
  const found: string[] = [];

  // Email should not be in public responses
  if ('email' in obj && obj.email !== undefined) {
    found.push('email');
  }

  if ('payment_id' in obj && obj.payment_id !== undefined) {
    found.push('payment_id');
  }

  if ('paymentId' in obj && obj.paymentId !== undefined) {
    found.push('paymentId');
  }

  return found;
}
