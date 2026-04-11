# TBD

There is a common reactive requirement that comes up:

A method of a class searches for an element, based on some criteria.  We want the method to return the found element, and make it available as a readonly property to other methods of the class.  But we don't want to cause memory leak issues if the element is removed by other logic, so we really want to make a weak reference to it.  An example of this can be seen with [this example](https://raw.githubusercontent.com/bahrus/be-clonable/refs/heads/baseline/be-clonable.js) with the trigger property.  I would like to be able to configure this declaratively so that:

1.  A readonly property is created either on the object if it isn't an instance of a class, or on the class prototype that provides the deref()'ed value if available, logs a console error if not, similar (but not exactly like) the enhancedElement property in the link above.
2. Stores the weakRef in some private location.

This means a method should be able to return:

```JavaScript
return /** @type {PAP} */ ({
    trigger //: new WeakRef(trigger),
    resolved: true,
    byob
});
```

Would this fit in with any of the existing patterns?  Compacts? Handlers?  Infractions?  Positractions  If not, should we create another category to describe this linkage declaratively?  If so, I would prefer some name that relates to cars / transportation to fit in with the "roundabout" metaphor.

---

## Ideas for WeakRef Property Management

### Potential Names (Transportation Theme)
- **Parkings** - Properties that are "parked" safely with WeakRef to avoid blocking garbage collection
- **Garages** - Storage locations for WeakRef'd values with automatic deref access
- **Valet** - Automatic handling of storing/retrieving WeakRef'd values
- **Checkpoints** - Properties that checkpoint references without holding them permanently
- **Layovers** - Temporary storage with automatic cleanup
- **Depots** - Central storage for WeakRef'd resources

### Pattern Ideas

#### Option 1: Declarative WeakRef Configuration
```typescript
parkings: {
    trigger: {
        readonly: true,
        logIfCollected: true,
        storageKey: '_triggerRef' // optional, auto-generated if not provided
    },
    enhancedElement: {
        readonly: true,
        logIfCollected: 'warn' // or 'error', 'silent'
    }
}
```

#### Option 2: Convention-Based Pattern
```typescript
// Properties ending in certain suffix are auto-WeakRef'd
weakRefs: ['trigger', 'enhancedElement'],
// Or use naming convention: properties ending in 'Ref' are automatically wrapped
autoWeakRef: true // trigger -> _triggerWeakRef (private), trigger (getter)
```

#### Option 3: Extend Existing Patterns

**Extend Actions:**
```typescript
actions: {
    findTrigger: {
        ifAllOf: ['searchCriteria'],
        do: 'findTriggerElement',
        weakRef: ['trigger'], // These return values become WeakRef'd
        readonly: ['trigger']
    }
}
```

**Extend Infractions:**
```typescript
infractions: [
    {
        fn: ({searchCriteria}) => ({trigger: element}),
        weakRef: ['trigger'],
        readonly: true
    }
]
```

### Implementation Considerations

1. **Getter Generation**: Create a getter that calls `deref()` and optionally logs if collected
2. **Private Storage**: Store WeakRef in a private/symbol property (e.g., `__weakRefs.trigger`)
3. **Readonly Enforcement**: Use `Object.defineProperty` with `writable: false` or only provide getter
4. **Logging Options**: 
   - `'error'` - console.error if deref returns null
   - `'warn'` - console.warn if deref returns null
   - `'silent'` - return null/undefined silently
   - Custom function for logging
5. **Type Safety**: TypeScript types should reflect the actual value type, not WeakRef

### Getter Pattern Example
```typescript
Object.defineProperty(vm, 'trigger', {
    get() {
        const ref = this.__weakRefs?.trigger;
        if (!ref) return undefined;
        const value = ref.deref();
        if (!value && options.logIfCollected) {
            console.error(`WeakRef property 'trigger' has been garbage collected`);
        }
        return value;
    },
    enumerable: true,
    configurable: false
});
```

### Integration with assignGingerly

When a method returns an object with properties marked for WeakRef:
1. Detect which properties should be WeakRef'd (via configuration)
2. Wrap those values in WeakRef before storing
3. Create/update the getter to deref the value
4. Store other properties normally

