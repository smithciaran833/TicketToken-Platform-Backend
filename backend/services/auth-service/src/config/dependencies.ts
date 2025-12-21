import { createContainer, asClass, asValue, InjectionMode } from 'awilix';
import { RateLimitService } from '../services/rate-limit.service';
import { DeviceTrustService } from '../services/device-trust.service';
import { BiometricService } from '../services/biometric.service';
import { JWTService } from '../services/jwt.service';
import { AuthService } from '../services/auth.service';
import { AuthExtendedService } from '../services/auth-extended.service';
import { RBACService } from '../services/rbac.service';
import { MFAService } from '../services/mfa.service';
import { EmailService } from '../services/email.service';
import { LockoutService } from '../services/lockout.service';
import { AuditService } from '../services/audit.service';
import { MonitoringService } from '../services/monitoring.service';
import { WalletService } from '../services/wallet.service';
import { OAuthService } from '../services/oauth.service';
import { db } from './database';
import { env } from './env';

export function createDependencyContainer() {
  const container = createContainer({
    injectionMode: InjectionMode.CLASSIC,
  });

  container.register({
    // Config
    env: asValue(env),
    
    // Database
    db: asValue(db),
    
    // Core Services
    jwtService: asClass(JWTService).singleton(),
    authService: asClass(AuthService).singleton().inject(() => ({ 
      jwtService: container.resolve('jwtService') 
    })),
    authExtendedService: asClass(AuthExtendedService).singleton().inject(() => ({
      emailService: container.resolve('emailService')
    })),
    rbacService: asClass(RBACService).singleton(),
    mfaService: asClass(MFAService).singleton(),
    walletService: asClass(WalletService).singleton(),
    rateLimitService: asClass(RateLimitService).singleton(),
    deviceTrustService: asClass(DeviceTrustService).singleton(),
    biometricService: asClass(BiometricService).singleton(),
    oauthService: asClass(OAuthService).singleton(),
    
    // Supporting Services
    emailService: asClass(EmailService).singleton(),
    lockoutService: asClass(LockoutService).singleton(),
    auditService: asClass(AuditService).singleton(),
    monitoringService: asClass(MonitoringService).singleton(),
  });

  return container;
}

export type Container = ReturnType<typeof createDependencyContainer>;
export type Cradle = Container extends { cradle: infer C } ? C : never;
