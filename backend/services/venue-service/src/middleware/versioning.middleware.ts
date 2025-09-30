import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';

interface VersionConfig {
  current: string;
  supported: string[];
  deprecated: string[];
  sunset: { [version: string]: Date };
}

const versionConfig: VersionConfig = {
  current: 'v1',
  supported: ['v1'],
  deprecated: [],
  sunset: {}
};

export function versionMiddleware(request: FastifyRequest, reply: FastifyReply, done: () => void) {
  // Extract version from URL path or header
  const pathMatch = request.url.match(/\/api\/(v\d+)\//);
  const headerVersion = request.headers?.['api-version'] as string;
  const acceptVersion = request.headers?.['accept-version'] as string;

  // Priority: URL path > api-version header > accept-version header
  const version = pathMatch?.[1] || headerVersion || acceptVersion || versionConfig.current;

  // Check if version is supported
  if (!versionConfig.supported.includes(version)) {
    reply.status(400).send({
      success: false,
      error: `API version ${version} is not supported`,
      code: 'UNSUPPORTED_VERSION',
      details: {
        current: versionConfig.current,
        supported: versionConfig.supported
      }
    });
    return;
  }

  // Warn if using deprecated version
  if (versionConfig.deprecated.includes(version)) {
    const sunsetDate = versionConfig.sunset[version];
    reply.header('Deprecation', 'true');
    reply.header('Sunset', sunsetDate?.toISOString() || 'TBD');
    logger.warn({
      version,
      requestId: request.id,
      sunsetDate
    }, 'Deprecated API version used');
  }

  // Add version to request context
  (request as any).apiVersion = version;

  // Add version headers to response
  reply.header('API-Version', version);
  reply.header('X-API-Version', version);

  done();
}

// Helper to register versioned routes
export function registerVersionedRoute(
  fastify: any,
  versions: string[],
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  path: string,
  handler: any,
  options?: any
) {
  versions.forEach(version => {
    const versionedPath = `/api/${version}${path}`;
    fastify[method.toLowerCase()](versionedPath, options || {}, handler);
  });
}
