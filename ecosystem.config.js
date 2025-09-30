// WP-12 Phase 6: PM2 Configuration for Auto-Recovery

module.exports = {
  apps: [
    {
      name: 'api-gateway',
      script: './backend/services/api-gateway/index.js',
      instances: 2,
      exec_mode: 'cluster',
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '500M',
      error_file: './logs/pm2/gateway-error.log',
      out_file: './logs/pm2/gateway-out.log',
      autorestart: true,
      watch: false,
      exp_backoff_restart_delay: 100,
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    },
    {
      name: 'auth-service',
      script: './backend/services/auth-service/index.js',
      instances: 1,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '300M',
      error_file: './logs/pm2/auth-error.log',
      out_file: './logs/pm2/auth-out.log',
      autorestart: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      }
    },
    {
      name: 'payment-service',
      script: './backend/services/payment-service/index.js',
      instances: 2,
      exec_mode: 'cluster',
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '400M',
      error_file: './logs/pm2/payment-error.log',
      out_file: './logs/pm2/payment-out.log',
      autorestart: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3004
      }
    },
    {
      name: 'scanning-service',
      script: './backend/services/scanning-service/index.js',
      instances: 2,
      exec_mode: 'cluster',
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '300M',
      error_file: './logs/pm2/scanning-error.log',
      out_file: './logs/pm2/scanning-out.log',
      autorestart: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3005
      }
    },
    {
      name: 'service-guardian',
      script: './backend/scripts/service-guardian.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '100M',
      error_file: './logs/pm2/guardian-error.log',
      out_file: './logs/pm2/guardian-out.log',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
