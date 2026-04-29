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
