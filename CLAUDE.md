# EVEM Development Guide

## Commands
- **Run all tests**: `pnpm test:nowatch`
- **Run single test**: `pnpm test:nowatch -- tests/priority.test.ts`
- **Run specific test pattern**: `pnpm test:nowatch -- -t "callbacks should be executed in priority order"`
- **Coverage report**: `pnpm test:coverage`

## Code Style Guidelines
- **Imports**: Use named imports; sort imports alphabetically
- **Types**: Strong typing with TS; use interfaces for public APIs and types for internal structures
- **Naming**: camelCase for variables/methods; PascalCase for classes/interfaces; UPPERCASE for constants
- **Error Handling**: Use specific error messages; handle async errors with try/catch; use Promise rejection for async failures
- **Documentation**: JSDoc comments for public APIs
- **Formatting**: TypeScript/ESLint standards; consistent spacing and indentation
- **General**: Prioritize readability and maintainability
- **Testing**: TDD; always test first and use the tests to validate simple designs. 

## Architecture
- Modular event emitter with namespacing, filtering, throttling, debouncing, and priority features
- Minimize dependencies; focus on performance and reliability