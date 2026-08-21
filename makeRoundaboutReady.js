import { PropertyChangeEvent } from './core/Events.js';
/**
 * Symbol used to tag a prototype as "roundabout ready" — meaning
 * getter/setters are installed and processor modules are cached.
 */
export const ROUNDABOUT_READY = Symbol.for('roundaboutReady');
/**
 * Pre-loads processor modules and installs getter/setters on a class prototype
 * so that subsequent `roundaboutSync()` calls can be fully synchronous.
 *
 * Call this once per class, before `customElements.define()`.
 *
 * ```js
 * await makeRoundaboutReady(UserCounter, raConfig);
 * customElements.define('user-counter', UserCounter);
 * ```
 */
export async function makeRoundaboutReady(Constructor, config) {
    const { inferPropertiesToMonitor } = await import('./utils/PropagatorSetup.js');
    // 1. Determine which properties need getter/setters
    const propertiesToMonitor = inferPropertiesToMonitor(config);
    // 2. Pre-import all processor modules the config requires
    const modules = {};
    const importPromises = [];
    if (config.compacts) {
        importPromises.push(import('./processors/compacts.js').then(m => { modules.processCompacts = m.processCompacts; }));
    }
    if (config.actions) {
        importPromises.push(import('./processors/actions.js').then(m => { modules.processActions = m.processActions; }));
    }
    if (config.handlers) {
        importPromises.push(import('./processors/handlers.js').then(m => { modules.processHandlers = m.processHandlers; }));
    }
    if (config.hitches) {
        importPromises.push(import('./processors/hitches.js').then(m => { modules.processHitches = m.processHitches; }));
    }
    if (config.merges) {
        importPromises.push(import('./processors/merges.js').then(m => { modules.processMerges = m.processMerges; }));
    }
    if (config.positractions) {
        importPromises.push(import('./processors/positractions.js').then(m => { modules.processPositractions = m.processPositractions; }));
    }
    if (config.yields) {
        importPromises.push(import('./processors/yields.js').then(m => { modules.processYields = m.processYields; }));
    }
    await Promise.all(importPromises);
    // 3. Install getter/setters on the prototype
    const proto = Constructor.prototype;
    const weakRefConfig = parseWeakRefConfig(config.weakRef);
    for (const prop of propertiesToMonitor) {
        installPrototypeGetterSetter(proto, prop, weakRefConfig);
    }
    // 4. Tag the prototype with the cache
    const cache = {
        propertiesToMonitor,
        config,
        modules,
        weakRefConfig,
    };
    Object.defineProperty(proto, ROUNDABOUT_READY, {
        value: cache,
        enumerable: false,
        writable: false,
        configurable: true,
    });
}
/**
 * Check the prototype chain for an existing accessor descriptor.
 */
function getPrototypeAccessorDescriptor(proto, prop) {
    let current = proto;
    while (current) {
        const descriptor = Object.getOwnPropertyDescriptor(current, prop);
        if (descriptor && (descriptor.get || descriptor.set)) {
            return descriptor;
        }
        current = Object.getPrototypeOf(current);
    }
    return undefined;
}
/**
 * Install a getter/setter pair on a prototype for a given property.
 * Storage is per-instance via `this[__propName]`.
 */
function installPrototypeGetterSetter(proto, prop, weakRefConfig) {
    const storageKey = `__${prop}`;
    const mode = getWeakRefMode(weakRefConfig, prop);
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
            return derefStoredValue(val, mode, weakRefConfig.logIfCollected, prop);
        },
        set(newValue) {
            const stored = this[storageKey];
            const oldValue = derefStoredValue(stored, mode, weakRefConfig.logIfCollected, prop);
            if (oldValue !== newValue) {
                let valueToStore = newValue;
                if (mode === 'single' && newValue) {
                    valueToStore = new WeakRef(newValue);
                }
                else if (mode === 'list') {
                    valueToStore = wrapWeakRefList(newValue);
                }
                if (!(storageKey in this)) {
                    Object.defineProperty(this, storageKey, {
                        value: valueToStore,
                        writable: true,
                        enumerable: false,
                        configurable: true,
                    });
                }
                else {
                    this[storageKey] = valueToStore;
                }
                const instancePropagator = this.propagator;
                if (instancePropagator) {
                    instancePropagator.dispatchEvent(new PropertyChangeEvent(prop, oldValue, newValue));
                }
            }
        },
        enumerable: true,
        configurable: true,
    });
}
function parseWeakRefConfig(config) {
    if (!config) {
        return { properties: new Set(), listProperties: new Set(), logIfCollected: 'error' };
    }
    if (Array.isArray(config)) {
        return { properties: new Set(config), listProperties: new Set(), logIfCollected: 'error' };
    }
    const properties = new Set(config.properties || []);
    const listProperties = new Set(config.listProperties || []);
    // Warn if a property is listed in both places; list mode wins.
    for (const prop of properties) {
        if (listProperties.has(prop)) {
            console.warn(`Property '${prop}' is in both weakRef.properties and weakRef.listProperties; treating it as a list property.`);
            properties.delete(prop);
        }
    }
    return {
        properties,
        listProperties,
        logIfCollected: config.logIfCollected || 'error',
    };
}
function getWeakRefMode(weakRefProps, prop) {
    if (weakRefProps.listProperties.has(prop))
        return 'list';
    if (weakRefProps.properties.has(prop))
        return 'single';
    return 'none';
}
function getLogger(logIfCollected) {
    if (typeof logIfCollected === 'function')
        return logIfCollected;
    return logIfCollected === 'warn' ? console.warn : console.error;
}
/**
 * Dereference an array stored as WeakRef elements.
 * Returns a new array; collected elements become `undefined` in their original slots.
 */
function derefWeakRefList(storedList, logIfCollected, prop) {
    if (!Array.isArray(storedList))
        return storedList;
    const collected = [];
    const result = storedList.map((item, idx) => {
        if (item instanceof WeakRef) {
            const derefed = item.deref();
            if (derefed === undefined)
                collected.push(idx);
            return derefed;
        }
        return item;
    });
    if (collected.length > 0 && logIfCollected !== 'silent') {
        const logger = getLogger(logIfCollected);
        logger(`WeakRef list property '${prop}' had ${collected.length} collected element(s) at index(es) ${collected.join(', ')}`);
    }
    return result;
}
/**
 * Wrap each truthy element of an array in a WeakRef.
 * Non-array values are returned unchanged.
 */
function wrapWeakRefList(value) {
    if (!Array.isArray(value))
        return value;
    return value.map(item => (item ? new WeakRef(item) : item));
}
/**
 * Dereference a stored value whether it is a single WeakRef or a list of WeakRefs.
 */
function derefStoredValue(stored, mode, logIfCollected, prop) {
    if (mode === 'list' && Array.isArray(stored)) {
        return derefWeakRefList(stored, logIfCollected, prop);
    }
    if (stored instanceof WeakRef) {
        const derefed = stored.deref();
        if (derefed === undefined && logIfCollected !== 'silent') {
            const logger = getLogger(logIfCollected);
            logger(`WeakRef property '${prop}' has been garbage collected`);
        }
        return derefed;
    }
    return stored;
}
