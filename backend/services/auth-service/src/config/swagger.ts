export const swaggerOptions = {
  openapi: {
    info: {
      title: 'TicketToken Auth Service API',
      description: 'Authentication and authorization service for the TicketToken platform',
      version: '1.0.0'
    },
    servers: [
      {
        url: process.env.AUTH_SERVICE_URL || 'http://auth-service:3001',
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http' as const,
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    tags: [
      { name: 'auth', description: 'Authentication endpoints' },
      { name: 'mfa', description: 'Multi-factor authentication' },
      { name: 'roles', description: 'Role management' }
    ]
  }
};

export const swaggerUiOptions = {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'list' as const,
    deepLinking: true
  },
  staticCSP: true,
  transformStaticCSP: (header: string) => header
};
