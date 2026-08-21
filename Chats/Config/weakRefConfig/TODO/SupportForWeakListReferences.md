# Support For Weak List References

It would be great, alongside [Support For Weak References](../SupportForWeakReferences.md) to also support lists of elements in weak references.

For example, after doing a querySelectorAll, rather than storing direct links to the matching elements, which could result in memory leaks, store an array, but the elements of the array are weak references.  

Prior to get getting there, I have a concern about the code I'm seeing in makeRoundaboutReady.ts:

```TS
/**
 * Install a getter/setter pair on a prototype for a given property.
 * Storage is per-instance via `this[__propName]`.
 */
function installPrototypeGetterSetter(
    proto: any,
    prop: string,
    weakRefConfig: WeakRefProps
): void {
    const storageKey = `__${prop}`;
    const useWeakRef = weakRefConfig.properties.has(prop);

    // Don't overwrite existing getter/setters on this prototype
    const existing = Object.getOwnPropertyDescriptor(proto, prop);
    if (existing && (existing.get || existing.set)) {
        return;
    }

    // Don't shadow read-only native accessors in the prototype chain (e.g. ownerDocument).
    // Presets on the instance will remain as own data properties and can still be read.
    const inherited = getPrototypeAccessorDescriptor(proto, prop);
    if (inherited && inherited.get && !inherited.set) {
        return;
    }

    Object.defineProperty(proto, prop, {
        get() {
            const val = this[storageKey];
            if (val instanceof WeakRef) {
                const derefed = val.deref();
                if (derefed === undefined && weakRefConfig.logIfCollected !== 'silent') {
                    const logger = typeof weakRefConfig.logIfCollected === 'function'
                        ? weakRefConfig.logIfCollected
                        : weakRefConfig.logIfCollected === 'warn' ? console.warn : console.error;
                    logger(`WeakRef property '${prop}' has been garbage collected`);
                }
                return derefed;
            }
            return val;
        },
        set(newValue: any) {
            const stored = this[storageKey];
            const oldValue = (stored instanceof WeakRef) ? stored.deref() : stored;

            if (oldValue !== newValue) {
                const valueToStore = (useWeakRef && newValue)
                    ? new WeakRef(newValue)
                    : newValue;

                if (!(storageKey in this)) {
                    Object.defineProperty(this, storageKey, {
                        value: valueToStore,
                        writable: true,
                        enumerable: false,
                        configurable: true,
                    });
                } else {
                    this[storageKey] = valueToStore;
                }

                const instancePropagator = this.propagator;
                if (instancePropagator) {
                    instancePropagator.dispatchEvent(
                        new PropertyChangeEvent(prop, oldValue, newValue)
                    );
                }
            }
        },
        enumerable: true,
        configurable: true,
    });
}
```

Shouldn't line 36 above be:

```TS
if (useWeakRef &&  (val instanceof WeakRef)) {
```

? Or am I missing somethin?

Anyway, the way I would want this to work is:

```TS
const raConfig = {
    weakRef: {
        properties: [props.hamburgerButton, props.closeButton, props.overlay, props.drawer],
        listProperties: ['divs', 'spans'],
        logIfCollected: 'warn'
    },
    ...
}
```

I'll let you propose how installPrototypeGetterSetter should be modified to accommodate this request, to see if we are on the same page.

---

## Kimi's Thoughts

### Re: line 36

The current `if (val instanceof WeakRef)` check is intentional and preferable to `if (useWeakRef && (val instanceof WeakRef))`. Decoupling the getter from the current config makes the storage format the source of truth:

- If `weakRef.properties` is toggled off after values were already wrapped, the getter still unwraps them instead of returning a `WeakRef` object.
- If the config is toggled on later, previously-stored raw values still come back raw; only new writes get wrapped.
- It avoids a class of bugs where the config and the stored state drift.

So I would keep line 36 as-is.

### Proposed list support

Add a second set to the weak-ref config:

```TS
const raConfig = {
    weakRef: {
        properties: [props.hamburgerButton, props.closeButton, props.overlay, props.drawer],
        listProperties: ['divs', 'spans'],
        logIfCollected: 'warn'
    },
    ...
}
```

`installPrototypeGetterSetter` then needs two booleans:

```TS
const useWeakRef      = weakRefConfig.properties.has(prop);
const useWeakRefList  = weakRefConfig.listProperties.has(prop);
```

A property should not be in both sets; if it is, I'd make `listProperties` win and emit a one-time warning so the mistake is visible.

#### Getter

For a list property, the stored value is an array of `WeakRef`s. The getter derefs each element and returns a normal array:

```TS
if (useWeakRefList && Array.isArray(val)) {
    const collected: number[] = [];
    const result = val.map((item, idx) => {
        if (item instanceof WeakRef) {
            const derefed = item.deref();
            if (derefed === undefined) collected.push(idx);
            return derefed;
        }
        return item;
    });

    if (collected.length > 0 && weakRefConfig.logIfCollected !== 'silent') {
        const logger = typeof weakRefConfig.logIfCollected === 'function'
            ? weakRefConfig.logIfCollected
            : weakRefConfig.logIfCollected === 'warn' ? console.warn : console.error;
        logger(
            `WeakRef list property '${prop}' had ${collected.length} collected element(s) at index(es) ${collected.join(', ')}`
        );
    }

    return result;
}
```

