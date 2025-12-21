# Documentation Standards for Production Systems
## Comprehensive Audit Guide

**Version:** 1.0  
**Last Updated:** December 2025  
**Purpose:** Standards, best practices, and audit checklists for production system documentation

---

## Table of Contents

1. [Standards & Best Practices](#1-standards--best-practices)
   - [API Documentation (OpenAPI/Swagger)](#11-api-documentation-openapiswagger)
   - [Architecture Documentation (ADRs, C4 Diagrams)](#12-architecture-documentation-adrs-c4-diagrams)
   - [Runbooks for Operations](#13-runbooks-for-operations)
   - [Incident Response Documentation](#14-incident-response-documentation)
   - [Onboarding Documentation](#15-onboarding-documentation)
   - [README Standards](#16-readme-standards)
   - [Code Documentation](#17-code-documentation-when-and-how-much)
   - [Environment Variables Documentation](#18-environment-variables-documentation)
2. [Common Vulnerabilities & Mistakes](#2-common-vulnerabilities--mistakes)
3. [Audit Checklists](#3-audit-checklists)
4. [Sources & References](#4-sources--references)

---

## 1. Standards & Best Practices

### 1.1 API Documentation (OpenAPI/Swagger)

API documentation is critical for developer adoption and integration success. According to a 2024 Swagger survey, 80% of developers indicated that better documentation reduced onboarding time and increased productivity.

#### Design-First vs Code-First Approach

The OpenAPI Initiative strongly recommends Design-First approach where the API specification is written before implementation. This ensures the API can be fully described with OpenAPI and prevents the need for workarounds later.

**Source:** [OpenAPI Best Practices](https://learn.openapis.org/best-practices.html)

#### Required OpenAPI Components

| Component | Purpose | Required |
|-----------|---------|----------|
| `openapi` | Specification version | ✅ Yes |
| `info` | API title, version, description | ✅ Yes |
| `servers` | Server URLs (avoid localhost defaults) | ✅ Yes |
| `paths` | All endpoints with operations | ✅ Yes |
| `components/schemas` | Reusable data models | ✅ Yes |
| `security` | Authentication requirements | ✅ Yes |
| `operationId` | Unique ID for each operation | ✅ Yes |
| `tags` | Logical grouping of endpoints | Recommended |
| `examples` | Request/response examples | Recommended |

**Source:** [APIMatic - 14 Best Practices for OpenAPI](https://www.apimatic.io/blog/2022/11/14-best-practices-to-write-openapi-for-better-api-consumption)

#### Best Practices

1. **Specify servers property**: Never leave empty; defaults to localhost in tools
2. **Use operationId**: Unique identifier for code generation and tooling
3. **Add descriptions everywhere**: Endpoints, parameters, schemas, responses
4. **Include examples**: Non-empty examples for parameters and responses
5. **Document security requirements**: OAuth2, API keys, JWT at global and operation level
6. **Use $ref for reusability**: Define schemas in components, reference everywhere
7. **Order parameters**: Required parameters first, then optional
8. **Keep documentation synchronized**: Automate generation from code annotations

**Source:** [Swagger Blog - Best Practices in API Documentation](https://swagger.io/blog/api-documentation/best-practices-in-api-documentation/)

#### Recommended Tools

- **Swagger UI**: Interactive documentation from OpenAPI specs
- **Redocly**: Beautiful API reference documentation
- **Stoplight**: Design-first API development platform
- **Postman**: API testing and documentation

**Source:** [Daily.dev - API Documentation Best Practices](https://daily.dev/blog/api-documentation-best-practices-11-tips-for-2024)

---

### 1.2 Architecture Documentation (ADRs, C4 Diagrams)

#### Architecture Decision Records (ADRs)

An ADR captures a single architectural decision and its rationale. According to AWS, teams spend 20-30% of their time coordinating with other teams, and ADRs help reduce this overhead by providing clear decision history.

**Source:** [AWS Architecture Blog - Master ADRs](https://aws.amazon.com/blogs/architecture/master-architecture-decision-records-adrs-best-practices-for-effective-decision-making/)

#### ADR Template (MADR Format)

```markdown
# ADR-NNNN: [Short Title]

## Status
[Proposed | Accepted | Deprecated | Superseded by ADR-XXXX]

## Context
What is the issue that we're seeing that is motivating this decision?

## Decision
What is the change that we're proposing and/or doing?

## Consequences
What becomes easier or more difficult because of this change?

## Alternatives Considered
What other options were evaluated?
```

**Source:** [ADR GitHub Organization](https://adr.github.io/)

#### ADR Best Practices

1. **One decision per ADR**: Keep each record focused on a single decision
2. **Start early**: Begin ADRs at project inception, not retrospectively
3. **Store with code**: Keep ADRs in a `docs/decisions/` directory in version control
4. **Include confidence level**: Document certainty about the decision
5. **Review monthly**: Compare decisions with actual outcomes
6. **Centralize storage**: Make ADRs accessible to all project members
7. **Use readout meetings**: 10-15 minutes of silent reading before discussion
8. **Keep participant list lean**: Below 10 people for efficient decision-making

**Sources:**
- [Microsoft Azure - Maintain an ADR](https://learn.microsoft.com/en-us/azure/well-architected/architect-role/architecture-decision-record)
- [Google Cloud - ADR Overview](https://docs.cloud.google.com/architecture/architecture-decision-records)
- [TechTarget - 8 Best Practices for ADRs](https://www.techtarget.com/searchapparchitecture/tip/4-best-practices-for-creating-architecture-decision-records)

#### What to Document in ADRs

- Technology choices (frameworks, databases, languages)
- Non-functional requirements (security, scalability, performance)
- Integration patterns
- Infrastructure decisions (cloud services, deployment strategies)
- Breaking changes and migrations

**Source:** [AWS Prescriptive Guidance - ADR Process](https://docs.aws.amazon.com/prescriptive-guidance/latest/architectural-decision-records/adr-process.html)

---

#### C4 Model for Architecture Diagrams

The C4 model, created by Simon Brown, provides a hierarchical approach to visualizing software architecture at four levels of abstraction.

**Source:** [C4 Model Official Site](https://c4model.com/)

#### The Four C4 Levels

| Level | Diagram | Audience | Purpose |
|-------|---------|----------|---------|
| 1 | Context | All stakeholders | System boundaries and external interactions |
| 2 | Container | Technical stakeholders | Major technology choices and data flows |
| 3 | Component | Developers | Internal structure of containers |
| 4 | Code | Developers | Class-level detail (optional) |

**Most teams only need Levels 1 and 2.**

**Source:** [C4 Model - Diagrams](https://c4model.com/diagrams)

#### C4 Best Practices

1. **Keep diagrams simple**: Avoid cluttering with unnecessary detail
2. **Use consistent notation**: Same shapes and colors across all diagrams
3. **Include legends**: Document what each symbol means
4. **Add descriptive text**: Each element needs name, type, technology, and description
5. **Keep diagrams updated**: Review when architecture changes
6. **Store as code**: Use tools like Structurizr, PlantUML, or Mermaid

**Sources:**
- [InfoQ - The C4 Model for Software Architecture](https://www.infoq.com/articles/C4-architecture-model/)
- [Miro - C4 Model Guide](https://miro.com/diagramming/c4-model-for-software-architecture/)

---

### 1.3 Runbooks for Operations

Runbooks are operational procedures that guide teams through routine maintenance and incident response. They reduce mean time to resolve (MTTR) by providing proven recovery paths.

**Source:** [Squadcast - Runbook Template](https://www.squadcast.com/sre-best-practices/runbook-template)

#### Runbook Structure Template

```markdown
# Runbook: [Title]

## Metadata
- **Service**: [Service name]
- **Owner**: [Team/Person]
- **Last Updated**: [Date]
- **Severity**: [P1/P2/P3]

## Trigger
What alert or condition triggers this runbook?

## Impact Assessment
- Systems affected
- User impact
- Business impact

## Prerequisites
- Required access/permissions
- Tools needed
- Dashboard links

## Procedure
1. [Step 1 with expected outcome]
2. [Step 2 with expected outcome]
3. ...

## Verification
How to confirm the issue is resolved

## Rollback
Steps to revert if the fix fails

## Escalation
- Who to contact if runbook fails
- When to escalate
```

**Source:** [TechTarget - SRE Documentation Best Practices](https://www.techtarget.com/searchitoperations/tip/An-introduction-to-SRE-documentation-best-practices)

#### Required Runbooks by Category

**Infrastructure:**
- Service restart procedures
- Database failover
- Cache flush procedures
- Disk space cleanup
- Certificate renewal
- DNS changes

**Application:**
- Deploy/rollback procedures
- Feature flag toggling
- Configuration changes
- Log level adjustment
- Health check failures

**Data:**
- Backup restoration
- Data migration
- Database maintenance
- Queue purging

**Security:**
- API key rotation
- Secret rotation
- Access revocation
- Security incident response

**Source:** [Nobl9 - Runbook Best Practices Guide](https://www.nobl9.com/it-incident-management/runbook-example)

#### Runbook Best Practices

1. **Codify every action**: Don't perform manual steps; script everything
2. **Include verification steps**: How to confirm each step succeeded
3. **Provide rollback procedures**: Every runbook needs an undo path
4. **Link to dashboards**: Include direct links to monitoring and logs
5. **Test regularly**: Runbooks must be validated before incidents
6. **Automate where possible**: Move from manual to semi-automated to fully automated
7. **Keep them discoverable**: Link runbooks directly from alerts
8. **Update after incidents**: Post-mortem learnings should update runbooks

**Sources:**
- [Medium/Fylamynt - What is a Runbook](https://medium.com/fylamynt/what-is-a-runbook-and-what-would-an-sre-do-with-it-ac355a46307d)
- [SolarWinds - Runbook Automation](https://www.solarwinds.com/sre-best-practices/runbook-automation)
- [Atlassian - DevOps Runbook Template](https://www.atlassian.com/software/confluence/templates/devops-runbook)

---

### 1.4 Incident Response Documentation

#### Incident Response Plan Components

An incident response plan defines processes for responding to, resolving, and learning from incidents. According to NIST, organizations with tested incident response plans save an average of $2.66 million per data breach.

**Source:** [Concertium - NIST Incident Response Playbook](https://concertium.com/nist-incident-response-playbook-template/)

#### Required Documentation

1. **Incident Response Policy**: Foundation document with governance and rules
2. **Incident Response Plan**: Operational guidebook for handling incidents
3. **Incident Response Playbooks**: Step-by-step procedures for specific incident types

**Source:** [Fortinet - IR Plans, Playbooks, and Policy](https://www.fortinet.com/blog/ciso-collective/incident-response-plans-playbooks-policy)

#### NIST Incident Response Framework Phases

| Phase | Purpose | Key Documentation |
|-------|---------|-------------------|
| Preparation | Build capability | Team roster, tools inventory, training records |
| Detection & Analysis | Identify incidents | Alert thresholds, triage criteria, severity matrix |
| Containment | Limit damage | Isolation procedures, communication templates |
| Eradication & Recovery | Remove threat and restore | Remediation steps, restoration procedures |
| Post-Incident Activity | Learn and improve | Post-mortem template, lessons learned |

**Source:** [CISA - Federal Government Cybersecurity Playbooks](https://www.cisa.gov/resources-tools/resources/federal-government-cybersecurity-incident-and-vulnerability-response-playbooks)

#### Playbook Types (Minimum Required)

- **General Security Incident**: Catch-all for unknown threats
- **Ransomware Attack**: Isolation, assessment, recovery, law enforcement
- **Data Breach**: Containment, notification, forensics, compliance
- **DDoS Attack**: Traffic analysis, mitigation, provider escalation
- **Phishing Attack**: User notification, account lockdown, credential reset
- **Insider Threat**: Investigation, access revocation, HR coordination
- **Cloud Security Incident**: Provider coordination, log analysis, IAM review

**Sources:**
- [Microsoft - Incident Response Playbooks](https://learn.microsoft.com/en-us/security/operations/incident-response-playbooks)
- [Wiz - Free Incident Response Playbooks](https://www.wiz.io/academy/incident-response-playbooks)
- [CM-Alliance - Incident Response Playbook Examples 2025](https://www.cm-alliance.com/cybersecurity-blog/cyber-incident-response-playbook-examples-for-2025)

#### Playbook Structure

Each playbook should contain:
- Prerequisites (permissions, logging requirements)
- Workflow diagram
- Checklist of tasks
- Detailed investigation steps
- Communication templates
- Recovery procedures
- Post-incident review steps

**Source:** [Atlassian - How to Create an Incident Response Playbook](https://www.atlassian.com/incident-management/incident-response/how-to-create-an-incident-response-playbook)

---

### 1.5 Onboarding Documentation

Effective onboarding can improve retention by 82% and productivity by 70% according to Brandon Hall Group research. Developer onboarding requires specific technical documentation.

**Source:** [Zydesoft - 9 Point Developer Onboarding Checklist](https://zydesoft.com/onboard-remote-software-developers-checklist/)

#### Required Onboarding Documents

| Document | Purpose | Owner |
|----------|---------|-------|
| Company Overview | Mission, values, culture | HR |
| Team Structure | Org chart, who's who, communication channels | Manager |
| Technical Onboarding Playbook | Step-by-step setup guide | Engineering |
| Architecture Overview | 2-page system overview with diagrams | Architecture |
| Development Environment Setup | IDE, tools, dependencies, local setup | Engineering |
| Code Standards Guide | Style guides, linting rules, PR process | Engineering |
| Access Provisioning Guide | Systems, permissions, how to request | IT/Security |
| Glossary | Team-specific terms and acronyms | Engineering |

**Source:** [Cortex - Developer Onboarding Guide](https://www.cortex.io/post/developer-onboarding-guide)

#### Technical Onboarding Checklist

**Pre-Day 1 (7 days before):**
- [ ] Order hardware
- [ ] Create accounts (email, Slack, GitHub, etc.)
- [ ] Prepare access to documentation platforms
- [ ] Assign buddy and mentor
- [ ] Schedule welcome meeting

**Day 1:**
- [ ] Welcome meeting with team
- [ ] Company overview presentation
- [ ] Share onboarding document with links to all resources
- [ ] Verify all account access
- [ ] Environment setup begins

**Week 1:**
- [ ] Complete local development environment setup
- [ ] First code commit (no matter how small)
- [ ] Architecture walkthrough session
- [ ] Codebase tour with mentor
- [ ] Daily check-ins

**Days 30/60/90:**
- [ ] Clear milestones defined and tracked
- [ ] Regular feedback sessions
- [ ] Documentation contributions expected
- [ ] Increasing autonomy and ownership

**Sources:**
- [Port.io - Developer Onboarding Checklist](https://www.port.io/blog/developer-onboarding-checklist)
- [FullScale - 90-Day Developer Onboarding Best Practices](https://fullscale.io/blog/developer-onboarding-best-practices/)

#### Key Metrics

- **Time to first commit**: Target < 3 days
- **Time to first PR merged**: Target < 1 week
- **Time to independent contribution**: Target < 30 days

**Source:** [Noxx - Software Developer Onboarding Checklist](https://www.noxx.ai/blogs/software-developer-onboarding-checklist)

---

### 1.6 README Standards

A README is the first thing visitors see when opening your repository. It should answer: What is this? Why should I use it? How do I get started?

**Source:** [FreeCodeCamp - How to Write a Good README](https://www.freecodecamp.org/news/how-to-write-a-good-readme-file/)

#### README Template

```markdown
# Project Name

Brief description (1-2 sentences) of what the project does.

## Features

- Key feature 1
- Key feature 2
- Key feature 3

## Prerequisites

- Runtime requirements (Node.js 18+, Python 3.10+)
- System dependencies
- Required accounts/access

## Installation

```bash
# Clone the repository
git clone https://github.com/org/project.git

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
```

## Usage

```bash
# Start the application
npm start
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `DATABASE_URL` | Database connection string | Required |

## API Reference

Brief overview with link to full API docs.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE)
```

**Source:** [Standard Readme](https://github.com/RichardLitt/standard-readme)

#### README Best Practices

1. **Start with the name and description**: One sentence explaining what it does
2. **Include installation steps**: Clear, copy-paste commands
3. **Provide usage examples**: Real code that works
4. **Document configuration**: All environment variables and options
5. **Add badges**: Build status, coverage, version (when meaningful)
6. **Link to detailed docs**: Don't duplicate; reference external documentation
7. **Keep it updated**: Update with every significant change
8. **Include license**: Legal clarity for users

**Sources:**
- [GitHub - Awesome README](https://github.com/matiassingers/awesome-readme)
- [Tilburg Science Hub - README Best Practices](https://tilburgsciencehub.com/topics/collaborate-share/share-your-work/content-creation/readme-best-practices/)
- [Hatica - Best Practices for GitHub README](https://www.hatica.io/blog/best-practices-for-github-readme/)

#### What NOT to Include

- Auto-generated content without review
- Implementation details that belong in code comments
- Outdated screenshots or examples
- Internal team information in public repos

---

### 1.7 Code Documentation (When and How Much)

Code documentation exists on a spectrum from meaningful names to detailed design docs. The right level depends on audience and complexity.

**Source:** [Google Style Guide - Documentation Best Practices](https://google.github.io/styleguide/docguide/best_practices.html)

#### Documentation Spectrum

| Type | Purpose | When to Use |
|------|---------|-------------|
| Meaningful names | Self-documenting code | Always |
| Inline comments | Explain "why" not "what" | Complex logic, workarounds, non-obvious decisions |
| Docstrings | API contracts | All public functions, classes, modules |
| README | Project overview | Every project/module |
| Architecture docs | System understanding | Major components, integrations |
| Design docs | Decision capture | New features, major changes |

**Source:** [Stack Overflow - Best Practices for Code Comments](https://stackoverflow.blog/2021/12/23/best-practices-for-writing-code-comments/)

#### When to Comment

**Always comment:**
- Complex algorithms or business logic
- Workarounds for bugs (link to issue)
- Non-obvious performance optimizations
- Reasons for choosing one approach over another
- Assumptions and preconditions
- External dependencies and their purpose

**Never comment:**
- What the code does (if it's obvious)
- Obvious getters/setters
- Code that should be refactored instead
- Commented-out code (delete it)

**Source:** [Hatica - Code Documentation Practices](https://www.hatica.io/blog/code-documentation-practices/)

#### Docstring Standards

**Python (Google Style):**
```python
def calculate_tax(amount: float, rate: float) -> float:
    """Calculate tax for a given amount.
    
    Args:
        amount: The base amount before tax.
        rate: Tax rate as a decimal (e.g., 0.08 for 8%).
    
    Returns:
        The calculated tax amount.
    
    Raises:
        ValueError: If amount or rate is negative.
    """
```

**JavaScript (JSDoc):**
```javascript
/**
 * Calculate tax for a given amount.
 * @param {number} amount - The base amount before tax.
 * @param {number} rate - Tax rate as decimal.
 * @returns {number} The calculated tax amount.
 * @throws {Error} If amount or rate is negative.
 */
```

**Source:** [PEP 8 - Style Guide for Python Code](https://peps.python.org/pep-0008/)

#### Key Principles

1. **Comments lie, code doesn't**: Keep comments synchronized with code
2. **Explain why, not what**: Code shows what; comments explain why
3. **Document the interface, not implementation**: Focus on public APIs
4. **Dead docs are worse than no docs**: Outdated docs mislead developers
5. **Treat documentation as code**: Review in PRs, version control, test

**Sources:**
- [Stepsize - Engineer's Guide to Code Comments](https://www.stepsize.com/blog/the-engineers-guide-to-writing-code-comments)
- [Codacy - Code Documentation Best Practices](https://blog.codacy.com/code-documentation)
- [Daily.dev - 10 Code Commenting Best Practices](https://daily.dev/blog/10-code-commenting-best-practices-for-developers)

---

### 1.8 Environment Variables Documentation

Environment variables are a common source of configuration errors and security incidents. Proper documentation prevents deployment failures and security breaches.

#### .env Documentation Requirements

Every project must have:

1. **`.env.example`**: Template with all variables (no real values)
2. **Configuration documentation**: Description of each variable
3. **Validation**: Runtime checks for required variables

**Source:** [GitGuardian - Secure Your Secrets with .env](https://blog.gitguardian.com/secure-your-secrets-with-env/)

#### .env.example Template

```bash
# Application
NODE_ENV=development          # Environment: development, staging, production
PORT=3000                     # Server port
LOG_LEVEL=info                # Logging: debug, info, warn, error

# Database
DATABASE_URL=                 # Required: PostgreSQL connection string
DATABASE_POOL_MIN=2           # Minimum pool connections
DATABASE_POOL_MAX=10          # Maximum pool connections

# External Services
STRIPE_SECRET_KEY=            # Required: Stripe API key (sk_test_... or sk_live_...)
STRIPE_WEBHOOK_SECRET=        # Required: Stripe webhook signing secret

# Feature Flags
ENABLE_NEW_CHECKOUT=false     # Enable new checkout flow
```

#### Environment Variable Documentation Table

| Variable | Required | Default | Description | Example |
|----------|----------|---------|-------------|---------|
| `NODE_ENV` | Yes | development | Runtime environment | `production` |
| `DATABASE_URL` | Yes | - | PostgreSQL connection string | `postgres://user:pass@host:5432/db` |
| `REDIS_URL` | No | - | Redis connection string | `redis://localhost:6379` |

#### Secrets Management Best Practices

1. **Never commit secrets**: Add `.env` to `.gitignore`
2. **Use secrets managers in production**: AWS Secrets Manager, HashiCorp Vault, 1Password
3. **Separate config from secrets**: Non-sensitive config can be in code
4. **Implement rotation policies**: Automated credential rotation
5. **Audit access**: Log who accesses secrets and when
6. **Validate at startup**: Fail fast if required variables missing

**Sources:**
- [Docker Docs - Environment Variables Best Practices](https://docs.docker.com/compose/how-tos/environment-variables/best-practices/)
- [Kubernetes - Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)
- [Medium - Beyond .env Files](https://medium.com/@instatunnel/beyond-env-files-the-new-best-practices-for-managing-secrets-in-development-b4b05e0a3055)
- [OpenReplay - .env Files and the Art of Not Committing Secrets](https://blog.openreplay.com/env-files-art-not-committing-secrets/)

---

## 2. Common Vulnerabilities & Mistakes

### 2.1 Outdated Documentation

Documentation debt is a type of technical debt that leads to inaccurate, incomplete, or outdated information. Outdated docs are often worse than no docs because they actively mislead developers.

**Source:** [ICIS 2024 - Recommendations for Dealing with Documentation Debt](https://aisel.aisnet.org/icis2024/practitioner/practitioner/8/)

#### Problems Caused

- Developers waste time on incorrect information
- New hires learn wrong patterns
- Bugs introduced from following outdated procedures
- Trust in documentation erodes completely

#### Prevention Strategies

1. **Documentation as Code**: Treat docs like code with version control and PRs
2. **Automated generation**: Use OpenAPI, JSDoc, Sphinx to generate from source
3. **Link docs to code**: Documentation lives in the same repo as code
4. **PR requirements**: Every code PR must update relevant docs
5. **Regular review cycles**: Quarterly documentation audits
6. **Delete aggressively**: Remove outdated docs rather than leave them misleading

**Sources:**
- [Working Software - Technical Debt Scenario #5](https://www.workingsoftware.dev/technical-debt-scenario-5-the-code-documents-the-system/)
- [Trevor Lasn - Outdated Docs Are Tech Debt](https://www.trevorlasn.com/blog/outdated-docs-are-tech-debt)
- [Stack Overflow - Developers Hate Documentation](https://stackoverflow.blog/2024/12/19/developers-hate-documentation-ai-generated-toil-work/)

---

### 2.2 Missing API Documentation

APIs without documentation have significantly lower adoption rates. Developers cannot use what they cannot understand.

#### Consequences

- Integration failures during development
- Increased support burden on API teams
- Incorrect usage leading to bugs
- Slower onboarding for new developers
- Technical debt as undocumented behaviors become "features"

#### Minimum Requirements

- All endpoints documented
- Request/response schemas defined
- Authentication requirements clear
- Error codes and messages listed
- Rate limits documented
- Versioning strategy explained

**Source:** [Swagger Blog - Best Practices in API Documentation](https://swagger.io/blog/api-documentation/best-practices-in-api-documentation/)

---

### 2.3 No Runbooks for Common Operations

Without runbooks, incident response depends entirely on individual knowledge. When that person is unavailable, simple issues become major incidents.

#### Common Missing Runbooks

- How to restart services safely
- How to perform database failover
- How to rotate credentials
- How to scale services up/down
- How to investigate common alerts
- How to roll back deployments

#### Impact

- Extended incident duration (MTTR increases 3-5x)
- Inconsistent responses to similar issues
- Knowledge loss when team members leave
- Increased stress on on-call engineers
- Higher error rates during incidents

**Source:** [Doctor Droid - Runbooks Guide for SRE](https://drdroid.io/guides/runbooks-guide-for-sre-on-call-teams)

---

### 2.4 Undocumented Environment Variables

Environment variables that exist only in production without documentation create deployment risks and security vulnerabilities.

#### Common Problems

- Deployments fail because developers don't know required variables
- Security incidents from accidentally exposing secrets
- Different values across environments without explanation
- Orphaned variables that no one knows if they're still needed
- No validation, so missing variables cause runtime failures

#### Prevention

- Maintain `.env.example` with all variables documented
- Add validation at application startup
- Document purpose and acceptable values
- Review environment variables in PRs
- Audit production for undocumented variables quarterly

**Source:** [GitGuardian - Secure Your Secrets](https://blog.gitguardian.com/secure-your-secrets-with-env/)

---

### 2.5 Missing Architecture Decisions

When architecture decisions aren't recorded, teams repeatedly revisit the same debates, and new team members don't understand why things were built a certain way.

#### Symptoms

- Same architectural debates every few months
- New hires asking "why did we build it this way?"
- Inconsistent patterns across the codebase
- Fear of changing anything because no one knows the rationale
- Difficulty onboarding new team members

#### Impact

- 20-30% of engineering time spent on coordination (AWS estimate)
- Repeated refactoring when decisions are revisited
- Technical debt from inconsistent decisions
- Slower innovation due to lack of understanding

**Source:** [AWS Architecture Blog - Master ADRs](https://aws.amazon.com/blogs/architecture/master-architecture-decision-records-adrs-best-practices-for-effective-decision-making/)

---

### 2.6 No Incident Playbooks

Without playbooks, incident response is chaotic. Different responders take different approaches, communication breaks down, and recovery takes longer.

#### Consequences

- Inconsistent incident handling
- Longer mean time to resolution
- Mistakes under pressure
- No institutional learning
- Compliance failures (many regulations require documented IR procedures)

#### Financial Impact

Organizations with tested incident response plans save an average of $2.66 million per data breach compared to those without.

**Source:** [Concertium - NIST Incident Response Playbook](https://concertium.com/nist-incident-response-playbook-template/)

---

## 3. Audit Checklists

### 3.1 Documentation Existence Checklist

#### Project-Level Documentation

- [ ] **README.md** exists and is up-to-date
- [ ] **CONTRIBUTING.md** for contributor guidelines
- [ ] **CHANGELOG.md** tracking version history
- [ ] **LICENSE** file present
- [ ] **SECURITY.md** with vulnerability reporting process
- [ ] **.env.example** with all environment variables documented

#### Architecture Documentation

- [ ] **Architecture Decision Records (ADRs)** in `docs/decisions/`
  - [ ] Database selection documented
  - [ ] Framework choices documented
  - [ ] Infrastructure decisions documented
  - [ ] Security architecture documented
- [ ] **C4 Context Diagram** (Level 1) showing system boundaries
- [ ] **C4 Container Diagram** (Level 2) showing major components
- [ ] **Data flow diagrams** for sensitive data
- [ ] **Network architecture diagram** (for infrastructure)

#### API Documentation

- [ ] **OpenAPI/Swagger specification** exists
- [ ] **API documentation** accessible (Swagger UI, Redoc, or similar)
- [ ] **Authentication documentation** is complete
- [ ] **Versioning strategy** documented
- [ ] **Rate limiting** documented
- [ ] **Error codes** documented with descriptions

#### Operational Documentation

- [ ] **Runbooks** exist for critical operations
- [ ] **Incident response playbooks** defined
- [ ] **On-call rotation** documented
- [ ] **Escalation procedures** documented
- [ ] **Post-mortem templates** available

#### Onboarding Documentation

- [ ] **Onboarding guide** for new developers
- [ ] **Local development setup** instructions
- [ ] **Access request procedures** documented
- [ ] **Team glossary** of terms and acronyms
- [ ] **Architecture overview** (2-page summary)

---

### 3.2 API Documentation Audit Checklist

#### Specification Quality

- [ ] OpenAPI version 3.0+ used
- [ ] `info` section complete (title, version, description, contact)
- [ ] `servers` array populated with real URLs (not localhost)
- [ ] All paths have `operationId`
- [ ] All paths have `summary` and `description`
- [ ] All paths have `tags` for logical grouping

#### Request Documentation

- [ ] All parameters documented (query, path, header, cookie)
- [ ] Required vs optional parameters marked
- [ ] Parameter descriptions provided
- [ ] Parameter examples provided
- [ ] Request body schemas defined
- [ ] Request body examples provided
- [ ] Content types specified

#### Response Documentation

- [ ] All response codes documented (2xx, 4xx, 5xx)
- [ ] Response schemas defined for each status code
- [ ] Response examples provided
- [ ] Error response format consistent
- [ ] Error codes and messages documented

#### Security Documentation

- [ ] Security schemes defined (API key, OAuth2, JWT)
- [ ] Security requirements specified per endpoint
- [ ] Authentication examples provided
- [ ] Authorization (scopes/roles) documented

#### Usability

- [ ] Getting started guide available
- [ ] Code examples in multiple languages
- [ ] Interactive documentation (try it out) available
- [ ] Changelog/versioning visible
- [ ] Rate limits documented
- [ ] Pagination explained

---

### 3.3 Runbook Audit Checklist

#### Required Runbooks by Service

**For each critical service, verify runbooks exist for:**

- [ ] Service restart procedure
- [ ] Health check failure response
- [ ] Scaling procedure (up/down)
- [ ] Log access and analysis
- [ ] Configuration changes
- [ ] Deployment procedure
- [ ] Rollback procedure

#### Required Runbooks by System

**Database:**
- [ ] Connection pool exhaustion
- [ ] High CPU/memory usage
- [ ] Replication lag
- [ ] Backup verification
- [ ] Failover procedure
- [ ] Recovery from backup

**Cache (Redis/Memcached):**
- [ ] Cache invalidation
- [ ] Memory pressure
- [ ] Connection issues
- [ ] Cluster failover

**Message Queue (Kafka/RabbitMQ/SQS):**
- [ ] Queue backup/overflow
- [ ] Consumer lag
- [ ] Dead letter queue processing
- [ ] Partition rebalancing

**API Gateway/Load Balancer:**
- [ ] Traffic spike response
- [ ] Backend unhealthy
- [ ] SSL certificate renewal
- [ ] Rate limit adjustment

#### Runbook Quality Checklist

For each runbook, verify:
- [ ] Clear trigger condition defined
- [ ] Step-by-step procedures provided
- [ ] Expected outcomes for each step
- [ ] Verification steps included
- [ ] Rollback procedure documented
- [ ] Escalation path defined
- [ ] Owner and last update date visible
- [ ] Links to dashboards/logs included
- [ ] Access requirements listed

---

### 3.4 Incident Response Audit Checklist

#### Policy and Plan

- [ ] Incident Response Policy exists and is approved
- [ ] Incident Response Plan documented
- [ ] Roles and responsibilities defined
- [ ] Contact information current
- [ ] Communication templates prepared
- [ ] External notification requirements documented (legal, regulatory)

#### Playbooks

**Minimum required playbooks:**
- [ ] General security incident
- [ ] Data breach
- [ ] Ransomware attack
- [ ] DDoS attack
- [ ] Phishing attack
- [ ] Insider threat
- [ ] Service outage
- [ ] Third-party service failure

**For each playbook, verify:**
- [ ] Detection criteria defined
- [ ] Severity classification guidelines
- [ ] Immediate containment steps
- [ ] Investigation procedures
- [ ] Evidence preservation steps
- [ ] Recovery procedures
- [ ] Communication templates
- [ ] Post-incident review process

#### Testing and Training

- [ ] Tabletop exercises conducted (minimum 2x/year)
- [ ] Last exercise date recorded
- [ ] Lessons learned documented
- [ ] Playbooks updated after exercises
- [ ] Team training current

---

### 3.5 Environment Variables Audit Checklist

#### Documentation Requirements

- [ ] `.env.example` exists in repository
- [ ] All production variables present in `.env.example`
- [ ] Each variable has a description comment
- [ ] Required vs optional clearly marked
- [ ] Default values documented where applicable
- [ ] Example values provided (non-secret)
- [ ] Format/pattern documented for complex values

#### Security Requirements

- [ ] `.env` in `.gitignore`
- [ ] No secrets in `.env.example`
- [ ] Secrets stored in proper secrets manager (not files)
- [ ] Production secrets not accessible in development
- [ ] Secret rotation procedures documented
- [ ] Access to secrets audited

#### Validation Requirements

- [ ] Application validates required variables at startup
- [ ] Application fails fast on missing required variables
- [ ] Variables typed appropriately (not just strings)
- [ ] Sensitive variables masked in logs

#### Inventory Checklist

For each environment variable in production:
- [ ] Purpose documented
- [ ] Owner identified
- [ ] Still in use (not orphaned)
- [ ] Rotation schedule defined (if secret)
- [ ] Access appropriately restricted

---

### 3.6 README Audit Checklist

- [ ] **Project name** clear and descriptive
- [ ] **Description** explains what it does in 1-2 sentences
- [ ] **Status badges** (build, coverage, version) current
- [ ] **Prerequisites** listed completely
- [ ] **Installation steps** accurate and tested
- [ ] **Usage examples** that actually work
- [ ] **Configuration** documented (all options)
- [ ] **Environment variables** explained or linked
- [ ] **API reference** linked (if applicable)
- [ ] **Contributing guidelines** linked
- [ ] **License** specified
- [ ] **No broken links**
- [ ] **Last update** within 6 months
- [ ] **Screenshots/diagrams** current (if present)

---

### 3.7 Code Documentation Audit Checklist

#### Public API Documentation

- [ ] All public functions have docstrings
- [ ] All public classes have docstrings
- [ ] All public modules have docstrings
- [ ] Parameters documented with types
- [ ] Return values documented with types
- [ ] Exceptions/errors documented
- [ ] Usage examples for complex APIs

#### Comment Quality

- [ ] Comments explain "why" not "what"
- [ ] No commented-out code
- [ ] No TODO/FIXME without issue links
- [ ] Complex algorithms explained
- [ ] Workarounds documented with issue references
- [ ] Assumptions documented
- [ ] No outdated comments

#### Generated Documentation

- [ ] Documentation generation configured (JSDoc, Sphinx, etc.)
- [ ] Generated docs build successfully
- [ ] Generated docs published and accessible
- [ ] Generation runs in CI pipeline

---

## 4. Sources & References

### API Documentation
- [OpenAPI Best Practices](https://learn.openapis.org/best-practices.html)
- [APIMatic - 14 Best Practices for OpenAPI](https://www.apimatic.io/blog/2022/11/14-best-practices-to-write-openapi-for-better-api-consumption)
- [Swagger Blog - Best Practices in API Documentation](https://swagger.io/blog/api-documentation/best-practices-in-api-documentation/)
- [Daily.dev - API Documentation Best Practices](https://daily.dev/blog/api-documentation-best-practices-11-tips-for-2024)

### Architecture Decision Records
- [ADR GitHub Organization](https://adr.github.io/)
- [ADR Templates](https://adr.github.io/adr-templates/)
- [AWS Architecture Blog - Master ADRs](https://aws.amazon.com/blogs/architecture/master-architecture-decision-records-adrs-best-practices-for-effective-decision-making/)
- [AWS Prescriptive Guidance - ADR Process](https://docs.aws.amazon.com/prescriptive-guidance/latest/architectural-decision-records/adr-process.html)
- [Microsoft Azure - Maintain an ADR](https://learn.microsoft.com/en-us/azure/well-architected/architect-role/architecture-decision-record)
- [Google Cloud - ADR Overview](https://docs.cloud.google.com/architecture/architecture-decision-records)
- [TechTarget - 8 Best Practices for ADRs](https://www.techtarget.com/searchapparchitecture/tip/4-best-practices-for-creating-architecture-decision-records)
- [GitHub - joelparkerhenderson/architecture-decision-record](https://github.com/joelparkerhenderson/architecture-decision-record)

### C4 Model
- [C4 Model Official Site](https://c4model.com/)
- [C4 Model - Diagrams](https://c4model.com/diagrams)
- [InfoQ - The C4 Model for Software Architecture](https://www.infoq.com/articles/C4-architecture-model/)
- [Miro - C4 Model Guide](https://miro.com/diagramming/c4-model-for-software-architecture/)

### Runbooks
- [TechTarget - SRE Documentation Best Practices](https://www.techtarget.com/searchitoperations/tip/An-introduction-to-SRE-documentation-best-practices)
- [Squadcast - Runbook Template](https://www.squadcast.com/sre-best-practices/runbook-template)
- [Nobl9 - Runbook Best Practices Guide](https://www.nobl9.com/it-incident-management/runbook-example)
- [Doctor Droid - Runbooks Guide for SRE](https://drdroid.io/guides/runbooks-guide-for-sre-on-call-teams)
- [SolarWinds - Runbook Automation](https://www.solarwinds.com/sre-best-practices/runbook-automation)
- [Atlassian - DevOps Runbook Template](https://www.atlassian.com/software/confluence/templates/devops-runbook)
- [Medium/Fylamynt - What is a Runbook](https://medium.com/fylamynt/what-is-a-runbook-and-what-would-an-sre-do-with-it-ac355a46307d)

### Incident Response
- [CISA - Federal Government Cybersecurity Playbooks](https://www.cisa.gov/resources-tools/resources/federal-government-cybersecurity-incident-and-vulnerability-response-playbooks)
- [Microsoft - Incident Response Playbooks](https://learn.microsoft.com/en-us/security/operations/incident-response-playbooks)
- [Atlassian - How to Create an Incident Response Playbook](https://www.atlassian.com/incident-management/incident-response/how-to-create-an-incident-response-playbook)
- [TechTarget - How to Create an Incident Response Playbook](https://www.techtarget.com/searchsecurity/tip/How-to-create-an-incident-response-playbook)
- [Wiz - Free Incident Response Playbooks](https://www.wiz.io/academy/incident-response-playbooks)
- [Fortinet - IR Plans, Playbooks, and Policy](https://www.fortinet.com/blog/ciso-collective/incident-response-plans-playbooks-policy)
- [CM-Alliance - Incident Response Playbook Examples 2025](https://www.cm-alliance.com/cybersecurity-blog/cyber-incident-response-playbook-examples-for-2025)
- [Cynet - Incident Response Plan Template](https://www.cynet.com/incident-response/incident-response-plan-template/)
- [Concertium - NIST Incident Response Playbook](https://concertium.com/nist-incident-response-playbook-template/)

### Onboarding Documentation
- [Port.io - Developer Onboarding Checklist](https://www.port.io/blog/developer-onboarding-checklist)
- [Cortex - Developer Onboarding Guide](https://www.cortex.io/post/developer-onboarding-guide)
- [FullScale - 90-Day Developer Onboarding Best Practices](https://fullscale.io/blog/developer-onboarding-best-practices/)
- [CloudHire - Developer Onboarding Checklist](https://cloudhire.ai/developer-onboarding-checklist/)
- [Zydesoft - 9 Point Developer Onboarding Checklist](https://zydesoft.com/onboard-remote-software-developers-checklist/)
- [Noxx - Software Developer Onboarding Checklist](https://www.noxx.ai/blogs/software-developer-onboarding-checklist)

### README Standards
- [Standard Readme](https://github.com/RichardLitt/standard-readme)
- [GitHub - Awesome README](https://github.com/matiassingers/awesome-readme)
- [FreeCodeCamp - How to Write a Good README](https://www.freecodecamp.org/news/how-to-write-a-good-readme-file/)
- [Tilburg Science Hub - README Best Practices](https://tilburgsciencehub.com/topics/collaborate-share/share-your-work/content-creation/readme-best-practices/)
- [Hatica - Best Practices for GitHub README](https://www.hatica.io/blog/best-practices-for-github-readme/)

### Code Documentation
- [Google Style Guide - Documentation Best Practices](https://google.github.io/styleguide/docguide/best_practices.html)
- [Stack Overflow - Best Practices for Code Comments](https://stackoverflow.blog/2021/12/23/best-practices-for-writing-code-comments/)
- [PEP 8 - Style Guide for Python Code](https://peps.python.org/pep-0008/)
- [Hatica - Code Documentation Practices](https://www.hatica.io/blog/code-documentation-practices/)
- [Stepsize - Engineer's Guide to Code Comments](https://www.stepsize.com/blog/the-engineers-guide-to-writing-code-comments)
- [Codacy - Code Documentation Best Practices](https://blog.codacy.com/code-documentation)
- [Daily.dev - 10 Code Commenting Best Practices](https://daily.dev/blog/10-code-commenting-best-practices-for-developers)

### Environment Variables & Secrets
- [GitGuardian - Secure Your Secrets with .env](https://blog.gitguardian.com/secure-your-secrets-with-env/)
- [Docker Docs - Environment Variables Best Practices](https://docs.docker.com/compose/how-tos/environment-variables/best-practices/)
- [Kubernetes - Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)
- [Medium - Beyond .env Files](https://medium.com/@instatunnel/beyond-env-files-the-new-best-practices-for-managing-secrets-in-development-b4b05e0a3055)
- [OpenReplay - .env Files and Not Committing Secrets](https://blog.openreplay.com/env-files-art-not-committing-secrets/)
- [Node.js Security - Do Not Use Secrets in Environment Variables](https://www.nodejs-security.com/blog/do-not-use-secrets-in-environment-variables-and-here-is-how-to-do-it-better)

### Documentation Debt & Technical Debt
- [ICIS 2024 - Documentation Debt Recommendations](https://aisel.aisnet.org/icis2024/practitioner/practitioner/8/)
- [Working Software - Technical Debt Scenario #5](https://www.workingsoftware.dev/technical-debt-scenario-5-the-code-documents-the-system/)
- [Trevor Lasn - Outdated Docs Are Tech Debt](https://www.trevorlasn.com/blog/outdated-docs-are-tech-debt)
- [Stack Overflow - Developers Hate Documentation](https://stackoverflow.blog/2024/12/19/developers-hate-documentation-ai-generated-toil-work/)
- [IBM - What is Technical Debt](https://www.ibm.com/think/topics/technical-debt)
- [Kong - Reducing Technical Debt](https://konghq.com/blog/learning-center/reducing-technical-debt)
- [Stepsize - 4 Types of Tech Debt](https://www.stepsize.com/blog/types-of-tech-debt-with-examples-and-fixes)

---

## Quick Reference Commands

### Generate API Documentation

```bash
# Generate OpenAPI spec from code (Node.js/Express)
npx swagger-jsdoc -d swaggerDef.js -o swagger.json

# Validate OpenAPI spec
npx @redocly/cli lint openapi.yaml

# Serve documentation locally
npx @redocly/cli preview-docs openapi.yaml
```

### ADR Management

```bash
# Create new ADR using adr-tools
adr new "Use PostgreSQL for primary database"

# List all ADRs
adr list

# Generate ADR table of contents
adr generate toc > docs/decisions/README.md
```

### Documentation Generation

```bash
# Python - Sphinx
sphinx-build -b html docs/ docs/_build/

# JavaScript - JSDoc
npx jsdoc -c jsdoc.json

# TypeScript - TypeDoc
npx typedoc --out docs src/
```

### Documentation Validation

```bash
# Check for broken links in markdown
npx markdown-link-check README.md

# Lint markdown files
npx markdownlint '**/*.md'

# Check for outdated links
npx linkinator . --recurse
```

---

*Document created: December 2025*  
*For questions or updates, contact your engineering documentation team.*