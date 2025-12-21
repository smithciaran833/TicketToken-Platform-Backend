# File Upload and Handling Security Audit

A comprehensive guide covering industry standards, OWASP guidelines, and best practices for secure file upload handling in production systems.

---

## Table of Contents

1. [Standards & Best Practices](#1-standards--best-practices)
2. [Common Vulnerabilities & Mistakes](#2-common-vulnerabilities--mistakes)
3. [Technology-Specific Audit Checklists](#3-technology-specific-audit-checklists)
4. [Pre-Production Audit Summary](#4-pre-production-audit-summary)
5. [Sources & References](#5-sources--references)

---

## 1. Standards & Best Practices

### 1.1 File Upload Validation

#### Extension Validation
Use an **allowlist approach** (not denylist) to only permit specific file extensions. Denylists are inherently flawed because it's difficult to block every dangerous extension (.php5, .phtml, .shtml, etc.).

**Recommended Allowlist for Images:**
```javascript
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
```

**Validation Order:**
1. Decode the filename first (handle URL encoding)
2. Validate the extension against allowlist
3. Check for double extensions (e.g., `image.php.jpg`)
4. Check for null byte injection (e.g., `image.php%00.jpg`)

#### Content-Type Validation
The Content-Type header is provided by the client and **cannot be trusted**. It should only be used as a quick preliminary check, not as a security control.

```javascript
// Quick check only - NOT a security measure
if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
  throw new Error('Invalid file type');
}
```

#### Magic Byte (File Signature) Validation
Validate the file's actual content by checking magic bytes (file signatures). This is more reliable than extension or Content-Type but can still be bypassed.

**Common Magic Bytes:**
| Format | Magic Bytes (Hex) | ASCII |
|--------|-------------------|-------|
| JPEG | `FF D8 FF` | N/A |
| PNG | `89 50 4E 47 0D 0A 1A 0A` | `.PNG....` |
| GIF | `47 49 46 38` | `GIF8` |
| WebP | `52 49 46 46 ?? ?? ?? ?? 57 45 42 50` | `RIFF....WEBP` |
| PDF | `25 50 44 46` | `%PDF` |

**Node.js Implementation:**
```javascript
import { fileTypeFromBuffer } from 'file-type';

async function validateMagicBytes(buffer, allowedTypes) {
  const type = await fileTypeFromBuffer(buffer);
  if (!type || !allowedTypes.includes(type.mime)) {
    throw new Error('Invalid file content');
  }
  return type;
}
```

#### File Size Limits
Set strict file size limits to prevent denial of service attacks and storage exhaustion.

```javascript
// Fastify multipart configuration
fastify.register(require('@fastify/multipart'), {
  limits: {
    fileSize: 5 * 1024 * 1024,  // 5 MB max
    files: 1,                    // Max 1 file per request
    fieldSize: 100,              // Max field value size
    fields: 10                   // Max non-file fields
  }
});
```

**Considerations:**
- Set limits at multiple layers (application, web server, load balancer)
- Consider compressed file decompression size (zip bombs)
- Log when limits are exceeded for monitoring

#### Defense in Depth Approach
No single validation technique is sufficient. Implement multiple layers:

1. **Extension allowlist** - First line of defense
2. **Content-Type check** - Quick preliminary filter
3. **Magic byte validation** - Content verification
4. **File size limits** - Resource protection
5. **Virus scanning** - Malware detection
6. **Image reprocessing** - Strip embedded code

---

### 1.2 Secure File Storage

#### Store Outside Webroot
**Never store uploaded files in a publicly accessible directory.** Files should be stored:
- On a separate server or domain
- Outside the web root directory
- In cloud storage (S3, GCS, Azure Blob)
- In a database (for small files)

#### S3 Security Configuration

**Block Public Access:**
```javascript
const s3Bucket = new s3.Bucket(this, 'uploads', {
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  encryption: s3.BucketEncryption.S3_MANAGED,
  enforceSSL: true,
  versioning: true
});
```

**Bucket Policy - Require HTTPS:**
```json
{
  "Statement": [{
    "Sid": "RequireHTTPS",
    "Effect": "Deny",
    "Principal": "*",
    "Action": "s3:*",
    "Resource": ["arn:aws:s3:::bucket-name/*"],
    "Condition": {
      "Bool": { "aws:SecureTransport": "false" }
    }
  }]
}
```

**S3 Security Checklist:**
- [ ] Block Public Access enabled at account and bucket level
- [ ] Server-side encryption enabled (SSE-S3 or SSE-KMS)
- [ ] Bucket versioning enabled
- [ ] HTTPS enforced via bucket policy
- [ ] Access logging enabled
- [ ] IAM policies follow least privilege
- [ ] MFA Delete enabled for sensitive data
- [ ] CloudTrail logging for data events

#### File Organization
```
uploads/
├── {tenant_id}/
│   ├── {entity_type}/
│   │   ├── {entity_id}/
│   │   │   └── {uuid}.{extension}
```

**Key Principles:**
- Use UUIDs or random strings for filenames
- Include tenant/user isolation in the path
- Store original filename in database, not filesystem
- Separate uploads by type/purpose

---

### 1.3 File Naming and Path Traversal Prevention

#### Generate Random Filenames
Never use user-provided filenames directly. Generate new names server-side.

```javascript
import { randomUUID } from 'crypto';
import path from 'path';

function generateSecureFilename(originalName) {
  const ext = path.extname(originalName).toLowerCase();
  const uuid = randomUUID();
  return `${uuid}${ext}`;
}
```

#### Path Traversal Prevention
Path traversal attacks use sequences like `../` to escape intended directories.

**Dangerous Patterns to Block:**
- `../` and `..\\` - Directory traversal
- `%2e%2e%2f` - URL-encoded traversal
- `....//` - Double encoding bypass
- Null bytes `%00` - Extension truncation
- Absolute paths `/etc/passwd`

**Secure Path Resolution:**
```javascript
import path from 'path';

function resolveSafePath(baseDir, userPath) {
  // URL decode first
  const decoded = decodeURIComponent(userPath);
  
  // Remove any directory components
  const filename = path.basename(decoded);
  
  // Resolve to absolute path
  const resolvedPath = path.resolve(baseDir, filename);
  
  // Verify the resolved path is within base directory
  if (!resolvedPath.startsWith(path.resolve(baseDir))) {
    throw new Error('Path traversal attempt detected');
  }
  
  return resolvedPath;
}
```

**Key Rules:**
- Always decode user input before validation
- Use `path.basename()` to strip directory components
- Verify final path is within intended directory
- Never concatenate user input directly to paths
- `path.normalize()` alone is NOT sufficient

---

### 1.4 Image Processing Security

#### ImageMagick Vulnerabilities (ImageTragick)
ImageMagick has had critical remote code execution vulnerabilities. If using ImageMagick:

**Configure policy.xml to disable dangerous features:**
```xml
<policymap>
  <policy domain="coder" rights="none" pattern="EPHEMERAL" />
  <policy domain="coder" rights="none" pattern="HTTPS" />
  <policy domain="coder" rights="none" pattern="HTTP" />
  <policy domain="coder" rights="none" pattern="URL" />
  <policy domain="coder" rights="none" pattern="FTP" />
  <policy domain="coder" rights="none" pattern="MVG" />
  <policy domain="coder" rights="none" pattern="MSL" />
  <policy domain="coder" rights="none" pattern="TEXT" />
  <policy domain="coder" rights="none" pattern="LABEL" />
  <policy domain="path" rights="none" pattern="@*" />
</policymap>
```

#### Recommended: Use Sharp Instead
Sharp (using libvips) is safer and faster than ImageMagick for Node.js:

```javascript
import sharp from 'sharp';

async function processUploadedImage(buffer) {
  // Validate by attempting to read metadata
  const metadata = await sharp(buffer).metadata();
  
  // Reprocess to strip potential embedded code
  const processed = await sharp(buffer)
    .resize(1200, 1200, { 
      fit: 'inside',
      withoutEnlargement: true 
    })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
  
  return processed;
}
```

#### Image Sanitization by Reprocessing
Reprocessing images through an image library strips embedded malicious content:

```javascript
async function sanitizeImage(inputBuffer, outputFormat = 'jpeg') {
  // This strips EXIF data and any embedded code
  return sharp(inputBuffer)
    .rotate()  // Auto-rotate based on EXIF
    .toFormat(outputFormat, { quality: 85 })
    .toBuffer();
}
```

**Why Reprocessing Helps:**
- Strips EXIF metadata (can contain scripts)
- Removes embedded code in image comments
- Eliminates polyglot file attacks
- Ensures output is a valid image

---

### 1.5 Virus/Malware Scanning

#### ClamAV Integration
ClamAV is an open-source antivirus engine suitable for scanning uploaded files.

**Node.js Integration with clamscan:**
```javascript
import NodeClam from 'clamscan';

const clamscan = await new NodeClam().init({
  clamdscan: {
    socket: '/var/run/clamd.scan/clamd.sock',
    host: '127.0.0.1',
    port: 3310,
    timeout: 60000
  },
  preference: 'clamdscan'
});

async function scanFile(filePath) {
  const { isInfected, viruses } = await clamscan.isInfected(filePath);
  
  if (isInfected) {
    console.error(`Malware detected: ${viruses.join(', ')}`);
    // Delete file and reject upload
    await fs.unlink(filePath);
    throw new Error('Malware detected in uploaded file');
  }
  
  return true;
}
```

**Stream Scanning (scan during upload):**
```javascript
const av = clamscan.passthrough();

// Pipe upload through scanner before saving
uploadStream
  .pipe(av)
  .pipe(fs.createWriteStream(destPath));

av.on('scan-complete', ({ isInfected, viruses }) => {
  if (isInfected) {
    fs.unlinkSync(destPath);
  }
});
```

**Best Practices:**
- Scan files before permanent storage
- Keep virus definitions updated (`freshclam`)
- Quarantine infected files, don't just delete
- Log all scan results for auditing
- Consider async scanning for large files
- Test with EICAR test file

---

### 1.6 Serving Uploaded Files Safely

#### Security Headers
When serving uploaded files, include these headers to prevent XSS and content-type sniffing attacks:

```javascript
// Always set these headers when serving user uploads
response.header('X-Content-Type-Options', 'nosniff');
response.header('Content-Disposition', 'attachment; filename="file.jpg"');
response.header('Content-Security-Policy', "default-src 'none'");
response.header('X-Frame-Options', 'DENY');
```

**Header Explanations:**
- `X-Content-Type-Options: nosniff` - Prevents MIME type sniffing
- `Content-Disposition: attachment` - Forces download instead of rendering
- `Content-Security-Policy: default-src 'none'` - Blocks scripts in viewed files

#### Serve from Separate Domain
Serve uploads from a different domain to isolate them from your main application's cookies and session:

```
Main app: app.example.com
Uploads:  uploads.example.com  (or cdn.example.com)
```

This prevents:
- Cookie theft from malicious uploaded files
- Session hijacking via XSS in uploads
- CSRF attacks using uploaded content

#### Use Presigned URLs for S3
Instead of proxying files through your server, use time-limited presigned URLs:

```javascript
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';

async function generateDownloadUrl(key, expiresIn = 3600) {
  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: key,
    ResponseContentDisposition: 'attachment',
    ResponseContentType: 'application/octet-stream'
  });
  
  return getSignedUrl(s3Client, command, { expiresIn });
}
```

**Presigned URL Best Practices:**
- Set short expiration times (5-60 minutes)
- Include Content-Disposition in the URL
- Use minimum necessary permissions
- Generate URLs server-side only
- Don't cache presigned URLs

---

## 2. Common Vulnerabilities & Mistakes

### 2.1 Trusting Content-Type Header

**The Problem:**
The Content-Type header is sent by the client and can be trivially spoofed. Attackers can upload a PHP file with `Content-Type: image/jpeg`.

**Vulnerable Code:**
```javascript
// DANGEROUS - Never do this!
if (file.mimetype === 'image/jpeg') {
  saveFile(file);  // Attacker uploads shell.php with image/jpeg mimetype
}
```

**Impact:**
- Remote code execution
- Web shell uploads
- Server compromise

**Fix:**
Validate file content using magic bytes, not the Content-Type header:
```javascript
const type = await fileTypeFromBuffer(buffer);
if (!type || type.mime !== 'image/jpeg') {
  throw new Error('Invalid file');
}
```

---

### 2.2 Path Traversal Vulnerabilities

**The Problem:**
Using user-supplied filenames without sanitization allows attackers to escape upload directories.

**Vulnerable Code:**
```javascript
// DANGEROUS - Path traversal vulnerability!
const filePath = path.join('/uploads', req.body.filename);
fs.writeFileSync(filePath, data);
// Attacker uses filename: "../../etc/cron.d/malicious"
```

**Common Bypass Techniques:**
- `../../../etc/passwd` - Basic traversal
- `....//....//etc/passwd` - Filter bypass
- `..%2f..%2f` - URL encoded
- `..%252f..%252f` - Double encoded

**Impact:**
- Arbitrary file write (overwrite configs, plant web shells)
- Arbitrary file read (steal credentials, source code)
- System compromise

**Fix:**
```javascript
// Use path.basename() and verify final path
const safeName = path.basename(userFilename);
const finalPath = path.join(uploadsDir, safeName);

if (!finalPath.startsWith(uploadsDir)) {
  throw new Error('Invalid path');
}
```

---

### 2.3 Storing Files in Webroot

**The Problem:**
Files stored in publicly accessible directories can be directly executed by the web server.

**Vulnerable Setup:**
```
/var/www/html/
├── index.php
├── uploads/           <- Publicly accessible!
│   └── shell.php      <- Executes when accessed
```

**Impact:**
- Uploaded PHP/JSP/ASP files get executed
- Direct access to uploaded malware
- Web shell access

**Fix:**
- Store uploads outside webroot
- Use cloud storage (S3)
- Serve through a handler that sets proper headers
- Disable script execution in upload directories

---

### 2.4 No File Size Limits

**The Problem:**
Without size limits, attackers can:
- Exhaust disk space
- Cause memory exhaustion
- Create denial of service

**Vulnerable Code:**
```javascript
// DANGEROUS - No size limit!
app.post('/upload', (req, res) => {
  const data = req.body; // Could be gigabytes
  fs.writeFileSync(path, data);
});
```

**Impact:**
- Denial of service
- Storage exhaustion
- Memory exhaustion
- Increased costs (cloud storage)

**Fix:**
Set limits at multiple levels:
```javascript
// Application level
fastify.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } });

// Nginx level
client_max_body_size 5M;

// S3 presigned URL level
// Use POST policy with content-length-range condition
```

---

### 2.5 Executable File Uploads

**The Problem:**
Allowing upload of executable files (.exe, .php, .sh, .bat) can lead to code execution.

**Vulnerable Code:**
```javascript
// DANGEROUS - Allows any extension!
const ext = path.extname(filename);
if (ext) {  // Just checks extension exists
  saveFile(file);
}
```

**Impact:**
- Remote code execution
- Server compromise
- Malware distribution

**Fix:**
Use strict allowlist:
```javascript
const SAFE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.pdf'];

function validateExtension(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (!SAFE_EXTENSIONS.includes(ext)) {
    throw new Error(`Extension ${ext} not allowed`);
  }
}
```

**Additional Protections:**
- Rename files to remove original extension
- Disable script execution in upload directory
- Reprocess images to strip embedded code

---

### 2.6 Missing Virus Scanning

**The Problem:**
Without virus scanning, your server becomes a malware distribution point.

**Impact:**
- Malware distribution to users
- Legal liability
- Reputation damage
- Potential server compromise

**Consequences:**
- Users download infected files from your platform
- Your domain gets blacklisted
- Compliance violations (HIPAA, PCI-DSS)

**Fix:**
Implement ClamAV or commercial scanning:
```javascript
// Scan before saving to permanent storage
const { isInfected } = await clamscan.scanFile(tempPath);
if (isInfected) {
  await fs.unlink(tempPath);
  throw new Error('Malware detected');
}
// Only save after clean scan
await moveToStorage(tempPath, finalPath);
```

---

## 3. Technology-Specific Audit Checklists

### 3.1 Fastify Multipart Configuration

#### Plugin Registration
```javascript
fastify.register(require('@fastify/multipart'), {
  limits: {
    fieldNameSize: 100,     // Max field name size
    fieldSize: 1000000,     // Max field value size (1MB)
    fields: 10,             // Max non-file fields
    fileSize: 5242880,      // Max file size (5MB)
    files: 1,               // Max files per request
    headerPairs: 2000,      // Max header key-value pairs
    parts: 1000             // Max total parts
  }
});
```

#### Fastify Upload Handler Checklist
- [ ] `limits.fileSize` set appropriately (default is 1MB)
- [ ] `limits.files` set to expected maximum
- [ ] File stream consumed or properly destroyed
- [ ] Extension validated against allowlist
- [ ] Magic bytes verified using `file-type` package
- [ ] Filename sanitized (use `path.basename()`)
- [ ] Random filename generated for storage
- [ ] Error handling for `FilesLimitError`
- [ ] Temporary files cleaned up on error

#### Secure Upload Handler Example
```javascript
fastify.post('/upload', async (request, reply) => {
  const data = await request.file();
  
  if (!data) {
    return reply.code(400).send({ error: 'No file uploaded' });
  }
  
  // 1. Validate extension
  const ext = path.extname(data.filename).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    // Consume and discard the stream
    await data.file.resume();
    return reply.code(400).send({ error: 'Invalid file type' });
  }
  
  // 2. Read to buffer for validation
  const chunks = [];
  for await (const chunk of data.file) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  
  // 3. Validate magic bytes
  const fileType = await fileTypeFromBuffer(buffer);
  if (!fileType || !ALLOWED_MIME_TYPES.includes(fileType.mime)) {
    return reply.code(400).send({ error: 'Invalid file content' });
  }
  
  // 4. Generate secure filename
  const secureFilename = `${randomUUID()}${ext}`;
  
  // 5. Process image (sanitize)
  const processed = await sharp(buffer)
    .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  
  // 6. Virus scan
  const scanResult = await clamscan.scanBuffer(processed);
  if (scanResult.isInfected) {
    return reply.code(400).send({ error: 'File rejected' });
  }
  
  // 7. Upload to S3
  await s3Client.send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: `uploads/${secureFilename}`,
    Body: processed,
    ContentType: fileType.mime
  }));
  
  return { success: true, filename: secureFilename };
});
```

---

### 3.2 S3 Storage Security

#### Bucket Configuration Checklist
- [ ] Block Public Access enabled (account and bucket level)
- [ ] Default encryption enabled (SSE-S3 or SSE-KMS)
- [ ] Bucket versioning enabled
- [ ] HTTPS enforced via bucket policy
- [ ] Access logging enabled to separate bucket
- [ ] Lifecycle rules for cleanup/archival
- [ ] CORS configured with specific origins (not `*`)

#### IAM Policy (Least Privilege)
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::bucket-name/uploads/*"
    }
  ]
}
```

#### Presigned URL Security
- [ ] Short expiration times (5-60 minutes typical)
- [ ] Content-Type specified in presigned URL
- [ ] Content-Disposition set to attachment
- [ ] Generated server-side only
- [ ] User authentication before generating
- [ ] Unique key per upload (include UUID)
- [ ] Validate file key format before generating URL

#### S3 Upload Configuration
```javascript
// Generate presigned URL for upload
const command = new PutObjectCommand({
  Bucket: process.env.S3_BUCKET,
  Key: `uploads/${userId}/${randomUUID()}.jpg`,
  ContentType: 'image/jpeg',
  // Metadata for tracking
  Metadata: {
    'uploaded-by': userId,
    'upload-timestamp': Date.now().toString()
  }
});

const presignedUrl = await getSignedUrl(s3Client, command, {
  expiresIn: 300  // 5 minutes
});
```

---

### 3.3 Image Upload for Events (Application-Specific)

#### Event Image Requirements
Typical requirements for event images:
- Supported formats: JPEG, PNG, WebP
- Maximum size: 5-10 MB
- Maximum dimensions: 4096x4096
- Output format: JPEG/WebP for web delivery
- Storage: S3 with CDN (CloudFront)

#### Processing Pipeline
```javascript
async function processEventImage(buffer, eventId) {
  // 1. Validate format
  const type = await fileTypeFromBuffer(buffer);
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(type?.mime)) {
    throw new Error('Invalid image format');
  }
  
  // 2. Get metadata and validate dimensions
  const metadata = await sharp(buffer).metadata();
  if (metadata.width > 4096 || metadata.height > 4096) {
    throw new Error('Image dimensions too large');
  }
  
  // 3. Generate variants
  const variants = await Promise.all([
    // Thumbnail (200x200)
    sharp(buffer)
      .resize(200, 200, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toBuffer(),
    
    // Preview (800x600)
    sharp(buffer)
      .resize(800, 600, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer(),
    
    // Full size (max 1920px)
    sharp(buffer)
      .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer()
  ]);
  
  // 4. Upload all variants
  const imageId = randomUUID();
  const uploads = [
    { key: `events/${eventId}/${imageId}_thumb.jpg`, body: variants[0] },
    { key: `events/${eventId}/${imageId}_preview.jpg`, body: variants[1] },
    { key: `events/${eventId}/${imageId}_full.jpg`, body: variants[2] }
  ];
  
  await Promise.all(uploads.map(u => 
    s3Client.send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: u.key,
      Body: u.body,
      ContentType: 'image/jpeg',
      CacheControl: 'public, max-age=31536000'
    }))
  ));
  
  return imageId;
}
```

#### Event Image Checklist
- [ ] Validate image format (JPEG, PNG, WebP only)
- [ ] Check dimensions before processing
- [ ] Strip EXIF data (privacy concern)
- [ ] Generate multiple sizes (thumb, preview, full)
- [ ] Use consistent naming convention
- [ ] Set appropriate Cache-Control headers
- [ ] Store image reference in database with event
- [ ] Implement cleanup when event deleted
- [ ] Serve via CDN with proper headers

---

## 4. Pre-Production Audit Summary

### Upload Handler Verification

| Check | Status | Notes |
|-------|--------|-------|
| File size limits configured | ☐ | Max: ___ MB |
| Extension allowlist implemented | ☐ | Allowed: ___ |
| Magic byte validation | ☐ | Using: ___ |
| Filename sanitization | ☐ | |
| Random filename generation | ☐ | |
| Path traversal prevention | ☐ | |
| Virus scanning integrated | ☐ | |
| Error handling complete | ☐ | |
| Temp file cleanup | ☐ | |
| Rate limiting on upload endpoint | ☐ | |

### Storage Verification

| Check | Status | Notes |
|-------|--------|-------|
| Files stored outside webroot | ☐ | |
| S3 Block Public Access enabled | ☐ | |
| S3 encryption enabled | ☐ | Type: ___ |
| HTTPS enforced | ☐ | |
| IAM least privilege | ☐ | |
| Bucket versioning | ☐ | |
| Access logging enabled | ☐ | |
| CORS properly configured | ☐ | |
| Lifecycle rules configured | ☐ | |

### File Serving Verification

| Check | Status | Notes |
|-------|--------|-------|
| X-Content-Type-Options: nosniff | ☐ | |
| Content-Disposition header | ☐ | |
| Served from separate domain | ☐ | Domain: ___ |
| Presigned URLs short-lived | ☐ | TTL: ___ min |
| CDN configured properly | ☐ | |
| Cache headers appropriate | ☐ | |

### Image Processing Verification

| Check | Status | Notes |
|-------|--------|-------|
| Using Sharp (not ImageMagick) | ☐ | |
| Images reprocessed/sanitized | ☐ | |
| EXIF data stripped | ☐ | |
| Dimension limits enforced | ☐ | Max: ___x___ |
| Multiple sizes generated | ☐ | |
| Output format normalized | ☐ | Format: ___ |

---

## 5. Sources & References

### OWASP Guidelines
- OWASP File Upload Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- OWASP Unrestricted File Upload: https://owasp.org/www-community/vulnerabilities/Unrestricted_File_Upload
- OWASP Input Validation Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html
- OWASP Testing for Upload of Unexpected File Types: https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/10-Business_Logic_Testing/08-Test_Upload_of_Unexpected_File_Types

### Web Security Resources
- PortSwigger File Upload Vulnerabilities: https://portswigger.net/web-security/file-upload
- PortSwigger File Upload Functionality: https://portswigger.net/kb/issues/00500980_file-upload-functionality
- SecureFlag Unrestricted File Upload: https://knowledge-base.secureflag.com/vulnerabilities/unrestricted_file_upload/unrestricted_file_upload_vulnerability.html

### File Type Validation
- Wikipedia List of File Signatures: https://en.wikipedia.org/wiki/List_of_file_signatures
- Transloadit Magic Numbers Guide: https://transloadit.com/devtips/secure-api-file-uploads-with-magic-numbers/
- Theodo File Type Security: https://blog.theodo.com/2023/12/mastering-file-upload-security-by-understanding-file-types/

### Path Traversal
- Node.js Security Path Traversal Guide: https://www.nodejs-security.com/blog/secure-coding-practices-nodejs-path-traversal-vulnerabilities
- Node.js Path Traversal Book: https://www.nodejs-security.com/book/path-traversal
- StackHawk Path Traversal Guide: https://www.stackhawk.com/blog/node-js-path-traversal-guide-examples-and-prevention/
- YesWeHack Path Traversal Guide: https://www.yeswehack.com/learn-bug-bounty/practical-guide-path-traversal-attacks

### ImageMagick Security
- ImageTragick: https://imagetragick.com/
- Snyk ImageMagick for Node.js: https://snyk.io/blog/safe-imagemagick-for-node/
- Red Hat ImageTragick: https://access.redhat.com/security/vulnerabilities/ImageTragick
- CVE Details ImageMagick: https://www.cvedetails.com/vulnerability-list/vendor_id-1749/Imagemagick.html

### Sharp Image Processing
- Sharp Documentation: https://sharp.pixelplumbing.com/
- Sharp npm: https://www.npmjs.com/package/sharp
- Sharp GitHub: https://github.com/lovell/sharp
- DigitalOcean Sharp Tutorial: https://www.digitalocean.com/community/tutorials/how-to-process-images-in-node-js-with-sharp
- LogRocket Sharp Guide: https://blog.logrocket.com/processing-images-sharp-node-js/

### Virus Scanning
- ClamAV clamscan npm: https://www.npmjs.com/package/clamscan
- ClamAV GitHub: https://github.com/kylefarris/clamscan
- Transloadit ClamAV Integration: https://transloadit.com/devtips/implementing-server-side-malware-scanning-with-clamav-in-node-js/
- DEV ClamAV Tutorial: https://dev.to/jfbloom22/how-to-virus-scan-file-users-upload-using-clamav-2i5d

### AWS S3 Security
- AWS S3 Security Best Practices: https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-practices.html
- AWS Top 10 S3 Security Practices: https://aws.amazon.com/blogs/security/top-10-security-best-practices-for-securing-data-in-amazon-s3/
- AWS S3 Security Features: https://aws.amazon.com/s3/security/
- Wiz S3 Security Best Practices: https://www.wiz.io/academy/amazon-s3-security-best-practices
- CSA S3 Security Guide: https://cloudsecurityalliance.org/blog/2024/06/10/aws-s3-bucket-security-the-top-cspm-practices

### AWS Presigned URLs
- AWS Presigned URLs Documentation: https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html
- AWS Uploading with Presigned URLs: https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html
- AWS Securing Presigned URLs: https://aws.amazon.com/blogs/compute/securing-amazon-s3-presigned-urls-for-serverless-applications/
- Insecurity Blog Presigned URLs: https://insecurity.blog/2021/03/06/securing-amazon-s3-presigned-urls/

### Fastify Multipart
- Fastify Multipart GitHub: https://github.com/fastify/fastify-multipart
- Fastify Multipart npm: https://www.npmjs.com/package/@fastify/multipart
- Snyk Fastify File Uploads: https://snyk.io/blog/node-js-file-uploads-with-fastify/
- BetterStack Fastify Uploads: https://betterstack.com/community/guides/scaling-nodejs/fastify-file-uploads/

### HTTP Headers
- MDN Content-Disposition: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Disposition
- MDN Content-Type: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Type
- OPSWAT File Upload Best Practices: https://www.opswat.com/blog/file-upload-protection-best-practices

---

*Document generated: December 2024*
*For the most current security recommendations, always refer to official OWASP and vendor documentation.*