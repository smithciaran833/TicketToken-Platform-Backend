"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CampaignStatus = exports.CampaignType = void 0;
var CampaignType;
(function (CampaignType) {
    CampaignType["EMAIL"] = "email";
    CampaignType["SMS"] = "sms";
    CampaignType["PUSH"] = "push";
    CampaignType["SOCIAL"] = "social";
    CampaignType["DISPLAY"] = "display";
    CampaignType["SEARCH"] = "search";
    CampaignType["MULTI_CHANNEL"] = "multi_channel";
})(CampaignType || (exports.CampaignType = CampaignType = {}));
var CampaignStatus;
(function (CampaignStatus) {
    CampaignStatus["DRAFT"] = "draft";
    CampaignStatus["SCHEDULED"] = "scheduled";
    CampaignStatus["ACTIVE"] = "active";
    CampaignStatus["PAUSED"] = "paused";
    CampaignStatus["COMPLETED"] = "completed";
    CampaignStatus["CANCELLED"] = "cancelled";
})(CampaignStatus || (exports.CampaignStatus = CampaignStatus = {}));
//# sourceMappingURL=campaign.types.js.map