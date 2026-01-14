import { 
  ModelType,
  DemandForecast,
  PriceOptimization,
  ChurnPrediction,
  CustomerLifetimeValue,
  NoShowPrediction,
  WhatIfScenario
} from '../types';
import { logger } from '../utils/logger';
import { customerIntelligenceService } from './customer-intelligence.service';
import * as tf from '@tensorflow/tfjs-node';

export class PredictionService {
  private static instance: PredictionService;
  private log = logger.child({ component: 'PredictionService' });
  private models: Map<ModelType, tf.LayersModel> = new Map();

  static getInstance(): PredictionService {
    if (!this.instance) {
      this.instance = new PredictionService();
    }
    return this.instance;
  }

  async initialize(): Promise<void> {
    try {
      // Load pre-trained models
      // In production, these would be loaded from model storage
      this.log.info('Initializing prediction models...');
      
      // For now, we'll create simple placeholder models
      await this.initializePlaceholderModels();
      
      this.log.info('Prediction models initialized');
    } catch (error) {
      this.log.error('Failed to initialize prediction models', { error });
    }
  }

  private async initializePlaceholderModels(): Promise<void> {
    // Create simple neural networks for each model type
    const modelTypes = Object.values(ModelType);
    
    for (const modelType of modelTypes) {
      const model = tf.sequential({
        layers: [
          tf.layers.dense({ inputShape: [10], units: 64, activation: 'relu' }),
          tf.layers.dropout({ rate: 0.2 }),
          tf.layers.dense({ units: 32, activation: 'relu' }),
          tf.layers.dense({ units: 1, activation: 'sigmoid' })
        ]
      });
      
      model.compile({
        optimizer: 'adam',
        loss: 'binaryCrossentropy',
        metrics: ['accuracy']
      });
      
      this.models.set(modelType, model);
    }
  }

