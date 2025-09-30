import * as tf from '@tensorflow/tfjs-node';
import { logger } from '../../utils/logger';
import { pgPool } from '../../utils/database';
import { alertService } from '../../services/alert.service';

export class AnomalyDetector {
  private model: tf.LayersModel | null = null;
  private threshold: number = 0.95;
  private historicalData: Map<string, number[]> = new Map();
  
  constructor() {
    this.initializeModel();
  }

  private async initializeModel() {
    try {
      // Create an autoencoder for anomaly detection
      const encoder = tf.sequential({
        layers: [
          tf.layers.dense({ units: 32, activation: 'relu', inputShape: [10] }),
          tf.layers.dense({ units: 16, activation: 'relu' }),
          tf.layers.dense({ units: 8, activation: 'relu' }),
          tf.layers.dense({ units: 4, activation: 'relu' })
        ]
      });

      const decoder = tf.sequential({
        layers: [
          tf.layers.dense({ units: 8, activation: 'relu', inputShape: [4] }),
          tf.layers.dense({ units: 16, activation: 'relu' }),
          tf.layers.dense({ units: 32, activation: 'relu' }),
          tf.layers.dense({ units: 10, activation: 'sigmoid' })
        ]
      });

      // Combine encoder and decoder
      const input = tf.input({ shape: [10] });
      const encoded = encoder.apply(input) as tf.SymbolicTensor;
      const decoded = decoder.apply(encoded) as tf.SymbolicTensor;
      
      this.model = tf.model({ inputs: input, outputs: decoded });
      
      this.model.compile({
        optimizer: 'adam',
        loss: 'meanSquaredError'
      });

      logger.info('Anomaly detection model initialized');
      
      // Start training with historical data
      await this.trainOnHistoricalData();
    } catch (error) {
      logger.error('Failed to initialize anomaly detection model:', error);
    }
  }

  private async trainOnHistoricalData() {
    try {
      // Fetch historical metrics
      const query = `
        SELECT metric_name, value, timestamp
        FROM metrics
        WHERE timestamp > NOW() - INTERVAL '7 days'
        ORDER BY metric_name, timestamp
      `;
      
      const result = await pgPool.query(query);
      
      // Group by metric name
      const metricGroups = new Map<string, number[]>();
      result.rows.forEach(row => {
        if (!metricGroups.has(row.metric_name)) {
          metricGroups.set(row.metric_name, []);
        }
        metricGroups.get(row.metric_name)!.push(parseFloat(row.value));
      });

      // Store historical data
      this.historicalData = metricGroups;
      
      // Train model if we have enough data
      if (result.rows.length > 100) {
        await this.trainModel(metricGroups);
      }
      
      logger.info(`Trained on ${result.rows.length} historical data points`);
    } catch (error) {
      logger.error('Error training on historical data:', error);
    }
  }

  private async trainModel(data: Map<string, number[]>) {
    if (!this.model) return;

    try {
      // Prepare training data
      const trainingData: number[][] = [];
      
      data.forEach((values, metricName) => {
        // Create sliding windows of 10 values
        for (let i = 0; i < values.length - 10; i++) {
          const window = values.slice(i, i + 10);
          const normalized = this.normalizeData(window);
          trainingData.push(normalized);
        }
      });

      if (trainingData.length === 0) return;

      // Convert to tensors
      const xs = tf.tensor2d(trainingData);
      
      // Train the autoencoder to reconstruct normal patterns
      await this.model.fit(xs, xs, {
        epochs: 50,
        batchSize: 32,
        verbose: 0,
        callbacks: {
          onEpochEnd: (epoch, logs) => {
            if (epoch % 10 === 0) {
              logger.debug(`Training epoch ${epoch}, loss: ${logs?.loss}`);
            }
          }
        }
      });

      xs.dispose();
      
      logger.info('Anomaly detection model training complete');
    } catch (error) {
      logger.error('Error training model:', error);
    }
  }

  private normalizeData(values: number[]): number[] {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    return values.map(v => (v - min) / range);
  }

