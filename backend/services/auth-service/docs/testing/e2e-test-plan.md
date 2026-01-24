# Auth Service E2E Test Plan

## Overview

This document outlines the end-to-end (E2E) browser-based tests recommended for the auth-service. These tests validate complete user flows through real browser interactions, complementing the existing unit and integration tests.

**Recommended Framework:** Playwright or Cypress
**Test Environment:** Staging/E2E environment with test tenant

---

## 1. OAuth Flow Tests

### 1.1 Google OAuth Login
```
Scenario: New user signs up via Google OAuth
Given I am on the login page
When I click "Continue with Google"
And I authenticate with Google (mocked/test account)
Then I should be redirected back to the app
And I should see my Google profile name
And a new user account should be created

Scenario: Existing user logs in via Google OAuth
Given I have an account linked to Google
When I click "Continue with Google"
And I authenticate with Google
Then I should be logged in
And I should see my dashboard

Scenario: Link Google account to existing email account
Given I am logged in with email/password
When I go to account settings
And I click "Link Google Account"
And I authenticate with Google
Then my account should show Google as linked
```

### 1.2 OAuth Error Scenarios
```
Scenario: User cancels OAuth flow
Given I am on the login page
When I click "Continue with Google"
And I cancel the Google authentication
Then I should be returned to the login page
And I should see an appropriate message

Scenario: OAuth token exchange fails
Given the OAuth provider returns an error
When I complete OAuth authentication
Then I should see an error message
And I should be able to try again
```

---

## 2. MFA Flow Tests

### 2.1 TOTP Setup Flow
```
Scenario: User enables MFA with authenticator app
Given I am logged in
When I go to security settings
And I click "Enable Two-Factor Authentication"
Then I should see a QR code
When I scan the QR code with Google Authenticator
And I enter the 6-digit code
Then MFA should be enabled
And I should receive backup codes

Scenario: User saves backup codes
Given I have just enabled MFA
When I am shown backup codes
Then I should be able to copy them
And I should be able to download them as a file
```

### 2.2 MFA Login Flow
```
Scenario: User logs in with MFA enabled
Given I have MFA enabled
When I enter my email and password
And I am prompted for MFA code
And I enter a valid TOTP code
Then I should be logged in

Scenario: User uses backup code
Given I have MFA enabled
And I don't have access to my authenticator
When I enter my email and password
And I click "Use backup code"
And I enter a valid backup code
Then I should be logged in
And the backup code should be consumed
```

### 2.3 MFA Error Scenarios
```
Scenario: Invalid MFA code
Given I have MFA enabled
When I enter an incorrect TOTP code
Then I should see an error message
And I should be able to retry

Scenario: Too many failed MFA attempts
Given I have MFA enabled
When I enter incorrect codes 5 times
Then I should be temporarily locked out
And I should see a lockout message
```

---

## 3. Password Reset Flow Tests

### 3.1 Password Reset Request
```
Scenario: User requests password reset
Given I am on the login page
When I click "Forgot Password"
And I enter my email address
Then I should see a confirmation message
And I should receive a password reset email

Scenario: Non-existent email
Given I am on the forgot password page
When I enter an email that doesn't exist
Then I should still see a confirmation message (prevent enumeration)
```

### 3.2 Password Reset Completion
```
Scenario: User resets password
Given I have received a password reset email
When I click the reset link
And I enter a new password
And I confirm the new password
Then my password should be changed
And I should be able to log in with the new password

Scenario: Expired reset token
Given I have an expired password reset link
When I click the link
Then I should see an expiration message
And I should be able to request a new link
```

---

## 4. Session Management Tests

### 4.1 Session Visibility
```
Scenario: User views active sessions
Given I am logged in
When I go to security settings
Then I should see a list of active sessions
And each session should show device, location, and time

Scenario: User revokes a session
Given I am logged in on multiple devices
When I revoke a session from another device
Then that session should be terminated
And the user on that device should be logged out
```

### 4.2 Session Security
```
Scenario: Session expires after inactivity
Given I am logged in
When I am inactive for the session timeout period
Then I should be logged out
And I should see a session expired message

Scenario: All sessions revoked on password change
Given I am logged in on multiple devices
When I change my password
Then all other sessions should be terminated
And only my current session should remain active
```

