---
inclusion: auto
---

# Roundabout API Documentation

## Actions

Actions provide fine-grained control over when and how methods are invoked in response to property changes. Unlike compacts which use naming conventions, actions use explicit configuration.

### Basic Structure

```typescript
actions: {
    methodName: {
        // Conditional logic options
        ifAllOf?: string | string[],
        ifKeyIn?: string | string[],
        ifNoneOf?: string | string[],
        ifEquals?: string[],
        ifAtLeastOneOf?: string | string[],
        ifNotAllOf?: string | string[],
        
        // Execution options
        delay?: number,
        debug?: boolean,
        
        // Method reference (optional - defaults to key name)
        do?: Function | string | ((props) => Partial<Props>)
    }
}
```

### Conditional Logic Options

#### `ifAllOf`
Execute the action only when ALL specified properties are truthy.

```typescript
actions: {
    validateForm: {
        ifAllOf: ['username', 'password', 'email']
    }
}
```

**Behavior**: Method `validateForm` is called only when `username`, `password`, AND `email` are all truthy.

---

#### `ifKeyIn`
Execute the action when ANY of the specified properties change.

```typescript
actions: {
    recalculate: {
        ifKeyIn: ['width', 'height', 'depth']
    }
}
```

**Behavior**: Method `recalculate` is called whenever `width`, `height`, OR `depth` changes.

---

#### `ifNoneOf`
Execute the action only when NONE of the specified properties are truthy.

```typescript
actions: {
    showEmptyState: {
        ifNoneOf: ['data', 'loading', 'error']
    }
}
```

**Behavior**: Method `showEmptyState` is called only when `data`, `loading`, AND `error` are all falsy.

---

#### `ifEquals`
Execute the action when all specified properties have equal values.

```typescript
actions: {
    confirmMatch: {
        ifEquals: ['password', 'confirmPassword']
    }
}
```

**Behavior**: Method `confirmMatch` is called when `password === confirmPassword`.

---

#### `ifAtLeastOneOf`
Execute the action when AT LEAST ONE of the specified properties is truthy.

```typescript
actions: {
    handleError: {
        ifAtLeastOneOf: ['networkError', 'validationError', 'serverError']
    }
}
```

**Behavior**: Method `handleError` is called when any error property is truthy.

---

#### `ifNotAllOf`
Execute the action when NOT ALL of the specified properties are truthy (i.e., at least one is falsy).

```typescript
actions: {
    showIncompleteWarning: {
        ifNotAllOf: ['step1Complete', 'step2Complete', 'step3Complete']
    }
}
```

**Behavior**: Method `showIncompleteWarning` is called when at least one step is incomplete.

---

### Execution Options

#### `delay`
Delay execution by specified milliseconds (useful for debouncing).

```typescript
actions: {
    search: {
        ifKeyIn: ['searchQuery'],
        delay: 300  // Wait 300ms after last change
    }
}
```

---

#### `debug`
Enable debug logging for this action.

```typescript
actions: {
    complexCalculation: {
        ifAllOf: ['x', 'y', 'z'],
        debug: true  // Log when conditions are checked and action is invoked
    }
}
```

---

#### `do`
Explicitly specify the method to call (if different from the action key).

```typescript
actions: {
    onDataChange: {
        ifKeyIn: ['data'],
        do: 'processData'  // Call vm.processData() instead of vm.onDataChange()
    }
}
```

Can also be a function reference or inline function:

```typescript
actions: {
    calculate: {
        ifKeyIn: ['a', 'b'],
        do: ({a, b}) => ({ result: a + b })
    }
}
```

---

## Questions / Clarifications Needed

1. **Combining conditions**: Can multiple conditional options be used together? E.g., `ifAllOf` AND `ifKeyIn`?
   - If yes, are they AND-ed or OR-ed?

Answer:  Great question!

Yes, multiple conditional options can be used together.  They are all AND-ed.

2. **Trigger timing**: When exactly is an action evaluated?
   - Only when properties in the condition change?
   - Or continuously checked whenever any property changes?

Careful book keeping should be established so that only when relevant properties to the conditions change, should, the conditions be checked, and if all the conditions are met, the action should be performed.  In the case of ifKeyIn, the action should be (re) invoked every time the properties change in value.  However, for the other conditions, the condition should only be called when all the conditions are met for the first time, or if one or more conditions aren't met followed by all the conditions being met again.

3. **Method signature**: What parameters does the action method receive?
   - Just `self`?
   - The changed property name and value?
   - All properties that triggered it?

   Definitely self.  I think it would be helpful to provide a second parameter, context, that has:

   1.  The rule that triggered the action
   2.  The changed property name

Let's leave it at that for now.

4. **Return value**: What should action methods return?
   - `Partial<Props>` to merge back (like compacts)?
   - `void` for side effects only?
   - Both supported?

Both should be supported.  If void is returned, do nothing, if an object is returned, use assignGingerly to merge back in like compacts.  Support both async and sync.  A check should be made if async and if so do an await, otherwise call directly.

5. **Conflict with compacts**: The README mentions compacts that call methods can't be mixed with actions for the same method. Should this be enforced? How?

During the initial handshake, check for this scenario, if if it happens, throw an error and cease further processing.

6. **Initial evaluation**: Are actions evaluated once on initialization, or only on subsequent changes?

Yes, check if the conditions are all met at the get-go, and if so invoke the action.

7. **Property monitoring**: Should actions automatically infer which properties to monitor (like compacts do), or only monitor explicitly listed properties?

Yes, actions should infer which properties to monitor (and add the property to the vm if applicable like compacts do).

---

## Implementation Notes

- Actions should register reactions similar to compacts
- Need to evaluate conditions efficiently
- Should support both string method names and function references
- Must handle async methods
- Need proper cleanup on abort
