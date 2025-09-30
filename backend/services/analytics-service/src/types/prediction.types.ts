export interface PredictionModel {
  id: string;
  venueId: string;
  modelType: ModelType;
  version: string;
  status: ModelStatus;
  accuracy?: number;
  lastTrained: Date;
  nextTraining: Date;
  parameters: ModelParameters;
  metrics: ModelMetrics;
  features: string[];
}

export enum ModelType {
  DEMAND_FORECAST = 'demand_forecast',
  PRICE_OPTIMIZATION = 'price_optimization',
  CHURN_PREDICTION = 'churn_prediction',
  LIFETIME_VALUE = 'lifetime_value',
  NO_SHOW_PREDICTION = 'no_show_prediction',
  FRAUD_DETECTION = 'fraud_detection',
}

export enum ModelStatus {
  TRAINING = 'training',
  READY = 'ready',
  FAILED = 'failed',
  OUTDATED = 'outdated',
  DISABLED = 'disabled',
}

export interface ModelParameters {
  algorithm: string;
  hyperparameters: Record<string, any>;
  trainingConfig: {
    batchSize?: number;
    epochs?: number;
    learningRate?: number;
    validationSplit?: number;
  };
}

export interface ModelMetrics {
  accuracy?: number;
  precision?: number;
  recall?: number;
  f1Score?: number;
  rmse?: number;
  mae?: number;
  r2?: number;
  confusionMatrix?: number[][];
  featureImportance?: Array<{
    feature: string;
    importance: number;
  }>;
}

export interface DemandForecast {
  eventId: string;
  predictions: Array<{
    date: Date;
    ticketTypeId: string;
    predictedDemand: number;
    confidenceInterval: {
      lower: number;
      upper: number;
    };
    factors: Array<{
      name: string;
      impact: number;
    }>;
  }>;
  aggregated: {
    totalPredictedDemand: number;
    peakDemandDate: Date;
    sellOutProbability: number;
  };
}

export interface PriceOptimization {
  eventId: string;
  ticketTypeId: string;
  currentPrice: number;
  recommendations: Array<{
    price: number;
    expectedDemand: number;
    expectedRevenue: number;
    elasticity: number;
    confidence: number;
  }>;
  optimalPrice: number;
  priceRange: {
    min: number;
    max: number;
  };
  factors: Array<{
    factor: string;
    weight: number;
    direction: 'positive' | 'negative';
  }>;
}

export interface ChurnPrediction {
  customerId: string;
  churnProbability: number;
  riskLevel: 'low' | 'medium' | 'high';
  timeframe: number; // days
  reasons: Array<{
    factor: string;
    weight: number;
    description: string;
  }>;
  recommendedActions: Array<{
    action: string;
    expectedImpact: number;
    effort: 'low' | 'medium' | 'high';
  }>;
}

export interface CustomerLifetimeValue {
  customerId: string;
  predictedCLV: number;
  confidence: number;
  timeHorizon: number; // months
  breakdown: {
    expectedPurchases: number;
    averageOrderValue: number;
    retentionProbability: number;
  };
  segment: string;
  growthPotential: number;
}

export interface NoShowPrediction {
  ticketId: string;
  customerId: string;
  eventId: string;
  noShowProbability: number;
  riskFactors: Array<{
    factor: string;
    value: any;
    contribution: number;
  }>;
  recommendedActions?: string[];
}

export interface FraudDetection {
  transactionId: string;
  fraudProbability: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  anomalies: Array<{
    type: string;
    severity: number;
    description: string;
  }>;
  requiresReview: boolean;
  autoDecision: 'approve' | 'decline' | 'review';
}

export interface WhatIfScenario {
  id: string;
  name: string;
  type: 'pricing' | 'capacity' | 'timing' | 'marketing';
  baselineMetrics: Record<string, number>;
  scenarios: Array<{
    name: string;
    parameters: Record<string, any>;
    predictions: Record<string, number>;
    impact: Record<string, number>;
  }>;
  recommendations: string[];
}

export interface SeasonalityPattern {
  venueId: string;
  metricType: string;
  patterns: Array<{
    type: 'daily' | 'weekly' | 'monthly' | 'yearly';
    values: number[];
    strength: number;
    confidence: number;
  }>;
  holidays: Array<{
    name: string;
    impact: number;
    daysAffected: number;
  }>;
  events: Array<{
    type: string;
    averageImpact: number;
    frequency: number;
  }>;
}
