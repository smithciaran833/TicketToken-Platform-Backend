
export interface SendPushInput { token:string; title:string; body:string; data?: any; }
export class PushProvider { async send(_i: SendPushInput){ return { id:'stub-push', status:'queued' as const, channel:'push' as const }; } }
