# Support For Prototype Setup

---

## Human Ask

the file tests/custom-element-example.html demonstrates how to integrate this package into a custom element.  What bothers a bit is this code:

```Javascript
async connectedCallback() {
    // Setup roundabout for reactive property management
    // This will convert properties to getter/setters
    const [vm, propagator] = await roundabout({
        vm: this,
        ...raConfig,
    });
    ...
}
```

What bothers a bit is the knowledge that in that call, roundabout if will be dynamically creating properties on the custom element prototype.  I think it would probably work okay, but it feels a little unsettling.  Also that we have to make connectedCallback async (of course we could do a fire and forget to an asymch method, but still...)

I wonder how much work it would take to define a cleaner way of doing that initial setup:

```JavaScript
import {makeRoundaboutReady} from 'roundabout-lib/makeRoundaboutReady.js';
class UserCounter extends HTMLElement {
    
    async connectedCallback() {
        // Setup roundabout for reactive property management
        // This will convert properties to getter/setters
        // would we still need await if we can skip the round about ready guarantee?
        const [vm, propagator] = await roundabout({
            skipRoundaboutReadyguarantee: true,
            vm: this,
            ...raConfig,
        });
        ...
    }
}

 // Register the custom element
await makeRoundaboutReady(UserCount, raConfig);
customElements.define('user-counter', UserCounter);
```

Alternatively, we define a different function than roundabout for when we know it's roundabout ready.

I can't recall how much we depend on the vm returns.  I don't think there's any issue spawning asynchronous logic to perform some of the actions, I don't think we need to wait on that before returning the propagator, etc. do we?


---

## Kiro's Analysis

Good instinct here. After reading through `RoundaboutManager`, `PropagatorSetup`, and the custom element example, here's what I see:

### The core tension

The `roundabout()` call does two conceptually different things:

1. **Prototype-level work** — `setupPropagatorAndProperties()` defines getter/setters on the prototype (for class instances). This only needs to happen once per class, and the code already detects this (`alreadyConverted` check in `setupPropagator`). On subsequent instances it just initializes per-instance storage.

2. **Instance-level work** — creating the propagator EventTarget, wiring up reactions, processing compacts/actions/merges/handlers/hitches, dispatching `ROUNDABOUT_READY_EVENT`.

These are already somewhat separated internally, but the API forces both to happen in `connectedCallback`.

### Why it's async today

The async nature comes from dynamic `import()` calls throughout `RoundaboutManager.initialize()`. Every processor (`compacts.js`, `actions.js`, `merges.js`, etc.) and even `PropagatorSetup.js` itself are lazily imported. If those imports were pre-loaded, the actual setup logic is synchronous (no network calls, no timers — just object manipulation).

### A `makeRoundaboutReady` approach could work well

Here's what it would do:

1. Pre-import all the processor modules that the config requires (compacts, actions, merges, etc.)
2. Run `inferPropertiesToMonitor(config)` to determine the property set
3. Define getter/setters on the class prototype (the "first instance" path in `convertPropertyToGetterSetter`, but targeting the prototype directly without needing an instance)
4. Cache the pre-loaded modules and inferred properties so that subsequent `roundabout()` calls can skip the async imports and the prototype setup

After `makeRoundaboutReady`, the per-instance `roundabout()` call could potentially be **synchronous** — it would just:
- Initialize per-instance storage (`__propName` fields)
- Create the propagator EventTarget
- Wire up reactions using the already-loaded processors
- Return `[vm, propagator]`

### On the `vm` return value

Looking at the example: `vm` and `this` are the same object reference (the comment in the example even says so). The return is just for ergonomics / destructuring the propagator alongside it. So there's no dependency issue — you could return `[this, propagator]` synchronously and fire off the `ROUNDABOUT_READY_EVENT` dispatch asynchronously (or skip it if `skipRoundaboutReadyGuarantee` is set).

### Suggested API shape

```javascript
import { makeRoundaboutReady, roundaboutSync } from 'roundabout-lib';

const raConfig = { /* ... */ };

class UserCounter extends HTMLElement {
    connectedCallback() {
        // Synchronous! Prototype is already prepared.
        const [vm, propagator] = roundaboutSync({
            vm: this,
            ...raConfig,
        });
        // proceed immediately
    }

    updateStatus(self) { /* ... */ }
}

// One-time async setup — pre-loads modules, installs prototype getter/setters
await makeRoundaboutReady(UserCounter, raConfig);
customElements.define('user-counter', UserCounter);
```

A separate `roundaboutSync` function (rather than a flag on the existing `roundabout`) feels cleaner — it makes the contract explicit and avoids conditional return types.

### What needs to happen

1. Factor out `inferPropertiesToMonitor` + prototype getter/setter installation into a standalone function that works on a class constructor's prototype (without an instance).
2. Create a module cache mechanism so processor imports can be pre-resolved.
3. Write `roundaboutSync` that assumes the prototype is ready and modules are cached — no awaits needed.
4. `makeRoundaboutReady(Constructor, config)` does the async prep work and tags the prototype (e.g., a Symbol) so `roundaboutSync` can verify it's been called.

