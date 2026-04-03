/**
 * Dynamically sets up a propagator and converts properties to getter/setters
 * that fire events when changed.
 */

export async function setupPropagator(
    vm: any,
    propertiesToMonitor: Set<string>
): Promise<EventTarget> {
    // Create or get propagator
    let propagator: EventTarget;
    
    if (vm.propagator) {
        propagator = vm.propagator;
    } else {
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
    let storage: any;
    
    if (isPlainObject) {
        // For plain objects, create a private storage object
        storage = {};
        Object.defineProperty(vm, '__roundaboutStorage', {
            value: storage,
            enumerable: false,
            writable: false,
            configurable: true
        });
    } else {
        // For class instances, use the instance itself as storage
        // but we'll need to use private symbols or a WeakMap
        storage = vm;
    }

    // Convert each property to getter/setter
    for (const prop of propertiesToMonitor) {
        await convertPropertyToGetterSetter(vm, prop, storage, propagator, isPlainObject);
    }

    return propagator;
}

async function convertPropertyToGetterSetter(
    vm: any,
    prop: string,
    storage: any,
    propagator: EventTarget,
    isPlainObject: boolean
): Promise<void> {
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
    } else {
        // For class instances, store with a prefixed key
        if (!(storageKey in storage)) {
            Object.defineProperty(storage, storageKey, {
                value: currentValue,
                writable: true,
                enumerable: false,
                configurable: true
            });
        }
    }

    // Define getter/setter
    Object.defineProperty(vm, prop, {
        get() {
            return isPlainObject ? storage[prop] : storage[storageKey];
        },
        set(newValue: any) {
            const oldValue = isPlainObject ? storage[prop] : storage[storageKey];
            
            // Only fire event if value actually changed
            if (oldValue !== newValue) {
                if (isPlainObject) {
                    storage[prop] = newValue;
                } else {
                    storage[storageKey] = newValue;
                }
                
                // Fire event on propagator
                propagator.dispatchEvent(new CustomEvent(prop, { 
                    detail: { oldValue, newValue } 
                }));
            }
        },
        enumerable: true,
        configurable: true
    });
}

/**
 * Infer which properties need to be monitored based on configuration
 */
export function inferPropertiesToMonitor(options: any): Set<string> {
    const props = new Set<string>();
    
    // Add explicitly propagated properties
    if (options.propagate) {
        if (typeof options.propagate === 'string') {
            props.add(options.propagate);
        } else if (Array.isArray(options.propagate)) {
            options.propagate.forEach((p: string) => props.add(p));
        }
    }
    
    // Infer from compacts
    if (options.compacts) {
        for (const key of Object.keys(options.compacts)) {
            const extracted = extractSourceProperty(key);
            if (extracted) props.add(extracted);
        }
    }
    
    // Infer from actions
    if (options.actions) {
        for (const actionConfig of Object.values(options.actions) as any[]) {
            if (actionConfig.ifAllOf) {
                const arr = Array.isArray(actionConfig.ifAllOf) ? actionConfig.ifAllOf : [actionConfig.ifAllOf];
                arr.forEach((p: string) => props.add(p));
            }
            if (actionConfig.ifKeyIn) {
                const arr = Array.isArray(actionConfig.ifKeyIn) ? actionConfig.ifKeyIn : [actionConfig.ifKeyIn];
                arr.forEach((p: string) => props.add(p));
            }
            if (actionConfig.ifAtLeastOneOf) {
                const arr = Array.isArray(actionConfig.ifAtLeastOneOf) ? actionConfig.ifAtLeastOneOf : [actionConfig.ifAtLeastOneOf];
                arr.forEach((p: string) => props.add(p));
            }
        }
    }
    
    // Infer from hitches
    if (options.hitch) {
        for (const key of Object.keys(options.hitch)) {
            // when_X_emits_Y_inc_Z_by
            const match = key.match(/^when_(.+?)_emits/);
            if (match) props.add(match[1]);
        }
    }
    
    // Infer from positractions
    if (options.positractions) {
        for (const positraction of options.positractions) {
            if (positraction.ifKeyIn) {
                positraction.ifKeyIn.forEach((p: string) => props.add(p));
            }
            if (positraction.ifAllOf) {
                positraction.ifAllOf.forEach((p: string) => props.add(p));
            }
        }
    }
    
    return props;
}

function extractSourceProperty(compactKey: string): string | null {
    // negate_X_to_Y -> X
    let match = compactKey.match(/^negate_(.+?)_to_/);
    if (match) return match[1];
    
    // pass_length_of_X_to_Y -> X
    match = compactKey.match(/^pass_length_of_(.+?)_to_/);
    if (match) return match[1];
    
    // echo_X_to_Y -> X
    match = compactKey.match(/^echo_(.+?)_to_/);
    if (match) return match[1];
    
    // when_X_changes_call_Y -> X
    match = compactKey.match(/^when_(.+?)_changes_/);
    if (match) return match[1];
    
    return null;
}
