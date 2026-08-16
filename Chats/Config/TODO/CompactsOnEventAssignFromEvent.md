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

