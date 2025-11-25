interface FeeBreakdown {
    basePrice: number;
    platformFee: number;
    platformFeePercent: number;
    venueFee: number;
    venueFeePercent: number;
    paymentProcessingFee: number;
    paymentProcessingPercent: number;
    taxAmount: number;
    taxPercent: number;
    totalPrice: number;
    currency: string;
}
interface VenueFeePolicy {
    venueId: string;
    venueName: string;
    baseFeePercent: number;
    serviceFeePercent: number;
    resaleFeePercent: number;
    maxResalePrice?: number;
    effectiveDate: Date;
    lastUpdated: Date;
}
export declare class FeeTransparencyService {
    calculateFeeBreakdown(basePrice: number, venueId: string, isResale?: boolean, location?: string): Promise<FeeBreakdown>;
    getVenueFeePolicy(venueId: string): Promise<VenueFeePolicy>;
    getOrderFees(orderId: string): Promise<any>;
    generateVenueFeeReport(venueId: string, startDate: Date, endDate: Date): Promise<any>;
    private getTaxRate;
}
export declare const feeTransparencyService: FeeTransparencyService;
export {};
//# sourceMappingURL=fee-transparency.service.d.ts.map