---

## 5. Wallet Authentication Tests

### 5.1 Wallet Registration
```
Scenario: User registers with Solana wallet
Given I am on the registration page
When I click "Connect Wallet"
And I connect my Phantom wallet
And I sign the authentication message
Then my account should be created
And my wallet should be linked

Scenario: User links wallet to existing account
Given I am logged in with email/password
When I go to wallet settings
And I connect my wallet
And I sign the verification message
Then my wallet should be linked to my account
```

### 5.2 Wallet Login
```
Scenario: User logs in with wallet
Given I have a wallet-linked account
When I click "Connect Wallet"
And I connect my wallet
And I sign the authentication message
Then I should be logged in
```

---

## 6. Registration Tests

### 6.1 Email Registration
```
Scenario: New user registers
Given I am on the registration page
When I fill in all required fields
And I submit the form
Then my account should be created
And I should receive a verification email

Scenario: Registration with weak password
Given I am on the registration page
When I enter a password that's too weak
Then I should see password requirements
And I should not be able to submit

Scenario: Registration with existing email
Given there is an account with email "test@example.com"
When I try to register with the same email
Then I should see an error message
```

---

## 7. Email Verification Tests

### 7.1 Verification Flow
```
Scenario: User verifies email
Given I have registered but not verified my email
When I click the verification link in my email
Then my email should be marked as verified
And I should see a success message

Scenario: Resend verification email
Given I have registered but not verified my email
When I request a new verification email
Then I should receive a new verification email
And the old link should still work
```

---

## 8. Biometric Authentication Tests

### 8.1 WebAuthn/PassKey Flow
```
Scenario: User registers biometric credential
Given I am logged in
When I go to security settings
And I click "Add Biometric Login"
And I complete the biometric registration
Then a new credential should be registered

Scenario: User logs in with biometric
Given I have a registered biometric credential
When I click "Login with Biometric"
And I complete the biometric verification
Then I should be logged in
```

---

## Implementation Notes

### Test Data Management
- Use dedicated test tenant with isolated data
- Create test user factory for consistent test data
- Implement cleanup hooks after each test run

### OAuth Mocking
- Use OAuth provider test/sandbox modes
- Mock external OAuth calls in CI environment
- Test with real OAuth in staging environment

### Browser Configuration
- Test on Chrome, Firefox, Safari
- Test mobile viewport sizes
- Test with and without JavaScript (graceful degradation)

### Security Considerations
- Never use real user credentials in tests
- Use time-limited test tokens
- Rotate test secrets regularly

### CI/CD Integration
```yaml
e2e-tests:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Start test environment
      run: docker-compose -f docker-compose.e2e.yml up -d
    - name: Run E2E tests
      run: npx playwright test
    - name: Upload test artifacts
      uses: actions/upload-artifact@v3
      with:
        name: playwright-report
        path: playwright-report/
```

---

## Priority Matrix

| Test Suite | Priority | Complexity | Coverage Gap |
|------------|----------|------------|--------------|
| OAuth Login | HIGH | HIGH | Currently mocked only |
| MFA Setup/Login | HIGH | MEDIUM | Integration only |
| Password Reset | MEDIUM | LOW | Good coverage |
| Session Management | MEDIUM | LOW | Good coverage |
| Wallet Auth | MEDIUM | HIGH | Integration only |
| Biometric Auth | LOW | HIGH | Limited browser support |

---

## Estimated Effort

- OAuth Flow Tests: 3-4 days
- MFA Flow Tests: 2-3 days
- Password Reset Tests: 1 day
- Session Management Tests: 1 day
- Wallet Auth Tests: 2-3 days
- Biometric Tests: 2 days
- CI/CD Integration: 1 day

**Total Estimated Effort: 12-15 days**

---

## Next Steps

1. Set up Playwright project with test fixtures
2. Configure test tenant and test data factory
3. Implement OAuth mock server for CI
4. Start with highest priority OAuth tests
5. Integrate with CI/CD pipeline
