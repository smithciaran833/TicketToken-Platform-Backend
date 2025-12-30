import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { 
  SEMRESATTRS_SERVICE_NAME, 
  SEMRESATTRS_SERVICE_VERSION, 
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT 
} from '@opentelemetry/semantic-conventions';
import { logger } from '../utils/logger';

let sdk: NodeSDK | null = null;

export function initTracing(): void {
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  
  if (!otlpEndpoint && process.env.NODE_ENV === 'production') {
    logger.info('OpenTelemetry tracing disabled - no OTEL_EXPORTER_OTLP_ENDPOINT configured');
    return;
  }

  try {
    const resource = resourceFromAttributes({
      [SEMRESATTRS_SERVICE_NAME]: 'auth-service',
      [SEMRESATTRS_SERVICE_VERSION]: process.env.npm_package_version || '1.0.0',
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
    });

    sdk = new NodeSDK({
      resource,
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-fs': {
            enabled: false,
          },
          '@opentelemetry/instrumentation-http': {
            ignoreIncomingRequestHook: (request) => {
              const ignorePaths = ['/health', '/health/live', '/health/ready', '/health/startup', '/metrics'];
              return ignorePaths.some(path => request.url?.startsWith(path));
            },
          },
        }),
      ],
    });

    sdk.start();
    logger.info('OpenTelemetry tracing initialized');

    process.on('SIGTERM', () => {
      sdk?.shutdown()
        .then(() => logger.info('OpenTelemetry shut down'))
        .catch((error) => logger.error('Error shutting down OpenTelemetry', { error }));
    });
  } catch (error) {
    logger.error('Failed to initialize OpenTelemetry tracing', { error });
  }
}

export function getTracer(name: string = 'auth-service') {
  const { trace } = require('@opentelemetry/api');
  return trace.getTracer(name);
}

export async function shutdownTracing(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    logger.info('OpenTelemetry tracing shut down');
  }
}
