export const RATE_LIMITS = {
  // Per-user limits (per hour)
  email: {
    perUser: {
      max: parseInt(process.env.RATE_LIMIT_EMAIL_PER_USER || '20'),
      duration: 3600 // 1 hour
    },
    global: {
      max: parseInt(process.env.RATE_LIMIT_EMAIL_GLOBAL || '1000'),
      duration: 60 // 1 minute
    }
  },
  
  sms: {
    perUser: {
      max: parseInt(process.env.RATE_LIMIT_SMS_PER_USER || '5'),
      duration: 3600 // 1 hour
    },
    global: {
      max: parseInt(process.env.RATE_LIMIT_SMS_GLOBAL || '100'),
      duration: 60 // 1 minute
    }
  },
  
  push: {
    perUser: {
      max: parseInt(process.env.RATE_LIMIT_PUSH_PER_USER || '50'),
      duration: 3600 // 1 hour
    },
    global: {
      max: parseInt(process.env.RATE_LIMIT_PUSH_GLOBAL || '5000'),
      duration: 60 // 1 minute
    }
  },
  
  // Critical notifications bypass rate limits
  criticalTypes: [
    'payment_failed',
    'account_security',
    'account_locked',
    'password_reset',
    'two_factor_auth'
  ],
  
  // Rate limit bypass for specific users (e.g., admin, testing)
  bypassUsers: (process.env.RATE_LIMIT_BYPASS_USERS || '').split(',').filter(Boolean),
  
  // Rate limit bypass for specific IPs
  bypassIPs: (process.env.RATE_LIMIT_BYPASS_IPS || '').split(',').filter(Boolean)
};

export function shouldBypassRateLimit(
  userId?: string,
  ip?: string,
  notificationType?: string
): boolean {
  // Check if critical notification
  if (notificationType && RATE_LIMITS.criticalTypes.includes(notificationType)) {
    return true;
  }
  
  // Check if bypass user
  if (userId && RATE_LIMITS.bypassUsers.includes(userId)) {
    return true;
  }
  
  // Check if bypass IP
  if (ip && RATE_LIMITS.bypassIPs.includes(ip)) {
    return true;
  }
  
  return false;
}
