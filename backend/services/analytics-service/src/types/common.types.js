"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventType = exports.MetricType = void 0;
var MetricType;
(function (MetricType) {
    MetricType["SALES"] = "sales";
    MetricType["REVENUE"] = "revenue";
    MetricType["ATTENDANCE"] = "attendance";
    MetricType["CAPACITY"] = "capacity";
    MetricType["CONVERSION"] = "conversion";
    MetricType["CART_ABANDONMENT"] = "cart_abandonment";
    MetricType["AVERAGE_ORDER_VALUE"] = "average_order_value";
    MetricType["CUSTOMER_LIFETIME_VALUE"] = "customer_lifetime_value";
})(MetricType || (exports.MetricType = MetricType = {}));
var EventType;
(function (EventType) {
    EventType["TICKET_PURCHASED"] = "ticket.purchased";
    EventType["TICKET_TRANSFERRED"] = "ticket.transferred";
    EventType["TICKET_REFUNDED"] = "ticket.refunded";
    EventType["TICKET_SCANNED"] = "ticket.scanned";
    EventType["VENUE_CREATED"] = "venue.created";
    EventType["VENUE_UPDATED"] = "venue.updated";
    EventType["EVENT_CREATED"] = "event.created";
    EventType["EVENT_UPDATED"] = "event.updated";
    EventType["EVENT_CANCELLED"] = "event.cancelled";
    EventType["PAYMENT_COMPLETED"] = "payment.completed";
    EventType["PAYMENT_FAILED"] = "payment.failed";
    EventType["REFUND_PROCESSED"] = "refund.processed";
    EventType["LISTING_CREATED"] = "listing.created";
    EventType["LISTING_SOLD"] = "listing.sold";
    EventType["OFFER_MADE"] = "offer.made";
    EventType["USER_REGISTERED"] = "user.registered";
    EventType["USER_LOGIN"] = "user.login";
    EventType["USER_PROFILE_UPDATED"] = "user.profile_updated";
})(EventType || (exports.EventType = EventType = {}));
//# sourceMappingURL=common.types.js.map