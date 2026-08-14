# Ensure Passthrough Of Abort Signal

---

## Human Ask

The roundaboutFeature isn't currently setting the RAController.  

I think we need to, and make sure the signal is passed to all assignFrom's, used by the merges option.  

We are currently creating the roundaboutSyncup in the constructor, but I think we need to add the disconnected callback, which aborts the controller.

And we need to add the connectedCallback to roundAbourHeature, that reconnects the roundaboutSync in the constructor only if disconnectedCallback was called.

Please do a lightweight inspection of the code pathways to make sure that eventHandlers that are invoked in assignGingerly with the += command, that the signal is passed through.  If this seems difficult to determine, please don't burn many tokens walking through it.  I will add console.logs as needed to make sure it gets passed through the food chain.

If you see any obvious "breakages" that could lead to a memory leak that needs addressing in the assign-gingerly library, please flag as such below, and I will work to rectify that.

Please make sure we are on the same page by providing your findings / implementation plan / concerns / blockers below.

Once we are on the same page I will ask you to implement it.

---

## Inspection Findings / Thoughts

### 1. RAController is already wired in `roundaboutSync` / `RoundaboutManager`

Both code paths already create an `AbortController` and expose it on the VM:

- `roundaboutSync.ts:123-125` → `setupRoundaboutReadyInterface(vm, abortController)` sets `vm.RAController = abortController`.
- `RoundaboutManager.ts:44-45` → same thing inside `setupViewModel`.
- The controller's signal is already used to register propagator listeners:
  - `roundaboutSync.ts:69-74`
  - `RoundaboutManager.ts:101-108`

So the VM **does** end up with `RAController`. The gap is in `RoundaboutFeature`: the per-instance controller created in `roundaboutSync` is not stored on the feature instance, and there is no `disconnectedCallback` to abort it.

### 2. `RoundaboutFeature` currently has no lifecycle callbacks

`roundaboutFeature.ts:46-108` only has a constructor. The custom-element integration needs:

- **Constructor**: run `roundaboutSync` (already happening).
- **`disconnectedCallback`**: abort `RAController` so all propagator listeners and downstream observers stop.
- **`connectedCallback`**: re-run `roundaboutSync` **only if** a previous disconnect aborted the controller. Otherwise leave the initial sync in place.

Caveat: if we abort and then reconnect, we need to make sure `roundaboutSync` can safely run again on the same instance. It currently always creates a fresh `AbortController` (`roundaboutSync.ts:42`), so assigning a new one to `vm.RAController` is fine. The bigger concern is duplicate processor state (`__roundaboutReactions`, action states, etc.) unless the reconnect path cleans the old state first or reuses it carefully.

### 3. `merges` does not pass the abort signal to `assignFrom`

`processors/merges.ts:207-216` builds `options` from `__roundaboutAssignOptions` and `from: vm`, but it does **not** add `signal`. The call should become something like:

```ts
const options: any = {
  from: vm,
  signal: (vm as any).RAController?.signal,
};
if (vmAny.__roundaboutAssignOptions) {
  Object.assign(options, vmAny.__roundaboutAssignOptions);
}
// Ensure signal isn't accidentally overwritten by assignOptions
options.signal = (vm as any).RAController?.signal;
await assignFrom(vm, config.assign, options);
```

Same issue exists for the `assignFrom` call in `roundabout.ts:13-18` for initial values with `protocols`.

### 4. `actions` / `handlers` also drop the signal on internal `assignGingerly` calls

- `processors/actions.ts:451-452` → `assignGingerly(vm, result, vmAny.__roundaboutAssignOptions)` — no signal.
- `processors/handlers.ts:96-97` → same pattern.

