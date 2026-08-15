# Compacts - On Event Assign

---

## Human Ask

I would like to add another compact option:

```JS
compacts: {
    on_click_of_incrementButton_inc_count_by: 1,
    on_click_of_decrementButton_inc_count_by: -1,
    on_click_of_resetButton_set_count_to: 0,
    on_click_of_resetButton_assign: {

    }
},
```

This would invoke assignFrom from the assign-gingerly package, similar to the merges assign.

Do you see any ambiguities / suggestions for improvements / concerns with this request?

---

## Thoughts / Findings

### 1. Syntax is consistent with existing event compacts

The proposed key `on_EVENT_of_X_assign` fits the existing family:

- `on_EVENT_of_X_inc_Y_by`
- `on_EVENT_of_X_set_Y_to`
- `on_EVENT_of_X_assign` ← new

The value would be a pattern object passed to `assignFrom`, just like `merges[].assign`. From a parsing standpoint it slots in cleanly after the existing `on_event_set` parser in `processors/compacts.ts:196-220`.

### 2. Main ambiguity: what is the `from` source for `assignFrom`?

In `merges.ts:207-216`, `assignFrom` is called with:

```ts
assignFrom(vm, config.assign, { from: vm, ...assignOptions });
```

Everything resolves against the VM.

For an event-triggered compact, there are three reasonable things the user might want as the source:

- **(a) The VM** — consistent with merges; `?.count` reads `vm.count`. This is what "similar to the merges assign" implies.
- **(b) The event object** — so the user could write `?.target?.value` or `?.detail`.
- **(c) The element that fired the event** — the value of `sourceProp`.

I recommend starting with **(a)** for consistency, but documenting clearly that event data is not directly available. If event data is needed later, a separate syntax like `on_EVENT_of_X_assignFromEvent` or an explicit `fromEvent: true` flag could be added without breaking this one.

### 3. TypeScript type needs a new union member

Current `Compacts` type (`types/roundabout/types.d.ts:45-56`) would need:

```ts
| Partial<{[key in `on_${TEvents}_of_${keyof TProps & string}_assign`]: Record<string, any>}>
```

The value type should probably match `Merge['assign']` (a `Record<string, any>` pattern object). Reusing that type keeps the two features aligned.

### 4. Implementation plan (minimal)

In `processors/compacts.ts`:

1. Add a new parser branch for `^on_(.+)_of_(.+)_assign$` returning `type: 'on_event_assign'` with `eventName`, `sourceProp`, and `assignPattern`.
2. Treat it like the other event-listener compacts (`on_event_inc` / `on_event_set`) so it gets the same attach/detach/cleanup behavior via `setupEventCompactListener`.
3. In `setupEventCompactListener`, when the event fires:
   - Import `assignFrom` from `assign-gingerly`.
   - Build options: `{ from: vm, signal: vm.RAController?.signal, ...vm.__roundaboutAssignOptions }`.
   - Call `assignFrom(vm, parsed.assignPattern, options)`.

This mirrors `merges.ts` exactly and reuses the existing event-listener lifecycle.

### 5. Concerns

- **Order of regex parsing**: the new pattern `on_EVENT_of_X_assign` must be checked *before* `on_EVENT_of_X_set_Y_to`, or the existing regex `^on_(.+)_of_(.+)_set_(.+)_to$` will greedily match `assign` as a property name and leave no match. Actually `on_click_of_resetButton_assign` has no `_set_..._to` suffix, so the set regex will not match it. Still, placing the new parser right after the event compacts is safest.

- **Keyword collision with a property named `assign`**: if a user has a property literally called `assign`, they cannot use `on_click_of_resetButton_assign` to set it. But `assign` is already used as a keyword in merges, so this is consistent with `inc` and `set` being treated as keywords in the compact grammar.

- **Signal passthrough**: as noted in the abort-signal chat, this new `assignFrom` call must include `signal: vm.RAController?.signal`. Otherwise event listeners created via `+=` inside the compact's assign pattern will never be cleaned up.

- **Async handlers are fire-and-forget**: `assignFrom` is synchronous, but it dynamically imports `processHandlerCommands` for ` =>` keys. Those handler commands will run after the event listener returns. If the compact needs to await the full result, we would need `assignFromAsync` instead. For parity with `merges`, `assignFrom` is the right choice.

- **No built-in event access**: if the pattern needs the event itself, the user would have to stash the event in a VM property in an action first, then trigger the compact. That is a real limitation worth documenting.

- **Recursive event risk**: if the assign pattern sets `sourceProp` itself, it could detach/re-attach the listener or trigger other compacts. The existing event compacts already have this class of risk, so it is not new.

### 6. Suggested improvements

- **Reuse the merge executor**: consider extracting a small helper `executeAssign(vm, pattern)` that both `merges.ts` and the new compact use, so signal handling, `assignOptions` merging, and error logging stay in one place.
- **Add `delay` support**: the existing compact grammar lets numeric values act as delays. For `on_event_assign`, the value is an object, so delay would have to live inside the pattern or be unsupported. I lean toward **unsupported for now** — the pattern can use its own timing if needed.
- **Document the `from` semantics** explicitly in the type comment: `"Pattern resolves against the VM, not the event or the element."`

### 7. Bottom line

This is a straightforward, useful addition. It extends the existing event-compact machinery with a single new parser branch and reuses the `merges` `assignFrom` execution model. The main design decision is confirming that `from: vm` is the intended source; if event-aware patterns are wanted later, they should get a distinct keyword to avoid ambiguity.

---

## Human Response I

I agree with all your recommendations.  Please implement, and update this document with implementation notes as you progress.
