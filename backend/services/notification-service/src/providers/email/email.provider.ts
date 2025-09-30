
export interface SendEmailInput { to:string; subject:string; html?:string; text?:string; from?:string; }
export class EmailProvider { async send(_i: SendEmailInput){ return { id:'stub-email', status:'queued' as const, channel:'email' as const }; } }
