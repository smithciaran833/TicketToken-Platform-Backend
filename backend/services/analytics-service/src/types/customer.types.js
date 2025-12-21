"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InsightType = exports.CustomerSegment = void 0;
var CustomerSegment;
(function (CustomerSegment) {
    CustomerSegment["NEW"] = "new";
    CustomerSegment["OCCASIONAL"] = "occasional";
    CustomerSegment["REGULAR"] = "regular";
    CustomerSegment["VIP"] = "vip";
    CustomerSegment["AT_RISK"] = "at_risk";
    CustomerSegment["DORMANT"] = "dormant";
    CustomerSegment["LOST"] = "lost";
})(CustomerSegment || (exports.CustomerSegment = CustomerSegment = {}));
var InsightType;
(function (InsightType) {
    InsightType["PURCHASE_PATTERN"] = "purchase_pattern";
    InsightType["CHURN_RISK"] = "churn_risk";
    InsightType["UPSELL_OPPORTUNITY"] = "upsell_opportunity";
    InsightType["REACTIVATION"] = "reactivation";
    InsightType["MILESTONE"] = "milestone";
    InsightType["PREFERENCE_CHANGE"] = "preference_change";
    InsightType["LOW_ENGAGEMENT"] = "low_engagement";
    InsightType["HIGH_VALUE"] = "high_value";
})(InsightType || (exports.InsightType = InsightType = {}));
//# sourceMappingURL=customer.types.js.map