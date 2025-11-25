/**
 * TicketToken JavaScript SDK
 * Browser and Node.js compatible wrapper around the TypeScript SDK
 */

// Re-export everything from the TypeScript SDK
export * from '@tickettoken/sdk-typescript';

// Export default for UMD builds
import { TicketToken } from '@tickettoken/sdk-typescript';
export default TicketToken;
