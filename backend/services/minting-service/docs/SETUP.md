# Minting Service - Setup Guide

This guide walks you through setting up the minting service for production use.

## Prerequisites

- Node.js 20+
- PostgreSQL database
- Redis instance
- Solana wallet with SOL (devnet or mainnet)
- IPFS service account (Pinata or NFT.Storage)

## Environment Setup

### 1. Copy Environment Template

```bash
cp .env.example .env
```

### 2. Configure Database

```env
DATABASE_URL=postgresql://user:password@localhost:5432/tickettoken_db
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tickettoken_db
DB_USER=tickettoken
DB_PASSWORD=your_secure_password
```

### 3. Configure Redis

```env
REDIS_URL=redis://:password@localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
```

### 4. Configure Solana

```env
# Use devnet for testing
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_NETWORK=devnet
SOLANA_CLUSTER=devnet

# Wallet configuration
WALLET_PATH=./devnet-wallet.json

# Will be set after creating collection
COLLECTION_MINT=CHANGE_ME_after_collection_deployed
MERKLE_TREE_ADDRESS=CHANGE_ME_after_merkle_tree_created

# Transaction settings
TRANSACTION_TIMEOUT=60000
CONFIRMATION_COMMITMENT=confirmed
PRIORITY_FEE_MICROLAMPORTS=1
```

### 5. Configure IPFS (Pinata)

Sign up at https://pinata.cloud and get your API credentials:

```env
IPFS_PROVIDER=pinata
PINATA_API_KEY=your_api_key
PINATA_SECRET_API_KEY=your_secret_key
PINATA_JWT=your_jwt_token  # Optional, use either JWT or API keys
IPFS_GATEWAY=https://gateway.pinata.cloud
```

Alternative - NFT.Storage:

```env
IPFS_PROVIDER=nft.storage
NFT_STORAGE_API_KEY=your_nft_storage_key
```

### 6. Configure Internal Service Authentication

Generate a secure random secret (minimum 32 characters):

```bash
openssl rand -base64 32
```

```env
INTERNAL_SERVICE_SECRET=your_generated_secret_here
```

### 7. Configure Monitoring

```env
PROMETHEUS_PORT=9090
METRICS_ENABLED=true
LOG_LEVEL=info
LOG_FORMAT=json
```

### 8. Configure Service

```env
PORT=3018
SERVICE_NAME=minting-service
NODE_ENV=production

# Queue settings
QUEUE_CONCURRENCY=5
MAX_MINT_RETRIES=3

# Balance monitoring
MIN_SOL_BALANCE=0.1
BALANCE_CHECK_INTERVAL=300000
```

## Wallet Setup

### Creating a Devnet Wallet

```bash
# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Create a new wallet
solana-keygen new --outfile devnet-wallet.json

# Set to devnet
solana config set --url https://api.devnet.solana.com

# Fund the wallet (request 2 SOL)
solana airdrop 2 devnet-wallet.json

# Check balance
solana balance devnet-wallet.json
```

Keep your wallet file secure! Never commit it to version control.

### For Production (Mainnet)

1. Create wallet using hardware wallet or secure key management
2. Fund with sufficient SOL for minting operations
3. Store private key in AWS Secrets Manager or HashiCorp Vault
4. Update WALLET_PATH to point to secure storage

## Collection NFT Setup

The collection NFT is required for compressed NFTs. Create it once:

```bash
# Ensure you have:
# 1. Wallet with at least 0.1 SOL
# 2. IPFS credentials configured
# 3. Solana RPC configured

# Run the collection creation script
npx ts-node scripts/create-collection.ts
```

This will:
1. Upload collection metadata to IPFS
2. Create collection NFT on Solana
3. Save configuration to `collection-config.json`
4. Display the collection mint address

Update your `.env` file with the collection mint address:

```env
COLLECTION_MINT=<address from script output>
```

## Database Migrations

Run migrations to create required tables:

```bash
npm run migrate:latest
```

This creates:
- `collections` table
- `mints` table
- `nfts` table

## Verification

### 1. Check Configuration

```bash
npm run check-config
```

### 2. Test IPFS Connection

```bash
npm run test:ipfs
```

### 3. Test Solana Connection

```bash
npm run test:solana
```

### 4. Run Health Check

Start the service and check health:

```bash
npm start

# In another terminal
curl http://localhost:3018/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "minting-service",
  "timestamp": "2025-11-13T..."
}
```

## Starting the Service

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

### With PM2

```bash
pm2 start ecosystem.config.js
pm2 logs minting-service
```

## Monitoring

### Check Service Status

```bash
curl http://localhost:3018/health
curl http://localhost:3018/health/db
```

### View Metrics

```bash
curl http://localhost:3018/metrics
```

### Monitor Logs

```bash
tail -f logs/minting-service.log
```

Or with PM2:

```bash
pm2 logs minting-service
```

## Troubleshooting

### Wallet Balance Low

```bash
# Check balance
solana balance devnet-wallet.json

# Request airdrop (devnet only)
solana airdrop 1 devnet-wallet.json
```

### IPFS Upload Failures

- Verify API credentials are correct
- Check if you've exceeded free tier limits
- Try alternative IPFS provider

### Transaction Failures

- Check wallet has sufficient SOL
- Verify RPC endpoint is accessible
- Check Solana network status
- Review transaction logs for errors

### Database Connection Issues

- Verify PostgreSQL is running
- Check DATABASE_URL is correct
- Ensure database exists
- Run migrations if tables missing

## Security Best Practices

1. **Never commit**:
   - `.env` file
   - Wallet files
   - Private keys

2. **Production**:
   - Use AWS Secrets Manager for wallet
   - Enable rate limiting
   - Use HTTPS only
   - Implement webhook signature validation
   - Monitor for suspicious activity

3. **Monitoring**:
   - Set up alerts for low balance
   - Monitor failed transactions
   - Track minting success rate
   - Alert on high error rates

## Next Steps

After setup is complete:

1. Test minting in development
2. Verify NFTs on Solana Explorer
3. Check metadata on IPFS gateway
4. Run integration tests
5. Perform load testing
6. Document any custom configurations
7. Set up monitoring and alerts

## Support

For issues or questions:
- Check logs in `logs/` directory
- Review error messages in console
- Check Solana Explorer for transaction details
- Verify IPFS gateway accessibility

## Additional Resources

- [Solana Documentation](https://docs.solana.com/)
- [Metaplex Documentation](https://docs.metaplex.com/)
- [Pinata Documentation](https://docs.pinata.cloud/)
- [NFT.Storage Documentation](https://nft.storage/docs/)
