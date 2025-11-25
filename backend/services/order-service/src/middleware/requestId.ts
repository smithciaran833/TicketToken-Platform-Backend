import { FastifyInstance, FastifyPluginOptions, DoneFuncWithErrOrRes } from 'fastify';

// Fastify has built-in request ID support via genReqId option
// This middleware is no longer needed but kept for compatibility

function requestIdMiddleware(
  fastify: FastifyInstance,
  options: FastifyPluginOptions,
  done: DoneFuncWithErrOrRes
): void {
  fastify.addHook('onRequest', (request, reply, next) => {
    // Fastify already handles request IDs
    next();
  });
  done();
}

export default requestIdMiddleware;
