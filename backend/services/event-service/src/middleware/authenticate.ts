import { FastifyRequest, FastifyReply } from 'fastify';

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const token = request.headers.authorization;
  if (!token) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
  // Add actual JWT verification here
}
