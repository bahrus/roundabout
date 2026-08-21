# Support For Weak List References

It would be great, alongside [Support For Weak References](../SupportForWeakReferences.md) to also support lists of elements in weak references.

For example, after doing a querySelectorAll, rather than storing direct links to the matching elements, which could result in memory leaks, store an array, but the elements of the array are weak references.  

For getting there, I have a concern about the code I'm seeing in makeRoundaboutReady.ts:

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

