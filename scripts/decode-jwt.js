const token = process.argv[2];
if (!token) {
  console.log('Usage: node decode-jwt.js <token>');
  process.exit(1);
}

const parts = token.split('.');
const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
console.log('JWT Payload:', JSON.stringify(payload, null, 2));
