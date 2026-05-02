# Custom Element Declarative Journey - Notes

## Goal
Make the `tests/custom-element-example.html` as close to 100% declarative as possible:
- The JSON-serializable roundabout configuration should grow toward 100%
- Imperative code should shrink toward 0%
- Then update documentation (README.md) to showcase this
- Decide whether a base web component class (separate package) is needed to reduce boilerplate

## Bug Fix Log

### Bug #1: Second instance display not updating (2026-04-29)

**Symptom:** When two `<user-counter>` elements exist on the page, clicking +1 on the second
element (Bob, initial-count=15) logs "Bob incremented to 16" but the displayed count stays at 15.

**Root Cause:** In `utils/PropagatorSetup.js`, `convertPropertyToGetterSetter` for class instances
defines getter/setters on the **prototype** for the first instance. When the second instance is
processed, the function detects the prototype already has getter/setters and returns early — but
it failed to **delete the instance's own data property** first. The own data property (`count = 15`)
shadows the prototype getter/setter, so assignments like `this.count++` bypass the setter entirely.
No `PropertyChangeEvent` is dispatched, so UI update listeners never fire.

**Fix:** Before the early return, delete the instance's own data property so the prototype
getter/setter takes effect:
```js
if (protoDescriptor && (protoDescriptor.get || protoDescriptor.set)) {
    if (vm.hasOwnProperty(prop)) {
        delete vm[prop];
    }
    return;
}
```

**Verification:** All 30 existing Playwright tests pass after the fix.

### Bug #2: handlePropertyChange drops changes for same-key rapid updates (2026-05-01)

**Symptom:** When using `ifKeyIn: ['count']`, the `updateStatus` action only fires once (for the
initial `count = 0` assignment). Subsequent synchronous assignments to the same property (e.g.,
`this.count = 5` right after `this.count = 0`) are silently dropped, and user clicks that should
trigger the action via the reaction system also lose their changes if any async processing is
still in flight.

**Root Cause:** `RoundaboutManager.handlePropertyChange` used a `processingQueue` Map to deduplicate.
When a second change arrived for the same key while the first was still processing (async), the
code simply awaited the existing promise and returned — discarding the new value entirely. For
`ifKeyIn` actions (which should fire on *every* value change), this meant only the first change
in a synchronous batch was ever processed.

**Fix:** Instead of dropping the change, store the latest pending value. After the current
processing completes, check for a pending value and recursively process it:
```js
pendingValues = new Map();
async handlePropertyChange(key, value) {
    const existing = this.processingQueue.get(key);
    if (existing) {
        this.pendingValues.set(key, value);  // keep latest, don't drop
        await existing;
        return;
    }
    // ... normal processing ...
    // After processing, pick up any value that arrived while we were busy
    if (this.pendingValues.has(key)) {
        const next = this.pendingValues.get(key);
        this.pendingValues.delete(key);
        await this.handlePropertyChange(key, next);
    }
}
```

Note: if multiple intermediate values arrive, only the *latest* is processed (coalescing).
This is correct for reactive state — intermediate values are stale by the time processing
resumes. The important thing is that the final value is never lost.

**Verification:** All 30 existing Playwright tests pass after the fix.

---

## Current State of Declarative Configuration (lines 152-175)

The roundabout config object (declarative):
```js
{
    vm: this,
    propagate: ['count', 'username', 'status', 'statusMessage'],
    weakRef: {
        properties: ['incrementButton', 'decrementButton', 'resetButton'],
        logIfCollected: 'warn'
    },
    actions: {
        calculateStatus: {
            ifAllOf: ['count'],
            do: 'updateStatus'
        }
    },
    compacts: {
        echo_status_to_statusMessage: 0
    }
}
```

Imperative code that remains:
1. Property initialization (`this.count = 0`, etc.)
2. Attribute reading (`this.getAttribute(...)`)
3. `render()` call and DOM creation
4. Button reference acquisition (`this.querySelector(...)`)
5. Propagator event listeners for UI updates (`propagator.addEventListener(...)`)
6. Button click event listeners
7. `increment()`, `decrement()`, `reset()` methods (user actions)
8. `updateStatus()` action method (called both by roundabout and manually)
9. `updateCountDisplay()`, `updateStatusDisplay()`, `updateUsernameDisplay()` (UI update methods)
10. Manual status update calls inside increment/decrement/reset (workaround for ifAllOf transition-only firing)

## Observations
- The action `calculateStatus` with `ifAllOf: ['count']` only fires on transition (falsy→truthy),
  not on every change. This forces manual `updateStatus()` calls in increment/decrement/reset.
  Using `ifKeyIn: ['count']` would fire on every change but has been noted as having issues.
- The compact `echo_status_to_statusMessage` is truly declarative — no code needed.
- WeakRef for button references is declarative configuration.
- The bulk of imperative code is DOM interaction (rendering, querying, event listeners).

## Documentation Improvements Made

### README.md updates (2026-05-02)
- Added "Design Philosophy: Declarative First" section emphasizing JSON-serializable config
- Added "Web Component Example" showing the declarative approach with handlers, assignGingerly, etc.
- Added assignGingerly feature introduction (optional chaining, withMethods, aka) as it pertains to roundabout
- Updated Actions Reference: `do` property marked as "discouraged for actions", explained it's for positractions
- Clarified that action key = method name convention

### Type changes (2026-05-02)
- Split `LogicOp` into `LogicOp` (without `do`) and `LogicOpWithDo` (with `do`)
- `Actions` type uses `LogicOp` — TypeScript users won't see `do` as an option for actions
- `Positraction` type uses `LogicOpWithDo` — `do` is available and required for positractions
- Runtime still supports `do` in actions for backward compatibility

### Concerns addressed from Concerns.md
1. **Imperative code = failure to roundabout**: Added prominent design philosophy section
2. **`do` property misuse in actions**: Separated types, updated docs to discourage
3. **`echo_status_to_statusMessage` confusion**: This was a misunderstanding — removed from the
   recommended pattern. Status and statusMessage are computed differently by `updateStatus`.
4. **assignGingerly features not documented**: Added introduction to key features (withMethods, aka,
   optional chaining syntax) directly in README
5. **Web component example quality**: Added complete example showing declarative approach
