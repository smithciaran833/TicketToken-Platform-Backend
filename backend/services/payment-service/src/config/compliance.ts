export const complianceConfig = {
  tax: {
    tennessee: {
      stateSalesRate: 7.0,
      localRates: {
        nashville: 2.25,
        memphis: 2.75,
        knoxville: 2.5
      }
    },
    
    nexusStates: [
      'TN', 'CA', 'NY', 'TX', 'FL', 'IL', 'PA'
    ],
    
    digitalAssetReporting: {
      form: '1099-DA',
      threshold: 600,
      startDate: new Date('2025-01-01')
    }
  },
  
  aml: {
    transactionThreshold: 10000,
    aggregateThreshold: 50000,
    suspiciousPatterns: [
      'rapid_high_value',
      'structured_transactions',
      'unusual_geography'
    ]
  },
  
  kyc: {
    basic: {
      monthlyLimit: 20000,
      requirements: ['email', 'phone']
    },
    enhanced: {
      monthlyLimit: 100000,
      requirements: ['id', 'address', 'ssn']
    }
  }
};
