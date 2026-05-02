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
export async function covertlySetProperty(vm: any, prop: string, value: any): Promise<void> {
    const metadata = vm.__roundaboutStorageMetadata;
    if (!metadata) {
        // Fallback to direct assignment if no metadata
        vm[prop] = value;
        return;
    }
    
    const { storage, isPlainObject, weakRefProps } = metadata;
    
    // Check if property has been converted to getter/setter
    const descriptor = Object.getOwnPropertyDescriptor(vm, prop);
    const isGetterSetter = descriptor && (descriptor.get || descriptor.set);
    
    if (!isGetterSetter) {
        // Property hasn't been converted yet - convert it now
        const propagator = vm.propagator;
        if (propagator) {
            await convertPropertyToGetterSetter(vm, prop, storage, propagator, isPlainObject, weakRefProps);
        }
    }
    
    // Check if this property should use WeakRef
    const useWeakRef = weakRefProps && weakRefProps.properties.has(prop);
    const valueToStore = (useWeakRef && value) ? new WeakRef(value) : value;
    
    // Now set the value in storage
    if (isPlainObject) {
        storage[prop] = valueToStore;
    } else {
        const storageKey = `__${prop}`;
        vm[storageKey] = valueToStore;
    }
}

/**
 * Get a property value directly from storage without triggering getter
 */
export function covertlyGetProperty(vm: any, prop: string): any {
    const metadata = vm.__roundaboutStorageMetadata;
    if (!metadata) {
        return vm[prop];
    }
    
    const { storage, isPlainObject } = metadata;
    
    let val: any;
    if (isPlainObject) {
        val = storage[prop];
    } else {
        const storageKey = `__${prop}`;
        val = vm[storageKey];
    }
    
    // Deref if it's a WeakRef
    return (val instanceof WeakRef) ? val.deref() : val;
}

export async function setupPropagator(
    vm: any,
    propertiesToMonitor: Set<string>,
    weakRefConfig?: any
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
    
    // Parse weakRef configuration
    const weakRefProps = parseWeakRefConfig(weakRefConfig);
    
    // Create storage for property values (only for plain objects)
    let storage: any = null;
    
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

    // Convert each property to getter/setter
    for (const prop of propertiesToMonitor) {
        await convertPropertyToGetterSetter(vm, prop, storage, propagator, isPlainObject, weakRefProps);
    }

    return propagator;
}

interface WeakRefProps {
    properties: Set<string>;
    logIfCollected: 'error' | 'warn' | 'silent' | ((propName: string) => void);
}

function parseWeakRefConfig(config: any): WeakRefProps {
    if (!config) {
        return { properties: new Set(), logIfCollected: 'error' };
    }
    
    // Handle array shorthand: ['prop1', 'prop2']
    if (Array.isArray(config)) {
        return { properties: new Set(config), logIfCollected: 'error' };
    }
    
    // Handle object config
    return {
        properties: new Set(config.properties || []),
        logIfCollected: config.logIfCollected || 'error'
    };
}

