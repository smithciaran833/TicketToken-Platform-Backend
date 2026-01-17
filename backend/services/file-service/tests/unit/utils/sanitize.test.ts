describe('utils/sanitize', () => {
  let sanitize: any;

  beforeEach(() => {
    jest.resetModules();
    sanitize = require('../../../src/utils/sanitize');
  });

  describe('escapeHtml', () => {
    it('should escape ampersand', () => {
      expect(sanitize.escapeHtml('foo & bar')).toBe('foo &amp; bar');
    });

    it('should escape less than', () => {
      expect(sanitize.escapeHtml('a < b')).toBe('a &lt; b');
    });

    it('should escape greater than', () => {
      expect(sanitize.escapeHtml('a > b')).toBe('a &gt; b');
    });

    it('should escape double quote', () => {
      expect(sanitize.escapeHtml('say "hello"')).toBe('say &quot;hello&quot;');
    });

    it('should escape single quote', () => {
      expect(sanitize.escapeHtml("it's")).toBe('it&#x27;s');
    });

    it('should escape forward slash', () => {
      expect(sanitize.escapeHtml('path/to/file')).toBe('path&#x2F;to&#x2F;file');
    });

    it('should escape backtick', () => {
      expect(sanitize.escapeHtml('text `code` text')).toBe('text &#x60;code&#x60; text');
    });

    it('should escape equals sign', () => {
      expect(sanitize.escapeHtml('x=5')).toBe('x&#x3D;5');
    });

    it('should escape XSS attempt', () => {
      const xss = '<script>alert("xss")</script>';
      const escaped = sanitize.escapeHtml(xss);
      expect(escaped).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;');
    });

    it('should return empty string for null', () => {
      expect(sanitize.escapeHtml(null)).toBe('');
    });

    it('should return empty string for undefined', () => {
      expect(sanitize.escapeHtml(undefined)).toBe('');
    });

    it('should return empty string for non-string', () => {
      expect(sanitize.escapeHtml(123 as any)).toBe('');
    });
  });

  describe('escapeXml', () => {
    it('should escape XML entities', () => {
      expect(sanitize.escapeXml('a & b')).toBe('a &amp; b');
      expect(sanitize.escapeXml('a < b')).toBe('a &lt; b');
      expect(sanitize.escapeXml('a > b')).toBe('a &gt; b');
    });

    it('should escape quotes', () => {
      expect(sanitize.escapeXml('"test"')).toBe('&quot;test&quot;');
      expect(sanitize.escapeXml("'test'")).toBe('&apos;test&apos;');
    });

    it('should return empty for null/undefined', () => {
      expect(sanitize.escapeXml(null)).toBe('');
      expect(sanitize.escapeXml(undefined)).toBe('');
    });
  });

  describe('sanitizeSvgText', () => {
    it('should escape XML entities', () => {
      const result = sanitize.sanitizeSvgText('Hello & World');
      expect(result).toBe('Hello &amp; World');
    });

    it('should remove script tags', () => {
      const result = sanitize.sanitizeSvgText('text<script>alert("xss")</script>more');
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('</script>');
    });

    it('should remove javascript: protocol', () => {
      const result = sanitize.sanitizeSvgText('javascript:alert(1)');
      expect(result).not.toContain('javascript:');
    });

    it('should remove on event handlers', () => {
      const result = sanitize.sanitizeSvgText('text onclick=alert(1)');
      expect(result).not.toContain('onclick=');
    });

    it('should remove data: protocol', () => {
      const result = sanitize.sanitizeSvgText('data:text/html,<script>alert(1)</script>');
      expect(result).not.toContain('data:');
    });

    it('should remove control characters', () => {
      const text = 'hello\x00\x01\x1Fworld';
      const result = sanitize.sanitizeSvgText(text);
      expect(result).toBe('helloworld');
    });

    it('should limit length to default 100', () => {
      const longText = 'a'.repeat(200);
      const result = sanitize.sanitizeSvgText(longText);
      expect(result.length).toBe(100);
    });

    it('should limit length to custom value', () => {
      const longText = 'a'.repeat(200);
      const result = sanitize.sanitizeSvgText(longText, 50);
      expect(result.length).toBe(50);
    });

    it('should trim whitespace', () => {
      const result = sanitize.sanitizeSvgText('  hello  ');
      expect(result).toBe('hello');
    });

    it('should return empty string for null/undefined', () => {
      expect(sanitize.sanitizeSvgText(null)).toBe('');
      expect(sanitize.sanitizeSvgText(undefined)).toBe('');
    });
  });

  describe('sanitizeColor', () => {
    it('should allow valid 6-digit hex colors', () => {
      expect(sanitize.sanitizeColor('#ff0000')).toBe('#ff0000');
      expect(sanitize.sanitizeColor('#ABCDEF')).toBe('#ABCDEF');
      expect(sanitize.sanitizeColor('#123456')).toBe('#123456');
    });

    it('should expand 3-digit hex colors', () => {
      expect(sanitize.sanitizeColor('#fff')).toBe('#ffffff');
      expect(sanitize.sanitizeColor('#abc')).toBe('#aabbcc');
      expect(sanitize.sanitizeColor('#123')).toBe('#112233');
    });

    it('should allow safe named colors', () => {
      expect(sanitize.sanitizeColor('black')).toBe('black');
      expect(sanitize.sanitizeColor('white')).toBe('white');
      expect(sanitize.sanitizeColor('red')).toBe('red');
      expect(sanitize.sanitizeColor('transparent')).toBe('transparent');
    });

    it('should normalize named colors to lowercase', () => {
      expect(sanitize.sanitizeColor('BLACK')).toBe('black');
      expect(sanitize.sanitizeColor('Blue')).toBe('blue');
    });

    it('should reject invalid hex colors', () => {
      expect(sanitize.sanitizeColor('#gg0000')).toBe('#000000');
      expect(sanitize.sanitizeColor('#ff')).toBe('#000000');
      expect(sanitize.sanitizeColor('ff0000')).toBe('#000000');
    });

    it('should reject dangerous named colors', () => {
      expect(sanitize.sanitizeColor('expression(alert(1))')).toBe('#000000');
      expect(sanitize.sanitizeColor('url(javascript:alert(1))')).toBe('#000000');
    });

    it('should default to black for invalid input', () => {
      expect(sanitize.sanitizeColor('')).toBe('#000000');
      expect(sanitize.sanitizeColor(null as any)).toBe('#000000');
      expect(sanitize.sanitizeColor(undefined as any)).toBe('#000000');
    });
  });

  describe('sanitizeFilename', () => {
    it('should remove path traversal attempts', () => {
      expect(sanitize.sanitizeFilename('../../../etc/passwd')).toBe('etc_passwd');
    });

    it('should remove absolute path indicators', () => {
      expect(sanitize.sanitizeFilename('/etc/passwd')).toBe('etc_passwd');
      expect(sanitize.sanitizeFilename('C:\\Windows\\System32')).toBe('_Windows_System32');
    });

    it('should remove null bytes', () => {
      expect(sanitize.sanitizeFilename('file\x00name.txt')).toBe('filename.txt');
    });

    it('should replace unsafe characters with underscore', () => {
      expect(sanitize.sanitizeFilename('file@name!.txt')).toBe('file_name_.txt');
      expect(sanitize.sanitizeFilename('file#name$.txt')).toBe('file_name_.txt');
    });

    it('should preserve safe characters', () => {
      expect(sanitize.sanitizeFilename('my-file_v2.1.pdf')).toBe('my-file_v2.1.pdf');
      expect(sanitize.sanitizeFilename('document 2024.docx')).toBe('document 2024.docx');
    });

    it('should remove leading/trailing dots and spaces', () => {
      expect(sanitize.sanitizeFilename('...file.txt')).toBe('file.txt');
      expect(sanitize.sanitizeFilename('file.txt...')).toBe('file.txt');
      expect(sanitize.sanitizeFilename('  file.txt  ')).toBe('file.txt');
    });

    it('should limit length to default 255', () => {
      const longName = 'a'.repeat(300) + '.txt';
      const result = sanitize.sanitizeFilename(longName);
      expect(result.length).toBe(255);
    });

    it('should limit length to custom value', () => {
      const longName = 'a'.repeat(100) + '.txt';
      const result = sanitize.sanitizeFilename(longName, 50);
      expect(result.length).toBe(50);
    });

    it('should return unnamed for empty/invalid input', () => {
      expect(sanitize.sanitizeFilename('')).toBe('unnamed');
      expect(sanitize.sanitizeFilename(null as any)).toBe('unnamed');
      expect(sanitize.sanitizeFilename('...')).toBe('unnamed');
    });
  });

  describe('getSafeExtension', () => {
    it('should extract file extension', () => {
      expect(sanitize.getSafeExtension('file.txt')).toBe('txt');
      expect(sanitize.getSafeExtension('document.pdf')).toBe('pdf');
      expect(sanitize.getSafeExtension('image.jpeg')).toBe('jpeg');
    });

    it('should lowercase extension', () => {
      expect(sanitize.getSafeExtension('FILE.TXT')).toBe('txt');
      expect(sanitize.getSafeExtension('Image.JPEG')).toBe('jpeg');
    });

    it('should handle multiple dots', () => {
      expect(sanitize.getSafeExtension('archive.tar.gz')).toBe('gz');
      expect(sanitize.getSafeExtension('file.backup.txt')).toBe('txt');
    });

    it('should return empty string for no extension', () => {
      expect(sanitize.getSafeExtension('filename')).toBe('');
      expect(sanitize.getSafeExtension('noext')).toBe('');
    });

    it('should handle hidden files', () => {
      expect(sanitize.getSafeExtension('.gitignore')).toBe('gitignore');
      expect(sanitize.getSafeExtension('.env.local')).toBe('local');
    });
  });

  describe('isAllowedMimeType', () => {
    it('should allow image types', () => {
      expect(sanitize.isAllowedMimeType('image/jpeg')).toBe(true);
      expect(sanitize.isAllowedMimeType('image/png')).toBe(true);
      expect(sanitize.isAllowedMimeType('image/gif')).toBe(true);
      expect(sanitize.isAllowedMimeType('image/webp')).toBe(true);
    });

    it('should allow document types', () => {
      expect(sanitize.isAllowedMimeType('application/pdf')).toBe(true);
      expect(sanitize.isAllowedMimeType('application/msword')).toBe(true);
      expect(sanitize.isAllowedMimeType('text/plain')).toBe(true);
      expect(sanitize.isAllowedMimeType('text/csv')).toBe(true);
    });

    it('should allow video types', () => {
      expect(sanitize.isAllowedMimeType('video/mp4')).toBe(true);
      expect(sanitize.isAllowedMimeType('video/webm')).toBe(true);
    });

    it('should allow audio types', () => {
      expect(sanitize.isAllowedMimeType('audio/mpeg')).toBe(true);
      expect(sanitize.isAllowedMimeType('audio/wav')).toBe(true);
    });

    it('should reject dangerous types', () => {
      expect(sanitize.isAllowedMimeType('application/x-msdownload')).toBe(false);
      expect(sanitize.isAllowedMimeType('application/x-exe')).toBe(false);
      expect(sanitize.isAllowedMimeType('text/html')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(sanitize.isAllowedMimeType('IMAGE/JPEG')).toBe(true);
      expect(sanitize.isAllowedMimeType('Application/PDF')).toBe(true);
    });

    it('should reject empty/invalid', () => {
      expect(sanitize.isAllowedMimeType('')).toBe(false);
      expect(sanitize.isAllowedMimeType(null as any)).toBe(false);
    });
  });

  describe('sanitizeMimeType', () => {
    it('should keep allowed types', () => {
      expect(sanitize.sanitizeMimeType('image/jpeg')).toBe('image/jpeg');
      expect(sanitize.sanitizeMimeType('application/pdf')).toBe('application/pdf');
    });

    it('should normalize to lowercase', () => {
      expect(sanitize.sanitizeMimeType('IMAGE/JPEG')).toBe('image/jpeg');
    });

    it('should default to octet-stream for dangerous types', () => {
      expect(sanitize.sanitizeMimeType('application/x-exe')).toBe('application/octet-stream');
      expect(sanitize.sanitizeMimeType('text/html')).toBe('application/octet-stream');
    });

    it('should default to octet-stream for empty', () => {
      expect(sanitize.sanitizeMimeType('')).toBe('application/octet-stream');
      expect(sanitize.sanitizeMimeType(null as any)).toBe('application/octet-stream');
    });
  });

  describe('sanitizeUrl', () => {
    it('should allow http URLs', () => {
      expect(sanitize.sanitizeUrl('http://example.com')).toBe('http://example.com');
    });

    it('should allow https URLs', () => {
      expect(sanitize.sanitizeUrl('https://example.com')).toBe('https://example.com');
    });

    it('should allow relative URLs', () => {
      expect(sanitize.sanitizeUrl('/path/to/file')).toBe('/path/to/file');
      expect(sanitize.sanitizeUrl('path/file.jpg')).toBe('path/file.jpg');
    });

    it('should block javascript: protocol', () => {
      expect(sanitize.sanitizeUrl('javascript:alert(1)')).toBe('');
      expect(sanitize.sanitizeUrl('JAVASCRIPT:alert(1)')).toBe('');
    });

    it('should block data: protocol', () => {
      expect(sanitize.sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    });

    it('should block vbscript: protocol', () => {
      expect(sanitize.sanitizeUrl('vbscript:msgbox(1)')).toBe('');
    });

    it('should block file: protocol', () => {
      expect(sanitize.sanitizeUrl('file:///etc/passwd')).toBe('');
    });

    it('should trim whitespace', () => {
      expect(sanitize.sanitizeUrl('  http://example.com  ')).toBe('http://example.com');
    });

    it('should return empty for null/undefined', () => {
      expect(sanitize.sanitizeUrl('')).toBe('');
      expect(sanitize.sanitizeUrl(null as any)).toBe('');
    });
  });

  describe('sanitizeSqlString', () => {
    it('should remove quotes', () => {
      expect(sanitize.sanitizeSqlString("test'")).not.toContain("'");
      expect(sanitize.sanitizeSqlString('test"')).not.toContain('"');
      expect(sanitize.sanitizeSqlString('test;')).not.toContain(';');
    });

    it('should remove SQL comments', () => {
      expect(sanitize.sanitizeSqlString('test--comment')).not.toContain('--');
      expect(sanitize.sanitizeSqlString('test/*comment*/')).not.toContain('/*');
    });

    it('should remove SQL keywords', () => {
      const result = sanitize.sanitizeSqlString('SELECT * FROM users');
      expect(result.toLowerCase()).not.toContain('select');
    });

    it('should remove dangerous keywords', () => {
      expect(sanitize.sanitizeSqlString('DROP TABLE users')).not.toMatch(/drop/i);
      expect(sanitize.sanitizeSqlString('DELETE FROM users')).not.toMatch(/delete/i);
      expect(sanitize.sanitizeSqlString('EXEC sp_')).not.toMatch(/exec/i);
    });

    it('should return empty for null/undefined', () => {
      expect(sanitize.sanitizeSqlString(null as any)).toBe('');
      expect(sanitize.sanitizeSqlString(undefined as any)).toBe('');
    });
  });

  describe('sanitizeHeaderValue', () => {
    it('should remove newlines', () => {
      expect(sanitize.sanitizeHeaderValue('value\ninjection')).toBe('valueinjection');
      expect(sanitize.sanitizeHeaderValue('value\r\nmore')).toBe('valuemore');
    });

    it('should remove control characters', () => {
      const text = 'test\x00\x01\x1Fvalue';
      expect(sanitize.sanitizeHeaderValue(text)).toBe('testvalue');
    });

    it('should prevent header injection', () => {
      const injection = 'value\r\nX-Injected: header';
      expect(sanitize.sanitizeHeaderValue(injection)).not.toContain('\r\n');
    });

    it('should return empty for null/undefined', () => {
      expect(sanitize.sanitizeHeaderValue(null as any)).toBe('');
      expect(sanitize.sanitizeHeaderValue(undefined as any)).toBe('');
    });
  });

  describe('sanitizeWatermarkOptions', () => {
    it('should sanitize text', () => {
      const options = { text: '<script>alert(1)</script>' };
      const result = sanitize.sanitizeWatermarkOptions(options);
      expect(result.text).not.toContain('<script>');
    });

    it('should validate position', () => {
      const result1 = sanitize.sanitizeWatermarkOptions({ position: 'center' });
      expect(result1.position).toBe('center');

      const result2 = sanitize.sanitizeWatermarkOptions({ position: 'invalid' as any });
      expect(result2.position).toBe('center');
    });

    it('should clamp opacity between 0 and 1', () => {
      expect(sanitize.sanitizeWatermarkOptions({ opacity: -0.5 }).opacity).toBe(0);
      expect(sanitize.sanitizeWatermarkOptions({ opacity: 1.5 }).opacity).toBe(1);
      expect(sanitize.sanitizeWatermarkOptions({ opacity: 0.5 }).opacity).toBe(0.5);
    });

    it('should clamp fontSize between 10 and 200', () => {
      expect(sanitize.sanitizeWatermarkOptions({ fontSize: 5 }).fontSize).toBe(10);
      expect(sanitize.sanitizeWatermarkOptions({ fontSize: 300 }).fontSize).toBe(200);
      expect(sanitize.sanitizeWatermarkOptions({ fontSize: 24 }).fontSize).toBe(24);
    });

    it('should sanitize color', () => {
      const result = sanitize.sanitizeWatermarkOptions({ color: '#ff0000' });
      expect(result.color).toBe('#ff0000');

      const result2 = sanitize.sanitizeWatermarkOptions({ color: 'invalid' });
      expect(result2.color).toBe('#000000');
    });

    it('should provide defaults', () => {
      const result = sanitize.sanitizeWatermarkOptions({});
      expect(result.text).toBe('');
      expect(result.position).toBe('center');
      expect(result.opacity).toBe(0.5);
      expect(result.fontSize).toBe(24);
      expect(result.color).toBe('#000000');
    });
  });
});
