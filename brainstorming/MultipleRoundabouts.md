# Support fir multiple roundabouts on same target (prototype)

---
## Human Ask

Do you forsee any issues with making two or more calls to makeRoundaboutReady on the same prototype with different RAConfigs, and corresponding calls to roundaboutSync on each instance, passing in the same corresponding RAConfig (assuming the developer is carefull about avoiding namespace conflicts between them)?

---

## Kiro's Analysis

Short answer: it would mostly work today, but there's one concrete issue and a couple of subtle gotchas.

### What works fine

1. **Getter/setter installation** — `installPrototypeGetterSetter` already skips properties that have an existing getter/setter. So the second `makeRoundaboutReady` call won't clobber getters installed by the first. Properties unique to each config get their own getter/setter; shared properties (if any) use whichever was installed first — which is fine since they all use the same `this[__prop]` storage pattern and dispatch on the same `this.propagator`.

2. **Processor wiring** — each `roundaboutSync` call registers its own reactions in `__roundaboutReactions`. Multiple reaction arrays for the same property key just accumulate — they all fire when the property changes. No conflict there.

3. **Propagator** — `roundaboutSync` checks `if (vm.propagator)` and reuses it. So the second call shares the same propagator as the first. All property-change events go to the same EventTarget, and all reactions from both configs listen on it. This is correct behavior.

### The concrete issue: `ROUNDABOUT_READY` cache overwrite

```javascript
Object.defineProperty(proto, ROUNDABOUT_READY, {
    value: cache,
    configurable: true,  // ← allows overwrite
});
```

The second `makeRoundaboutReady` call **overwrites** the cache on the prototype. When `roundaboutSync` later reads `proto[ROUNDABOUT_READY]`, it only sees the *last* cache. This means:

- If you call `roundaboutSync` with config A, it reads the cache and finds config B's modules. It would then try to use config B's cached processors for config A's options — which might work accidentally (if both configs use the same processor types) or silently skip processors (if config A has `compacts` but config B didn't, so `modules.processCompacts` is undefined).

**Fix needed:** The cache should be keyed by config identity, not stored as a single value. Options:
- Use a `Map` or array of caches on the prototype
- Have `roundaboutSync` match the passed config against the cached config
- Use a WeakMap keyed by the config object itself

### Subtle gotcha: `RoundaboutReady` interface members

`roundaboutSync` installs `RAController`, `covertAssignment`, `awake`, `nudge`, `rock` on the vm. The second call checks `if (!vm.RAController)` etc., so it skips if already present. This means both roundabout instances share the same `AbortController`. If one aborts, it kills both. Each `roundaboutSync` call should probably get its own controller regardless.

### Subtle gotcha: `__roundaboutStorageMetadata`

This is set once with `configurable: false` (in `roundaboutSync`'s `storeMetadata`). The second call would silently fail to set it. This is probably fine since the metadata is the same (same vm, same plain-object check), but worth noting.

### Summary

| Aspect | Status | Issue |
|--------|--------|-------|
| Getter/setter installation | ✅ Works | Skips duplicates correctly |
| Propagator sharing | ✅ Works | Single propagator, all reactions fire |
| Reaction registration | ✅ Works | Accumulates, no conflicts |
| `ROUNDABOUT_READY` cache | ❌ Breaks | Second call overwrites first |
| AbortController | ⚠️ Shared | Aborting one kills both |
| Storage metadata | ⚠️ Minor | Second set silently skipped |

### If you want to support this pattern

The main fix is changing the cache from a single value to a collection. Something like:

```javascript
// Instead of one cache per prototype:
proto[ROUNDABOUT_READY] = cache;

// Use an array or Map:
if (!proto[ROUNDABOUT_READY]) proto[ROUNDABOUT_READY] = [];
proto[ROUNDABOUT_READY].push(cache);

// Then roundaboutSync finds the matching cache by config reference:
const caches = proto[ROUNDABOUT_READY];
const cache = caches.find(c => c.config === options);  // or deep-equal, or by a config ID
```

And give each `roundaboutSync` call its own `AbortController`.

Want me to implement these fixes, or is this more of a "good to know for later" situation?

---

## Human response I

Thanks for the analysis.  This is likely to be a need, based on some half-baked requirements.  Let me solidify those requirements, and see if there are workaounds before committing to this.

On a scale of 0 - 10, how much complexity does this add?  Does your intuition seem like it would have use cases to justify it?

---

## Kiro's Response I

### Complexity: 3/10

The actual code change is small:
- Change `proto[ROUNDABOUT_READY]` from a single cache to an array of caches (~5 lines in `makeRoundaboutReady`)
- Have `roundaboutSync` find the matching cache by config reference (~3 lines)
- Give each `roundaboutSync` call its own `AbortController` (already mostly the case — just remove the `if (!vm.RAController)` guard)

No architectural changes, no new concepts, no API changes for single-roundabout users. The existing behavior is a degenerate case of "array with one entry."

### Use cases — yes, I think so

The pattern maps naturally to **composition of independent behaviors** on a single element:

1. **Feature composition** — A custom element has a `timeTicker` feature (with its own reactive config: duration, disabled, tick events) AND a separate "presentation" roundabout (with its own config: items, idx, item, DOM rendering merges). Each feature author defines their own `raConfig` independently. This is essentially what you're already doing with `RoundaboutFeature` + `assignFeatures` — if two features both use `RoundaboutFeature`, you'd hit this.

2. **Enhancement stacking** — Multiple enhancements on the same element, each bringing their own reactive wiring. Enhancement A manages form validation state, Enhancement B manages animation state. Neither knows about the other.

3. **Separation of concerns** — Keep "data logic" (items, selection, filtering) in one config and "UI wiring" (DOM updates, class toggling, event dispatching) in another. Easier to test each in isolation.

### The workaround (if you don't want to commit yet)

Merge the configs into one before calling `makeRoundaboutReady`:

```javascript
const mergedConfig = {
    ...configA,
    ...configB,
    compacts: { ...configA.compacts, ...configB.compacts },
    merges: [...(configA.merges || []), ...(configB.merges || [])],
    // etc.
};
await makeRoundaboutReady(MyElement, mergedConfig);
```

This works but defeats the purpose of independent composition — the configs need to know about each other at merge time.

### My intuition

Worth supporting eventually, but not urgent. The workaround (merging configs) covers the immediate need. When you have the solidified requirements, the fix is small enough to do in an hour.
