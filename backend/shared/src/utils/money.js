"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toCents = toCents;
exports.fromCents = fromCents;
exports.addCents = addCents;
exports.subtractCents = subtractCents;
exports.percentOfCents = percentOfCents;
exports.multiplyCents = multiplyCents;
exports.formatCents = formatCents;
exports.parseToCents = parseToCents;
function toCents(dollars) {
    if (!Number.isFinite(dollars)) {
        throw new Error('Invalid dollar amount: must be finite number');
    }
    if (dollars < 0) {
        throw new Error('Invalid dollar amount: cannot be negative');
    }
    return Math.round(dollars * 100);
}
function fromCents(cents) {
    if (!Number.isInteger(cents)) {
        throw new Error('Cents must be an integer');
    }
    return cents / 100;
}
function addCents(...amounts) {
    return amounts.reduce((sum, amt) => {
        if (!Number.isInteger(amt)) {
            throw new Error(`All amounts must be integers, got: ${amt}`);
        }
        return sum + amt;
    }, 0);
}
function subtractCents(base, subtract) {
    if (!Number.isInteger(base) || !Number.isInteger(subtract)) {
        throw new Error('All amounts must be integers');
    }
    return base - subtract;
}
function percentOfCents(amountCents, basisPoints) {
    if (!Number.isInteger(amountCents) || !Number.isInteger(basisPoints)) {
        throw new Error('Values must be integers');
    }
    return Math.floor((amountCents * basisPoints) / 10000);
}
function multiplyCents(cents, quantity) {
    if (!Number.isInteger(cents) || !Number.isInteger(quantity)) {
        throw new Error('Values must be integers');
    }
    return cents * quantity;
}
function formatCents(cents, currency = 'USD') {
    if (!Number.isInteger(cents)) {
        throw new Error('Cents must be an integer');
    }
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency
    }).format(fromCents(cents));
}
function parseToCents(moneyString) {
    const cleaned = moneyString.replace(/[$,\s]/g, '');
    const dollars = parseFloat(cleaned);
    if (isNaN(dollars)) {
        throw new Error(`Invalid money string: ${moneyString}`);
    }
    return toCents(dollars);
}
//# sourceMappingURL=money.js.map