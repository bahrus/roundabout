import type { RoundaboutOptions, RoundaboutReady } from './types/roundabout/types.js';
import { ROUNDABOUT_READY, type RoundaboutReadyCache } from './makeRoundaboutReady.js';
import { PropertyChangeEvent } from './core/Events.js';

/**
 * Synchronous roundabout initialization for class instances whose prototype
 * has been prepared via `makeRoundaboutReady()`.
 *
 * Always returns `[vm, propagator]` synchronously. If the prototype hasn't
 * been prepared, getter/setters are installed inline (still synchronous) and
 * processor wiring is deferred to a microtask.
 *
 * ```js
 * connectedCallback() {
 *     const [vm, propagator] = roundaboutSync({ vm: this, ...raConfig });
 * }
 * ```
 */
export function roundaboutSync<TProps = any, TActions = TProps, ETProps = TProps>(
    options: RoundaboutOptions<TProps, TActions, ETProps>,
    infractions?: Array<Function | string>
): [vm: TProps & TActions & RoundaboutReady, propagator: EventTarget] {
    const vm = (options.vm || {}) as any;
    const proto = Object.getPrototypeOf(vm);
    const cache: RoundaboutReadyCache | undefined = proto?.[ROUNDABOUT_READY];

    // Create propagator
    let propagator: EventTarget;
    if (vm.propagator) {
        propagator = vm.propagator;
    } else {
        propagator = new EventTarget();
        Object.defineProperty(vm, 'propagator', {
            value: propagator,
            enumerable: false,
            writable: false,
            configurable: true,
        });
    }

    // Setup RoundaboutReady interface on the vm
    const abortController = new AbortController();
    setupRoundaboutReadyInterface(vm, abortController);

    // Store assignOptions on VM so processors can access them
    if (options.assignOptions) {
        Object.defineProperty(vm, '__roundaboutAssignOptions', {
            value: options.assignOptions,
            enumerable: false,
            writable: false,
            configurable: true,
        });
    }

    if (cache) {
        // Happy path: prototype is prepared, everything is synchronous
        const { propertiesToMonitor, modules, weakRefConfig } = cache;

        // Initialize per-instance storage
        initializeInstanceStorage(vm, propertiesToMonitor, weakRefConfig);

        // Store metadata for covertAssignment
        storeMetadata(vm, weakRefConfig);

        // Wire up property-change listeners and processors synchronously
        const handlePropertyChange = createPropertyChangeHandler(vm);

        for (const prop of propertiesToMonitor) {
            propagator.addEventListener(prop, (event: Event) => {
                const propChangeEvent = event as any;
                handlePropertyChange(prop, propChangeEvent.newValue).catch(err => {
                    console.error(`Error handling property change for ${prop}:`, err);
                });
            }, { signal: abortController.signal });
        }

        // Process all options synchronously using cached modules
        processOptionsSync(vm, options, modules, handlePropertyChange, abortController, infractions);

        // Handle initialPropVals / defaultPropVals synchronously if possible
        const initVals = options.initialPropVals || options.defaultPropVals;
        if (initVals) {
            // Fire-and-forget: assignGingerly needs an import but values can be set after
            import('assign-gingerly/assignGingerly.js').then(({ assignGingerly }) => {
                assignGingerly(vm, initVals, options.assignOptions as any);
            });
        }
    } else {
        // Fallback path: prototype not prepared.
        // Install getter/setters synchronously (inline logic, no imports needed).
        // Defer processor wiring to a microtask.
        const weakRefConfig = parseWeakRefConfig(options.weakRef);
        const propertiesToMonitor = inferPropertiesToMonitorSync(options);

        // Install getter/setters directly on the prototype (or instance for plain objects)
        const isPlainObject = Object.getPrototypeOf(vm) === Object.prototype;
        installGetterSettersInline(vm, propertiesToMonitor, propagator, weakRefConfig, isPlainObject);

        // Store metadata for covertAssignment
        storeMetadata(vm, weakRefConfig);

        // Wire up property-change listeners
        const handlePropertyChange = createPropertyChangeHandler(vm);

        for (const prop of propertiesToMonitor) {
            propagator.addEventListener(prop, (event: Event) => {
                const propChangeEvent = event as any;
                handlePropertyChange(prop, propChangeEvent.newValue).catch(err => {
                    console.error(`Error handling property change for ${prop}:`, err);
                });
            }, { signal: abortController.signal });
        }

        // Fire-and-forget: load processor modules and wire them up
        deferProcessorWiring(vm, options, handlePropertyChange, abortController, infractions);
    }

    return [vm as TProps & TActions & RoundaboutReady, propagator];
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function setupRoundaboutReadyInterface(vm: any, abortController: AbortController): void {
    if (!vm.RAController) {
        vm.RAController = abortController;
    }
    if (!vm.covertAssignment) {
        vm.covertAssignment = async (obj: any) => {
            const { covertlySetProperty } = await import('./utils/PropagatorSetup.js');
            for (const [key, value] of Object.entries(obj)) {
                covertlySetProperty(vm, key, value);
            }
        };
    }
    if (!vm.awake) {
        vm.awake = async () => {};
    }
    if (!vm.nudge) {
        vm.nudge = () => {};
    }
    if (!vm.rock) {
        vm.rock = () => {};
    }
}

function initializeInstanceStorage(vm: any, propertiesToMonitor: Set<string>, weakRefConfig: any): void {
    for (const prop of propertiesToMonitor) {
        const storageKey = `__${prop}`;
        if (!(storageKey in vm)) {
            const currentValue = vm[prop];
            const useWeakRef = weakRefConfig?.properties?.has(prop);
            const valueToStore = useWeakRef && currentValue ? new WeakRef(currentValue) : currentValue;
            Object.defineProperty(vm, storageKey, {
                value: valueToStore,
                writable: true,
                enumerable: false,
                configurable: true,
            });
        }
        // Delete any own data property that would shadow the prototype getter/setter
        const ownDesc = Object.getOwnPropertyDescriptor(vm, prop);
        if (ownDesc && !ownDesc.get && !ownDesc.set) {
            delete vm[prop];
        }
    }
}

function storeMetadata(vm: any, weakRefConfig: any): void {
    if (!vm.__roundaboutStorageMetadata) {
        const isPlainObject = Object.getPrototypeOf(vm) === Object.prototype;
        Object.defineProperty(vm, '__roundaboutStorageMetadata', {
            value: { storage: isPlainObject ? (vm.__roundaboutStorage || null) : null, isPlainObject, weakRefProps: weakRefConfig },
            enumerable: false,
            writable: false,
            configurable: true,
        });
    }
}

function createPropertyChangeHandler(vm: any): (key: string, value: any) => Promise<void> {
    const processingQueue = new Map<string, Promise<void>>();
    const pendingValues = new Map<string, any>();

    async function handlePropertyChange(key: string, value: any): Promise<void> {
        const existing = processingQueue.get(key);
        if (existing) {
            pendingValues.set(key, value);
            await existing;
            return;
        }

        const promise = processPropertyChangeInternal(key, value);
        processingQueue.set(key, promise);

        try {
            await promise;
        } finally {
            processingQueue.delete(key);
        }

        if (pendingValues.has(key)) {
            const next = pendingValues.get(key);
            pendingValues.delete(key);
            await handlePropertyChange(key, next);
        }
    }

    async function processPropertyChangeInternal(key: string, _value: any): Promise<void> {
        const reactions = vm.__roundaboutReactions?.get(key);
        if (reactions && Array.isArray(reactions)) {
            for (const reaction of reactions) {
                try {
                    await reaction(_value);
                } catch (err) {
                    console.error(`Error in reaction for ${key}:`, err);
                }
            }
        }
    }

    return handlePropertyChange;
}

function processOptionsSync(
    vm: any,
    options: any,
    modules: RoundaboutReadyCache['modules'],
    handlePropertyChange: (key: string, value: any) => Promise<void>,
    abortController: AbortController,
    infractions?: Array<Function | string>
): void {
    const onChange = (key: string) => handlePropertyChange(key, vm[key]);

    if (options.compacts && modules.processCompacts) {
        modules.processCompacts(vm, options.compacts, onChange);
    }
    if (options.actions && modules.processActions) {
        modules.processActions(
            vm, options.actions, onChange,
            options.internalRouting === true
        );
    }
    if (options.handlers && modules.processHandlers) {
        modules.processHandlers(vm, options.handlers, abortController.signal);
    }
    if (options.hitches && modules.processHitches) {
        modules.processHitches(vm, options.hitches, onChange);
    }
    if (options.positractions && modules.processPositractions) {
        modules.processPositractions(vm, options.positractions, onChange);
    }
    if (options.merges && modules.processMerges) {
        modules.processMerges(vm, options.merges, onChange);
    }
    if (options.yields && modules.processYields) {
        modules.processYields(vm, options.yields, onChange);
    }

    // Handle infractions if provided
    if (infractions) {
        import('./processors/infractions.js').then(({ processInfractions }) => {
            processInfractions(vm, infractions, onChange);
        });
    }
}

async function deferProcessorWiring(
    vm: any,
    options: any,
    handlePropertyChange: (key: string, value: any) => Promise<void>,
    abortController: AbortController,
    infractions?: Array<Function | string>
): Promise<void> {
    const onChange = (key: string) => handlePropertyChange(key, vm[key]);

    const promises: Promise<void>[] = [];

    if (options.compacts) {
        promises.push(
            import('./processors/compacts.js').then(({ processCompacts }) => {
                processCompacts(vm, options.compacts!, onChange);
            })
        );
    }
    if (options.actions) {
        promises.push(
            import('./processors/actions.js').then(({ processActions }) => {
                processActions(vm, options.actions!, onChange, options.internalRouting === true);
            })
        );
    }
    if (options.handlers) {
        promises.push(
            import('./processors/handlers.js').then(({ processHandlers }) => {
                processHandlers(vm, options.handlers!, abortController.signal);
            })
        );
    }
    if (options.hitches) {
        promises.push(
            import('./processors/hitches.js').then(({ processHitches }) => {
                processHitches(vm, options.hitches!, onChange);
            })
        );
    }
    if (options.positractions) {
        promises.push(
            import('./processors/positractions.js').then(({ processPositractions }) => {
                processPositractions(vm, options.positractions!, onChange);
            })
        );
    }
    if (options.merges) {
        promises.push(
            import('./processors/merges.js').then(({ processMerges }) => {
                processMerges(vm, options.merges!, onChange);
            })
        );
    }
    if (options.yields) {
        promises.push(
            import('./processors/yields.js').then(({ processYields }) => {
                processYields(vm, options.yields!, onChange);
            })
        );
    }
    if (infractions) {
        promises.push(
            import('./processors/infractions.js').then(({ processInfractions }) => {
                processInfractions(vm, infractions, onChange);
            })
        );
    }

    // Handle initialPropVals / defaultPropVals
    const initVals = options.initialPropVals || options.defaultPropVals;
    if (initVals) {
        promises.push(
            import('assign-gingerly/assignGingerly.js').then(({ assignGingerly }) => {
                assignGingerly(vm, initVals, options.assignOptions as any);
            })
        );
    }

    await Promise.all(promises);
}

/**
 * Synchronous version of inferPropertiesToMonitor — same logic, no imports needed.
 */
function inferPropertiesToMonitorSync(options: any): Set<string> {
    const props = new Set<string>();

    if (options.propagate) {
        if (typeof options.propagate === 'string') {
            props.add(options.propagate);
        } else if (Array.isArray(options.propagate)) {
            options.propagate.forEach((p: string) => props.add(p));
        }
    }

    if (options.compacts) {
        for (const key of Object.keys(options.compacts)) {
            const source = extractSourceProperty(key);
            if (source) props.add(source);
            const target = extractTargetProperty(key);
            if (target) props.add(target);
        }
    }

    if (options.actions) {
        for (const [, actionConfig] of Object.entries(options.actions) as any[]) {
            for (const condKey of ['ifAllOf', 'ifKeyIn', 'ifAtLeastOneOf', 'ifNoneOf', 'ifEquals', 'ifNotAllOf']) {
                if (actionConfig[condKey]) {
                    const arr = Array.isArray(actionConfig[condKey]) ? actionConfig[condKey] : [actionConfig[condKey]];
                    arr.forEach((p: string) => props.add(p));
                }
            }
        }
    }

    if (options.hitches) {
        for (const key of Object.keys(options.hitches)) {
            const match = key.match(/^when_(.+?)_emits/);
            if (match) props.add(match[1]);
        }
    }

    if (options.handlers) {
        for (const key of Object.keys(options.handlers)) {
            const match = key.match(/^(.+)_to_(.+)_on$/);
            if (match) props.add(match[1]);
        }
    }

    if (options.positractions) {
        for (const positraction of options.positractions) {
            if (positraction.ifKeyIn) positraction.ifKeyIn.forEach((p: string) => props.add(p));
            if (positraction.ifAllOf) positraction.ifAllOf.forEach((p: string) => props.add(p));
        }
    }

    if (options.merges) {
        for (const merge of options.merges) {
            const addArr = (value: any) => {
                if (typeof value === 'string') props.add(value);
                else if (Array.isArray(value)) value.forEach((p: string) => props.add(p));
            };
            if (merge.ifAllOf) addArr(merge.ifAllOf);
            if (merge.ifKeyIn) addArr(merge.ifKeyIn);
            if (merge.ifNoneOf) addArr(merge.ifNoneOf);
            if (merge.ifEquals) addArr(merge.ifEquals);
            if (merge.ifAtLeastOneOf) addArr(merge.ifAtLeastOneOf);
            if (merge.ifNotAllOf) addArr(merge.ifNotAllOf);
        }
    }

    if (options.yields) {
        for (const [targetProp, config] of Object.entries(options.yields) as any[]) {
            props.add(targetProp);
            if (config.from) props.add(config.from);
            if (config.atIndex) props.add(config.atIndex);
        }
    }

    return props;
}

function extractSourceProperty(compactKey: string): string | null {
    let match = compactKey.match(/^negate_(.+?)_to_/);
    if (match) return match[1];
    match = compactKey.match(/^pass_length_of_(.+?)_to_/);
    if (match) return match[1];
    match = compactKey.match(/^echo_(.+?)_to_/);
    if (match) return match[1];
    match = compactKey.match(/^when_(.+?)_changes_/);
    if (match) return match[1];
    match = compactKey.match(/^on_.+?_of_(.+?)_inc_/);
    if (match) return match[1];
    match = compactKey.match(/^on_.+?_of_(.+?)_set_/);
    if (match) return match[1];
    return null;
}

function extractTargetProperty(compactKey: string): string | null {
    let match = compactKey.match(/^negate_.+?_to_(.+)$/);
    if (match) return match[1];
    match = compactKey.match(/^pass_length_of_.+?_to_(.+)$/);
    if (match) return match[1];
    match = compactKey.match(/^echo_.+?_to_(.+?)(?:_after)?$/);
    if (match) return match[1];
    match = compactKey.match(/^when_.+?_changes_toggle_(.+)$/);
    if (match) return match[1];
    match = compactKey.match(/^when_.+?_changes_inc_(.+?)_by$/);
    if (match) return match[1];
    match = compactKey.match(/^on_.+?_of_.+?_inc_(.+?)_by$/);
    if (match) return match[1];
    match = compactKey.match(/^on_.+?_of_.+?_set_(.+?)_to$/);
    if (match) return match[1];
    return null;
}

function installGetterSettersInline(
    vm: any,
    propertiesToMonitor: Set<string>,
    propagator: EventTarget,
    weakRefConfig: WeakRefProps,
    isPlainObject: boolean
): void {
    if (isPlainObject) {
        const storage: any = {};
        Object.defineProperty(vm, '__roundaboutStorage', {
            value: storage,
            enumerable: false,
            writable: false,
            configurable: true,
        });

        for (const prop of propertiesToMonitor) {
            const useWeakRef = weakRefConfig.properties.has(prop);
            const descriptor = Object.getOwnPropertyDescriptor(vm, prop);
            if (descriptor && (descriptor.get || descriptor.set)) continue;

            const currentValue = vm[prop];
            storage[prop] = useWeakRef && currentValue ? new WeakRef(currentValue) : currentValue;

            Object.defineProperty(vm, prop, {
                get() {
                    const val = storage[prop];
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
                    const stored = storage[prop];
                    const oldValue = (stored instanceof WeakRef) ? stored.deref() : stored;
                    if (oldValue !== newValue) {
                        storage[prop] = (useWeakRef && newValue) ? new WeakRef(newValue) : newValue;
                        propagator.dispatchEvent(new PropertyChangeEvent(prop, oldValue, newValue));
                    }
                },
                enumerable: true,
                configurable: true,
            });
        }
    } else {
        const proto = Object.getPrototypeOf(vm);
        for (const prop of propertiesToMonitor) {
            const storageKey = `__${prop}`;
            const useWeakRef = weakRefConfig.properties.has(prop);

            // Initialize per-instance storage
            const currentValue = vm[prop];
            const valueToStore = useWeakRef && currentValue ? new WeakRef(currentValue) : currentValue;
            if (!(storageKey in vm)) {
                Object.defineProperty(vm, storageKey, {
                    value: valueToStore,
                    writable: true,
                    enumerable: false,
                    configurable: true,
                });
            }

            // Check if prototype already has getter/setter
            const protoDescriptor = Object.getOwnPropertyDescriptor(proto, prop);
            if (protoDescriptor && (protoDescriptor.get || protoDescriptor.set)) {
                // Already has getter/setter, just ensure own data prop doesn't shadow
                if (vm.hasOwnProperty(prop)) {
                    delete vm[prop];
                }
                continue;
            }

            // Delete own data property so prototype getter/setter takes effect
            if (vm.hasOwnProperty(prop)) {
                delete vm[prop];
            }

            const target = protoDescriptor ? vm : proto;

            Object.defineProperty(target, prop, {
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
                        const valToStore = (useWeakRef && newValue) ? new WeakRef(newValue) : newValue;
                        if (!(storageKey in this)) {
                            Object.defineProperty(this, storageKey, {
                                value: valToStore,
                                writable: true,
                                enumerable: false,
                                configurable: true,
                            });
                        } else {
                            this[storageKey] = valToStore;
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
    }
}

interface WeakRefProps {
    properties: Set<string>;
    logIfCollected: 'error' | 'warn' | 'silent' | ((propName: string) => void);
}

function parseWeakRefConfig(config: any): WeakRefProps {
    if (!config) {
        return { properties: new Set(), logIfCollected: 'error' };
    }
    if (Array.isArray(config)) {
        return { properties: new Set(config), logIfCollected: 'error' };
    }
    return {
        properties: new Set(config.properties || []),
        logIfCollected: config.logIfCollected || 'error',
    };
}
