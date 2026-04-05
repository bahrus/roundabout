/**
 * Dynamically sets up a propagator and converts properties to getter/setters
 * that fire events when changed.
 */
import { PropertyChangeEvent } from '../core/Events.js';
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
    const { storage, isPlainObject } = metadata;
    // Check if property has been converted to getter/setter
    const descriptor = Object.getOwnPropertyDescriptor(vm, prop);
    const isGetterSetter = descriptor && (descriptor.get || descriptor.set);
    if (!isGetterSetter) {
        // Property hasn't been converted yet - convert it now
        const propagator = vm.propagator;
        if (propagator) {
            await convertPropertyToGetterSetter(vm, prop, storage, propagator, isPlainObject);
        }
    }
    // Now set the value in storage
    if (isPlainObject) {
        storage[prop] = value;
    }
    else {
        const storageKey = `__${prop}`;
        storage[storageKey] = value;
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
    const { storage, isPlainObject } = metadata;
    if (isPlainObject) {
        return storage[prop];
    }
    else {
        const storageKey = `__${prop}`;
        return storage[storageKey];
    }
}
export async function setupPropagator(vm, propertiesToMonitor) {
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
    // Create storage for property values
    let storage;
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
    else {
        // For class instances, use the instance itself as storage
        // but we'll need to use private symbols or a WeakMap
        storage = vm;
    }
    // Store metadata for covertAssignment access
    Object.defineProperty(vm, '__roundaboutStorageMetadata', {
        value: { storage, isPlainObject },
        enumerable: false,
        writable: false,
        configurable: true
    });
    // Convert each property to getter/setter
    for (const prop of propertiesToMonitor) {
        await convertPropertyToGetterSetter(vm, prop, storage, propagator, isPlainObject);
    }
    return propagator;
}
async function convertPropertyToGetterSetter(vm, prop, storage, propagator, isPlainObject) {
    // Check if already converted
    const descriptor = Object.getOwnPropertyDescriptor(vm, prop);
    if (descriptor && (descriptor.get || descriptor.set)) {
        // Already a getter/setter, don't override
        return;
    }
    // Save the current value
    const currentValue = vm[prop];
    // Create a storage key
    const storageKey = isPlainObject ? prop : `__${prop}`;
    // Store the current value
    if (isPlainObject) {
        storage[prop] = currentValue;
    }
    else {
        // For class instances, store with a prefixed key
        if (!(storageKey in storage)) {
            Object.defineProperty(storage, storageKey, {
                value: currentValue,
                writable: true,
                enumerable: false,
                configurable: true
            });
        }
        else {
            // Update existing storage
            storage[storageKey] = currentValue;
        }
    }
    // Define getter/setter
    Object.defineProperty(vm, prop, {
        get() {
            return isPlainObject ? storage[prop] : storage[storageKey];
        },
        set(newValue) {
            const oldValue = isPlainObject ? storage[prop] : storage[storageKey];
            // Only fire event if value actually changed
            if (oldValue !== newValue) {
                if (isPlainObject) {
                    storage[prop] = newValue;
                }
                else {
                    storage[storageKey] = newValue;
                }
                // Fire event on propagator
                propagator.dispatchEvent(new PropertyChangeEvent(prop, oldValue, newValue));
            }
        },
        enumerable: true,
        configurable: true
    });
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
    if (options.hitch) {
        for (const key of Object.keys(options.hitch)) {
            // when_X_emits_Y_inc_Z_by
            const match = key.match(/^when_(.+?)_emits/);
            if (match)
                props.add(match[1]);
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
    return null;
}