  async detectAnomaly(metricName: string, currentValue: number): Promise<{
    isAnomaly: boolean;
    score: number;
    prediction: number;
    confidence: number;
  }> {
    try {
      // Get historical data for this metric
      const history = this.historicalData.get(metricName) || [];
      
      if (history.length < 10) {
        // Not enough data, use simple statistics
        return this.simpleAnomalyDetection(history, currentValue);
      }

      // Use ML model for detection
      if (this.model) {
        // Prepare input
        const recentValues = [...history.slice(-9), currentValue];
        const normalized = this.normalizeData(recentValues);
        const input = tf.tensor2d([normalized]);
        
        // Get reconstruction
        const reconstruction = this.model.predict(input) as tf.Tensor;
        const reconstructedValues = await reconstruction.array() as number[][];
        
        // Calculate reconstruction error
        const error = this.calculateReconstructionError(normalized, reconstructedValues[0]);
        
        // Determine if it's an anomaly
        const isAnomaly = error > this.threshold;
        const confidence = 1 - error;
        
        // Predict next value
        const prediction = this.predictNextValue(history);
        
        input.dispose();
        reconstruction.dispose();
        
        return {
          isAnomaly,
          score: error,
          prediction,
          confidence
        };
      }

      return this.simpleAnomalyDetection(history, currentValue);
    } catch (error) {
      logger.error('Error detecting anomaly:', error);
      return {
        isAnomaly: false,
        score: 0,
        prediction: currentValue,
        confidence: 0
      };
    }
  }

  private calculateReconstructionError(original: number[], reconstructed: number[]): number {
    const mse = original.reduce((sum, val, i) => {
      const diff = val - reconstructed[i];
      return sum + (diff * diff);
    }, 0) / original.length;
    
    return Math.sqrt(mse);
  }

  private simpleAnomalyDetection(history: number[], currentValue: number) {
    if (history.length === 0) {
      return {
        isAnomaly: false,
        score: 0,
        prediction: currentValue,
        confidence: 0
      };
    }

    const mean = history.reduce((a, b) => a + b, 0) / history.length;
    const stdDev = Math.sqrt(
      history.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / history.length
    );

    const zScore = Math.abs((currentValue - mean) / (stdDev || 1));
    const isAnomaly = zScore > 3; // 3 standard deviations

    return {
      isAnomaly,
      score: zScore / 10, // Normalize to 0-1 range
      prediction: mean,
      confidence: Math.max(0, 1 - (zScore / 10))
    };
  }

  private predictNextValue(history: number[]): number {
    if (history.length < 3) {
      return history[history.length - 1] || 0;
    }

    // Simple linear regression for prediction
    const n = Math.min(history.length, 10);
    const recentHistory = history.slice(-n);
    
    const xSum = (n * (n - 1)) / 2;
    const ySum = recentHistory.reduce((a, b) => a + b, 0);
    const xySum = recentHistory.reduce((sum, y, x) => sum + x * y, 0);
    const xSquaredSum = (n * (n - 1) * (2 * n - 1)) / 6;

    const slope = (n * xySum - xSum * ySum) / (n * xSquaredSum - xSum * xSum);
    const intercept = (ySum - slope * xSum) / n;

    return slope * n + intercept;
  }

  async checkAllMetrics() {
    try {
      // Get latest metrics
      const query = `
        SELECT DISTINCT ON (metric_name) 
          metric_name, value, timestamp
        FROM metrics
        WHERE timestamp > NOW() - INTERVAL '5 minutes'
        ORDER BY metric_name, timestamp DESC
      `;

      const result = await pgPool.query(query);
      
      for (const row of result.rows) {
        const detection = await this.detectAnomaly(row.metric_name, parseFloat(row.value));
        
        if (detection.isAnomaly) {
          logger.warn(`🚨 Anomaly detected in ${row.metric_name}: value=${row.value}, expected=${detection.prediction.toFixed(2)}, confidence=${(detection.confidence * 100).toFixed(1)}%`);
          
          // Create alert
          await this.createAnomalyAlert(row.metric_name, row.value, detection);
        }
      }
    } catch (error) {
      logger.error('Error checking metrics for anomalies:', error);
    }
  }

  private async createAnomalyAlert(metricName: string, value: number, detection: any) {
    try {
      const alert = {
        title: `Anomaly Detected: ${metricName}`,
        description: `Unusual pattern detected. Current: ${value}, Expected: ${detection.prediction.toFixed(2)}`,
        severity: detection.score > 5 ? 'critical' : 'warning',
        state: 'firing',
        labels: {
          type: 'anomaly',
          metric: metricName,
          ml_confidence: detection.confidence
        }
      };

      // Store alert in database
      await pgPool.query(
        `INSERT INTO alerts (title, description, severity, state, started_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [alert.title, alert.description, alert.severity, alert.state]
      );

      logger.info(`Created anomaly alert for ${metricName}`);
    } catch (error) {
      logger.error('Error creating anomaly alert:', error);
    }
  }
}

export const anomalyDetector = new AnomalyDetector();