I would return `undefined` in the slots of collected elements rather than filtering them out. Preserving array indices is less surprising for callers that index by position; callers who just want live elements can `.filter(Boolean)` themselves. If the dominant use case turns out to be "give me the currently-live nodes", we could add a config flag later (e.g. `filterCollectedLists: true`).

#### Setter

```TS
set(newValue: any) {
    const stored = this[storageKey];
    let oldValue: any = stored;

    if (useWeakRefList && Array.isArray(stored)) {
        oldValue = stored.map(item =>
            item instanceof WeakRef ? item.deref() : item
        );
    } else if (stored instanceof WeakRef) {
        oldValue = stored.deref();
    }

    if (oldValue !== newValue) {
        let valueToStore = newValue;

        if (useWeakRefList) {
            if (Array.isArray(newValue)) {
                valueToStore = newValue.map(item =>
                    item ? new WeakRef(item) : item
                );
            }
            // Non-array values are stored as-is; this keeps the setter permissive.
        } else if (useWeakRef && newValue) {
            valueToStore = new WeakRef(newValue);
        }

        // existing defineProperty / assignment logic...

        const instancePropagator = this.propagator;
        if (instancePropagator) {
            instancePropagator.dispatchEvent(
                new PropertyChangeEvent(prop, oldValue, newValue)
            );
        }
    }
}
```

Notes on the setter:

- For lists, `oldValue !== newValue` is a reference comparison of the arrays, which is the same behavior a normal property would have. If the user passes the same array reference, no event fires; if they pass a new array, it fires. That seems consistent.
- I only wrap truthy items (`item ? new WeakRef(item) : item`). `null`/`undefined` placeholders stay as-is so the array shape is preserved.
- Non-array values assigned to a list property are stored unchanged. Throwing would also be defensible, but permissive storage matches the rest of the codebase better.

#### No FinalizationRegistry needed yet

For this feature I would skip `FinalizationRegistry` cleanup of the array slots. The getter can lazily report collected elements, and the array of dead `WeakRef`s is tiny compared to the elements themselves. We can revisit if profiling shows it matters.

If this direction looks right, I can implement it in `makeRoundaboutReady.ts` and add tests under `tests/weakref/`.

## Bruce's Response

> ### Re: line 36

I just wonder, what if a developer wants a property that is really a weakReference, meaning the getter should just return the raw wekReference?  I thought by explicitly listing weakReference properties, we are saying "other properties, just pass back as is".  

Again, I'm probably missing something.  You sound confident, just if you can help me understand tha point it would be helpful.

Please proceed to implement this as described, and add your implementation notes below.

---

## Kimi's Follow-up on the Line 36 Question

> what if a developer wants a property that is really a weakReference, meaning the getter should just return the raw weakReference?

The `weakRef.properties` list is meant as "these properties hold object references that should be stored weakly," not "these properties hold `WeakRef` objects that should be returned as-is." The whole point of the feature is that callers can keep writing `vm.myElement` and get the element back transparently; they shouldn't have to know a `WeakRef` is involved.

If someone genuinely wants to store a raw `WeakRef` instance as a property value, they can do so by *not* listing that property in `weakRef.properties`. A `WeakRef` object itself is just a normal object, so it would be stored and returned unchanged.

So line 36 stays as `if (val instanceof WeakRef)`.

---

## Implementation Notes

Implemented in the following files:

- `types/roundabout/types.d.ts` — added `listProperties?: Array<keyof TProps & string>` to `WeakRefConfig`.
- `utils/PropagatorSetup.ts` — runtime `roundabout()` path for plain objects and class instances.
- `makeRoundaboutReady.ts` — pre-install path for class prototypes.
- Compiled `.js` equivalents regenerated by `npm run build`.
- Updated `README.md` with a new "WeakRef" section covering `properties`, `listProperties`, shorthand, and logging.
- New tests:
  - `tests/weakref/plain-object-weakref-list.html` / `.spec.mjs`
  - `tests/weakref/class-instance-weakref-list.html` / `.spec.mjs`

### Behavior

- `weakRef.listProperties` lists array-valued properties whose elements should be wrapped in `WeakRef` on write.
- The getter returns a new array with each `WeakRef` dereferenced.
- Collected elements become `undefined` in their original slot; the array length and indices are preserved.
- If a property appears in both `properties` and `listProperties`, a console warning is emitted and the property is treated as a list.
- `null` / `undefined` slots are preserved unchanged (not wrapped).
- Non-array values assigned to a list property are stored as-is.
- Logging uses the same `logIfCollected` setting and reports the count and indices of collected list elements.

### Validation

All 102 existing and new Playwright tests pass across Chromium, Firefox, and WebKit.

## Bruce's Response II

Can you please update the README.md with this feature?

## Kimi's Implementation Notes

Done. I updated `README.md` with a new **WeakRef** section.

What was added to `README.md`:

- Explanation of `weakRef.properties` for single-value WeakRef storage.
- New `weakRef.listProperties` for array-valued properties whose elements should be weakly held.
- Example showing both `properties` and `listProperties` together.
- Shorthand syntax (`weakRef: ['prop1', 'prop2']`).
- `logIfCollected` options, including the new aggregated list logging.

I also recorded the README update in the implementation notes of `Chats/Config/weakRefConfig/TODO/SupportForWeakListReferences.md`.

Full test suite still passes: **102 passed** across Chromium, Firefox, and WebKit.