async function convertPropertyToGetterSetter(
    vm: any,
    prop: string,
    storage: any,
    propagator: EventTarget,
    isPlainObject: boolean,
    weakRefProps: WeakRefProps
): Promise<void> {
    // Check if already converted
    const descriptor = Object.getOwnPropertyDescriptor(vm, prop);
    if (descriptor && (descriptor.get || descriptor.set)) {
        // Already a getter/setter, don't override
        return;
    }

    // Save the current value
    const currentValue = vm[prop];
    
    // Check if this property should use WeakRef
    const useWeakRef = weakRefProps.properties.has(prop);
    
    if (isPlainObject) {
        // For plain objects, store in the private storage object
        storage[prop] = useWeakRef && currentValue ? new WeakRef(currentValue) : currentValue;
        
        Object.defineProperty(vm, prop, {
            get() {
                const val = storage[prop];
                // Check if it's a WeakRef and deref
                if (val instanceof WeakRef) {
                    const derefed = val.deref();
                    if (derefed === undefined && weakRefProps.logIfCollected !== 'silent') {
                        const logger = typeof weakRefProps.logIfCollected === 'function' 
                            ? weakRefProps.logIfCollected
                            : weakRefProps.logIfCollected === 'warn' ? console.warn : console.error;
                        logger(`WeakRef property '${prop}' has been garbage collected`);
                    }
                    return derefed;
                }
                return val;
            },
            set(newValue: any) {
                const stored = storage[prop];
                const oldValue = (stored instanceof WeakRef) ? stored.deref() : stored;
                
                if (oldValue !== newValue) {
                    // Wrap in WeakRef if configured for this property
                    const valueToStore = (useWeakRef && newValue) 
                        ? new WeakRef(newValue) 
                        : newValue;
                    
                    storage[prop] = valueToStore;
                    propagator.dispatchEvent(new PropertyChangeEvent(prop, oldValue, newValue));
                }
            },
            enumerable: true,
            configurable: true
        });
    } else {
        // For class instances, store on the instance itself using a private key
        const storageKey = `__${prop}`;
        
        // Initialize storage on this instance
        const valueToStore = useWeakRef && currentValue ? new WeakRef(currentValue) : currentValue;
        if (!(storageKey in vm)) {
            Object.defineProperty(vm, storageKey, {
                value: valueToStore,
                writable: true,
                enumerable: false,
                configurable: true
            });
        }
        
        // Check if property already exists on prototype
        const proto = Object.getPrototypeOf(vm);
        const protoDescriptor = Object.getOwnPropertyDescriptor(proto, prop);
        
        if (protoDescriptor && (protoDescriptor.get || protoDescriptor.set)) {
            // Already defined on prototype by a previous instance.
            // Delete the instance's own data property so the prototype
            // getter/setter is no longer shadowed.
            if (vm.hasOwnProperty(prop)) {
                delete vm[prop];
            }
            return;
        }
        
        // Delete the instance property if it exists (so prototype getter/setter will be used)
        if (vm.hasOwnProperty(prop)) {
            delete vm[prop];
        }
        
        // Define getter/setter on prototype (first instance) or instance (if prototype already has it as data property)
        const target = protoDescriptor ? vm : proto;
        
        Object.defineProperty(target, prop, {
            get() {
                // 'this' refers to the actual instance, not the first instance!
                const val = this[storageKey];
                // Check if it's a WeakRef and deref
                if (val instanceof WeakRef) {
                    const derefed = val.deref();
                    if (derefed === undefined && weakRefProps.logIfCollected !== 'silent') {
                        const logger = typeof weakRefProps.logIfCollected === 'function' 
                            ? weakRefProps.logIfCollected
                            : weakRefProps.logIfCollected === 'warn' ? console.warn : console.error;
                        logger(`WeakRef property '${prop}' has been garbage collected`);
                    }
                    return derefed;
                }
                return val;
            },
            set(newValue: any) {
                // 'this' refers to the actual instance
                const stored = this[storageKey];
                const oldValue = (stored instanceof WeakRef) ? stored.deref() : stored;
                
                if (oldValue !== newValue) {
                    // Wrap in WeakRef if configured for this property
                    const valueToStore = (useWeakRef && newValue) 
                        ? new WeakRef(newValue) 
                        : newValue;
                    
                    // Ensure storage property exists on this instance
                    if (!(storageKey in this)) {
                        Object.defineProperty(this, storageKey, {
                            value: valueToStore,
                            writable: true,
                            enumerable: false,
                            configurable: true
                        });
                    } else {
                        this[storageKey] = valueToStore;
                    }
                    
                    // Get propagator from this instance
                    const instancePropagator = this.propagator;
                    if (instancePropagator) {
                        instancePropagator.dispatchEvent(
                            new PropertyChangeEvent(prop, oldValue, newValue)
                        );
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
            
            // Also add target properties
            const target = extractTargetProperty(key);
            if (target) props.add(target);
        }
    }
    
    // Infer from actions - both properties they READ and properties they might WRITE
    if (options.actions) {
        for (const [actionKey, actionConfig] of Object.entries(options.actions) as any[]) {
            // Properties the action reads (conditions)
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
            if (actionConfig.ifNoneOf) {
                const arr = Array.isArray(actionConfig.ifNoneOf) ? actionConfig.ifNoneOf : [actionConfig.ifNoneOf];
                arr.forEach((p: string) => props.add(p));
            }
            if (actionConfig.ifEquals) {
                const arr = Array.isArray(actionConfig.ifEquals) ? actionConfig.ifEquals : [actionConfig.ifEquals];
                arr.forEach((p: string) => props.add(p));
            }
            if (actionConfig.ifNotAllOf) {
                const arr = Array.isArray(actionConfig.ifNotAllOf) ? actionConfig.ifNotAllOf : [actionConfig.ifNotAllOf];
                arr.forEach((p: string) => props.add(p));
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
            if (match) props.add(match[1]);
        }
    }
    
    // Infer from handlers
    if (options.handlers) {
        for (const key of Object.keys(options.handlers)) {
            // eventTargetProp_to_methodName_on
            const match = key.match(/^(.+)_to_(.+)_on$/);
            if (match) props.add(match[1]); // Add the EventTarget property
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
    
    // Infer from merges
    if (options.merges) {
        for (const merge of options.merges) {
            const addArr = (value: any) => {
                if (typeof value === 'string') {
                    props.add(value);
                } else if (Array.isArray(value)) {
                    value.forEach((p: string) => props.add(p));
                }
            };
            if (merge.ifAllOf) addArr(merge.ifAllOf);
            if (merge.ifKeyIn) addArr(merge.ifKeyIn);
            if (merge.ifNoneOf) addArr(merge.ifNoneOf);
            if (merge.ifEquals) addArr(merge.ifEquals);
            if (merge.ifAtLeastOneOf) addArr(merge.ifAtLeastOneOf);
            if (merge.ifNotAllOf) addArr(merge.ifNotAllOf);
        }
    }
    
    return props;
}

function extractTargetProperty(compactKey: string): string | null {
    // negate_X_to_Y -> Y
    let match = compactKey.match(/^negate_.+?_to_(.+)$/);
    if (match) return match[1];
    
    // pass_length_of_X_to_Y -> Y
    match = compactKey.match(/^pass_length_of_.+?_to_(.+)$/);
    if (match) return match[1];
    
    // echo_X_to_Y -> Y
    match = compactKey.match(/^echo_.+?_to_(.+?)(?:_after)?$/);
    if (match) return match[1];
    
    // when_X_changes_toggle_Y -> Y
    match = compactKey.match(/^when_.+?_changes_toggle_(.+)$/);
    if (match) return match[1];
    
    // when_X_changes_inc_Y_by -> Y
    match = compactKey.match(/^when_.+?_changes_inc_(.+?)_by$/);
    if (match) return match[1];
    
    // on_EVENT_of_X_inc_Y_by -> Y
    match = compactKey.match(/^on_.+?_of_.+?_inc_(.+?)_by$/);
    if (match) return match[1];
    
    // on_EVENT_of_X_set_Y_to -> Y
    match = compactKey.match(/^on_.+?_of_.+?_set_(.+?)_to$/);
    if (match) return match[1];
    
    return null;
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
    
    // on_EVENT_of_X_inc_Y_by -> X
    match = compactKey.match(/^on_.+?_of_(.+?)_inc_/);
    if (match) return match[1];
    
    // on_EVENT_of_X_set_Y_to -> X
    match = compactKey.match(/^on_.+?_of_(.+?)_set_/);
    if (match) return match[1];
    
    return null;
}
