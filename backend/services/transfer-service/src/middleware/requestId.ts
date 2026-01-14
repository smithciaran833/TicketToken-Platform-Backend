import { FastifyInstance, FastifyPluginOptions, DoneFuncWithErrOrRes } from 'fastify';

// Fastify has built-in request ID support via genReqId option
// This middleware is no longer needed but kept for compatibility

function requestIdMiddleware(
  fastify: FastifyInstance,
  _options: FastifyPluginOptions,
  done: DoneFuncWithErrOrRes
): void {
  fastify.addHook('onRequest', (_request, _reply, next) => {
    // Fastify already handles request IDs via the genReqId option
    // This hook is just for any additional logging or processing
    next();
  });
  done();
}

export default requestIdMiddleware;
