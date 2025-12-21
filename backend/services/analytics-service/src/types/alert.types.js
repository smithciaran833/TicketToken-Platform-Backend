"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActionType = exports.ComparisonOperator = exports.AlertStatus = exports.AlertSeverity = exports.AlertType = void 0;
var AlertType;
(function (AlertType) {
    AlertType["THRESHOLD"] = "threshold";
    AlertType["ANOMALY"] = "anomaly";
    AlertType["TREND"] = "trend";
    AlertType["COMPARISON"] = "comparison";
    AlertType["CUSTOM"] = "custom";
})(AlertType || (exports.AlertType = AlertType = {}));
var AlertSeverity;
(function (AlertSeverity) {
    AlertSeverity["INFO"] = "info";
    AlertSeverity["WARNING"] = "warning";
    AlertSeverity["ERROR"] = "error";
    AlertSeverity["CRITICAL"] = "critical";
})(AlertSeverity || (exports.AlertSeverity = AlertSeverity = {}));
var AlertStatus;
(function (AlertStatus) {
    AlertStatus["ACTIVE"] = "active";
    AlertStatus["TRIGGERED"] = "triggered";
    AlertStatus["RESOLVED"] = "resolved";
    AlertStatus["SNOOZED"] = "snoozed";
    AlertStatus["DISABLED"] = "disabled";
})(AlertStatus || (exports.AlertStatus = AlertStatus = {}));
var ComparisonOperator;
(function (ComparisonOperator) {
    ComparisonOperator["EQUALS"] = "equals";
    ComparisonOperator["NOT_EQUALS"] = "not_equals";
    ComparisonOperator["GREATER_THAN"] = "greater_than";
    ComparisonOperator["LESS_THAN"] = "less_than";
    ComparisonOperator["GREATER_THAN_OR_EQUALS"] = "greater_than_or_equals";
    ComparisonOperator["LESS_THAN_OR_EQUALS"] = "less_than_or_equals";
    ComparisonOperator["BETWEEN"] = "between";
    ComparisonOperator["NOT_BETWEEN"] = "not_between";
    ComparisonOperator["CHANGE_PERCENT"] = "change_percent";
})(ComparisonOperator || (exports.ComparisonOperator = ComparisonOperator = {}));
var ActionType;
(function (ActionType) {
    ActionType["EMAIL"] = "email";
    ActionType["SMS"] = "sms";
    ActionType["WEBHOOK"] = "webhook";
    ActionType["SLACK"] = "slack";
    ActionType["DASHBOARD"] = "dashboard";
    ActionType["LOG"] = "log";
})(ActionType || (exports.ActionType = ActionType = {}));
//# sourceMappingURL=alert.types.js.map