### Edge Cases to Handle

1. **Null/Undefined Returns**: Don't create WeakRef for null/undefined
2. **Primitive Values**: WeakRef only works with objects - log error or skip
3. **Already WeakRef**: If method returns a WeakRef, use it directly
4. **Multiple References**: Same object returned by different methods
5. **Circular References**: Ensure WeakRef doesn't prevent cleanup of circular structures

### Potential API

```typescript
interface WeakRefConfig {
    // Properties to automatically wrap in WeakRef
    properties: string[];
    
    // Make these properties readonly
    readonly?: boolean | string[];
    
    // Logging behavior when deref returns null
    logIfCollected?: 'error' | 'warn' | 'silent' | ((propName: string) => void);
    
    // Custom storage location (default: __weakRefs)
    storageKey?: string;
    
    // Auto-detect properties that should be WeakRef'd (e.g., DOM elements)
    autoDetect?: boolean | ((value: any) => boolean);
}

// Usage
const [vm, propagator] = await roundabout({
    vm: model,
    parkings: {
        trigger: { readonly: true, logIfCollected: 'error' },
        enhancedElement: { readonly: true, logIfCollected: 'warn' }
    }
});
```

### Alternative: Metadata in Method Returns

Methods could return metadata about how to handle properties:

```typescript
doSearch(self) {
    const trigger = document.querySelector('.trigger');
    return {
        trigger,
        __meta: {
            weakRef: ['trigger'],
            readonly: ['trigger']
        }
    };
}
```

This keeps the configuration close to the method but loses JSON serializability.

### Recommendation

Create a new **"Parkings"** feature that:
1. Declares which properties should be WeakRef'd
2. Automatically wraps returned values in WeakRef
3. Creates readonly getters that deref and optionally log
4. Integrates with assignGingerly to intercept property assignment
5. Provides TypeScript types that hide the WeakRef implementation detail

This fits the transportation metaphor (parking = temporary storage that doesn't block traffic/GC) and provides a clean, declarative API for a common pattern.

---

## Other Future Enhancement Ideas

### 1. Handler Enhancements
- **Multiple Event Types**: `timeEmitter_to_incTicks_on: ['value-changed', 'tick']`
- **Event Filtering**: `timeEmitter_to_incTicks_on: { event: 'value-changed', filter: (e) => e.detail > 0 }`
- **Debouncing/Throttling**: `timeEmitter_to_incTicks_on: { event: 'value-changed', debounce: 300 }`
- **Handler Priority**: Control execution order when multiple handlers respond to same event

### 2. Compact Enhancements
- **Bidirectional Compacts**: `sync_X_with_Y` - keep two properties in sync
- **Transform Compacts**: `transform_X_to_Y_via: transformFn` - apply transformation function
- **Conditional Compacts**: `echo_X_to_Y_if: condition` - only execute if condition met

### 3. Action Enhancements
- **Action Composition**: Chain multiple actions together
- **Action Cancellation**: Cancel pending delayed actions when conditions change
- **Action History**: Track action execution for debugging/undo
- **Conditional Delays**: Dynamic delay based on current state

### 4. Performance Optimizations
- **Batch Mode**: Collect multiple changes and process once
- **Lazy Evaluation**: Defer action execution until property is accessed
- **Memoization**: Cache action results for same inputs
- **Priority Queue**: Execute high-priority actions first

### 5. Developer Experience
- **Debug Mode**: Detailed logging of all reactive updates
- **Visualization**: Generate diagrams of property dependencies
- **Hot Reload**: Update roundabout configuration without recreating
- **Type Generation**: Auto-generate TypeScript types from configuration

### 6. Testing Utilities
- **Mock Propagator**: Test reactive behavior without full setup
- **Time Travel**: Step through reactive updates for debugging
- **Assertion Helpers**: Verify reactive chains execute correctly
- **Coverage Reports**: Show which actions/compacts were triggered

### 7. Integration Features
- **Framework Adapters**: Easy integration with React, Vue, Svelte
- **DevTools Extension**: Browser extension for inspecting roundabouts
- **Serialization**: Save/restore roundabout state
- **Migration Tools**: Upgrade configurations between versions