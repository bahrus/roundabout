import type { Compacts } from '../types/roundabout/types.js';

export async function processCompacts<TProps = any, TActions = TProps>(
    vm: TProps & TActions,
    compacts: Compacts<TProps, TActions>,
    onChange: (key: string) => Promise<void>
): Promise<() => void> {
    const reactions = new Map<string, Array<(value: any) => Promise<void>>>();
    const vmAny = vm as any;
    
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
        
        const reactionFn = async (value: any) => {
            await executeCompact(vm, parsed, value);
        };
        
        reactions.get(parsed.sourceProp)!.push(reactionFn);
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
    type: 'negate' | 'pass_length' | 'echo' | 'echo_after' | 'call' | 'toggle' | 'inc' | 'dispatch';
    sourceProp: string;
    targetProp?: string;
    methodName?: string;
    delay: number;
    delayProp?: string;
    incrementBy?: number;
    eventName?: string;
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
                    await assignGingerly(vm, result);
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
                vmAny.propagator.dispatchEvent(new CustomEvent(parsed.eventName, { detail: sourceValue }));
            }
            break;
    }
}
