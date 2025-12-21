"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setDependency = setDependency;
exports.getDependency = getDependency;
exports.getAllDependencies = getAllDependencies;
const dependencies = {};
function setDependency(key, value) {
    dependencies[key] = value;
}
function getDependency(key) {
    return dependencies[key];
}
function getAllDependencies() {
    return dependencies;
}
//# sourceMappingURL=dependencies.js.map