# Compacts On Event Assign From Event

---

## Bruce's Ask

In [Compacts On Event Assign](./CompactsOnEventAssign.md#thoughts--findings) it was suggested:

> If event data is needed later, a separate syntax like `on_EVENT_of_X_assignFromEvent` 

I've now encountered an important use case where this would be useful.

Can this be done with minimal additional code?

If so, please implement.  Do not do create or perform any unit tests on it for now.

Please append your implementation notes below, unless further clarifications, listed below, are needed first.

---

## Bruce's Response I

I'm seeing that the code is kind of working with one big problem.

If I try it like this

```JS
on_keydown_of_ownerDocument_assignFromEvent: {
```

I think that the setting up of the propagator is wiping away the preset ownerDocument.

Is there an easy fix?

---

## Fix: Preserve Presets for Read-Only Native Accessors

Yes — the fix is small. The issue is that `ownerDocument` is a read-only native accessor on `Node.prototype` (getter only, no setter). Roundabout was walking the prototype, finding the accessor, and deleting the instance's own data property to avoid shadowing it. That deleted the preset.

### Changes made

In `utils/PropagatorSetup.ts`, `roundaboutSync.ts`, and `makeRoundaboutReady.ts`:

- Walk the prototype chain for accessor descriptors instead of checking only the immediate prototype.
- When the accessor is **getter-only** (read-only native property like `ownerDocument`), skip installing a roundabout getter/setter and **do not delete** any preset own data property.
- Continue the existing behavior for read/write accessors and data properties.

### Files changed

1. **`utils/PropagatorSetup.ts`**
   - Added `getAccessorDescriptorInChain` helper.
   - In `convertPropertyToGetterSetter`, preserve own presets when the prototype chain has a getter-only accessor.

2. **`roundaboutSync.ts`**
   - Updated `initializeInstanceStorage` to walk the prototype chain and preserve getter-only presets.
   - Updated `installGetterSettersInline` with the same logic.

3. **`makeRoundaboutReady.ts`**
   - Added `getPrototypeAccessorDescriptor` helper.
   - In `installPrototypeGetterSetter`, skip installing a roundabout accessor for getter-only native accessors so the native behavior and any preset remain intact.

### Verification

- `npm run build` compiles (same pre-existing TS errors).
- `npm test` passes: **96 passed**.

### Note

This means `ownerDocument` (and similar read-only native accessors) will **not** be reactively monitored. For this use case that's fine — the compact just needs the initial EventTarget value to attach the listener. If reactive updates to such a property are ever needed, a different approach would be required.

---

## Implementation Notes

Implemented `on_EVENT_of_X_assignFromEvent` with minimal additional code by reusing the existing `on_EVENT_of_X_assign` infrastructure.

### Files changed

1. **`types/roundabout/types.d.ts`**
   - Added new `Compacts` union member:
     ```ts
     | Partial<{[key in `on_${TEvents}_of_${keyof TProps & string}_assignFromEvent`]: Record<string, any>}>
     ```

2. **`processors/compacts.ts`** (and compiled `processors/compacts.js`)
   - Added `on_event_assignFromEvent` to the `ParsedCompact` type.
   - Added parser branch for `^on_(.+)_of_(.+)_assignFromEvent$`.
   - Included `on_event_assignFromEvent` in the event-listener branch.
   - Extended `setupEventCompactListener` to handle the new type:
     - Listener callback now receives the `event` object.
     - Calls `assignFrom(vm, parsed.assignPattern!, { from: event, ...assignOptions, signal })`.
     - All other behavior (WeakRef resolution, listener cleanup, signal passthrough) is shared with the existing event compacts.

3. **`utils/PropagatorSetup.ts` and `roundaboutSync.ts`**
   - Updated `extractSourceProperty` with the regex for `on_EVENT_of_X_assignFromEvent` so the EventTarget property is monitored.

4. **`README.md`**
   - Added `on_EVENT_of_X_assignFromEvent` to the `### Event-driven compacts` section with an input/text example.
   - Added a dedicated reference subsection explaining event object resolution.
   - Added row to the Quick Reference Table.

### Key design points

- **Minimal code**: the only real difference from `on_EVENT_of_X_assign` is `from: event` instead of `from: vm`.
- **Event access**: patterns can now use `?.target?.value`, `?.detail`, `?.key`, etc.
- **Target remains the VM**: results are merged back into the view model, so assignments like `'?.searchText': '?.target?.value'` update `vm.searchText`.
- **No tests added** per instruction.

### Verification

- `npm run build` compiles (same pre-existing TS errors as before, unrelated to this change).
- No unit tests were created per request.

---

## Bruce's Response I

I'm seeing that the code is kind of working with one big problem.

If I try it like this

```JS
on_keydown_of_ownerDocument_assignFromEvent: {
```

I think that the setting up of the propagator is wiping away the preset ownerDocument.

Is there an easy fix?

---

## Implementation Notes

Fixed the preset wipe for read-only native accessors like `ownerDocument`.

What changed:

- `utils/PropagatorSetup.ts` — added a prototype-chain accessor lookup and now skips shadowing/deleting presets when the chain has a getter-only accessor.
- `roundaboutSync.ts` — applied the same logic in `initializeInstanceStorage` and `installGetterSettersInline`.
- `makeRoundaboutReady.ts` — skips installing roundabout accessors for getter-only native accessors, preserving native behavior and any preset.
- `Chats/Config/TODO/CompactsOnEventAssignFromEvent.md` — appended the fix notes.

Why it works: `ownerDocument` on `Node.prototype` is `{ get, set: undefined }`. Roundabout was treating any prototype accessor as "already converted" and deleting the instance's own data property to avoid shadowing. Now it detects getter-only accessors, leaves them alone, and preserves the preset.

Verification: `npm test` passes — **96 passed**.