These should also thread the signal through (assign-gingerly's `IAssignGingerlyOptions` supports `signal`).

### 5. `+=` event-handler path: signal is **not** propagated from parent options

`assign-gingerly/assignGingerly.js:750-758 / 773-780` detects `Element LHS + object RHS with 'on'` and dynamically imports `addEventListener.js`. `attachEventListener` (`assign-gingerly/handlers/addEventListener.js:82-146`) creates its own `AbortController` (or uses one supplied in `get.abortController`) but **never consults `inheritedOptions.signal`**.

So even if roundabout passes `signal` into the top-level `assignGingerly` / `assignFrom` call, that signal will **not** reach event listeners added via `+=`. The signal chain breaks at the dynamic handler boundary.

To fix this, `attachEventListener` would need to subscribe its controller to the parent signal:

```ts
if (inheritedOptions?.signal) {
  inheritedOptions.signal.addEventListener('abort', () => controller.abort(), { once: true });
}
```

This requires a change in the `assign-gingerly` package, not in `roundabout-lib`.

### 6. Memory-leak flags in `assign-gingerly` (outside this repo)

While tracing the signal path I noticed a couple of leak-prone spots in `assign-gingerly`:

- **Un-keyed `+=` listeners accumulate.** In `attachEventListener.js:87-107`, if the user does not supply `get.key`, a brand-new `AbortController` is created for every `+=` call and the old one is never aborted. The `keyMap` WeakMap only helps when `get.key` is provided. If the same element is targeted repeatedly (e.g. by merges/actions), listeners stack up until the element itself is GC'd.
- **Parent signal is ignored.** As noted above, there is no automatic cleanup when the parent `AbortSignal` aborts, so a disconnected element's event listeners can stay attached.
- **`beVigilant` / `@eachTime` are signal-gated but the signal is optional upstream.** `assignFrom.js:510-515` only validates `signal` for `beVigilant`; if it *is* present it wires cleanup correctly, which is good. The issue is that roundabout currently doesn't supply it, so observers created by merges will live until the target is GC'd.

### 7. Initial value application in `RoundaboutFeature` also lacks signal

`roundaboutFeature.ts:102-106` applies `initVals` via `assignGingerly` without passing the controller signal. If those values trigger `+=` / `@eachTime` / `enhance`, nothing will clean them up on disconnect. Should be:

```ts
assignGingerly(hostElement, initVals, {
  ...(raConfig.assignOptions as any),
  signal: vm.RAController.signal,
});
```

### 8. Suggested implementation plan (high level)

1. **Thread `signal` through every internal `assignGingerly` / `assignFrom` call** in roundabout:
   - `processors/merges.ts`
   - `processors/actions.ts`
   - `processors/handlers.ts`
   - `roundabout.ts`
   - `roundaboutFeature.ts` constructor
2. **Store the `AbortController` on the `RoundaboutFeature` instance** and add lifecycle callbacks:
   - `disconnectedCallback()`: `this._vm.RAController.abort()`.
   - `connectedCallback()`: if `RAController.signal.aborted`, re-run `roundaboutSync` and re-apply `initVals`.
3. **Add a fallback in `roundaboutSync`** so reconnecting is safe (clear old reactions / processor state, or document that reconnect requires a full re-sync).
4. **Open / track upstream work in `assign-gingerly`** to propagate `inheritedOptions.signal` into `attachEventListener` and to better manage un-keyed `+=` deduplication.

### 9. Blockers / concerns

- **Reconnect safety**: `roundaboutSync` does not currently call any cleanup before re-initializing. Re-running it on a VM that already has `__roundaboutReactions`, `__roundaboutActionStates`, etc. could create duplicate reactions unless we explicitly reset those maps first. I'd recommend either adding a `cleanup()` step before the reconnect or making `roundaboutSync` idempotent for reconnects.
- **Upstream dependency**: the `+=` signal passthrough cannot be fully fixed inside this repo. The user already noted they are willing to add `console.log`s to verify the food chain; I agree the final leg of the chain lives in `assign-gingerly`.

---

**Bottom line**: the infrastructure for signal-based cleanup is mostly in place (RAController exists and its signal is used for propagator listeners). The main work is threading that signal into every `assignFrom` / `assignGingerly` call in roundabout, then adding `connectedCallback` / `disconnectedCallback` to `RoundaboutFeature`. The `+=` event-handler signal path is blocked by an upstream `assign-gingerly` gap.
