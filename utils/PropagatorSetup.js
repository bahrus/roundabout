/**
 * Dynamically sets up a propagator and converts properties to getter/setters
 * that fire events when changed.
 */
import { PropertyChangeEvent } from '../core/Events.js';
/**
 * Check if a property has a getter/setter anywhere in the prototype chain
 */
function hasGetterSetter(obj, prop) {
    let current = obj;
    while (current) {
        const descriptor = Object.getOwnPropertyDescriptor(current, prop);
        if (descriptor && (descriptor.get || descriptor.set)) {
            return true;
        }
        current = Object.getPrototypeOf(current);
    }
    return false;
}
/**
 * Find an accessor descriptor for a property in the prototype chain.
 */
function getAccessorDescriptorInChain(obj, prop) {
    let current = obj;
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
 * Covertly set a property value without triggering events
 * Used for internal routing optimization
 * If the property hasn't been converted to getter/setter yet, convert it first
 */
export async function covertlySetProperty(vm, prop, value) {
    const metadata = vm.__roundaboutStorageMetadata;
    if (!metadata) {
        // Fallback to direct assignment if no metadata
        vm[prop] = value;
        return;
    }
    const { storage, isPlainObject, weakRefProps } = metadata;
    // Check if property has been converted to getter/setter (check prototype chain too)
    if (!hasGetterSetter(vm, prop)) {
        // Property hasn't been converted yet - convert it now
        const propagator = vm.propagator;
        if (propagator) {
            await convertPropertyToGetterSetter(vm, prop, storage, propagator, isPlainObject, weakRefProps);
        }
    }
    // Check if this property should use WeakRef
    const mode = getWeakRefMode(weakRefProps, prop);
    let valueToStore = value;
    if (mode === 'single' && value) {
        valueToStore = new WeakRef(value);
    }
    else if (mode === 'list') {
        valueToStore = wrapWeakRefList(value);
    }
    // Now set the value in storage
    if (isPlainObject) {
        storage[prop] = valueToStore;
    }
    else {
        const storageKey = `__${prop}`;
        vm[storageKey] = valueToStore;
    }
}
/**
 * Get a property value directly from storage without triggering getter
 */
export function covertlyGetProperty(vm, prop) {
    const metadata = vm.__roundaboutStorageMetadata;
    if (!metadata) {
        return vm[prop];
    }
    const { storage, isPlainObject, weakRefProps } = metadata;
    let val;
    if (isPlainObject) {
        val = storage[prop];
    }
    else {
        const storageKey = `__${prop}`;
        val = vm[storageKey];
    }
    // Deref if it's a WeakRef (single or list)
    const mode = getWeakRefMode(weakRefProps, prop);
    return derefStoredValue(val, mode, weakRefProps?.logIfCollected || 'error', prop);
}
export async function setupPropagator(vm, propertiesToMonitor, weakRefConfig) {
    // Create or get propagator
    let propagator;
    if (vm.propagator) {
        propagator = vm.propagator;
    }
    else {
        propagator = new EventTarget();
        Object.defineProperty(vm, 'propagator', {
            value: propagator,
            enumerable: false,
            writable: false,
            configurable: true
        });
    }
    // Determine if this is a plain object or class instance
    const isPlainObject = Object.getPrototypeOf(vm) === Object.prototype;
    // Parse weakRef configuration
    const weakRefProps = parseWeakRefConfig(weakRefConfig);
    // Create storage for property values (only for plain objects)
    let storage = null;
    if (isPlainObject) {
        // For plain objects, create a private storage object
        storage = {};
        Object.defineProperty(vm, '__roundaboutStorage', {
            value: storage,
            enumerable: false,
            writable: false,
            configurable: true
        });
    }
    // Store metadata for covertAssignment access
    Object.defineProperty(vm, '__roundaboutStorageMetadata', {
        value: { storage, isPlainObject, weakRefProps },
        enumerable: false,
        writable: false,
        configurable: true
    });
    if (!isPlainObject) {
        // For class instances, check if the prototype already has getter/setters
        // from a previous instance of the same class.
        const proto = Object.getPrototypeOf(vm);
        const sampleProp = propertiesToMonitor.values().next().value;
        const alreadyConverted = sampleProp && proto &&
            (() => {
                const d = Object.getOwnPropertyDescriptor(proto, sampleProp);
                return d && (d.get || d.set);
            })();
        if (alreadyConverted) {
            // Prototype getter/setters already exist — just initialize per-instance storage
            for (const prop of propertiesToMonitor) {
                const storageKey = `__${prop}`;
                const mode = getWeakRefMode(weakRefProps, prop);
                const currentValue = vm[prop];
                let valueToStore = currentValue;
                if (mode === 'single' && currentValue) {
                    valueToStore = new WeakRef(currentValue);
                }
                else if (mode === 'list') {
                    valueToStore = wrapWeakRefList(currentValue);
                }
                if (!(storageKey in vm)) {
                    Object.defineProperty(vm, storageKey, {
                        value: valueToStore,
                        writable: true,
                        enumerable: false,
                        configurable: true
                    });
                }
                // Delete any own data property that would shadow the prototype getter/setter
                const ownDesc = Object.getOwnPropertyDescriptor(vm, prop);
                if (ownDesc && !ownDesc.get && !ownDesc.set) {
                    delete vm[prop];
                }
            }
            return propagator;
        }
    }
    // First instance (or plain object) — convert each property to getter/setter
    for (const prop of propertiesToMonitor) {
        await convertPropertyToGetterSetter(vm, prop, storage, propagator, isPlainObject, weakRefProps);
    }
    return propagator;
}
function parseWeakRefConfig(config) {
    if (!config) {
        return { properties: new Set(), listProperties: new Set(), logIfCollected: 'error' };
    }
    // Handle array shorthand: ['prop1', 'prop2']
    if (Array.isArray(config)) {
        return { properties: new Set(config), listProperties: new Set(), logIfCollected: 'error' };
    }
    // Handle object config
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
        logIfCollected: config.logIfCollected || 'error'
    };
}
function getWeakRefMode(weakRefProps, prop) {
    if (!weakRefProps)
        return 'none';
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
async function convertPropertyToGetterSetter(vm, prop, storage, propagator, isPlainObject, weakRefProps) {
    // Check if this property should use WeakRef
    const mode = getWeakRefMode(weakRefProps, prop);
    if (isPlainObject) {
        // For plain objects, check own descriptor only
        const descriptor = Object.getOwnPropertyDescriptor(vm, prop);
        if (descriptor && (descriptor.get || descriptor.set)) {
            return;
        }
        const currentValue = vm[prop];
        let initialValueToStore = currentValue;
        if (mode === 'single' && currentValue) {
            initialValueToStore = new WeakRef(currentValue);
        }
        else if (mode === 'list') {
            initialValueToStore = wrapWeakRefList(currentValue);
        }
        storage[prop] = initialValueToStore;
        Object.defineProperty(vm, prop, {
            get() {
                const val = storage[prop];
                return derefStoredValue(val, mode, weakRefProps.logIfCollected, prop);
            },
            set(newValue) {
                const stored = storage[prop];
                const oldValue = derefStoredValue(stored, mode, weakRefProps.logIfCollected, prop);
                if (oldValue !== newValue) {
                    let valueToStore = newValue;
                    if (mode === 'single' && newValue) {
                        valueToStore = new WeakRef(newValue);
                    }
                    else if (mode === 'list') {
                        valueToStore = wrapWeakRefList(newValue);
                    }
                    storage[prop] = valueToStore;
                    propagator.dispatchEvent(new PropertyChangeEvent(prop, oldValue, newValue));
                }
            },
            enumerable: true,
            configurable: true
        });
    }
    else {
        // For class instances: getter/setter goes on the prototype, storage on each instance
        const storageKey = `__${prop}`;
        const proto = Object.getPrototypeOf(vm);
        const protoDescriptor = getAccessorDescriptorInChain(proto, prop);
        const protoHasGetterSetter = protoDescriptor && (protoDescriptor.get || protoDescriptor.set);
        // Initialize per-instance storage
        const currentValue = vm[prop];
        let valueToStore = currentValue;
        if (mode === 'single' && currentValue) {
            valueToStore = new WeakRef(currentValue);
        }
        else if (mode === 'list') {
            valueToStore = wrapWeakRefList(currentValue);
        }
        if (!(storageKey in vm) && !(protoHasGetterSetter && protoDescriptor.get && !protoDescriptor.set)) {
            Object.defineProperty(vm, storageKey, {
                value: valueToStore,
                writable: true,
                enumerable: false,
                configurable: true
            });
        }
        if (protoHasGetterSetter) {
            // If the prototype has a getter but no setter, it's a read-only native
            // accessor (e.g. ownerDocument). Don't shadow it or delete a preset
            // own data property — the compact listener can still read the value.
            if (protoDescriptor.get && !protoDescriptor.set) {
                return;
            }
            // Prototype already has getter/setter (set up by a previous instance).
            // Just ensure the instance's own data property doesn't shadow it.
            if (vm.hasOwnProperty(prop)) {
                delete vm[prop];
            }
            return;
        }
        // First instance for this class — define getter/setter on the prototype.
        // Delete any own data property so the prototype getter/setter takes effect.
        if (vm.hasOwnProperty(prop)) {
            delete vm[prop];
        }
        // If the prototype already has a data property for this name, we can't
        // define on the prototype (it would affect unrelated instances), so fall
        // back to defining on the instance.
        const target = protoDescriptor ? vm : proto;
        Object.defineProperty(target, prop, {
            get() {
                const val = this[storageKey];
                return derefStoredValue(val, mode, weakRefProps.logIfCollected, prop);
            },
            set(newValue) {
                const stored = this[storageKey];
                const oldValue = derefStoredValue(stored, mode, weakRefProps.logIfCollected, prop);
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
                            configurable: true
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
            configurable: true
        });
    }
}
/**
 * Infer which properties need to be monitored based on configuration
 */
export function inferPropertiesToMonitor(options) {
    const props = new Set();
    // Add explicitly propagated properties
    if (options.propagate) {
        if (typeof options.propagate === 'string') {
            props.add(options.propagate);
        }
        else if (Array.isArray(options.propagate)) {
            options.propagate.forEach((p) => props.add(p));
        }
    }
    // Infer from compacts
    if (options.compacts) {
        for (const key of Object.keys(options.compacts)) {
            const extracted = extractSourceProperty(key);
            if (extracted)
                props.add(extracted);
            // Also add target properties
            const target = extractTargetProperty(key);
            if (target)
                props.add(target);
        }
    }
    // Infer from actions - both properties they READ and properties they might WRITE
    if (options.actions) {
        for (const [actionKey, actionConfig] of Object.entries(options.actions)) {
            // Properties the action reads (conditions)
            if (actionConfig.ifAllOf) {
                const arr = Array.isArray(actionConfig.ifAllOf) ? actionConfig.ifAllOf : [actionConfig.ifAllOf];
                arr.forEach((p) => props.add(p));
            }
            if (actionConfig.ifKeyIn) {
                const arr = Array.isArray(actionConfig.ifKeyIn) ? actionConfig.ifKeyIn : [actionConfig.ifKeyIn];
                arr.forEach((p) => props.add(p));
            }
            if (actionConfig.ifAtLeastOneOf) {
                const arr = Array.isArray(actionConfig.ifAtLeastOneOf) ? actionConfig.ifAtLeastOneOf : [actionConfig.ifAtLeastOneOf];
                arr.forEach((p) => props.add(p));
            }
            if (actionConfig.ifNoneOf) {
                const arr = Array.isArray(actionConfig.ifNoneOf) ? actionConfig.ifNoneOf : [actionConfig.ifNoneOf];
                arr.forEach((p) => props.add(p));
            }
            if (actionConfig.ifEquals) {
                const arr = Array.isArray(actionConfig.ifEquals) ? actionConfig.ifEquals : [actionConfig.ifEquals];
                arr.forEach((p) => props.add(p));
            }
            if (actionConfig.ifNotAllOf) {
                const arr = Array.isArray(actionConfig.ifNotAllOf) ? actionConfig.ifNotAllOf : [actionConfig.ifNotAllOf];
                arr.forEach((p) => props.add(p));
            }
            // Properties the action might write (inferred from action name or explicit writes config)
            // For now, we'll need to monitor ALL properties on the VM that actions might touch
            // This is a limitation - we can't know what an action will return without calling it
            // So we'll add a convention: if action is named "calculateX", it likely sets "x"
            // Or we could just convert all properties - but that's expensive
            // Better approach: dynamically add properties to monitoring when they're first set covertly
        }
    }
    // Infer from hitches
    if (options.hitches) {
        for (const key of Object.keys(options.hitches)) {
            // when_X_emits_Y_inc_Z_by
            const match = key.match(/^when_(.+?)_emits/);
            if (match)
                props.add(match[1]);
        }
    }
    // Infer from handlers
    if (options.handlers) {
        for (const key of Object.keys(options.handlers)) {
            // eventTargetProp_to_methodName_on
            const match = key.match(/^(.+)_to_(.+)_on$/);
            if (match)
                props.add(match[1]); // Add the EventTarget property
        }
    }
    // Infer from positractions
    if (options.positractions) {
        for (const positraction of options.positractions) {
            if (positraction.ifKeyIn) {
                positraction.ifKeyIn.forEach((p) => props.add(p));
            }
            if (positraction.ifAllOf) {
                positraction.ifAllOf.forEach((p) => props.add(p));
            }
        }
    }
    // Infer from merges
    if (options.merges) {
        for (const merge of options.merges) {
            const addArr = (value) => {
                if (typeof value === 'string') {
                    props.add(value);
                }
                else if (Array.isArray(value)) {
                    value.forEach((p) => props.add(p));
                }
            };
            if (merge.ifAllOf)
                addArr(merge.ifAllOf);
            if (merge.ifKeyIn)
                addArr(merge.ifKeyIn);
            if (merge.ifNoneOf)
                addArr(merge.ifNoneOf);
            if (merge.ifEquals)
                addArr(merge.ifEquals);
            if (merge.ifAtLeastOneOf)
                addArr(merge.ifAtLeastOneOf);
            if (merge.ifNotAllOf)
                addArr(merge.ifNotAllOf);
        }
    }
    // Infer from yields
    if (options.yields) {
        for (const [targetProp, config] of Object.entries(options.yields)) {
            props.add(targetProp);
            if (config.from)
                props.add(config.from);
            if (config.atIndex)
                props.add(config.atIndex);
        }
    }
    return props;
}
function extractTargetProperty(compactKey) {
    // negate_X_to_Y -> Y
    let match = compactKey.match(/^negate_.+?_to_(.+)$/);
    if (match)
        return match[1];
    // pass_length_of_X_to_Y -> Y
    match = compactKey.match(/^pass_length_of_.+?_to_(.+)$/);
    if (match)
        return match[1];
    // echo_X_to_Y -> Y
    match = compactKey.match(/^echo_.+?_to_(.+?)(?:_after)?$/);
    if (match)
        return match[1];
    // when_X_changes_toggle_Y -> Y
    match = compactKey.match(/^when_.+?_changes_toggle_(.+)$/);
    if (match)
        return match[1];
    // when_X_changes_inc_Y_by -> Y
    match = compactKey.match(/^when_.+?_changes_inc_(.+?)_by$/);
    if (match)
        return match[1];
    // on_EVENT_of_X_inc_Y_by -> Y
    match = compactKey.match(/^on_.+?_of_.+?_inc_(.+?)_by$/);
    if (match)
        return match[1];
    // on_EVENT_of_X_set_Y_to -> Y
    match = compactKey.match(/^on_.+?_of_.+?_set_(.+?)_to$/);
    if (match)
        return match[1];
    return null;
}
function extractSourceProperty(compactKey) {
    // negate_X_to_Y -> X
    let match = compactKey.match(/^negate_(.+?)_to_/);
    if (match)
        return match[1];
    // pass_length_of_X_to_Y -> X
    match = compactKey.match(/^pass_length_of_(.+?)_to_/);
    if (match)
        return match[1];
    // echo_X_to_Y -> X
    match = compactKey.match(/^echo_(.+?)_to_/);
    if (match)
        return match[1];
    // when_X_changes_call_Y -> X
    match = compactKey.match(/^when_(.+?)_changes_/);
    if (match)
        return match[1];
    // on_EVENT_of_X_inc_Y_by -> X
    match = compactKey.match(/^on_.+?_of_(.+?)_inc_/);
    if (match)
        return match[1];
    // on_EVENT_of_X_set_Y_to -> X
    match = compactKey.match(/^on_.+?_of_(.+?)_set_/);
    if (match)
        return match[1];
    // on_EVENT_of_X_assign -> X
    match = compactKey.match(/^on_.+?_of_(.+?)_assign$/);
    if (match)
        return match[1];
    // on_EVENT_of_X_assignFromEvent -> X
    match = compactKey.match(/^on_.+?_of_(.+?)_assignFromEvent$/);
    if (match)
        return match[1];
    return null;
}
