# Support propagate roundabout option

--

## Human Ask

Currently the propagate is a setting that can be passed into to rouadabout as an option, but not to the feature definition.  Should we also add a propagare setting to RAConfig?

---

## Kiro's Analysis

Yes — moving `propagate` to `RAConfig` (or at least duplicating it there) makes sense. Here's why:

### The current gap

`propagate` lives only on `RoundaboutOptions`, which extends `RAConfig`. When using `RoundaboutFeature`, the developer passes an `RAConfig` as `customData.raConfig`. This gets spread into the `RoundaboutOptions` object inside the feature constructor:

```javascript
roundaboutSync({ vm: hostElement, ...raConfig })
```

So technically, if you put `propagate` on the `raConfig` object today, it *would* flow through to `roundaboutSync` at runtime — JavaScript doesn't care that the type doesn't declare it on `RAConfig`. But TypeScript won't offer autocomplete or validation for it, and `makeRoundaboutReady` (which receives `RAConfig`) won't see it for `inferPropertiesToMonitor`.

### What moving it to `RAConfig` enables

1. **Feature authors can declare propagated properties** — properties that should have getter/setters and fire propagator events, even if no action/compact/merge references them. This is exactly the use case you described: attribute-parsed properties that other features subscribe to.

2. **`makeRoundaboutReady` picks them up** — `inferPropertiesToMonitor` already reads `options.propagate`. If it's on `RAConfig`, it works whether you call `roundabout()`, `roundaboutSync()`, or go through `RoundaboutFeature`.

3. **JSON-serializable** — `propagate` is just a string or array of strings. It fits the "declarative, JSON-serializable config" philosophy.

### The change

Move `propagate` from `RoundaboutOptions` to `RAConfig`:

```typescript
export interface RAConfig<TProps = unknown, TActions = TProps, ETProps = TProps, TCustomData = unknown> {
    actions?: Actions<TProps, TActions>,
    compacts?: Compacts<TProps, TActions>,
    handlers?: Handlers<ETProps, TActions>,
    hitches?: Hitches<TProps, TActions>,
    positractions?: Positractions<TProps>,
    merges?: Merges<TProps>,
    yields?: Yields<TProps>,
    propagate?: keyof TProps & string | Array<keyof TProps & string>,  // ← moved here
    // ...
}
```

Since `RoundaboutOptions extends RAConfig`, existing code that passes `propagate` to `roundabout()` still works. No breaking change.

### Effort: trivial

One line moved in `types.d.ts`. Everything else already works — `inferPropertiesToMonitor` reads from `options.propagate` regardless of which interface declares it.

Want me to just do it?
