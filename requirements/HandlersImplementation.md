# Handlers Implementation

## Status: ✅ Complete

All tests passing (28/28)

## Implementation Summary

Handlers have been implemented to provide declarative wiring between EventTarget properties and methods, with automatic listener management and cleanup.

## Files Modified/Created

### Core Implementation
- `processors/handlers.ts` - Main handler processor implementation
- `utils/PropagatorSetup.ts` - Added handler property inference to `inferPropertiesToMonitor()`

### Tests Created
- `tests/handlers/basic-handler.html` - Basic EventTarget to method test
- `tests/handlers/basic-handler.spec.mjs` - Test spec
- `tests/handlers/weakref-handler.html` - WeakRef<EventTarget> support test
- `tests/handlers/weakref-handler.spec.mjs` - Test spec
- `tests/handlers/handler-change.html` - Dynamic EventTarget change test
- `tests/handlers/handler-change.spec.mjs` - Test spec

### Documentation
- `requirements/Handlers.md` - Feature documentation
- `requirements/HandlersImplementation.md` - This file

## Implementation Details

### Pattern Parsing

Handlers use the pattern: `eventTargetProp_to_methodName_on: 'event-name'`

The parser extracts:
- `eventTargetProp` - Property holding the EventTarget
- `methodName` - Method to call when event fires
- `event-name` - Event type to listen for

### EventTarget Resolution

The implementation handles both:
1. Direct EventTarget references: `property: EventTarget`
2. WeakRef references: `property: WeakRef<EventTarget>`

The `resolveEventTarget()` function checks for WeakRef and calls `deref()` if needed.

### Listener Management

Each handler maintains:
- An AbortController for the current listener
- A property change listener to detect EventTarget changes
- Cleanup functions for proper teardown

When the EventTarget property changes:
1. Old listener is aborted and removed
2. New EventTarget is resolved (handling WeakRef)
3. New listener is attached with fresh AbortController

### Method Invocation

When an event fires:
1. The handler method is called with `(vm, event)` parameters
2. Result is awaited if it's a Promise (async support)
3. If result is an object, it's merged back via `assignGingerly`
4. Errors are caught and logged

### Property Monitoring

Handler properties are automatically added to the propagator's monitored properties in `inferPropertiesToMonitor()`:

```typescript
// Infer from handlers
if (options.handlers) {
    for (const key of Object.keys(options.handlers)) {
        // eventTargetProp_to_methodName_on
        const match = key.match(/^(.+)_to_(.+)_on$/);
        if (match) props.add(match[1]); // Add the EventTarget property
    }
}
```

This ensures the EventTarget property is converted to a getter/setter that fires change events.

### Cleanup

The processor returns a cleanup function that:
1. Aborts all active event listeners
2. Removes property change listeners
3. Clears internal tracking structures

This cleanup is called automatically when the roundabout is disconnected.

## Test Results

All 3 handler tests pass:
1. ✅ Basic EventTarget to method
2. ✅ WeakRef EventTarget to method  
3. ✅ EventTarget change updates listener

All existing tests continue to pass (25/25), confirming no regressions.

## Memory Safety

The implementation follows best practices for memory safety:

1. **AbortController Usage**: All event listeners use AbortController for cleanup
2. **Lifecycle Binding**: Listeners are tied to the roundabout's AbortSignal
3. **Immediate Cleanup**: Old listeners are removed immediately when EventTarget changes
4. **WeakRef Support**: Allows EventTargets to be garbage collected
5. **No Closure Leaks**: Event handlers don't capture unnecessary references

## Edge Cases Handled

1. **Null/Undefined EventTarget**: Gracefully handles when property is null/undefined
2. **WeakRef Deref Returns Null**: Handles when WeakRef target has been collected
3. **Method Not Found**: Logs error if handler method doesn't exist on VM
4. **Async Methods**: Properly awaits Promise results
5. **Non-Object Results**: Only merges results that are plain objects
6. **Multiple Property Changes**: Each change properly updates the listener

## Future Enhancements

Possible future improvements:
1. Support for multiple event types per handler
2. Event filtering/transformation options
3. Debouncing/throttling support
4. Handler priority/ordering
5. Conditional handler activation

## Related Features

Handlers complement other roundabout features:
- **Compacts**: Connect two properties
- **Hitches**: Coordinate three properties (EventTarget, event type, target property)
- **Actions**: Complex conditional logic with multiple properties
- **Handlers**: EventTarget to method with automatic lifecycle management

The key difference is that handlers manage external EventTarget subscriptions, while other features manage internal property relationships.
