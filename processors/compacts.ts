import type { Compacts } from '../types/roundabout/types.js';

export async function processCompacts<TProps = any, TActions = TProps>(
    vm: TProps & TActions,
    compacts: Compacts<TProps, TActions>,
    onChange: (key: string) => Promise<void>
): Promise<() => void> {
    const reactions = new Map<string, Array<(value: any) => Promise<void>>>();
    const vmAny = vm as any;
    const eventListenerStates: Array<{ abortController: AbortController | undefined }> = [];
    
    // Track methods invoked by compacts for conflict detection with actions
    if (!vmAny.__roundaboutCompactMethods) {
        vmAny.__roundaboutCompactMethods = new Set<string>();
    }

    for (const [compactKey, delayOrProp] of Object.entries(compacts)) {
        const parsed = await parseCompact(compactKey, delayOrProp);
        if (!parsed) continue;
        
        // Track if this compact calls a method
        if (parsed.type === 'call' && parsed.methodName) {
            vmAny.__roundaboutCompactMethods.add(parsed.methodName);
        }

        // Register reaction for the source property
        if (!reactions.has(parsed.sourceProp)) {
            reactions.set(parsed.sourceProp, []);
        }
        
        if (parsed.type === 'on_event_inc' || parsed.type === 'on_event_set') {
            // Event listener compact: attach/detach listener when element property changes
            const listenerState = { abortController: undefined as AbortController | undefined };
            eventListenerStates.push(listenerState);

            const reactionFn = async (value: any) => {
                setupEventCompactListener(vmAny, parsed, listenerState);
            };

            reactions.get(parsed.sourceProp)!.push(reactionFn);
        } else {
            const reactionFn = async (value: any) => {
                await executeCompact(vm, parsed, value);
            };
            
            reactions.get(parsed.sourceProp)!.push(reactionFn);
        }
    }

    // Store reactions on the VM so RoundaboutManager can trigger them
    if (!vmAny.__roundaboutReactions) {
        vmAny.__roundaboutReactions = new Map();
    }
    
    // Merge our reactions with any existing ones
    for (const [prop, fns] of reactions.entries()) {
        if (!vmAny.__roundaboutReactions.has(prop)) {
            vmAny.__roundaboutReactions.set(prop, []);
        }
        vmAny.__roundaboutReactions.get(prop).push(...fns);
    }

    // Return cleanup function
    return () => {
        // Abort event listener compacts
        for (const state of eventListenerStates) {
            if (state.abortController) {
                state.abortController.abort();
            }
        }
        // Remove our reactions
        for (const [prop, fns] of reactions.entries()) {
            const existing = vmAny.__roundaboutReactions?.get(prop);
            if (existing) {
                for (const fn of fns) {
                    const index = existing.indexOf(fn);
                    if (index !== -1) {
                        existing.splice(index, 1);
                    }
                }
            }
        }
    };
}

interface ParsedCompact {
    type: 'negate' | 'pass_length' | 'echo' | 'echo_after' | 'call' | 'toggle' | 'inc' | 'dispatch' | 'on_event_inc' | 'on_event_set';
    sourceProp: string;
    targetProp?: string;
    methodName?: string;
    delay: number;
    delayProp?: string;
    incrementBy?: number;
    eventName?: string;
    setValue?: any;
}

