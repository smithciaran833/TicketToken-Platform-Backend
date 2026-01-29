/**
 * PAYMENT SERVICE SERIALIZERS - Centralized Export
 *
 * This module exports all serializers for the payment service.
 * Use these serializers in ALL controllers before returning data to clients.
 *
 * SECURITY PATTERN:
 * 1. Query database (even with SELECT *)
 * 2. Pass result through appropriate serializer
 * 3. Return serialized data to client
 *
 * Example:
 * ```typescript
 * import { serializeTransaction, serializeRefund } from '../serializers';
 *
 * const transaction = await db.query('SELECT * FROM payment_transactions WHERE id = $1', [id]);
 * return reply.send({ transaction: serializeTransaction(transaction.rows[0]) });
 * ```
 */

// Transaction serializers
export {
  // Fields
  SAFE_TRANSACTION_FIELDS,
  SAFE_TRANSACTION_SELECT,
  FORBIDDEN_TRANSACTION_FIELDS,
  ADMIN_TRANSACTION_FIELDS,
  ADMIN_TRANSACTION_SELECT,

  // Types
  SafeTransaction,
  AdminTransaction,

  // Functions
  serializeTransaction,
  serializeTransactions,
  serializeTransactionAdmin,
  serializeTransactionsAdmin,
  serializeTransactionSummary,
  findForbiddenTransactionFields,
  findMissingSafeTransactionFields,
} from './transaction.serializer';

// Refund serializers
export {
  // Fields
  SAFE_REFUND_FIELDS,
  SAFE_REFUND_SELECT,
  FORBIDDEN_REFUND_FIELDS,
  ADMIN_REFUND_FIELDS,
  ADMIN_REFUND_SELECT,

  // Types
  SafeRefund,
  AdminRefund,

  // Functions
  serializeRefund,
  serializeRefunds,
  serializeRefundAdmin,
  serializeRefundsAdmin,
  serializeRefundSummary,
  findForbiddenRefundFields,
  findMissingSafeRefundFields,
} from './refund.serializer';

// Escrow serializers
export {
  // Fields
  SAFE_ESCROW_FIELDS,
  SAFE_ESCROW_SELECT,
  FORBIDDEN_ESCROW_FIELDS,
  ADMIN_ESCROW_FIELDS,
  ADMIN_ESCROW_SELECT,

  // Types
  SafeEscrow,
  AdminEscrow,

  // Functions
  serializeEscrow,
  serializeEscrows,
  serializeEscrowAdmin,
  serializeEscrowsAdmin,
  serializeEscrowSummary,
  findForbiddenEscrowFields,
  findMissingSafeEscrowFields,
} from './escrow.serializer';

// Fraud serializers
export {
  // Fields
  SAFE_FRAUD_CHECK_FIELDS_PUBLIC,
  ADMIN_FRAUD_CHECK_FIELDS,
  FORBIDDEN_FRAUD_FIELDS,
  ADMIN_IP_REPUTATION_FIELDS,
  FORBIDDEN_IP_FIELDS,

  // Types
  PublicFraudCheck,
  AdminFraudCheck,
  AdminIPReputation,
  AdminFraudRule,

  // Functions
  serializeFraudCheckPublic,
  serializeFraudChecksPublic,
  serializeFraudCheckAdmin,
  serializeFraudChecksAdmin,
  serializeIPReputationAdmin,
  serializeFraudRuleAdmin,
  serializeFraudRulesAdmin,
  findForbiddenFraudFields,
  findForbiddenIPFields,
} from './fraud.serializer';

// Group Payment serializers
export {
  // Fields
  SAFE_GROUP_PAYMENT_FIELDS,
  SAFE_GROUP_MEMBER_FIELDS,
  FORBIDDEN_GROUP_PAYMENT_FIELDS,

  // Types
  SafeGroupPayment,
  SafeGroupMemberOrganizer,
  SafeGroupMemberPublic,
  SafeGroupMemberSelf,

  // Functions
  serializeGroupPayment,
  serializeGroupPaymentPublic,
  serializeGroupMemberOrganizer,
  serializeGroupMembersOrganizer,
  serializeGroupMemberPublic,
  serializeGroupMembersPublic,
  serializeGroupMemberSelf,
  serializeGroupPaymentWithMembers,
  serializeGroupPaymentStatus,
  findForbiddenGroupPaymentFields,
  findForbiddenMemberFieldsPublic,
} from './group-payment.serializer';
