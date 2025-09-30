// This file will be used to manage service dependencies and dependency injection
// For now, it's a placeholder for future dependency injection setup

export interface Dependencies {
  // Services
  metricsService?: any;
  aggregationService?: any;
  customerIntelService?: any;
  predictionService?: any;
  messageGatewayService?: any;
  attributionService?: any;
  exportService?: any;
  alertService?: any;
  anonymizationService?: any;
  websocketService?: any;
}

const dependencies: Dependencies = {};

export function setDependency(key: keyof Dependencies, value: any) {
  dependencies[key] = value;
}

export function getDependency(key: keyof Dependencies) {
  return dependencies[key];
}

export function getAllDependencies(): Dependencies {
  return dependencies;
}
