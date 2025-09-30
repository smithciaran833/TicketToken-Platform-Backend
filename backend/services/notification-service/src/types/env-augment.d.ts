
declare module '../config/env' {
  export interface EnvConfig {
    SENDGRID_WEBHOOK_SECRET?: string;
    AWS_REGION?: string;
    AWS_ACCESS_KEY_ID?: string;
    AWS_SECRET_ACCESS_KEY?: string;
  }
}
