const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { defaultResource, resourceFromAttributes } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');
const { BatchSpanProcessor, ConsoleSpanExporter } = require('@opentelemetry/sdk-trace-base');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
const { B3Propagator, B3InjectEncoding } = require('@opentelemetry/propagator-b3');
const opentelemetry = require('@opentelemetry/api');

class TracingService {
  constructor(serviceName) {
    this.serviceName = serviceName;
    this.tracer = null;
    this.provider = null;
  }

  initialize(options = {}) {
    // Get the default resource (it's a function that returns a resource)
    const defResource = defaultResource();
    
    // Create service-specific resource
    const serviceResource = resourceFromAttributes({
      [SemanticResourceAttributes.SERVICE_NAME]: this.serviceName,
      [SemanticResourceAttributes.SERVICE_VERSION]: process.env.SERVICE_VERSION || '1.0.0',
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
    });

    // Merge resources if merge is available, otherwise just use service resource
    let resource;
    if (defResource && typeof defResource.merge === 'function') {
      resource = defResource.merge(serviceResource);
    } else {
      // Just use the service resource if merge isn't available
      resource = serviceResource;
    }

    // Create tracer provider
    this.provider = new NodeTracerProvider({
      resource: resource,
    });

    // Configure exporters
    const exporters = [];

    // Always use console exporter in development
    if (process.env.NODE_ENV !== 'production') {
      exporters.push(new ConsoleSpanExporter());
    }

    // Add Jaeger exporter if configured
    if (process.env.JAEGER_ENDPOINT || options.jaegerEndpoint) {
      try {
        const jaegerExporter = new JaegerExporter({
          endpoint: options.jaegerEndpoint || process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
        });
        exporters.push(jaegerExporter);
      } catch (error) {
        console.log('Jaeger exporter not configured:', error.message);
      }
    }

    // Add span processors
    exporters.forEach(exporter => {
      this.provider.addSpanProcessor(new BatchSpanProcessor(exporter));
    });

    // Set global propagator for trace context
    opentelemetry.propagation.setGlobalPropagator(
      new B3Propagator({ injectEncoding: B3InjectEncoding.MULTI_HEADER })
    );

    // Register the provider
    this.provider.register();

    // Register auto-instrumentations
    this.registerInstrumentations();

    // Get tracer for manual instrumentation
    this.tracer = opentelemetry.trace.getTracer(this.serviceName);

    console.log(`🔍 Tracing initialized for ${this.serviceName}`);
    return this.tracer;
  }

  registerInstrumentations() {
    try {
      registerInstrumentations({
        instrumentations: [
          // HTTP instrumentation
          new HttpInstrumentation({
            requestHook: (span, request) => {
              span.setAttributes({
                'custom.service': this.serviceName,
              });
            },
            ignoreIncomingPaths: ['/health', '/ready', '/metrics'],
          }),
          
          // Express instrumentation
          new ExpressInstrumentation({
            requestHook: (span, { request }) => {
              if (request.route?.path) {
                span.updateName(`${request.method} ${request.route.path}`);
              }
            },
          }),
        ],
      });
    } catch (error) {
      console.log('Auto-instrumentation setup error:', error.message);
    }
  }

  // Create middleware for Express
  middleware() {
    return (req, res, next) => {
      const span = this.tracer.startSpan(`${req.method} ${req.path}`, {
        kind: opentelemetry.SpanKind.SERVER,
        attributes: {
          'http.method': req.method,
          'http.url': req.url,
          'http.target': req.path,
          'http.host': req.hostname,
          'request.id': req.requestId,
        },
      });

      // Store span in request for manual instrumentation
      req.span = span;
      
      // Extract or generate trace ID
      const spanContext = span.spanContext();
      const traceId = spanContext.traceId;
      req.traceId = traceId;
      res.setHeader('X-Trace-Id', traceId);

      // End span when response is finished
      const originalEnd = res.end;
      res.end = function(...args) {
        span.setAttributes({
          'http.status_code': res.statusCode,
        });

        if (res.statusCode >= 400) {
          span.setStatus({
            code: opentelemetry.SpanStatusCode.ERROR,
            message: `HTTP ${res.statusCode}`,
          });
        }

        span.end();
        return originalEnd.apply(res, args);
      };

      next();
    };
  }

  // Helper to create child spans
  startSpan(name, options = {}) {
    return this.tracer.startSpan(name, options);
  }

  // Helper to add event to current span
  addEvent(name, attributes = {}) {
    const span = opentelemetry.trace.getActiveSpan();
    if (span) {
      span.addEvent(name, attributes);
    }
  }

  // Helper to set attributes on current span
  setAttributes(attributes) {
    const span = opentelemetry.trace.getActiveSpan();
    if (span) {
      span.setAttributes(attributes);
    }
  }

  // Wrap async function with span
  async withSpan(name, fn, options = {}) {
    const span = this.tracer.startSpan(name, options);
    const context = opentelemetry.trace.setSpan(opentelemetry.context.active(), span);
    
    try {
      const result = await opentelemetry.context.with(context, fn);
      span.setStatus({ code: opentelemetry.SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: opentelemetry.SpanStatusCode.ERROR,
        message: error.message,
      });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  }

  // Shutdown tracing
  async shutdown() {
    try {
      await this.provider.shutdown();
      console.log('Tracing terminated');
    } catch (error) {
      console.error('Error shutting down tracing', error);
    }
  }
}

// Export singleton instance per service
let tracingInstance = null;

function initializeTracing(serviceName, options = {}) {
  if (!tracingInstance) {
    tracingInstance = new TracingService(serviceName);
    tracingInstance.initialize(options);
  }
  return tracingInstance;
}

module.exports = {
  TracingService,
  initializeTracing,
  opentelemetry,
};