async function parseCompact(key: string, value: any): Promise<ParsedCompact | null> {
    // negate_X_to_Y
    let match = key.match(/^negate_(.+)_to_(.+)$/);
    if (match) {
        return {
            type: 'negate',
            sourceProp: match[1],
            targetProp: match[2],
            delay: typeof value === 'number' ? value : 0
        };
    }

    // pass_length_of_X_to_Y
    match = key.match(/^pass_length_of_(.+)_to_(.+)$/);
    if (match) {
        return {
            type: 'pass_length',
            sourceProp: match[1],
            targetProp: match[2],
            delay: typeof value === 'number' ? value : 0
        };
    }

    // echo_X_to_Y_after
    match = key.match(/^echo_(.+)_to_(.+)_after$/);
    if (match) {
        return {
            type: 'echo_after',
            sourceProp: match[1],
            targetProp: match[2],
            delay: 0,
            delayProp: typeof value === 'string' ? value : undefined
        };
    }

    // echo_X_to_Y
    match = key.match(/^echo_(.+)_to_(.+)$/);
    if (match) {
        return {
            type: 'echo',
            sourceProp: match[1],
            targetProp: match[2],
            delay: typeof value === 'number' ? value : 0
        };
    }

    // when_X_changes_call_Y
    match = key.match(/^when_(.+)_changes_call_(.+)$/);
    if (match) {
        return {
            type: 'call',
            sourceProp: match[1],
            methodName: match[2],
            delay: typeof value === 'number' ? value : 0
        };
    }

    // when_X_changes_toggle_Y
    match = key.match(/^when_(.+)_changes_toggle_(.+)$/);
    if (match) {
        return {
            type: 'toggle',
            sourceProp: match[1],
            targetProp: match[2],
            delay: typeof value === 'number' ? value : 0
        };
    }

    // when_X_changes_inc_Y_by
    match = key.match(/^when_(.+)_changes_inc_(.+)_by$/);
    if (match) {
        return {
            type: 'inc',
            sourceProp: match[1],
            targetProp: match[2],
            delay: 0,
            incrementBy: typeof value === 'number' ? value : 1
        };
    }

    // when_X_changes_dispatch
    match = key.match(/^when_(.+)_changes_dispatch$/);
    if (match) {
        return {
            type: 'dispatch',
            sourceProp: match[1],
            delay: 0,
            eventName: typeof value === 'string' ? value : match[1]
        };
    }

    // on_EVENT_of_X_inc_Y_by
    match = key.match(/^on_(.+)_of_(.+)_inc_(.+)_by$/);
    if (match) {
        return {
            type: 'on_event_inc',
            eventName: match[1],
            sourceProp: match[2],
            targetProp: match[3],
            delay: 0,
            incrementBy: typeof value === 'number' ? value : 1
        };
    }

    // on_EVENT_of_X_set_Y_to
    match = key.match(/^on_(.+)_of_(.+)_set_(.+)_to$/);
    if (match) {
        return {
            type: 'on_event_set',
            eventName: match[1],
            sourceProp: match[2],
            targetProp: match[3],
            delay: 0,
            setValue: value
        };
    }

    return null;
}

async function executeCompact<TProps, TActions>(
    vm: TProps & TActions,
    parsed: ParsedCompact,
    sourceValue: any
): Promise<void> {
    const vmAny = vm as any;

    switch (parsed.type) {
        case 'negate':
            if (parsed.targetProp) {
                vmAny[parsed.targetProp] = !sourceValue;
            }
            break;

        case 'pass_length':
            if (parsed.targetProp) {
                vmAny[parsed.targetProp] = sourceValue?.length ?? 0;
            }
            break;

        case 'echo':
        case 'echo_after':
            if (parsed.targetProp) {
                vmAny[parsed.targetProp] = sourceValue;
            }
            break;

        case 'call':
            if (parsed.methodName && typeof vmAny[parsed.methodName] === 'function') {
                const result = await vmAny[parsed.methodName](vm);
                if (result && typeof result === 'object') {
                    const { assignGingerly } = await import('assign-gingerly/assignGingerly.js');
                    await assignGingerly(vm, result, vmAny.__roundaboutAssignGingerlyOptions);
                }
            }
            break;

        case 'toggle':
            if (parsed.targetProp) {
                vmAny[parsed.targetProp] = !vmAny[parsed.targetProp];
            }
            break;

        case 'inc':
            if (parsed.targetProp) {
                const current = vmAny[parsed.targetProp] || 0;
                vmAny[parsed.targetProp] = current + (parsed.incrementBy || 1);
            }
            break;

        case 'dispatch':
            if (parsed.eventName && vmAny.propagator) {
                const { CompactDispatchEvent } = await import('../core/Events.js');
                vmAny.propagator.dispatchEvent(new CompactDispatchEvent(parsed.eventName, sourceValue));
            }
            break;
    }
}

/**
 * Attach an event listener to an element property for on_EVENT_of_X_inc_Y_by compacts.
 * Handles both live references and WeakRef-wrapped references.
 * Cleans up the previous listener when the element changes.
 */
function setupEventCompactListener(
    vm: any,
    parsed: ParsedCompact,
    state: { abortController: AbortController | undefined }
): void {
    // Clean up previous listener
    if (state.abortController) {
        state.abortController.abort();
        state.abortController = undefined;
    }

    let element = vm[parsed.sourceProp];

    // Resolve WeakRef if needed
    if (element && typeof element === 'object' && 'deref' in element) {
        element = element.deref();
    }

    if (!element || !(element instanceof EventTarget)) {
        return;
    }

    const abortController = new AbortController();
    state.abortController = abortController;

    element.addEventListener(parsed.eventName!, () => {
        if (parsed.type === 'on_event_set') {
            vm[parsed.targetProp!] = parsed.setValue;
        } else {
            const current = vm[parsed.targetProp!] || 0;
            vm[parsed.targetProp!] = current + (parsed.incrementBy || 1);
        }
    }, { signal: abortController.signal });
}
