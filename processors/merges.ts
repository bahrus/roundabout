import type { Merge, Merges, LogicOp } from '../types/roundabout/types.js';

interface MergeState {
    config: Merge;
    monitoredProps: Set<string>;
    lastConditionsMet: boolean;
    pendingTimeout?: any;
}

export async function processMerges<TProps = any>(
    vm: TProps,
    merges: Merges<TProps>,
    onChange: (key: string) => Promise<void>
): Promise<() => void> {
    const vmAny = vm as any;

    const mergeStates: MergeState[] = [];

    // Register reactions for each merge
    for (let i = 0; i < merges.length; i++) {
        const merge = merges[i];
        const state = setupMerge(vm, merge, i);
        mergeStates.push(state);
    }

    // Initial evaluation
    for (const state of mergeStates) {
        await evaluateAndExecuteMerge(vm, state);
    }

    // Return cleanup function
    return () => {
        for (const state of mergeStates) {
            if (state.pendingTimeout) {
                clearTimeout(state.pendingTimeout);
            }
        }
        mergeStates.length = 0;
    };
}

function setupMerge<TProps>(
    vm: TProps,
    config: Merge<TProps>,
    index: number
): MergeState {
    const vmAny = vm as any;

    const monitoredProps = inferMonitoredProperties(config);

    const state: MergeState = {
        config,
        monitoredProps,
        lastConditionsMet: false
    };

    // Register reactions for monitored properties
    if (!vmAny.__roundaboutReactions) {
        vmAny.__roundaboutReactions = new Map();
    }

    for (const prop of monitoredProps) {
        if (!vmAny.__roundaboutReactions.has(prop)) {
            vmAny.__roundaboutReactions.set(prop, []);
        }

        const reactionFn = async (value: any) => {
            await evaluateAndExecuteMerge(vm, state);
        };

        vmAny.__roundaboutReactions.get(prop).push(reactionFn);
    }

    return state;
}

function inferMonitoredProperties(config: LogicOp): Set<string> {
    const props = new Set<string>();

    const addProps = (value: any) => {
        if (typeof value === 'string') {
            props.add(value);
        } else if (Array.isArray(value)) {
            value.forEach(p => props.add(p));
        }
    };

    if (config.ifAllOf) addProps(config.ifAllOf);
    if (config.ifKeyIn) addProps(config.ifKeyIn);
    if (config.ifNoneOf) addProps(config.ifNoneOf);
    if (config.ifEquals) addProps(config.ifEquals);
    if (config.ifAtLeastOneOf) addProps(config.ifAtLeastOneOf);
    if (config.ifNotAllOf) addProps(config.ifNotAllOf);

    return props;
}

async function evaluateAndExecuteMerge<TProps>(
    vm: TProps,
    state: MergeState
): Promise<void> {
    const config = state.config;

    // Clear any pending timeout
    if (state.pendingTimeout) {
        clearTimeout(state.pendingTimeout);
        state.pendingTimeout = undefined;
    }

    const conditionsMet = evaluateConditions(vm, config);

    if (config.debug) {
        console.log(`[Merge] Conditions evaluated:`, {
            conditionsMet,
            lastConditionsMet: state.lastConditionsMet
        });
    }

    let shouldExecute = false;

    if (config.ifKeyIn) {
        // For ifKeyIn, execute every time a monitored property changes
        shouldExecute = conditionsMet;
    } else {
        // For other conditions, execute only on transition to "all conditions met"
        shouldExecute = conditionsMet && !state.lastConditionsMet;
    }

    state.lastConditionsMet = conditionsMet;

    if (!shouldExecute) {
        return;
    }

    const delay = config.delay || 0;

    if (delay > 0) {
        state.pendingTimeout = setTimeout(async () => {
            await executeMerge(vm, config);
        }, delay);
    } else {
        await executeMerge(vm, config);
    }
}

function evaluateConditions<TProps>(
    vm: TProps,
    config: LogicOp<TProps>
): boolean {
    const vmAny = vm as any;

    if (config.ifAllOf) {
        const props = Array.isArray(config.ifAllOf) ? config.ifAllOf : [config.ifAllOf];
        if (!props.every(p => !!vmAny[p])) {
            return false;
        }
    }

    if (config.ifKeyIn) {
        const props = Array.isArray(config.ifKeyIn) ? config.ifKeyIn : [config.ifKeyIn];
        if (!props.some(p => vmAny[p] !== undefined)) {
            return false;
        }
    }

    if (config.ifNoneOf) {
        const props = Array.isArray(config.ifNoneOf) ? config.ifNoneOf : [config.ifNoneOf];
        if (props.some(p => !!vmAny[p])) {
            return false;
        }
    }

    if (config.ifEquals && Array.isArray(config.ifEquals) && config.ifEquals.length > 1) {
        const firstValue = vmAny[config.ifEquals[0]];
        if (!config.ifEquals.every(p => vmAny[p] === firstValue)) {
            return false;
        }
    }

    if (config.ifAtLeastOneOf) {
        const props = Array.isArray(config.ifAtLeastOneOf) ? config.ifAtLeastOneOf : [config.ifAtLeastOneOf];
        if (!props.some(p => !!vmAny[p])) {
            return false;
        }
    }

    if (config.ifNotAllOf) {
        const props = Array.isArray(config.ifNotAllOf) ? config.ifNotAllOf : [config.ifNotAllOf];
        if (props.every(p => !!vmAny[p])) {
            return false;
        }
    }

    return true;
}

async function executeMerge<TProps>(
    vm: TProps,
    config: Merge<TProps>
): Promise<void> {
    const vmAny = vm as any;

    if (config.debug) {
        console.log(`[Merge] Executing assign with pattern:`, config.assign);
    }

    try {
        const { assignFrom } = await import('assign-gingerly/assignFrom.js');
        const options: any = { from: vm };

        // Pass through assignGingerlyOptions stored on the VM
        if (vmAny.__roundaboutAssignGingerlyOptions) {
            Object.assign(options, vmAny.__roundaboutAssignGingerlyOptions);
        }

        assignFrom(vm, config.assign, options);
    } catch (error) {
        console.error(`Error executing merge:`, error);
    }
}
