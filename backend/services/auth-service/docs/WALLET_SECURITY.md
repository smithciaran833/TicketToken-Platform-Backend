# Wallet Security Architecture

## Overview
Auth-service handles wallet-based authentication without ever accessing private keys.

## Security Model

### What Auth-Service Does
- Stores public wallet addresses
- Verifies signed messages (signature verification)
- Links wallets to user accounts
- Tracks wallet connection metadata

### What Auth-Service Does NOT Do
- Store private keys
- Sign transactions
- Access wallet funds
- Generate wallet addresses

## Authentication Flow

1. **Challenge Generation**
   - Service generates random nonce
   - Nonce stored in Redis with TTL (5 min)
   - Nonce sent to client

2. **Signature Verification**
   - Client signs nonce with wallet
   - Service receives signature + public address
   - Service verifies signature matches address
   - Service verifies nonce exists and not expired

3. **Account Linking**
   - Verified address stored in `wallet_connections`
   - Address linked to user_id
   - Network type recorded (Ethereum, Solana)

## Supported Networks
- Ethereum (ethers.js verification)
- Solana (tweetnacl verification)

## Security Controls
- Nonce replay protection (single-use)
- Nonce expiration (5 minutes)
- Rate limiting on verification attempts
- Audit logging of all wallet operations
