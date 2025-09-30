const fs = require('fs');

const filePath = 'backend/services/auth-service/src/index.ts';
let content = fs.readFileSync(filePath, 'utf8');

// Add rate limiting imports at the top
const importsToAdd = `import { RateLimiterMemory } from 'rate-limiter-flexible';

// Rate limiter configuration
const loginRateLimiter = new RateLimiterMemory({
  points: 5, // 5 attempts
  duration: 900, // per 15 minutes
  blockDuration: 900, // block for 15 minutes
});
`;

// Add after the imports section
content = content.replace(
  'const app = express();',
  importsToAdd + '\nconst app = express();'
);

// Update the login endpoint to include rate limiting
const updatedLoginEndpoint = `// FIXED Login endpoint with validation and rate limiting
app.post('/auth/login', async (req, res) => {
  try {
    // Rate limiting check
    const ip = req.ip || 'unknown';
    try {
      await loginRateLimiter.consume(ip);
    } catch (rateLimitError) {
      return res.status(429).json({
        success: false,
        error: 'Too many login attempts. Please try again later.'
      });
    }

    // Validate input using Joi
    const { error, value } = loginSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });`;

content = content.replace(
  '// FIXED Login endpoint with validation\napp.post(\'/auth/login\', async (req, res) => {\n  try {\n    // Validate input using Joi\n    const { error, value } = loginSchema.validate(req.body, {',
  updatedLoginEndpoint.split('    const { error, value } = loginSchema.validate(req.body, {')[0] + '    const { error, value } = loginSchema.validate(req.body, {'
);

fs.writeFileSync(filePath, content);
console.log('Added rate limiting to login endpoint');
