"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.campaignController = void 0;
const base_controller_1 = require("./base.controller");
class CampaignController extends base_controller_1.BaseController {
    getCampaigns = async (request, reply) => {
        try {
            return this.success(reply, { campaigns: [] });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    getCampaign = async (request, reply) => {
        try {
            return this.success(reply, { campaign: {} });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    getCampaignPerformance = async (request, reply) => {
        try {
            return this.success(reply, { performance: {} });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    getCampaignAttribution = async (request, reply) => {
        try {
            return this.success(reply, { attribution: {} });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    getChannelPerformance = async (request, reply) => {
        try {
            return this.success(reply, { channels: [] });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    trackTouchpoint = async (request, reply) => {
        try {
            return this.success(reply, { message: 'Touchpoint tracked' }, 201);
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    getCampaignROI = async (request, reply) => {
        try {
            return this.success(reply, { roi: {} });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
}
exports.campaignController = new CampaignController();
//# sourceMappingURL=campaign.controller.js.map