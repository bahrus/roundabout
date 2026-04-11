# Support for weak references

## Status: ✅ Complete

All tests passing (30/30)

## Problem Identified and Fixed

### Critical Storage Scoping Bug

The original implementation had a critical flaw for class instances where all instances shared the same storage via closure capture. This has been fixed.

**Original Problem:**
```typescript
// For class instances, use the instance itself as storage
storage = vm; // This was the FIRST instance

Object.defineProperty(vm, prop, {
    get() {
        return storage[storageKey]; // Closure captures first instance!
    }
});
```

When the getter/setter was defined on the prototype (first instance), it captured `storage` (the first instance) in its closure. All subsequent instances would use that same closure, causing them to read/write to the first instance's storage.

**Solution:**
Use `this` instead of closure variables, ensuring each instance accesses its own storage:

```typescript
Object.defineProperty(target, prop, {
    get() {
        return this[storageKey]; // 'this' refers to actual instance!
    },
    set(newValue: any) {
        this[storageKey] = newValue; // Each instance has its own storage
        this.propagator.dispatchEvent(...); // Each instance has its own propagator
    }
});
```

## WeakRef Support Implementation

### Configuration

WeakRef support is opt-in via the `weakRef` configuration option:

```typescript
// Array shorthand
const [vm, propagator] = await roundabout({
    vm: model,
    weakRef: ['trigger', 'enhancedElement']
});

// Object with logging configuration
const [vm, propagator] = await roundabout({
    vm: model,
    weakRef: {
        properties: ['trigger', 'enhancedElement'],
        logIfCollected: 'warn' // 'error', 'warn', 'silent', or custom function
    }
});
```

### Behavior

1. **Automatic Wrapping**: When a value is set to a WeakRef-configured property, it's automatically wrapped in `WeakRef`
2. **Automatic Dereferencing**: When accessing the property, the getter automatically calls `deref()`
3. **Garbage Collection Logging**: When a WeakRef'd value is garbage collected, the getter can log a warning/error
4. **Transparent to User**: The user doesn't see `WeakRef` in their code - it's handled internally

### Example

```typescript
const element = document.createElement('div');

const model = {
    trigger: element,
    count: 0
};

const [vm, propagator] = await roundabout({
    vm: model,
    propagate: ['trigger', 'count'],
    weakRef: ['trigger']
});

// Access works normally
console.log(vm.trigger); // <div></div>

// Setting works normally
vm.trigger = document.createElement('span');

// But internally, values are stored as WeakRef
// If the element is garbage collected, vm.trigger returns undefined
```

### Class Instance Support

The implementation properly handles class instances with multiple instances:

```typescript
class MyComponent {
    constructor() {
        this.enhancedElement = null;
    }
}

const instance1 = new MyComponent();
const instance2 = new MyComponent();

instance1.enhancedElement = document.createElement('div');
instance2.enhancedElement = document.createElement('span');

await roundabout({ vm: instance1, weakRef: ['enhancedElement'] });
await roundabout({ vm: instance2, weakRef: ['enhancedElement'] });

// Each instance maintains its own WeakRef'd element
// Changing instance1 does NOT affect instance2
```

## Implementation Details

### Files Modified

1. **types/roundabout/types.d.ts**
   - Added `WeakRefConfig` interface
   - Added `weakRef` option to `RoundaboutOptions`

2. **utils/PropagatorSetup.ts**
   - Fixed storage scoping bug (use `this` instead of closure)
   - Added `parseWeakRefConfig()` function
   - Updated `setupPropagator()` to accept `weakRefConfig` parameter
   - Updated `convertPropertyToGetterSetter()` to handle WeakRef wrapping/unwrapping
   - Updated `covertlySetProperty()` and `covertlyGetProperty()` for WeakRef support

3. **core/RoundaboutManager.ts**
   - Pass `weakRef` config to `setupPropagator()`

### Tests Created

1. **tests/weakref/plain-object-weakref.html** - Tests WeakRef with plain objects
2. **tests/weakref/plain-object-weakref.spec.mjs** - Test spec
3. **tests/weakref/class-instance-weakref.html** - Tests WeakRef with class instances and storage scoping
4. **tests/weakref/class-instance-weakref.spec.mjs** - Test spec

## Key Features

1. ✅ **Opt-in Configuration**: WeakRef is explicit, not automatic
2. ✅ **Transparent Usage**: Users don't see WeakRef in their code
3. ✅ **Configurable Logging**: Control what happens when values are GC'd
4. ✅ **Storage Scoping Fixed**: Each class instance has its own storage
5. ✅ **Plain Object Support**: Works with both plain objects and class instances
6. ✅ **Covert Assignment Support**: WeakRef works with internal routing

## Memory Safety

The implementation ensures:
- WeakRef'd values can be garbage collected when no longer referenced elsewhere
- Each class instance has its own storage (no cross-instance leaks)
- Getters handle `undefined` from `deref()` gracefully
- Optional logging helps debug when values are unexpectedly GC'd

## Design Decisions

### Why Opt-in?

Making WeakRef opt-in (rather than automatic for all Elements) provides:
- **Explicit behavior**: No surprises about when values might become undefined
- **User control**: Developers decide which properties need WeakRef
- **Type safety**: TypeScript types remain accurate
- **Debugging**: Easier to understand when and why values are GC'd

### Why Transparent?

Automatic wrapping/unwrapping provides:
- **Clean API**: Users write `vm.trigger = element`, not `vm.trigger = new WeakRef(element)`
- **Consistency**: Property access always returns the value, not a WeakRef
- **Compatibility**: Existing code doesn't need to change

## Future Enhancements

Possible improvements:
1. Auto-detect DOM elements and suggest WeakRef
2. TypeScript types that reflect WeakRef behavior (value | undefined)
3. Metrics/telemetry for GC events
4. WeakRef for specific object types (not just any value)

