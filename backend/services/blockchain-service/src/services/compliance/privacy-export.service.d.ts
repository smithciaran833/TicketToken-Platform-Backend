interface UserDataExport {
    requestId: string;
    userId: string;
    requestedAt: Date;
    completedAt?: Date;
    downloadUrl?: string;
    expiresAt?: Date;
    status: 'pending' | 'processing' | 'completed' | 'failed';
}
export declare class PrivacyExportService {
    private exportPath;
    requestDataExport(userId: string, reason: string): Promise<UserDataExport>;
    private processExportAsync;
    private collectUserData;
    private createExportArchive;
    private generateReadme;
    requestAccountDeletion(userId: string, reason: string): Promise<any>;
    private generateDownloadUrl;
    private notifyUserExportReady;
    private sendDeletionConfirmation;
}
export declare const privacyExportService: PrivacyExportService;
export {};
//# sourceMappingURL=privacy-export.service.d.ts.map