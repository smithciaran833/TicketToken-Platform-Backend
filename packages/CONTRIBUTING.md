# Contributing to TicketToken SDK

First off, thank you for considering contributing to TicketToken SDK! It's people like you that make TicketToken SDK such a great tool.

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the issue list as you might find out that you don't need to create one. When you are creating a bug report, please include as many details as possible:

* **Use a clear and descriptive title**
* **Describe the exact steps to reproduce the problem**
* **Provide specific examples to demonstrate the steps**
* **Describe the behavior you observed after following the steps**
* **Explain which behavior you expected to see instead and why**
* **Include screenshots or animated GIFs if possible**
* **Include your environment details** (OS, Node version, SDK version)

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please include:

* **Use a clear and descriptive title**
* **Provide a step-by-step description of the suggested enhancement**
* **Provide specific examples to demonstrate the steps**
* **Describe the current behavior** and **explain which behavior you expected to see**
* **Explain why this enhancement would be useful**

### Pull Requests

* Fill in the required template
* Follow the TypeScript styleguide
* Include tests for new features
* Update documentation as needed
* End all files with a newline
* Ensure all tests pass before submitting

## Development Process

### Setting Up Your Environment

1. **Fork the repository**
   ```bash
   # Fork on GitHub, then clone your fork
   git clone https://github.com/YOUR_USERNAME/tickettoken-sdk.git
   cd tickettoken-sdk/packages
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Create a branch**
   ```bash
   git checkout -b feature/my-new-feature
   # or
   git checkout -b fix/my-bug-fix
   ```

### Running Tests

```bash
# Run all tests
npm test

# Run tests for specific package
npm test -- sdk-typescript

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage
```

### Building

```bash
# Build all packages
npm run build

# Build specific package
npm run build -- sdk-typescript

# Build in watch mode for development
npm run dev
```

### Linting

```bash
# Lint all packages
npm run lint

# Fix linting issues
npm run lint:fix

# Type check
npm run type-check
```

## Styleguides

### Git Commit Messages

* Use the present tense ("Add feature" not "Added feature")
* Use the imperative mood ("Move cursor to..." not "Moves cursor to...")
* Limit the first line to 72 characters or less
* Reference issues and pull requests liberally after the first line
* Consider starting the commit message with an applicable emoji:
    * 🎨 `:art:` - Improving structure/format
    * ⚡️ `:zap:` - Improving performance
    * 🔥 `:fire:` - Removing code or files
    * 🐛 `:bug:` - Fixing a bug
    * 🚑 `:ambulance:` - Critical hotfix
    * ✨ `:sparkles:` - Introducing new features
    * 📝 `:memo:` - Writing docs
    * 🚀 `:rocket:` - Deploying stuff
    * 💄 `:lipstick:` - Updating UI/style
    * 🎉 `:tada:` - Initial commit
    * ✅ `:white_check_mark:` - Adding tests
    * 🔒 `:lock:` - Fixing security issues
    * ⬆️ `:arrow_up:` - Upgrading dependencies
    * ⬇️ `:arrow_down:` - Downgrading dependencies
    * 🔧 `:wrench:` - Changing configuration

### TypeScript Styleguide

* Use TypeScript strict mode
* Prefer `const` over `let`, avoid `var`
* Use meaningful variable names
* Add JSDoc comments for public APIs
* Use type annotations for function parameters and return types
* Prefer interfaces over type aliases for object types
* Use async/await over Promise chains
* Keep functions small and focused
* Follow the existing code style

```typescript
/**
 * Fetch events with pagination
 * @param params - Search and pagination parameters
 * @returns Paginated list of events
 */
export async function fetchEvents(
  params: SearchParams
): Promise<PaginatedResponse<Event>> {
  // Implementation
}
```

### Documentation Styleguide

* Use [Markdown](https://guides.github.com/features/mastering-markdown/)
* Reference functions/classes in backticks
* Include code examples where appropriate
* Keep line length to 80-100 characters
* Use proper heading hierarchy

## Package Structure

```
packages/
├── sdk-typescript/     # Core TypeScript SDK
├── sdk-javascript/     # Browser-optimized JavaScript SDK
├── sdk-react/         # React hooks and components
└── tests/             # Integration tests
```

### Adding a New Feature

1. **Start with tests** - Write failing tests first (TDD)
2. **Implement the feature** - Make the tests pass
3. **Update types** - Ensure TypeScript types are correct
4. **Add documentation** - Update README and inline comments
5. **Add examples** - Include usage examples
6. **Update changelog** - Document the change

### Package-Specific Guidelines

#### TypeScript SDK (`sdk-typescript`)
* This is the core package - changes here affect all other packages
* Maintain backward compatibility when possible
* Export all public APIs through `src/index.ts`
* Include comprehensive JSDoc comments

#### JavaScript SDK (`sdk-javascript`)
* Must work in browsers without transpilation
* Keep bundle size small
* Test in multiple browsers
* Provide polyfills where needed

#### React SDK (`sdk-react`)
* Follow React best practices
* Use hooks over class components
* Ensure SSR compatibility
* Test with React Testing Library

## Testing Guidelines

### Unit Tests
* Test individual functions in isolation
* Mock external dependencies
* Aim for 80%+ code coverage
* Use descriptive test names

```typescript
describe('maskSensitiveData', () => {
  it('should mask middle characters of string', () => {
    const result = maskSensitiveData('secret123456', 4);
    expect(result).toBe('secr**3456');
  });
});
```

### Integration Tests
* Test multiple components together
* Use real implementations where possible
* Test error scenarios
* Test edge cases

### E2E Tests
* Test complete user workflows
* Use actual API calls (mocked backend)
* Test critical paths thoroughly

## Release Process

Releases are handled by maintainers. The process is:

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Create a git tag
4. Push to GitHub
5. Automated CI publishes to npm

## Community

* **Discussions**: Use GitHub Discussions for questions
* **Issues**: Use GitHub Issues for bugs and features
* **Pull Requests**: Submit PRs following the guidelines above

## Recognition

Contributors are recognized in:
* README.md contributors section
* Release notes
* CHANGELOG.md

## Questions?

Feel free to open an issue with the `question` label or start a discussion!

---

Thank you for contributing! 🎉
