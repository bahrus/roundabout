export async function processActions(vm, actions, onChange) {
    const vmAny = vm;
    // Check for conflicts with compacts
    checkForCompactConflicts(vmAny, actions);
    // Track action states for each action
    const actionStates = new Map();
    // Register reactions for each action
    for (const [actionKey, actionConfig] of Object.entries(actions)) {
        const state = await setupAction(vm, actionKey, actionConfig, actionStates);
        actionStates.set(actionKey, state);
    }
    // Initial evaluation - check all actions on startup
    for (const [actionKey, state] of actionStates.entries()) {
        await evaluateAndExecuteAction(vm, actionKey, state, '__init__');
    }
    // Return cleanup function
    return () => {
        actionStates.clear();
    };
}
function checkForCompactConflicts(vm, actions) {
    // Check if any action method conflicts with compact-invoked methods
    const compactInvokedMethods = new Set();
    // Extract methods called by compacts from __roundaboutReactions
    if (vm.__roundaboutCompactMethods) {
        vm.__roundaboutCompactMethods.forEach((method) => {
            compactInvokedMethods.add(method);
        });
    }
    // Check for conflicts
    for (const actionKey of Object.keys(actions)) {
        const actionConfig = actions[actionKey];
        const methodName = typeof actionConfig.do === 'string' ? actionConfig.do : actionKey;
        if (compactInvokedMethods.has(methodName)) {
            throw new Error(`Conflict detected: Method "${methodName}" is invoked by both a compact and an action. ` +
                `This creates ambiguity and is not allowed.`);
        }
    }
}
async function setupAction(vm, actionKey, config, actionStates) {
    const vmAny = vm;
    // Infer properties to monitor from conditions
    const monitoredProps = inferMonitoredProperties(config);
    // Create action state
    const state = {
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
        const reactionFn = async (value) => {
            await evaluateAndExecuteAction(vm, actionKey, state, prop);
        };
        vmAny.__roundaboutReactions.get(prop).push(reactionFn);
    }
    return state;
}
function inferMonitoredProperties(config) {
    const props = new Set();
    const addProps = (value) => {
        if (typeof value === 'string') {
            props.add(value);
        }
        else if (Array.isArray(value)) {
            value.forEach(p => props.add(p));
        }
    };
    if (config.ifAllOf)
        addProps(config.ifAllOf);
    if (config.ifKeyIn)
        addProps(config.ifKeyIn);
    if (config.ifNoneOf)
        addProps(config.ifNoneOf);
    if (config.ifEquals)
        addProps(config.ifEquals);
    if (config.ifAtLeastOneOf)
        addProps(config.ifAtLeastOneOf);
    if (config.ifNotAllOf)
        addProps(config.ifNotAllOf);
    return props;
}
async function evaluateAndExecuteAction(vm, actionKey, state, changedProperty) {
    const vmAny = vm;
    const config = state.config;
    // Clear any pending timeout
    if (state.pendingTimeout) {
        clearTimeout(state.pendingTimeout);
        state.pendingTimeout = undefined;
    }
    // Check if conditions are met
    const conditionsMet = evaluateConditions(vm, config);
    if (config.debug) {
        console.log(`[Action: ${actionKey}] Conditions evaluated:`, {
            conditionsMet,
            changedProperty,
            lastConditionsMet: state.lastConditionsMet
        });
    }
    // Determine if we should execute
    let shouldExecute = false;
    if (config.ifKeyIn) {
        // For ifKeyIn, execute every time a monitored property changes
        shouldExecute = conditionsMet;
    }
    else {
        // For other conditions, execute only on transition to "all conditions met"
        shouldExecute = conditionsMet && !state.lastConditionsMet;
    }
    state.lastConditionsMet = conditionsMet;
    if (!shouldExecute) {
        return;
    }
    // Apply delay if specified
    const delay = config.delay || 0;
    if (delay > 0) {
        state.pendingTimeout = setTimeout(async () => {
            await executeAction(vm, actionKey, config, changedProperty);
        }, delay);
    }
    else {
        await executeAction(vm, actionKey, config, changedProperty);
    }
}
function evaluateConditions(vm, config) {
    const vmAny = vm;
    // All conditions must be true (AND logic)
    // ifAllOf: All specified properties must be truthy
    if (config.ifAllOf) {
        const props = Array.isArray(config.ifAllOf) ? config.ifAllOf : [config.ifAllOf];
        if (!props.every(p => !!vmAny[p])) {
            return false;
        }
    }
    // ifKeyIn: At least one property must have changed (handled by caller)
    // This is always true if we're being called
    if (config.ifKeyIn) {
        // Just check that at least one is defined
        const props = Array.isArray(config.ifKeyIn) ? config.ifKeyIn : [config.ifKeyIn];
        if (!props.some(p => vmAny[p] !== undefined)) {
            return false;
        }
    }
    // ifNoneOf: None of the specified properties should be truthy
    if (config.ifNoneOf) {
        const props = Array.isArray(config.ifNoneOf) ? config.ifNoneOf : [config.ifNoneOf];
        if (props.some(p => !!vmAny[p])) {
            return false;
        }
    }
    // ifEquals: All specified properties must have equal values
    if (config.ifEquals && Array.isArray(config.ifEquals) && config.ifEquals.length > 1) {
        const firstValue = vmAny[config.ifEquals[0]];
        if (!config.ifEquals.every(p => vmAny[p] === firstValue)) {
            return false;
        }
    }
    // ifAtLeastOneOf: At least one property must be truthy
    if (config.ifAtLeastOneOf) {
        const props = Array.isArray(config.ifAtLeastOneOf) ? config.ifAtLeastOneOf : [config.ifAtLeastOneOf];
        if (!props.some(p => !!vmAny[p])) {
            return false;
        }
    }
    // ifNotAllOf: Not all properties should be truthy (at least one must be falsy)
    if (config.ifNotAllOf) {
        const props = Array.isArray(config.ifNotAllOf) ? config.ifNotAllOf : [config.ifNotAllOf];
        if (props.every(p => !!vmAny[p])) {
            return false;
        }
    }
    return true;
}
async function executeAction(vm, actionKey, config, changedProperty) {
    const vmAny = vm;
    // Determine which method to call
    let method;
    let methodName;
    if (config.do) {
        if (typeof config.do === 'function') {
            method = config.do;
            methodName = config.do.name || actionKey;
        }
        else if (typeof config.do === 'string') {
            methodName = config.do;
            method = vmAny[config.do];
        }
        else {
            methodName = actionKey;
            method = vmAny[actionKey];
        }
    }
    else {
        methodName = actionKey;
        method = vmAny[actionKey];
    }
    if (typeof method !== 'function') {
        console.error(`Action method "${methodName}" not found on view model`);
        return;
    }
    // Create context
    const context = {
        rule: actionKey,
        changedProperty
    };
    if (config.debug) {
        console.log(`[Action: ${actionKey}] Executing method "${methodName}"`, context);
    }
    // Call the method
    let result;
    try {
        result = method.call(vm, vm, context);
        // Check if result is a promise (async method)
        if (result && typeof result.then === 'function') {
            result = await result;
        }
    }
    catch (error) {
        console.error(`Error executing action "${actionKey}":`, error);
        return;
    }
    // Merge result back if it's an object
    if (result && typeof result === 'object' && !Array.isArray(result)) {
        const { assignGingerly } = await import('assign-gingerly/assignGingerly.js');
        await assignGingerly(vm, result);
    }
}
