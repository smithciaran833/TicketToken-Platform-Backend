/**
 * Order State Machine
 * Enforces valid order status transitions
 */

import { OrderStatus } from '../types/order.types';

export class OrderStateMachine {
  /**
   * Valid state transitions map
   * Key = current status, Value = array of allowed next statuses
   */
  private static readonly transitions: Record<OrderStatus, OrderStatus[]> = {
    [OrderStatus.PENDING]: [
      OrderStatus.RESERVED,
      OrderStatus.CANCELLED,
      OrderStatus.EXPIRED,
    ],
    [OrderStatus.RESERVED]: [
      OrderStatus.CONFIRMED,
      OrderStatus.CANCELLED,
      OrderStatus.EXPIRED,
    ],
    [OrderStatus.CONFIRMED]: [
      OrderStatus.COMPLETED,
      OrderStatus.CANCELLED,
      OrderStatus.REFUNDED,
    ],
    [OrderStatus.COMPLETED]: [],
    [OrderStatus.CANCELLED]: [],
    [OrderStatus.EXPIRED]: [],
    [OrderStatus.REFUNDED]: [],
  };

  /**
   * Check if a state transition is valid
   */
  static canTransition(from: OrderStatus, to: OrderStatus): boolean {
    const allowedTransitions = this.transitions[from];
    return allowedTransitions ? allowedTransitions.includes(to) : false;
  }

  /**
   * Validate state transition (throws error if invalid)
   */
  static validateTransition(from: OrderStatus, to: OrderStatus): void {
    if (!this.canTransition(from, to)) {
      const allowedTransitions = this.transitions[from] || [];
      throw new Error(
        `Invalid order status transition: ${from} → ${to}. ` +
        `Valid transitions from ${from}: ${
          allowedTransitions.length > 0 
            ? allowedTransitions.join(', ') 
            : 'none (terminal state)'
        }`
      );
    }
  }

  /**
   * Get all allowed transitions from a given status
   */
  static getAllowedTransitions(from: OrderStatus): OrderStatus[] {
    return this.transitions[from] || [];
  }

  /**
   * Check if a status is a terminal state (no valid transitions)
   */
  static isTerminalState(status: OrderStatus): boolean {
    const allowedTransitions = this.transitions[status];
    return !allowedTransitions || allowedTransitions.length === 0;
  }

  /**
   * Get human-readable description of transition rules
   */
  static getTransitionDescription(status: OrderStatus): string {
    const transitions = this.getAllowedTransitions(status);
    
    if (transitions.length === 0) {
      return `${status} is a terminal state with no valid transitions`;
    }
    
    return `From ${status}, can transition to: ${transitions.join(', ')}`;
  }

  /**
   * Validate entire transition path
   * Useful for testing or validation workflows
   */
  static validateTransitionPath(path: OrderStatus[]): { valid: boolean; error?: string } {
    if (path.length < 2) {
      return { valid: true };
    }

    for (let i = 0; i < path.length - 1; i++) {
      const from = path[i];
      const to = path[i + 1];

      if (!this.canTransition(from, to)) {
        return {
          valid: false,
          error: `Invalid transition at step ${i + 1}: ${from} → ${to}`
        };
      }
    }

    return { valid: true };
  }
}
