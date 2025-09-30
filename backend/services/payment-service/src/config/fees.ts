export const feeConfig = {
  tiers: {
    starter: {
      name: 'Starter',
      percentage: parseFloat(process.env.FEE_TIER_STARTER || '8.2'),
      monthlyVolumeMax: parseFloat(process.env.THRESHOLD_PRO || '10000')
    },
    pro: {
      name: 'Pro',
      percentage: parseFloat(process.env.FEE_TIER_PRO || '7.9'),
      monthlyVolumeMin: parseFloat(process.env.THRESHOLD_PRO || '10000'),
      monthlyVolumeMax: parseFloat(process.env.THRESHOLD_ENTERPRISE || '100000')
    },
    enterprise: {
      name: 'Enterprise',
      percentage: parseFloat(process.env.FEE_TIER_ENTERPRISE || '7.5'),
      monthlyVolumeMin: parseFloat(process.env.THRESHOLD_ENTERPRISE || '100000')
    }
  },
  
  instantPayout: {
    percentage: 1.0,
    minimum: 0.50
  },
  
  internationalPayment: {
    percentage: 2.0
  },
  
  groupPayment: {
    perMember: 0.50
  },
  
  ach: {
    fixed: 0.80
  }
};

export const chargebackReserves = {
  low: 5,      // 5% for established venues
  medium: 10,  // 10% for normal venues  
  high: 15     // 15% for new/risky venues
};

export const payoutThresholds = {
  minimum: 100, // $100 minimum payout
  maximumDaily: 50000 // $50k daily limit
};
