# Add a roundabout custom element  feature

---

## Human ask

I've updated the assign-gingerly package.

See in particular, [this section.](https://github.com/bahrus/assign-gingerly#class-level-setup-with-static-onassigned), and please become deeply familiar with custom element features discussed in that readme.

Can you please define a separate module that implements a roundabout feature, including support for parsing the withAttr attributes, and create a third test html file, custom-element-roundabout-feature-example.html to test it?


---

## Kiro's Analysis

This is a natural fit. The `static onAssigned` hook in assign-gingerly's features system is essentially the same lifecycle point as `makeRoundaboutReady` — one-time async class-level setup before any instances exist. And the feature constructor maps directly to what `roundaboutSync` does per-instance.

### What the roundabout feature class would look like

```javascript
// roundaboutFeature.js
import { makeRoundaboutReady } from './makeRoundaboutReady.js';
import { roundaboutSync } from './roundaboutSync.js';

export class RoundaboutFeature {
    static async onAssigned(ctr, featureConfig) {
        // One-time class-level setup: install prototype getter/setters, pre-load modules
        await makeRoundaboutReady(ctr, featureConfig.customData);
    }

    constructor(host, ctx, initVals) {
        // Instance-level setup (runs on first getter access via the lazy feature getter)
        const raConfig = ctx.injection.customData;
        const [vm, propagator] = roundaboutSync({
            vm: host,
            ...raConfig,
        });
        this._vm = vm;
        this._propagator = propagator;

        // Apply parsed attribute values if withAttrs was configured
        if (initVals) {
            // assignGingerly merges initVals into host via the feature's assignTo or direct merge
            Object.assign(host, initVals);
        }
    }
}
```

### How it integrates with the custom element

```javascript
import 'assign-gingerly/assignFeatures.js';
import { RoundaboutFeature } from 'roundabout-lib/roundaboutFeature.js';

const raConfig = {
    actions: { updateStatus: { ifKeyIn: ['count'] } },
    compacts: {
        on_click_of_incrementButton_inc_count_by: 1,
        on_click_of_decrementButton_inc_count_by: -1,
        on_click_of_resetButton_set_count_to: 0,
    },
    merges: [ /* ... */ ],
    // ...
};

class UserCounter extends HTMLElement {
    static supportedFeatures = {
        roundabout: {
            fallbackSpawn: RoundaboutFeature,
        }
    };

    connectedCallback() {
        // Trigger the feature getter — spawns RoundaboutFeature, which calls roundaboutSync
        const ra = this.roundabout;

        // Set initial state — getter/setters are already on the prototype
        this.template = template;
        this.status = 'low';
        // ...
    }

    updateStatus(self) {
        const { count } = self;
        if (count < 10) return { status: 'low', statusMessage: 'Low count' };
        if (count < 20) return { status: 'medium', statusMessage: 'Medium count' };
        return { status: 'high', statusMessage: 'High count!' };
    }
}

// assignFeatures calls RoundaboutFeature.onAssigned → makeRoundaboutReady
await customElements.assignFeatures(UserCounter, {
    roundabout: {
        spawn: RoundaboutFeature,
        customData: raConfig,
        withAttrs: {
            base: 'user-counter',
            count: '${base}-count',
            _count: { instanceOf: 'Number', valIfNull: 0 },
            username: '${base}-username',
        }
    }
});

customElements.define('user-counter', UserCounter);
```

### Key design points

1. **`static onAssigned`** calls `makeRoundaboutReady(ctr, raConfig)` — installs prototype getter/setters and pre-loads processor modules. This is the async part, done once.

2. **Constructor** calls `roundaboutSync({ vm: host, ...raConfig })` — fully synchronous per-instance setup. The feature getter triggers this on first access (in `connectedCallback`).

3. **`withAttrs`** is handled by assign-gingerly's feature system automatically — it parses attributes during spawn and passes them as `initVals` to the constructor. We just need to apply them to the host (since roundabout's getter/setters are on the host, not the feature instance).

4. **The feature instance itself** is lightweight — it's mostly a holder for `_vm` and `_propagator` references. The real reactive state lives on the host element (where the getter/setters are installed).

### Open questions

- Should the feature instance expose the propagator publicly (e.g., `el.roundabout.propagator`) or should it also be set on the host directly? Currently `roundaboutSync` puts it on the host as a non-enumerable `propagator` property, so `el.propagator` already works.

- Should `connectedCallback` forwarding be used? If we add `callbackForwarding: ['connectedCallback']`, the feature spawns automatically on connect without the user needing to access `this.roundabout` explicitly. That would make the class even cleaner — no `connectedCallback` needed just to trigger the feature. But then initial state assignment needs a different trigger point.

- The `initVals` from `withAttrs` — should they be applied via `assignGingerly` (to trigger reactive processing) or via `covertAssignment` (to set without triggering)? I'd lean toward `assignGingerly` so that actions/merges fire on the initial attribute values.

### What I'll implement

1. **`roundaboutFeature.ts`** — the feature class with `static onAssigned` and constructor
2. **`tests/custom-element-roundabout-feature-example.html`** — test page using the feature pattern
3. Export from index

Ready to proceed when you give the go-ahead (and weigh in on the open questions if you have preferences).

## Human response I

> Should the feature instance expose the propagator publicly

Let's do the minimal necessary to get it to work.  So I think no for now.

> Should `connectedCallback` forwarding be used?

Mostly this is up to the custom element author and the party that registers the feature.  Some custom elements might want to wait.  As far as implementing the feature, please see if the instructions in types/NewCustomElementFeature.md makes sense.

I think in the interest of being closest to the other tests, the way you invoke in the constructor looks good.

> The `initVals` from `withAttrs` 

I agree with how you lean.

One nit:  I think the customData should have two parts:  raConfig and withAttrs








