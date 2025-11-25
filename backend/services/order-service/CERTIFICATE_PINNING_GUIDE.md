# Certificate Pinning Implementation Guide

## Overview
Certificate pinning enhances mobile app security by preventing man-in-the-middle (MITM) attacks. This guide covers implementing certificate pinning for the TicketToken Order Service API across iOS, Android, and React Native platforms.

## Table of Contents
1. [What is Certificate Pinning?](#what-is-certificate-pinning)
2. [Generating Certificate Pins](#generating-certificate-pins)
3. [iOS Implementation](#ios-implementation)
4. [Android Implementation](#android-implementation)
5. [React Native Implementation](#react-native-implementation)
6. [Pin Management & Rotation](#pin-management--rotation)
7. [Testing](#testing)
8. [Troubleshooting](#troubleshooting)

---

## What is Certificate Pinning?

Certificate pinning validates that the server's SSL certificate matches a known, trusted certificate embedded in your app. This prevents attackers from using fraudulent certificates, even if they compromise a Certificate Authority.

**Two Types of Pinning:**
1. **Certificate Pinning** - Pin the entire certificate (less flexible, requires app update on cert renewal)
2. **Public Key Pinning** - Pin only the public key (recommended, survives cert renewal if key unchanged)

**TicketToken uses Public Key Pinning (SPKI - Subject Public Key Info)**

---

## Generating Certificate Pins

### Step 1: Get Your SSL Certificate

For production, obtain your certificate from your hosting provider:
```bash
# For Let's Encrypt
openssl s_client -servername api.tickettoken.com -connect api.tickettoken.com:443 \
  < /dev/null | openssl x509 -outform PEM > cert.pem

# For AWS ALB/CloudFront
# Download certificate from AWS Certificate Manager
```

For development/staging:
```bash
# Self-signed certificate (development only)
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes
```

### Step 2: Extract Public Key SHA-256 Hash

```bash
# Extract public key and generate SHA-256 hash (Base64 encoded)
openssl x509 -in cert.pem -pubkey -noout | \
  openssl pkey -pubin -outform der | \
  openssl dgst -sha256 -binary | \
  openssl enc -base64

# Output example:
# P4C0qYQGY2TqNXrF4JMyZq7x1d8OGqLDTa5bOQHPvCk=
```

**Important:** Generate hashes for both primary and backup certificates!

### Step 3: Store in Environment Variables

Add to `.env`:
```bash
# Primary certificate pin (current production cert)
API_CERT_PIN_PRIMARY=P4C0qYQGY2TqNXrF4JMyZq7x1d8OGqLDTa5bOQHPvCk=

# Backup certificate pin (next cert for rotation)
API_CERT_PIN_BACKUP=X8D1rZRHZ3UsTYsG5KNzAr8y2e9PHsSMEUb6cPRIQwDm=
```

---

## iOS Implementation

### Using URLSession (Native Swift)

**1. Create Pinning Manager**

```swift
import Foundation
import CommonCrypto

class CertificatePinningManager {
    static let shared = CertificatePinningManager()
    
    // Replace with your actual pins
    private let pinnedPublicKeyHashes: Set<String> = [
        "P4C0qYQGY2TqNXrF4JMyZq7x1d8OGqLDTa5bOQHPvCk=", // Primary
        "X8D1rZRHZ3UsTYsG5KNzAr8y2e9PHsSMEUb6cPRIQwDm="  // Backup
    ]
    
    func validateConnection(challenge: URLAuthenticationChallenge) -> Bool {
        guard let serverTrust = challenge.protectionSpace.serverTrust else {
            return false
        }
        
        // Get server certificate
        guard let serverCertificate = SecTrustGetCertificateAtIndex(serverTrust, 0) else {
            return false
        }
        
        // Extract public key from certificate
        guard let serverPublicKey = SecCertificateCopyKey(serverCertificate) else {
            return false
        }
        
        // Get public key data
        guard let serverPublicKeyData = SecKeyCopyExternalRepresentation(serverPublicKey, nil) else {
            return false
        }
        
        // Calculate SHA-256 hash
        let publicKeyData = serverPublicKeyData as Data
        let hash = sha256(data: publicKeyData)
        let base64Hash = hash.base64EncodedString()
        
        // Check if hash matches any pinned hashes
        return pinnedPublicKeyHashes.contains(base64Hash)
    }
    
    private func sha256(data: Data) -> Data {
        var hash = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
        data.withUnsafeBytes {
            _ = CC_SHA256($0.baseAddress, CC_LONG(data.count), &hash)
        }
        return Data(hash)
    }
}
```

**2. Implement URLSessionDelegate**

```swift
class APIClient: NSObject, URLSessionDelegate {
    private lazy var session: URLSession = {
        URLSession(configuration: .default, delegate: self, delegateQueue: nil)
    }()
    
    func urlSession(_ session: URLSession,
                   didReceive challenge: URLAuthenticationChallenge,
                   completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        
        // Only handle server trust evaluation
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust else {
            completionHandler(.performDefaultHandling, nil)
            return
        }
        
        // Validate certificate pinning
        if CertificatePinningManager.shared.validateConnection(challenge: challenge),
           let serverTrust = challenge.protectionSpace.serverTrust {
            completionHandler(.useCredential, URLCredential(trust: serverTrust))
        } else {
            completionHandler(.cancelAuthenticationChallenge, nil)
        }
    }
    
    func fetchOrders() async throws -> [Order] {
        let url = URL(string: "https://api.tickettoken.com/api/v1/orders")!
        let (data, _) = try await session.data(from: url)
        return try JSONDecoder().decode([Order].self, from: data)
    }
}
```

**3. Usage**

```swift
let apiClient = APIClient()

Task {
    do {
        let orders = try await apiClient.fetchOrders()
        print("Fetched \(orders.count) orders")
    } catch {
        print("Error: \(error)")
        // Handle pinning failure (likely MITM attack)
    }
}
```

---

## Android Implementation

### Using OkHttp (Kotlin)

**1. Add OkHttp Dependency**

```kotlin
// build.gradle
dependencies {
    implementation("com.squareup.okhttp3:okhttp:4.11.0")
}
```

**2. Create Certificate Pinner**

```kotlin
import okhttp3.CertificatePinner
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

object ApiClient {
    private const val BASE_URL = "api.tickettoken.com"
    
    // Replace with your actual pins
    private val certificatePinner = CertificatePinner.Builder()
        .add(BASE_URL, "sha256/P4C0qYQGY2TqNXrF4JMyZq7x1d8OGqLDTa5bOQHPvCk=") // Primary
        .add(BASE_URL, "sha256/X8D1rZRHZ3UsTYsG5KNzAr8y2e9PHsSMEUb6cPRIQwDm=") // Backup
        .build()
    
    val okHttpClient: OkHttpClient = OkHttpClient.Builder()
        .certificatePinner(certificatePinner)
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .addInterceptor { chain ->
            val request = chain.request().newBuilder()
                .addHeader("User-Agent", "TicketToken-Android/1.0")
                .build()
            chain.proceed(request)
        }
        .build()
}
```

**3. Use with Retrofit**

```kotlin
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.GET

interface OrderApi {
    @GET("api/v1/orders")
    suspend fun getOrders(): List<Order>
}

object RetrofitInstance {
    private const val BASE_URL = "https://api.tickettoken.com/"
    
    val api: OrderApi by lazy {
        Retrofit.Builder()
            .baseUrl(BASE_URL)
            .client(ApiClient.okHttpClient) // Use pinned client
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(OrderApi::class.java)
    }
}
```

**4. Usage**

```kotlin
class OrderRepository {
    suspend fun fetchOrders(): Result<List<Order>> {
        return try {
            val orders = RetrofitInstance.api.getOrders()
            Result.success(orders)
        } catch (e: SSLPeerUnverifiedException) {
            // Certificate pinning failed - possible MITM attack
            Log.e("OrderRepo", "Certificate pinning failed", e)
            Result.failure(e)
        } catch (e: Exception) {
            Log.e("OrderRepo", "Error fetching orders", e)
            Result.failure(e)
        }
    }
}
```

---

## React Native Implementation

### Using react-native-ssl-pinning

**1. Install Package**

```bash
npm install react-native-ssl-pinning
# or
yarn add react-native-ssl-pinning

# Link native modules
cd ios && pod install && cd ..
```

**2. Configure Pins**

```javascript
// api/config.js
export const API_CONFIG = {
  baseURL: 'https://api.tickettoken.com',
  pins: {
    'api.tickettoken.com': {
      includeSubdomains: true,
      publicKeyHashes: [
        'P4C0qYQGY2TqNXrF4JMyZq7x1d8OGqLDTa5bOQHPvCk=', // Primary
        'X8D1rZRHZ3UsTYsG5KNzAr8y2e9PHsSMEUb6cPRIQwDm=', // Backup
      ],
    },
  },
};
```

**3. Create API Client**

```javascript
// api/client.js
import { fetch } from 'react-native-ssl-pinning';
import { API_CONFIG } from './config';

class ApiClient {
  async request(endpoint, options = {}) {
    const url = `${API_CONFIG.baseURL}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        ...options,
        sslPinning: {
          certs: [API_CONFIG.pins['api.tickettoken.com'].publicKeyHashes[0]],
        },
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'TicketToken-RN/1.0',
          ...options.headers,
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      if (error.message.includes('SSL')) {
        // Certificate pinning failed
        console.error('Certificate pinning failed - possible security threat', error);
        throw new Error('Security verification failed. Please check your network.');
      }
      throw error;
    }
  }
  
  async getOrders() {
    return this.request('/api/v1/orders');
  }
}

export default new ApiClient();
```

**4. Usage in Component**

```javascript
import React, { useEffect, useState } from 'react';
import { View, Text, Alert } from 'react-native';
import ApiClient from './api/client';

export default function OrderList() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadOrders();
  }, []);
  
  async function loadOrders() {
    try {
      const data = await ApiClient.getOrders();
      setOrders(data);
    } catch (error) {
      Alert.alert(
        'Security Warning',
        'Could not verify secure connection. Please check your network.',
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
    }
  }
  
  return (
    <View>
      {loading ? <Text>Loading...</Text> : <Text>{orders.length} orders</Text>}
    </View>
  );
}
```

---

## Pin Management & Rotation

### When to Update Pins

1. **Initial Deployment** - Include 2 pins (current + backup)
2. **Cert Renewal** - If public key changes, update pins
3. **Security Incident** - Rotate immediately

### Certificate Rotation Strategy

**Step 1: Prepare Backup Certificate (30 days before expiry)**
```bash
# Generate new certificate with same or new public key
# Add backup pin to app and deploy new version

# Old app continues using: PIN_PRIMARY
# New app uses: PIN_PRIMARY, PIN_BACKUP
```

**Step 2: Deploy New Certificate (On expiry)**
```bash
# Install new certificate on server
# All apps (old + new) continue working
# Old app: Fails on PIN_PRIMARY, succeeds on PIN_BACKUP
# New app: Works with both pins
```

**Step 3: Remove Old Pin (After 90% user adoption)**
```bash
# Remove PIN_PRIMARY from new app version
# Only PIN_BACKUP remains (now becomes primary)
# Force update for remaining old app users
```

### Pin Rotation Schedule

```
Month 1: [PIN_A, PIN_B]         ← Current
Month 2: [PIN_A, PIN_B, PIN_C]  ← Add new pin
Month 3: [PIN_B, PIN_C]         ← Remove old PIN_A
Month 4: [PIN_B, PIN_C, PIN_D]  ← Add new pin
... (repeat cycle)
```

### Emergency Pin Bypass

**For catastrophic pin failures, include a** remote config **override:**

```javascript
// Check remote config before enforcing pinning
const config = await fetchRemoteConfig();
if (config.disableCertPinning) {
  // Temporarily disable pinning
  // Log security event for investigation
  console.warn('Certificate pinning disabled via remote config');
}
```

⚠️ **Use emergency bypass sparingly - logs all usage for security audit**

---

## Testing

### Test Certificate Pinning Works

**1. Correct Pin (Should Succeed)**
```bash
# iOS Simulator/Android Emulator
curl -v https://api.tickettoken.com/api/v1/health
# App should connect successfully
```

**2. Incorrect Pin (Should Fail)**
```swift
// Temporarily change pin to invalid value
private let pinnedPublicKeyHashes: Set<String> = [
    "INVALID_PIN_FOR_TESTING_XXXXXXXXXXXXXXXXXXXXXXXXXX="
]
// App should reject connection
```

**3. MITM Attack Simulation**

Using Charles Proxy or mitmproxy:
```bash
# Install Charles Proxy certificate on device
# Enable SSL Proxying for api.tickettoken.com
# App should reject connection (pinning working!)
```

**Expected Error Messages:**
- iOS: `NSURLErrorDomain Code=-1200` (SSL handshake failed)
- Android: `SSLPeerUnverifiedException`
- React Native: `SSL verification failed`

### Automated Testing

**iOS XCTest:**
```swift
func testCertificatePinningValid() {
    let expectation = self.expectation(description: "Valid pin should succeed")
    
    apiClient.fetchOrders { result in
        switch result {
        case .success:
            expectation.fulfill()
        case .failure:
            XCTFail("Expected success with valid pin")
        }
    }
    
    waitForExpectations(timeout: 5)
}
```

**Android JUnit:**
```kotlin
@Test
fun testCertificatePinning() = runBlocking {
    val result = orderRepository.fetchOrders()
    assertTrue("Valid pin should succeed", result.isSuccess)
}
```

---

## Troubleshooting

### Issue: App Can't Connect (Pin Mismatch)

**Symptoms:**
- SSL handshake failures
- `SSLPeerUnverifiedException`
- Network timeout errors

**Solutions:**
1. **Verify Pin is Correct:**
   ```bash
   # Re-extract pin from current server certificate
   openssl s_client -servername api.tickettoken.com \
     -connect api.tickettoken.com:443 < /dev/null | \
     openssl x509 -pubkey -noout | \
     openssl pkey -pubin -outform der | \
     openssl dgst -sha256 -binary | \
     openssl enc -base64
   ```

2. **Check Certificate Chain:**
   - Pin might be for intermediate cert, not leaf cert
   - Use `-showcerts` to see full chain

3. **Disable Pinning Temporarily:**
   - Use remote config flag
   - Deploy hotfix without pinning
   - Investigate root cause

### Issue: Pin Works in Dev, Fails in Production

**Cause:** Different certificates in dev vs prod

**Solution:** Maintain separate pins per environment:
```javascript
const PINS = {
  development: ['DEV_PIN_1', 'DEV_PIN_2'],
  staging: ['STAGING_PIN_1', 'STAGING_PIN_2'],
  production: ['PROD_PIN_1', 'PROD_PIN_2'],
};

const currentPins = PINS[process.env.NODE_ENV];
```

### Issue: Pinning Works on WiFi, Fails on Cellular

**Cause:** Corporate/carrier proxy intercepting SSL

**Solution:**
- Pin backup should include carrier certificate OR
- Allow pinning bypass on specific networks OR
- Educate users about network requirements

---

## Security Best Practices

### ✅ Do's

1. **Always pin multiple certificates** (2-3 pins minimum)
2. **Pin public keys, not certificates** (survives cert renewal)
3. **Monitor pinning failures** (may indicate attacks)
4. **Test pinning before release** (avoid breaking production)
5. **Document pin rotation schedule** (30-90 day cycle)
6. **Include backup pins** (for seamless rotation)
7. **Use `includeSubdomains: false`** unless needed

### ❌ Don'ts

1. **Don't pin to root CA** (defeats the purpose)
2. **Don't hardcode single pin** (requires app update on failure)
3. **Don't pin without backup** (can brick app if cert expires)
4. **Don't ignore pin failures silently** (security risk)
5. **Don't disable pinning in production** (except emergencies)
6. **Don't pin to expired certificates**
7. **Don't test only on WiFi** (mobile networks may have proxies)

---

## Implementation Checklist

- [ ] Generate SHA-256 hashes for primary and backup certificates
- [ ] Add pins to mobile app codebases (iOS, Android, React Native)
- [ ] Test with valid pins (should connect)
- [ ] Test with invalid pins (should reject)
- [ ] Test MITM attack simulation (should reject)
- [ ] Implement pin rotation strategy (30-90 day cycle)
- [ ] Add monitoring/alerting for pinning failures
- [ ] Document pin values in secure location (1Password, AWS Secrets)
- [ ] Set calendar reminders for certificate expiry (30 days before)
- [ ] Test emergency bypass mechanism
- [ ] Update .env.example with pin placeholders
- [ ] Train mobile team on pin rotation procedures

---

## References

- **OWASP Mobile Security:** https://owasp.org/www-project-mobile-security-testing-guide/
- **Apple Certificate Pinning:** https://developer.apple.com/news/?id=g9ejcf8y
- **Android Network Security:** https://developer.android.com/training/articles/security-config
- **RFC 7469 (HPKP):** https://tools.ietf.org/html/rfc7469

---

**Last Updated:** November 23, 2025  
**Maintained By:** TicketToken Security Team  