### Open questions

- Should `makeRoundaboutReady` also handle `withAttrs` parsing, or keep that separate as it is now?
- Do we want `roundaboutSync` to throw if the prototype hasn't been prepared, or silently fall back to the async path?
- The `ROUNDABOUT_READY_EVENT` — is anything actually listening for it externally, or is it just an internal signal? If external consumers depend on it, we'd need to decide whether `roundaboutSync` fires it synchronously or defers it to a microtask.

---

## Human Response I

> Should `makeRoundaboutReady` also handle `withAttrs` parsing, or keep that separate as it is now?

I'm not sure how that work.  I think for the most part that parsing needs to happen on individual parsing.  If some initialization work (like figuring out the template name structure) that can be done ahead of time would help, I think go for it.

> Do we want `roundaboutSync` to throw if the prototype hasn't been prepared, or silently fall back to the async path?

I guess silently falling back to the async path would be fine.

> The `ROUNDABOUT_READY_EVENT` — is anything actually listening for it externally, or is it just an internal signal? If external consumers depend on it, we'd need to decide whether `roundaboutSync` fires it synchronously or defers it to a microtask.

I wish I had recorded that requirement as a document.  I think we discussed it in a chat.  Anyway, I don't think we really need to fire it  in roundaboutSync.  We can always add it later if need be.




---

## Kiro's Response I

Good, those answers simplify things. Here's the refined plan:

### Design decisions locked in

- `withAttrs` stays instance-level (it needs actual attribute values from the DOM element). `makeRoundaboutReady` won't touch it.
- `roundaboutSync` silently falls back to async `roundabout()` if the prototype hasn't been prepared. No throw, no surprise. This means existing code keeps working even if someone forgets the `makeRoundaboutReady` call — they just don't get the sync benefit.
- No `ROUNDABOUT_READY_EVENT` from `roundaboutSync`. We skip it entirely for now.

### Implementation plan

**File: `makeRoundaboutReady.ts`** (new, exported from index)

```typescript
export async function makeRoundaboutReady(
    Constructor: { new(...args: any[]): any; prototype: any },
    config: RoundaboutOptions
): Promise<void>
```

Does:
1. Calls `inferPropertiesToMonitor(config)` to get the property set.
2. Pre-imports all processor modules the config needs (checks for `compacts`, `actions`, `handlers`, `hitches`, `merges`, `positractions`) and caches them on a WeakMap keyed by `Constructor`.
3. Installs getter/setters on `Constructor.prototype` for each inferred property. This is the same logic as `convertPropertyToGetterSetter` with `isPlainObject = false`, but operating directly on the prototype without needing an instance. The getter/setter will use `this[storageKey]` pattern (instance storage), so each instance gets its own values.
4. Tags the prototype with a Symbol (e.g., `Symbol.for('roundaboutReady')`) so `roundaboutSync` can detect it.

**File: `roundaboutSync.ts`** (new, exported from index)

```typescript
export function roundaboutSync(
    options: RoundaboutOptions
): [vm: any, propagator: EventTarget]
```

Does:
1. Checks for the ready Symbol on the vm's prototype. If missing, falls back to `roundabout(options)` (returns a Promise — caller would need to await, but that's their choice since they skipped `makeRoundaboutReady`).
2. If ready: initializes per-instance storage fields, creates the propagator EventTarget, wires up property-change listeners and reactions using the cached processor modules. All synchronous.
3. Returns `[vm, propagator]`.

**One wrinkle with the fallback:** If `roundaboutSync` falls back to async, its return type changes (Promise vs tuple). Two options:
- Option A: Always return the tuple synchronously, but if not ready, fire off the async setup in the background. The propagator works immediately but processors wire up slightly later (microtask timing). This matches your intuition that "I don't think we need to wait on that before returning the propagator."
- Option B: Return type is `[vm, propagator] | Promise<[vm, propagator]>` and let the caller handle it.

I'd lean toward **Option A** — always return `[vm, propagator]` synchronously, and if the prototype wasn't pre-prepared, do the module loading and processor wiring in a fire-and-forget async continuation. The getter/setters would still need to be installed synchronously in that path (they can be, since `convertPropertyToGetterSetter` is only async because of the import), so we'd just inline the getter/setter logic without the import.

Actually — simpler thought: if we're going to inline the getter/setter logic anyway for the fallback, we could just make `roundaboutSync` always work synchronously regardless of whether `makeRoundaboutReady` was called. The only difference would be whether processor modules are cached (instant) or need to be imported (deferred via fire-and-forget). The prototype getter/setter installation doesn't actually need any imports — it's self-contained logic.

**Want me to proceed with implementation, or do you want to weigh in on the fallback behavior first?**
