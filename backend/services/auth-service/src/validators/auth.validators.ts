import Joi from 'joi';

export const registerSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required',
  }),
  password: Joi.string().min(8).max(128).required().messages({
    'string.min': 'Password must be at least 8 characters long',
    'any.required': 'Password is required',
  }),
  firstName: Joi.string().min(1).max(100).required().messages({
    'any.required': 'First name is required',
  }),
  lastName: Joi.string().min(1).max(100).required().messages({
    'any.required': 'Last name is required',
  }),
  phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional().messages({
    'string.pattern.base': 'Please provide a valid phone number',
  }),
});

export const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

export const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required(),
});

export const verifyEmailSchema = Joi.object({
  token: Joi.string().required(),
});

export const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required(),
});

export const resetPasswordSchema = Joi.object({
  token: Joi.string().required(),
  newPassword: Joi.string().min(8).max(128).required(),
});

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).max(128).required(),
});

export const setupMFASchema = Joi.object({
  password: Joi.string().required(),
});

export const verifyMFASchema = Joi.object({
  token: Joi.string().length(6).pattern(/^\d+$/).required(),
});

export const grantRoleSchema = Joi.object({
  userId: Joi.string().uuid().required(),
  venueId: Joi.string().uuid().required(),
  role: Joi.string().valid('venue-owner', 'venue-manager', 'box-office', 'door-staff').required(),
  expiresAt: Joi.date().optional(),
});


export const disableMFASchema = Joi.object({
  password: Joi.string().required().messages({
    'any.required': 'Password is required to disable MFA',
    'string.empty': 'Password cannot be empty'
  })
});

export const updateProfileSchema = Joi.object({
  first_name: Joi.string().min(1).max(100).optional(),
  last_name: Joi.string().min(1).max(100).optional(),
  phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional().messages({
    'string.pattern.base': 'Please provide a valid phone number',
  }),
  preferences: Joi.object().unknown(true).optional()
});

export const walletLoginSchema = Joi.object({
  walletAddress: Joi.string().required(),
  signature: Joi.string().required(),
  message: Joi.string().required(),
});

export const connectWalletSchema = Joi.object({
  walletAddress: Joi.string().required(),
  walletType: Joi.string().valid('phantom', 'solflare', 'metamask').required(),
});

export const biometricRegisterSchema = Joi.object({
  publicKey: Joi.string().required(),
  deviceId: Joi.string().required(),
});

export const oauthLinkSchema = Joi.object({
  provider: Joi.string().valid('google', 'facebook', 'twitter').required(),
  accessToken: Joi.string().required(),
});

export const oauthLoginSchema = Joi.object({
  provider: Joi.string().valid('google', 'facebook', 'twitter').required(),
  accessToken: Joi.string().required(),
});
