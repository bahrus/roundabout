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

- Unit test all pure functions in isolation
- Integration tests for roundabout manager behavior
- Real-world examples as acceptance tests
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
