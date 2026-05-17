# Support for Source of truth Attributes

---

## Human Ask

I just added a property to types/assign-gingerly/types.d.ts called sourceOfTruth which is meant for custom elements that want to emulate native behavior of some widely used attributes like name, disabled, etc.

I actually have defined and published a TruthSourcer custom element feature that builds the two way binding between attribute and property value that comes along with these.

It would be nice if the makeRoundAboutReady detects that it is installing properties on a custom element prototype, and it encounters a withAttr setting where sourceOfTruth is true, that it ensures it is part of observedAttributes.

What do you think?

---

## Kiro's Analysis

I like the idea, but there's a significant timing constraint to consider.

### The problem with `observedAttributes` and `makeRoundaboutReady`

`static observedAttributes` is read by the browser **at `customElements.define()` time** — it's a one-shot read. After that, modifying the array has no effect. The browser caches the list internally.

The typical call order is:

```javascript
await customElements.assignFeatures(MyElement, { ... });  // calls makeRoundaboutReady
customElements.define('my-element', MyElement);            // browser reads observedAttributes HERE
```

So `makeRoundaboutReady` runs *before* `define()` — which means we're in time. If `makeRoundaboutReady` adds attributes to `static observedAttributes` before `define()` is called, the browser will pick them up. This works.

### What it would look like

In `makeRoundaboutReady` (or in `RoundaboutFeature.onAssigned`), after processing the config:

```javascript
static async onAssigned(ctr, featureConfig) {
    const { raConfig } = featureConfig.customData;
    await makeRoundaboutReady(ctr, raConfig);

    // If withAttrs has sourceOfTruth entries, add them to observedAttributes
    const withAttrs = featureConfig.withAttrs;
    if (withAttrs && ctr.prototype instanceof HTMLElement) {
        ensureObservedAttributes(ctr, withAttrs);
    }
}

function ensureObservedAttributes(ctr, withAttrs) {
    for (const [key, value] of Object.entries(withAttrs)) {
        if (key.startsWith('_') && typeof value === 'object' && value.sourceOfTruth) {
            // The attribute name is the non-underscore sibling key's resolved value
            const attrName = resolveAttrName(withAttrs, key.slice(1));
            if (attrName) {
                if (!ctr.observedAttributes) {
                    ctr.observedAttributes = [];
                }
                if (!ctr.observedAttributes.includes(attrName)) {
                    ctr.observedAttributes.push(attrName);
                }
            }
        }
    }
}
```

### Where should this live?

Two options:

**Option A: In `makeRoundaboutReady`** — it already receives the config and the constructor. But it currently doesn't receive `withAttrs` (that's on the feature config, not `raConfig`). We'd need to either pass `withAttrs` in, or move this logic elsewhere.

**Option B: In `RoundaboutFeature.onAssigned`** — this already has access to both `featureConfig.customData.raConfig` and `featureConfig.withAttrs`. It's the natural place since it's the feature-level hook that runs before `define()`. This keeps `makeRoundaboutReady` focused on roundabout concerns and puts the attribute-observation concern in the feature layer where `withAttrs` lives.

### My recommendation: Option B

Put it in `RoundaboutFeature.onAssigned`. It has access to everything needed, runs at the right time, and doesn't pollute `makeRoundaboutReady` with attribute-observation concerns that are specific to the custom element feature pattern.

### Considerations

1. **Template variable resolution** — attribute names in `withAttrs` use `${base}` templates (e.g., `'${base}-count'`). We'd need to resolve these to get the actual attribute name. The `resolveTemplate` function from assign-gingerly handles this.

2. **The `enh-` prefix** — for features (not enhancements), attributes are unprefixed. So we don't need to worry about the `enh-` prefix here.

3. **Idempotency** — if `observedAttributes` already contains the attribute, skip it. Multiple features might reference the same attribute.

4. **Non-custom-element targets** — guard with an `HTMLElement` prototype check so this doesn't run on plain objects.

### Effort: small

~15 lines in `RoundaboutFeature.onAssigned`, plus importing `resolveTemplate` from assign-gingerly to resolve `${base}` patterns. Want me to implement it?