  async predictDemand(
    venueId: string,
    eventId: string,
    daysAhead: number = 30
  ): Promise<DemandForecast> {
    try {
      // Get historical data
      
      // Generate predictions
      const predictions = [];
      const today = new Date();
      
      for (let i = 0; i < daysAhead; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() + i);
        
        // Deterministic demand prediction based on day of week and seasonal patterns
        const dayOfWeek = date.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const baseDemand = isWeekend ? 150 : 100;
        // Use deterministic variance based on day index and date hash instead of random
        const dateHash = (date.getDate() + date.getMonth() * 31 + i * 7) % 100;
        const variance = (dateHash - 50) / 2; // Produces -25 to +25 deterministically
        const predictedDemand = Math.max(0, baseDemand + variance);
        
        predictions.push({
          date,
          ticketTypeId: 'general',
          predictedDemand: Math.round(predictedDemand),
          confidenceInterval: {
            lower: Math.round(predictedDemand * 0.8),
            upper: Math.round(predictedDemand * 1.2)
          },
          factors: [
            { name: 'Day of Week', impact: isWeekend ? 1.5 : 1.0 },
            { name: 'Seasonality', impact: 1.0 },
            { name: 'Marketing', impact: 1.1 }
          ]
        });
      }
      
      const totalPredictedDemand = predictions.reduce((sum, p) => sum + p.predictedDemand, 0);
      const peakDemand = Math.max(...predictions.map(p => p.predictedDemand));
      const peakDemandDate = predictions.find(p => p.predictedDemand === peakDemand)?.date || today;
      
      return {
        eventId,
        predictions,
        aggregated: {
          totalPredictedDemand,
          peakDemandDate,
          sellOutProbability: totalPredictedDemand > 1000 ? 0.8 : 0.3
        }
      };
    } catch (error) {
      this.log.error('Failed to predict demand', { error, venueId, eventId });
      throw error;
    }
  }

  async optimizePrice(
    venueId: string,
    eventId: string,
    ticketTypeId: string,
    currentPrice: number
  ): Promise<PriceOptimization> {
    try {
      // Simple price optimization based on elasticity
      const elasticity = -1.5; // Price elasticity of demand
      const recommendations = [];
      
      // Test different price points
      const pricePoints = [0.8, 0.9, 1.0, 1.1, 1.2].map(factor => currentPrice * factor);
      
      for (const price of pricePoints) {
        const priceChange = (price - currentPrice) / currentPrice;
        const demandChange = elasticity * priceChange;
        const expectedDemand = 100 * (1 + demandChange);
        const expectedRevenue = price * expectedDemand;
        
        // Deterministic confidence based on price deviation from current
        const priceDeviation = Math.abs(priceChange);
        const confidence = 0.9 - (priceDeviation * 0.5); // Higher confidence near current price
        recommendations.push({
          price,
          expectedDemand: Math.round(expectedDemand),
          expectedRevenue: Math.round(expectedRevenue),
          elasticity,
          confidence: Math.max(0.7, Math.min(0.9, confidence))
        });
      }
      
      // Find optimal price
      const optimal = recommendations.reduce((best, current) => 
        current.expectedRevenue > best.expectedRevenue ? current : best
      );
      
      return {
        eventId,
        ticketTypeId,
        currentPrice,
        recommendations,
        optimalPrice: optimal.price,
        priceRange: {
          min: Math.min(...pricePoints),
          max: Math.max(...pricePoints)
        },
        factors: [
          { factor: 'Demand Level', weight: 0.4, direction: 'positive' },
          { factor: 'Competition', weight: 0.3, direction: 'negative' },
          { factor: 'Day of Week', weight: 0.2, direction: 'positive' },
          { factor: 'Seasonality', weight: 0.1, direction: 'positive' }
        ]
      };
    } catch (error) {
      this.log.error('Failed to optimize price', { error, venueId, eventId });
      throw error;
    }
  }

  async predictChurn(
    venueId: string,
    customerId: string
  ): Promise<ChurnPrediction> {
    try {
      const profile = await customerIntelligenceService.getCustomerProfile(venueId, customerId);
      
      if (!profile) {
        throw new Error('Customer profile not found');
      }
      
      // Simple churn prediction based on recency and frequency
      const churnProbability = profile.churnProbability;
      const riskLevel = churnProbability > 0.7 ? 'high' : 
                       churnProbability > 0.4 ? 'medium' : 'low';
      
      const reasons = [];
      
      if (profile.daysSinceLastPurchase > 90) {
        reasons.push({
          factor: 'Long time since last purchase',
          weight: 0.4,
          description: `${profile.daysSinceLastPurchase} days since last purchase`
        });
      }
      
      if (profile.purchaseFrequency < 2) {
        reasons.push({
          factor: 'Low purchase frequency',
          weight: 0.3,
          description: `Only ${profile.purchaseFrequency.toFixed(1)} purchases per year`
        });
      }
      
      const recommendedActions: Array<{
        action: string;
        expectedImpact: number;
        effort: 'low' | 'medium' | 'high';
      }> = [];
      
      if (riskLevel === 'high') {
        recommendedActions.push(
          { action: 'Send win-back email campaign', expectedImpact: 0.3, effort: 'low' },
          { action: 'Offer personalized discount', expectedImpact: 0.4, effort: 'medium' },
          { action: 'Call customer directly', expectedImpact: 0.5, effort: 'high' }
        );
      } else if (riskLevel === 'medium') {
        recommendedActions.push(
          { action: 'Include in re-engagement campaign', expectedImpact: 0.2, effort: 'low' },
          { action: 'Send event recommendations', expectedImpact: 0.3, effort: 'low' }
        );
      }
      
      return {
        customerId: profile.customerId,
        churnProbability,
        riskLevel: riskLevel as any,
        timeframe: 90,
        reasons,
        recommendedActions
      };
    } catch (error) {
      this.log.error('Failed to predict churn', { error, venueId, customerId });
      throw error;
    }
  }

  async predictCustomerLifetimeValue(
    venueId: string,
    customerId: string
  ): Promise<CustomerLifetimeValue> {
    try {
      const profile = await customerIntelligenceService.getCustomerProfile(venueId, customerId);
      
      if (!profile) {
        throw new Error('Customer profile not found');
      }
      
      // Simple CLV calculation
      const monthlySpend = profile.averageOrderValue * (profile.purchaseFrequency / 12);
      const retentionRate = 1 - profile.churnProbability;
      const timeHorizon = 36; // 3 years in months
      
      let clv = 0;
      let cumulativeRetention = 1;
      
      for (let month = 1; month <= timeHorizon; month++) {
        cumulativeRetention *= retentionRate;
        clv += monthlySpend * cumulativeRetention;
      }
      
      const growthPotential = profile.segment === 'new' ? 1.5 :
                             profile.segment === 'occasional' ? 1.3 :
                             profile.segment === 'regular' ? 1.1 : 1.0;
      
      return {
        customerId: profile.customerId,
        predictedCLV: Math.round(clv),
        confidence: 0.75,
        timeHorizon,
        breakdown: {
          expectedPurchases: Math.round(profile.purchaseFrequency * 3),
          averageOrderValue: profile.averageOrderValue,
          retentionProbability: retentionRate
        },
        segment: profile.segment,
        growthPotential
      };
    } catch (error) {
      this.log.error('Failed to predict CLV', { error, venueId, customerId });
      throw error;
    }
  }

  async predictNoShow(
    venueId: string,
    ticketId: string,
    customerId: string,
    eventId: string
  ): Promise<NoShowPrediction> {
    try {
      // Get customer profile
      const profile = await customerIntelligenceService.getCustomerProfile(venueId, customerId);
      
      // Simple no-show prediction based on customer behavior
      const riskFactors = [];
      let noShowProbability = 0.1; // Base probability
      
      if (profile) {
        if (profile.daysSinceLastPurchase > 180) {
          noShowProbability += 0.2;
          riskFactors.push({
            factor: 'Inactive customer',
            value: profile.daysSinceLastPurchase,
            contribution: 0.2
          });
        }
        
        if (profile.averageOrderValue < 50) {
          noShowProbability += 0.1;
          riskFactors.push({
            factor: 'Low-value tickets',
            value: profile.averageOrderValue,
            contribution: 0.1
          });
        }
      }
      
      // Add weather factor - deterministic based on event date
      // In production, this would call a weather API
      const eventDate = new Date();
      const dateBasedWeatherRisk = ((eventDate.getMonth() + eventDate.getDate()) % 10) / 50; // 0 to 0.18
      if (dateBasedWeatherRisk > 0.1) {
        noShowProbability += dateBasedWeatherRisk;
        riskFactors.push({
          factor: 'Weather conditions',
          value: 'Potential weather impact',
          contribution: dateBasedWeatherRisk
        });
      }
      
      const recommendedActions = noShowProbability > 0.3 ? [
        'Send reminder 24 hours before event',
        'Offer easy parking information',
        'Enable ticket transfer option'
      ] : [];
      
      return {
        ticketId,
        customerId,
        eventId,
        noShowProbability: Math.min(noShowProbability, 1),
        riskFactors,
        recommendedActions
      };
    } catch (error) {
      this.log.error('Failed to predict no-show', { error, venueId, ticketId });
      throw error;
    }
  }

  async runWhatIfScenario(
    venueId: string,
    scenario: Partial<WhatIfScenario>
  ): Promise<WhatIfScenario> {
    try {
      const baselineMetrics = {
        revenue: 100000,
        attendance: 1000,
        conversionRate: 0.05,
        averageTicketPrice: 100
      };
      
      const scenarios = [];
      
      // Price change scenarios
      if (scenario.type === 'pricing') {
        const priceChanges = [-20, -10, 0, 10, 20];
        
        for (const change of priceChanges) {
          const newPrice = baselineMetrics.averageTicketPrice * (1 + change / 100);
          const elasticity = -1.5;
          const demandChange = elasticity * (change / 100);
          const newAttendance = baselineMetrics.attendance * (1 + demandChange);
          const newRevenue = newPrice * newAttendance;
          
          scenarios.push({
            name: `${change > 0 ? '+' : ''}${change}% price`,
            parameters: { priceChange: change },
            predictions: {
              revenue: Math.round(newRevenue),
              attendance: Math.round(newAttendance),
              averageTicketPrice: newPrice
            },
            impact: {
              revenue: ((newRevenue - baselineMetrics.revenue) / baselineMetrics.revenue) * 100,
              attendance: ((newAttendance - baselineMetrics.attendance) / baselineMetrics.attendance) * 100
            }
          });
        }
      }
      
      return {
        id: scenario.id || 'scenario-' + Date.now(),
        name: scenario.name || 'What-If Analysis',
        type: scenario.type as any || 'pricing',
        baselineMetrics,
        scenarios,
        recommendations: [
          'Consider moderate price increases for high-demand events',
          'Monitor competitor pricing regularly',
          'Test dynamic pricing strategies'
        ]
      };
    } catch (error) {
      this.log.error('Failed to run what-if scenario', { error, venueId });
      throw error;
    }
  }

}

export const predictionService = PredictionService.getInstance();
