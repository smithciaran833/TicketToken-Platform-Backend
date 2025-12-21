"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelStatus = exports.ModelType = void 0;
var ModelType;
(function (ModelType) {
    ModelType["DEMAND_FORECAST"] = "demand_forecast";
    ModelType["PRICE_OPTIMIZATION"] = "price_optimization";
    ModelType["CHURN_PREDICTION"] = "churn_prediction";
    ModelType["LIFETIME_VALUE"] = "lifetime_value";
    ModelType["NO_SHOW_PREDICTION"] = "no_show_prediction";
    ModelType["FRAUD_DETECTION"] = "fraud_detection";
})(ModelType || (exports.ModelType = ModelType = {}));
var ModelStatus;
(function (ModelStatus) {
    ModelStatus["TRAINING"] = "training";
    ModelStatus["READY"] = "ready";
    ModelStatus["FAILED"] = "failed";
    ModelStatus["OUTDATED"] = "outdated";
    ModelStatus["DISABLED"] = "disabled";
})(ModelStatus || (exports.ModelStatus = ModelStatus = {}));
//# sourceMappingURL=prediction.types.js.map