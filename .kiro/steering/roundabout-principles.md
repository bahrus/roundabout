---
inclusion: auto
---

# Roundabout Implementation Steering Principles

## Core Philosophy

1. **Declarative Over Imperative**: Favor JSON-serializable configuration over programmatic API calls
2. **Minimal Coupling**: Keep action functions pure and loosely coupled from the view model structure
3. **Zero Boilerplate**: Reduce developer eyeball time on binding noise and framework ceremony
4. **Testability First**: All action functions should be side-effect free and easily testable in isolation
5. **Performance by Design**: Avoid unnecessary function calls through intelligent dependency tracking

## Code Quality Standards

### Minimal Implementation
- Write only the code needed to solve the immediate problem
- Avoid premature optimization or over-engineering
- Keep functions small and focused on single responsibilities

### Asynchronous by Default
- Methods should be `async` wherever possible
- Embrace the asynchronous nature of the library
- Conditional logic blocks >6-7 lines should be extracted to separate modules
- Use dynamic imports (`import()`) to load conditional code on-demand
- This keeps the main bundle small and loads features only when needed

### Type Safety
- Leverage TypeScript's type system for compile-time safety
- Use generic types to maintain flexibility while ensuring correctness
- Prefer type inference where it improves readability

### Pure Functions
- Action methods must be side-effect free
- State mutations happen only through the roundabout manager's controlled merge process
- All transformations should be deterministic and testable

## Architecture Principles

### Separation of Concerns
- **View Model (VM)**: Single source of truth for all state
- **Actions**: Pure transformation functions that return partial state updates
- **Propagator**: EventTarget for change notifications
- **Configuration**: Declarative rules for reactive behavior

### Progressive Enhancement
- Support three levels of developer control:
  1. **Compacts**: Convention-based, minimal syntax for common patterns
  2. **Infractions/Positractions**: Inferred dependencies with moderate configuration
  3. **Actions**: Full explicit control for complex scenarios

### Memory Safety
- Always use AbortSignal (disconnectedSignal) for cleanup
- Leverage WeakRef where appropriate to prevent memory leaks
- Automatic subscription management through the roundabout lifecycle

## Implementation Strategy

### Incremental Development
- Build features in small, testable increments
- Start with core functionality before adding syntactic sugar
- Validate each feature with practical examples

### JSON Serializability
- Default to string-based references for methods/properties
- Support inline functions for rapid prototyping
- Provide clear migration path from inline to serializable

### Developer Experience
- Prioritize clear error messages
- Support both TypeScript and JavaScript usage
- Maintain backward compatibility within major versions

## Testing Approach

### Playwright-Based Testing
- Use Playwright for all integration and end-to-end tests
- Test server runs on port 8000 via `npm run serve` (configured in playwright.config.ts)
- Keep spec files minimal - they should only navigate and assert final state
- Place validation logic in HTML test files for easy browser debugging

### Test File Structure
- Spec files: `tests/*.spec.mjs` - minimal navigation and assertions
- Test pages: `tests/*.html` - contains the actual test logic and validation
- HTML files should set a `mark` attribute (or similar) to indicate pass/fail state
- This allows opening HTML files directly in a browser for troubleshooting

### Example Test Pattern
```javascript
// tests/Example1.spec.mjs
import { test, expect } from '@playwright/test';
test('Example1', async ({ page }) => {
  await page.goto('./tests/Example1.html');
  await page.waitForTimeout(2000);
  const target = page.locator('#target');
  await expect(target).toHaveAttribute('mark', 'good');
});
```

### Testing Priorities
- Integration tests for roundabout manager behavior
- Real-world examples as acceptance tests
- Pure functions can be tested within HTML test pages
- Performance benchmarks for reactive updates

## Naming Conventions

- Use descriptive, self-documenting names
- Follow established patterns (e.g., `new{PropertyName}` for instantiation)
- Maintain consistency with existing JavaScript/TypeScript conventions
- Prefer clarity over brevity

## Dependencies

- Minimize external dependencies
- Use platform features where available (EventTarget, AbortSignal, WeakRef)
- Leverage modern JavaScript features (Map.getOrInsertComputed, etc.)
- Keep bundle size small for browser usage

## Legacy Code Reference

- The `legacy/` folder contains a working implementation that this library will replace
- Use legacy code as reference for understanding requirements and behavior
- **NEVER compile, modify, or import from the legacy folder**
- Legacy code is read-only documentation, not part of the build process
