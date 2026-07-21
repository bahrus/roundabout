# Support BYOPropagateList

---

## Human Ask

I found that it [flows quite nicely](https://github.com/bahrus/time-ticker/blob/baseline/cef.mjs) to proactively pass the entire list of props to propagate.

I wonder if the developer who does that can be rewarded by being able to pass another config settings, something like "OnlyDefinePropagateProps", so that the the JavaScript can avoid doing some unnecessary work, especially if it could result in downloading fewer ES modules?  Is it worth it to optimize on this?

---

## Kiro's Analysis

### What work could be skipped

If the developer provides the complete property list via `propagate` and sets `skipInference: true` (or whatever we call it), here's what gets avoided:

1. **`inferPropertiesToMonitor` parsing** — iterating over compacts keys (regex matching), actions conditions, hitches patterns, merges conditions, yields configs, etc. This is pure CPU work — no imports, no I/O. For a typical config with 5-15 entries, this is microseconds. Not meaningful.

2. **The `import('./utils/PropagatorSetup.js')` itself** — this module is ~500 lines but it's needed anyway for `setupPropagator` (which installs the getter/setters). So we can't skip the import entirely, only the `inferPropertiesToMonitor` function call within it.

### What CANNOT be skipped

- **Processor module imports** — these are determined by which config keys are present (`compacts`, `actions`, `merges`, etc.), not by the property list. Whether you provide `propagate` or not, if you have `compacts: {...}`, the compacts processor must be loaded. The property list doesn't change this.

- **Getter/setter installation** — still needs to happen for every property in the list.

- **Reaction wiring** — processors still need to parse the config and register reactions.

### Verdict: not worth optimizing

The only thing `skipInference` saves is the `inferPropertiesToMonitor` function — which is synchronous, does no imports, and runs in microseconds. The expensive parts (dynamic `import()` calls for processors, getter/setter installation, reaction wiring) happen regardless.

The real value of providing a complete `propagate` list isn't performance — it's **correctness**. It guarantees that properties which aren't referenced by any processor still get getter/setters and fire propagator events. That's already valuable without any optimization flag.

### Where there IS a potential optimization (different angle)

If the developer provides `propagate` and *also* knows that certain processors aren't needed (e.g., no compacts, no actions — just raw property monitoring), they could pass an empty config:

```javascript
raConfig: {
    propagate: ['duration', 'disabled', 'items', 'idx', 'item'],
    // no compacts, no actions, no merges
}
```

In this case, `makeRoundaboutReady` already skips all processor imports (the `if (config.compacts)` guards). So the optimization is already there implicitly — fewer config keys = fewer imports.

### Recommendation

Don't add `skipInference` / `onlyDefinePropagateProps`. The inference is cheap, and the flag would add API surface for negligible gain. The developer is already "rewarded" for providing `propagate` by getting correct behavior for properties that would otherwise be missed. If anything, we could add a dev-mode warning when `propagate` is provided and inference finds additional properties not in the list — that would help catch mistakes.
