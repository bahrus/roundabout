export async function processActions(vm, actions, onChange) {
    const vmAny = vm;
    // Check for conflicts with compacts
    checkForCompactConflicts(vmAny, actions);
    // Track action states for each action
    const actionStates = new Map();
    // Store action states on VM for internal routing access
    Object.defineProperty(vmAny, '__roundaboutActionStates', {
        value: actionStates,
        enumerable: false,
        writable: false,
        configurable: true
    });
    // Register reactions for each action
    for (const [actionKey, actionConfig] of Object.entries(actions)) {
        const state = await setupAction(vm, actionKey, actionConfig, actionStates);
        actionStates.set(actionKey, state);
    }
    // Initial evaluation - check all actions on startup (use normal execution, not internal routing)
    for (const [actionKey, state] of actionStates.entries()) {
        await evaluateAndExecuteAction(vm, actionKey, state, '__init__');
    }
    // Return cleanup function
    return () => {
        actionStates.clear();
        delete vmAny.__roundaboutActionStates;
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
    // Skip if actions are disabled (during internal routing event dispatch)
    if (vmAny.__roundaboutDisableActions) {
        return;
    }
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
/**
 * Evaluate and execute action using internal routing optimization
 */
async function evaluateAndExecuteActionWithInternalRouting(vm, actionKey, state, changedProperty) {
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
            await executeActionWithInternalRouting(vm, actionKey, config, changedProperty);
        }, delay);
    }
    else {
        await executeActionWithInternalRouting(vm, actionKey, config, changedProperty);
    }
}
/**
 * Execute action using internal routing
 */
async function executeActionWithInternalRouting(vm, actionKey, config, changedProperty) {
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
    // Merge result back if it's an object - use internal routing
    if (result && typeof result === 'object' && !Array.isArray(result)) {
        await processActionResult(vm, result, config.debug);
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
    // Merge result back if it's an object - use internal routing
    if (result && typeof result === 'object' && !Array.isArray(result)) {
        await processActionResult(vm, result, config.debug);
    }
}
/**
 * Process action result using internal routing optimization
 * Instead of setting properties via setters (which fire events immediately),
 * we batch changes, evaluate affected actions, and fire events at the end
 */
async function processActionResult(vm, result, debug) {
    const vmAny = vm;
    // Import covert property functions
    const { covertlySetProperty, covertlyGetProperty } = await import('../utils/PropagatorSetup.js');
    // Initialize the change bus
    const changeBus = new Map();
    // Add initial changes to the bus
    for (const [key, value] of Object.entries(result)) {
        changeBus.set(key, value);
    }
    // Track which properties have been processed to avoid infinite loops
    const processedInThisCycle = new Set();
    const maxIterations = 100; // Safety limit
    let iterations = 0;
    // Process the bus until it's empty
    while (changeBus.size > 0 && iterations < maxIterations) {
        iterations++;
        // Get current batch of changes
        const currentBatch = new Map(changeBus);
        changeBus.clear();
        if (debug) {
            console.log(`[Internal Routing] Iteration ${iterations}, processing ${currentBatch.size} changes:`, Array.from(currentBatch.keys()));
        }
        // Apply changes covertly (without firing events)
        for (const [key, value] of currentBatch) {
            await covertlySetProperty(vm, key, value);
            processedInThisCycle.add(key);
        }
        // Find all actions that might be affected by these changes
        const affectedActions = findAffectedActions(vmAny, currentBatch);
        if (debug && affectedActions.size > 0) {
            console.log(`[Internal Routing] Affected actions:`, Array.from(affectedActions.keys()));
        }
        // Evaluate and execute affected actions
        for (const [actionKey, state] of affectedActions) {
            // Get the first changed property from current batch that affects this action
            const changedProp = Array.from(currentBatch.keys())
                .find(key => state.monitoredProps.has(key)) || '__batch__';
            // Check if conditions are met
            const conditionsMet = evaluateConditions(vm, state.config);
            // Determine if we should execute
            let shouldExecute = false;
            if (state.config.ifKeyIn) {
                // For ifKeyIn, execute if conditions met
                shouldExecute = conditionsMet;
            }
            else {
                // For other conditions, execute only on transition
                shouldExecute = conditionsMet && !state.lastConditionsMet;
            }
            state.lastConditionsMet = conditionsMet;
            if (shouldExecute) {
                if (debug) {
                    console.log(`[Internal Routing] Executing action: ${actionKey}`);
                }
                // Execute the action
                const actionResult = await executeActionForInternalRouting(vm, actionKey, state.config, changedProp);
                // Add any new changes to the bus
                if (actionResult && typeof actionResult === 'object' && !Array.isArray(actionResult)) {
                    for (const [key, value] of Object.entries(actionResult)) {
                        changeBus.set(key, value);
                    }
                }
            }
        }
    }
    if (iterations >= maxIterations) {
        console.warn('[Internal Routing] Max iterations reached, possible infinite loop');
    }
    // Disable action routing temporarily while we fire events
    // This prevents the events from triggering actions again since we already processed them
    vmAny.__roundaboutDisableActions = true;
    try {
        // Now fire events for all properties that changed
        const propagator = vmAny.propagator;
        if (propagator) {
            for (const prop of processedInThisCycle) {
                const newValue = covertlyGetProperty(vm, prop);
                if (debug) {
                    console.log(`[Internal Routing] Firing event for: ${prop} = ${newValue}`);
                }
                propagator.dispatchEvent(new CustomEvent(prop, {
                    detail: { oldValue: undefined, newValue }
                }));
            }
        }
    }
    finally {
        // Re-enable action routing
        vmAny.__roundaboutDisableActions = false;
    }
}
/**
 * Execute action and return result without processing it
 * Used during internal routing to collect changes
 */
async function executeActionForInternalRouting(vm, actionKey, config, changedProperty) {
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
        return undefined;
    }
    // Create context
    const context = {
        rule: actionKey,
        changedProperty
    };
    // Call the method
    try {
        let result = method.call(vm, vm, context);
        // Check if result is a promise (async method)
        if (result && typeof result.then === 'function') {
            result = await result;
        }
        return result;
    }
    catch (error) {
        console.error(`Error executing action "${actionKey}":`, error);
        return undefined;
    }
}
/**
 * Find all actions that monitor any of the changed properties
 */
function findAffectedActions(vm, changedProps) {
    const affected = new Map();
    // Get all action states
    if (!vm.__roundaboutActionStates) {
        return affected;
    }
    const actionStates = vm.__roundaboutActionStates;
    for (const [actionKey, state] of actionStates) {
        // Check if any changed property is monitored by this action
        for (const changedProp of changedProps.keys()) {
            if (state.monitoredProps.has(changedProp)) {
                affected.set(actionKey, state);
                break;
            }
        }
    }
    return affected;
}
