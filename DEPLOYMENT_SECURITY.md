# Secure Deployment Configuration Guide

## Production Environment Variables

### Required Secrets (Must Be Set)

```bash
# Node Environment
NODE_ENV=production

# Authentication
JWT_SECRET=<generate-32-char-random-string>
JWT_REFRESH_SECRET=<generate-32-char-random-string-different-from-above>
DATA_ENCRYPTION_KEY=<generate-32-char-random-string>

# Database
DATABASE_URL=postgresql://user:password@host:5432/cmms
# OR for individual config:
DB_HOST=your-db-host
DB_PORT=5432
DB_USER=your-db-user
DB_PASSWORD=<strong-database-password>
DB_SSL=true

# Security
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
FRONTEND_URL=https://yourdomain.com
TRUST_PROXY_HOPS=1

# SMTP (if using email features)
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASS=<strong-smtp-password>
SMTP_FROM=noreply@yourdomain.com
```

### Optional but Recommended

```bash
# Admin Accounts (if needed)
ROOT_ADMIN_EMAIL=admin@yourdomain.com
ROOT_ADMIN_PASSWORD=<strong-password-min-12-chars>

# Alerts
SECURITY_ALERT_EMAILS=security@yourdomain.com
SECURITY_TEAM_USER_IDS=<user-ids-for-security-alerts>
```

## Generating Secure Secrets

### Linux/macOS
```bash
# Generate 32-character random string
openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32
```

### Windows (PowerShell)
```powershell
# Generate 32-character random string
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::Create().GetBytes(16)) -replace '[+=]', '' | Select-Object -First 32
```

## Container Security (Docker/Kubernetes)

### Docker Compose (Production)
```yaml
version: '3.8'
services:
  backend:
    environment:
      - NODE_ENV=production
      - JWT_SECRET=${JWT_SECRET}
      - JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
      - DATA_ENCRYPTION_KEY=${DATA_ENCRYPTION_KEY}
      - TRUST_PROXY_HOPS=1
      - CORS_ORIGINS=${CORS_ORIGINS}
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp:size=10M,mode=1777
    cap_drop:
      - ALL
```

### Kubernetes Secrets
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: cmms-secrets
type: Opaque
stringData:
  JWT_SECRET: <generated-secret>
  JWT_REFRESH_SECRET: <generated-secret>
  DATA_ENCRYPTION_KEY: <generated-secret>
  DB_PASSWORD: <db-password>
```

## Load Balancer Configuration

### Nginx (Production)
```nginx
upstream cmms_backend {
    server backend:3001;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://cmms_backend;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
    }
}
```

### AWS ALB Security
1. Enable WAF on ALB
2. Create rules to block:
   - SQL injection patterns
   - XSS patterns
   - Common attack vectors
3. Enable access logs
4. Configure health checks

## Database Security

### PostgreSQL SSL Configuration
```sql
-- Enable SSL
ALTER SYSTEM SET ssl = on;
ALTER SYSTEM SET ssl_cert_file = '/path/to/server.crt';
ALTER SYSTEM SET ssl_key_file = '/path/to/server.key';

-- Force SSL for all connections
ALTER SYSTEM SET pg_hba.conf = 'host all all 0.0.0.0/0 scram-sha-256 ssl';
```

### Recommended Database Settings
- Enable SSL/TLS
- Use strong authentication (SCRAM-SHA-256)
- Enable audit logging
- Restrict network access
- Regular security updates

## Monitoring & Alerting

### Security Event Types to Monitor
- AUTH_LOGIN_FAILED (threshold: 5 in 10 minutes)
- AUTH_ACCOUNT_LOCKED (threshold: 1)
- AUTH_AUTO_ROLE_ASSIGNED (threshold: 1)
- AUTHZ_PERMISSION_DENIED (threshold: 10 in 5 minutes)
- AUTH_TOKEN_VERIFICATION_FAILED (threshold: 5 in 5 minutes)

### Recommended Alert Channels
- Email for critical events
- Slack/PagerDuty for high-severity events
- SIEM integration for correlation

## SSL/TLS Configuration

### Required Security Headers (via Helmet)
```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

### Recommended CSP (Content Security Policy)
```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
connect-src 'self' https://yourdomain.com;
font-src 'self';
```

## Backup & Recovery

### Encrypted Backups
```bash
# Create encrypted backup
pg_dump -U postgres cmms | gzip | openssl enc -aes-256-cbc -salt -out backup.sql.gz.enc

# Restore encrypted backup
openssl enc -aes-256-cbc -d -in backup.sql.gz.enc | gunzip | psql -U postgres cmms
```

---

## Quick Start Checklist

1. [ ] Generate all required secrets
2. [ ] Configure environment variables
3. [ ] Set NODE_ENV=production
4. [ ] Configure CORS_ORIGINS
5. [ ] Set TRUST_PROXY_HOPS=1
6. [ ] Enable database SSL
7. [ ] Configure load balancer SSL
8. [ ] Set up monitoring alerts
9. [ ] Test rate limiting
10. [ ] Verify security headers
11. [ ] Run security tests: `npm run test`
12. [ ] Audit dependencies: `npm run security:audit`

---

Last Updated: 2026-05-12