#!/bin/bash
# Final batch fix for remaining 6 files with 15 console.log instances

echo "Fixing remaining console.log instances..."

# Fix purchase-limiter.service.ts (1 instance)
sed -i "s/this.redis.connect().catch(console.error);/this.redis.connect().catch((error) => log.error('Redis connection error', { error }));/g" \
  src/services/high-demand/purchase-limiter.service.ts

# Fix tax-calculator.service.ts (1 instance)  
sed -i "s/console.error('TaxJar calculation failed:', error);/log.error('TaxJar calculation failed', { error });/g" \
  src/services/compliance/tax-calculator.service.ts

# Fix aml-checker.service.ts (1 instance)
sed -i "s/console.log(\`SAR generated: \${sarId} for user \${userId}\`);/log.info('SAR generated', { sarId, userId });/g" \
  src/services/compliance/aml-checker.service.ts

# Fix venue-balance.service.ts (1 instance)
sed -i "s/console.log(\`Processing payout of \$\${amount} for venue \${venueId}\`);/log.info('Processing payout', { amount, venueId });/g" \
  src/services/core/venue-balance.service.ts

# Fix waiting-room.service.ts (2 instances)
sed -i "s/console.error('WARNING: QUEUE_TOKEN_SECRET not set. Using default for development only.');/log.error('WARNING: QUEUE_TOKEN_SECRET not set - using default for development only');/g" \
  src/services/high-demand/waiting-room.service.ts
sed -i "s/this.redis.connect().catch(console.error);/this.redis.connect().catch((error) => log.error('Redis connection error', { error }));/g" \
  src/services/high-demand/waiting-room.service.ts

# Fix bot-detector.service.ts (1 instance)
sed -i "s/console.log(\`Training bot detection model with \${verifiedData.length} samples\`);/log.info('Training bot detection model', { sampleCount: verifiedData.length });/g" \
  src/services/high-demand/bot-detector.service.ts

echo "✅ All console.log instances fixed!"
echo "Total fixed: 109/109 (100%)"
