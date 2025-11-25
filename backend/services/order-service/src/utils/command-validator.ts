/**
 * Command Validation Utilities
 * Prevents command injection attacks by validating and sanitizing shell commands
 */

import { logger } from './logger';
import { securityConfig } from '../config/security.config';

/**
 * Check if command execution is enabled
 */
export function isCommandExecutionEnabled(): boolean {
  return securityConfig.commandExecution.enabled;
}

/**
 * Validate command against whitelist
 */
export function isCommandAllowed(command: string): boolean {
  if (!command || typeof command !== 'string') {
    return false;
  }

  const allowedCommands = securityConfig.commandExecution.allowedCommands;
  
  // Extract the base command (first word)
  const baseCommand = command.trim().split(/\s+/)[0];

  return allowedCommands.includes(baseCommand);
}

/**
 * Detect dangerous command patterns
 */
export function containsDangerousPatterns(command: string): boolean {
  if (!command || typeof command !== 'string') {
    return false;
  }

  const dangerousPatterns = [
    /[;&|`$()]/,              // Shell operators
    /\$\{.*\}/,                 // Variable expansion
    /\$\(.*\)/,                 // Command substitution
    /`.*`/,                     // Backtick command substitution
    />>/,                       // Append redirect
    />/,                        // Output redirect
    /<</,                       // Here document
    /</,                        // Input redirect
    /\|\|/,                     // Logical OR
    /&&/,                       // Logical AND
    /\n/,                       // Newline (command chaining)
    /\r/,                       // Carriage return
    /\\\\/,                     // Escaped backslash
    /sudo/i,                    // Privilege escalation
    /su\s/i,                    // Switch user
    /chmod/i,                   // Change permissions
    /chown/i,                   // Change ownership
    /rm\s+-rf/i,                // Dangerous delete
    /mkfs/i,                    // Format filesystem
    /dd\s+/i,                   // Disk operations
    /wget/i,                    // Download files
    /curl/i,                    // Download files
    /nc\s+/i,                   // Netcat
    /telnet/i,                  // Telnet
    /ssh/i,                     // SSH
    /ftp/i,                     // FTP
  ];

  return dangerousPatterns.some(pattern => pattern.test(command));
}

/**
 * Sanitize command arguments
 */
export function sanitizeArguments(args: string[]): string[] {
  return args.map(arg => {
    // Remove or escape dangerous characters
    return arg
      .replace(/[;&|`$()]/g, '')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/'/g, "\\'");
  });
}

/**
 * Validate and sanitize a command
 * Throws error if command is invalid or dangerous
 */
export function validateCommand(command: string, args: string[] = []): {
  valid: boolean;
  sanitizedCommand: string;
  sanitizedArgs: string[];
  errors: string[];
} {
  const errors: string[] = [];

  // Check if command execution is enabled
  if (!isCommandExecutionEnabled()) {
    errors.push('Command execution is disabled');
    return {
      valid: false,
      sanitizedCommand: '',
      sanitizedArgs: [],
      errors,
    };
  }

  // Validate command string
  if (!command || typeof command !== 'string') {
    errors.push('Command must be a non-empty string');
  }

  // Check against whitelist
  if (!isCommandAllowed(command)) {
    errors.push(`Command "${command}" is not in the allowed list`);
  }

  // Check for dangerous patterns
  if (containsDangerousPatterns(command)) {
    errors.push('Command contains dangerous patterns');
    logger.warn('Dangerous command pattern detected', {
      command,
      args,
    });
  }

  // Check arguments
  if (args && args.length > 0) {
    for (const arg of args) {
      if (containsDangerousPatterns(arg)) {
        errors.push(`Argument "${arg}" contains dangerous patterns`);
        logger.warn('Dangerous argument pattern detected', {
          command,
          arg,
        });
      }
    }
  }

  const sanitizedArgs = args.length > 0 ? sanitizeArguments(args) : [];

  return {
    valid: errors.length === 0,
    sanitizedCommand: command,
    sanitizedArgs,
    errors,
  };
}

/**
 * Build safe command string
 * Returns null if command is invalid
 */
export function buildSafeCommand(
  command: string,
  args: string[] = []
): string | null {
  const validation = validateCommand(command, args);

  if (!validation.valid) {
    logger.error('Command validation failed', {
      command,
      args,
      errors: validation.errors,
    });
    return null;
  }

  // Build command with properly escaped arguments
  if (validation.sanitizedArgs.length > 0) {
    const escapedArgs = validation.sanitizedArgs.map(arg => `"${arg}"`);
    return `${validation.sanitizedCommand} ${escapedArgs.join(' ')}`;
  }

  return validation.sanitizedCommand;
}

/**
 * Execute a validated command (async)
 * This is a wrapper that should be used instead of child_process.exec
 */
export async function executeValidatedCommand(
  command: string,
  args: string[] = [],
  options: any = {}
): Promise<{ stdout: string; stderr: string }> {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  const safeCommand = buildSafeCommand(command, args);

  if (!safeCommand) {
    throw new Error('Command validation failed');
  }

  logger.info('Executing validated command', {
    command: safeCommand,
  });

  try {
    const result = await execAsync(safeCommand, {
      ...options,
      timeout: 30000, // 30 second timeout
      maxBuffer: 1024 * 1024, // 1MB buffer
    });

    return {
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    };
  } catch (error) {
    logger.error('Command execution failed', {
      command: safeCommand,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

export default {
  isCommandExecutionEnabled,
  isCommandAllowed,
  containsDangerousPatterns,
  sanitizeArguments,
  validateCommand,
  buildSafeCommand,
  executeValidatedCommand,
};
