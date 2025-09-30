
export interface SendSMSInput { to:string; message:string; }
export class SMSProvider { async send(_i: SendSMSInput){ return { id:'stub-sms', status:'queued' as const, channel:'sms' as const }; } }
