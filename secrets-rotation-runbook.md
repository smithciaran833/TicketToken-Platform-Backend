# Secrets Rotation Runbook

## When to Rotate
- Immediately if any secret is exposed
- Every 90 days for compliance
- When team members leave
- After security incidents

## Rotation Procedure

### 1. Database Password Rotation

Generate new password:
NEW_PASS=$(openssl rand -base64 32)

Update .env file:
sed -i "s/POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$NEW_PASS/" .env

Update running database (if needed):
docker-compose exec postgres psql -U postgres -c "ALTER USER postgres PASSWORD '$NEW_PASS';"

Restart services:
docker-compose down
docker-compose up -d

### 2. JWT Secret Rotation

Generate new secrets:
NEW_ACCESS=$(openssl rand -base64 32)
NEW_REFRESH=$(openssl rand -base64 32)

Update .env:
sed -i "s/JWT_ACCESS_SECRET=.*/JWT_ACCESS_SECRET=$NEW_ACCESS/" .env
sed -i "s/JWT_REFRESH_SECRET=.*/JWT_REFRESH_SECRET=$NEW_REFRESH/" .env

Note: This will invalidate all existing sessions - users will need to log in again

### 3. Service Restart Order
1. Database services first (Postgres, Redis, RabbitMQ)
2. Core services (Auth, Venue, Event)
3. Dependent services (Ticket, Payment, Notification)
4. API Gateway last

### 4. Verification Steps
- Check all services are healthy: docker-compose ps
- Test authentication: curl http://localhost:3001/health
- Verify database connection: docker-compose exec postgres pg_isready
- Check logs for errors: docker-compose logs --tail=50

### 5. Rollback Plan
If rotation fails:
1. Keep old .env.backup file before rotation
2. Restore: cp .env.backup .env
3. Restart all services: docker-compose restart
