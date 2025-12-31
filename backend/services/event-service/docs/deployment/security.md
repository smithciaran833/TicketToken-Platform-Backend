# Deployment Security Guidelines

## Overview

This document outlines security best practices for deploying the event-service in production environments. These guidelines help ensure the service runs with minimal attack surface and follows the principle of least privilege.

**AUDIT FIX (K8S-SEC)**: Kubernetes security configuration documented.

---

## Kubernetes Security Configuration

### Read-Only Root Filesystem

**CRITICAL**: Always run containers with a read-only root filesystem in production to prevent:
- Malicious file writes
- Runtime binary modifications
- Persistence mechanisms

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: event-service
spec:
  containers:
    - name: event-service
      image: event-service:latest
      securityContext:
        # AUDIT FIX (K8S-RO): Read-only root filesystem
        readOnlyRootFilesystem: true
        runAsNonRoot: true
        runAsUser: 1001
        runAsGroup: 1001
        allowPrivilegeEscalation: false
        capabilities:
          drop:
            - ALL
      volumeMounts:
        # Temp directory for runtime needs (logs, tmp files)
        - name: tmp-volume
          mountPath: /tmp
        # Node.js needs a writable cache directory
        - name: cache-volume
          mountPath: /home/nodejs/.npm
  volumes:
    - name: tmp-volume
      emptyDir:
        medium: Memory
        sizeLimit: 64Mi
    - name: cache-volume
      emptyDir:
        sizeLimit: 128Mi
```

### Complete Security Context

```yaml
securityContext:
  # Pod-level security context
  fsGroup: 1001
  seccompProfile:
    type: RuntimeDefault

containers:
  - name: event-service
    securityContext:
      # Container-level security context
      readOnlyRootFilesystem: true
      runAsNonRoot: true
      runAsUser: 1001
      runAsGroup: 1001
      allowPrivilegeEscalation: false
      privileged: false
      capabilities:
        drop:
          - ALL
```

---

## Network Policies

Restrict network traffic to only what's necessary:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: event-service-network-policy
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: event-service
  policyTypes:
    - Ingress
    - Egress
  ingress:
    # Allow traffic from API gateway
    - from:
        - podSelector:
            matchLabels:
              app: api-gateway
      ports:
        - port: 3003
    # Allow traffic from other internal services
    - from:
        - namespaceSelector:
            matchLabels:
              environment: production
        - podSelector:
            matchLabels:
              type: internal-service
      ports:
        - port: 3003
  egress:
    # Allow DNS
    - to:
        - namespaceSelector: {}
          podSelector:
            matchLabels:
              k8s-app: kube-dns
      ports:
        - port: 53
          protocol: UDP
    # Allow PostgreSQL
    - to:
        - podSelector:
            matchLabels:
              app: postgresql
      ports:
        - port: 5432
    # Allow Redis
    - to:
        - podSelector:
            matchLabels:
              app: redis
      ports:
        - port: 6379
    # Allow outbound to venue-service
    - to:
        - podSelector:
            matchLabels:
              app: venue-service
      ports:
        - port: 3002
```

---

## Pod Security Standards

Use Kubernetes Pod Security Standards (PSS) at the namespace level:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: production
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

---

## Resource Limits

Always set resource limits to prevent resource exhaustion attacks:

```yaml
resources:
  limits:
    cpu: "1"
    memory: "512Mi"
    ephemeral-storage: "256Mi"
  requests:
    cpu: "250m"
    memory: "256Mi"
```

---

## Service Account Security

Create a dedicated service account with minimal permissions:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: event-service
  namespace: production
automountServiceAccountToken: false  # Disable unless needed

---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: event-service-role
  namespace: production
rules:
  - apiGroups: [""]
    resources: ["configmaps"]
    resourceNames: ["event-service-config"]
    verbs: ["get"]
```

---

## Secret Management

### Using External Secrets Operator

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: event-service-secrets
  namespace: production
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-manager
    kind: ClusterSecretStore
  target:
    name: event-service-secrets
    creationPolicy: Owner
  data:
    - secretKey: DATABASE_URL
      remoteRef:
        key: event-service/database
        property: url
    - secretKey: JWT_SECRET
      remoteRef:
        key: event-service/jwt
        property: secret
```

### Never Hardcode Secrets

- ❌ Never put secrets in ConfigMaps
- ❌ Never put secrets in Dockerfile
- ❌ Never commit secrets to git
- ✅ Use Kubernetes Secrets
- ✅ Use external secret management (AWS Secrets Manager, HashiCorp Vault)
- ✅ Rotate secrets regularly (see key-rotation.md)

---

## Image Security

### Use Specific Image Digests

```yaml
# Bad - mutable tag
image: event-service:latest

# Good - immutable digest
image: event-service@sha256:1a526b9b6c18b2c5e4f1e0c33f4e4d8a7b3c9f...
```

### Scan Images for Vulnerabilities

```bash
# Using Trivy
trivy image event-service:latest

# Using Snyk
snyk container test event-service:latest
```

### Use Distroless or Minimal Base Images

```dockerfile
# Use Alpine for smaller attack surface
FROM node:20-alpine

# Even better - distroless (requires static build)
FROM gcr.io/distroless/nodejs20-debian11
```

---

## Monitoring & Alerting

### Security-Related Metrics to Monitor

1. **Failed authentication attempts**
   - Alert on > 10 failures in 5 minutes

2. **Rate limit hits**
   - Alert on sustained rate limiting

3. **Error rate spikes**
   - Alert on > 5% error rate

4. **Unauthorized access attempts**
   - Alert on any 403 from internal services

### Audit Logging

Ensure all security-relevant events are logged:
- Authentication failures
- Authorization denials
- Admin actions
- Data access patterns

---

## Checklist

Before deploying to production:

- [ ] Read-only root filesystem enabled
- [ ] Non-root user configured
- [ ] No privilege escalation allowed
- [ ] All capabilities dropped
- [ ] Network policies in place
- [ ] Resource limits set
- [ ] Secrets externalized
- [ ] Image from trusted registry
- [ ] Image scanned for vulnerabilities
- [ ] Service account with minimal permissions
- [ ] Pod Security Standards enforced
- [ ] Monitoring and alerting configured

---

## References

- [Kubernetes Security Best Practices](https://kubernetes.io/docs/concepts/security/overview/)
- [Pod Security Standards](https://kubernetes.io/docs/concepts/security/pod-security-standards/)
- [CIS Kubernetes Benchmark](https://www.cisecurity.org/benchmark/kubernetes)
- [NSA/CISA Kubernetes Hardening Guide](https://media.defense.gov/2022/Aug/29/2003066362/-1/-1/0/CTR_KUBERNETES_HARDENING_GUIDANCE_1.2_20220829.PDF)
