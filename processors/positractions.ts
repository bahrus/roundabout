import type { Positractions, Positraction } from '../types/roundabout/types.js';

/**
 * Process positractions - positional reactions
 * Call generic functions with positional parameters and assign results by position
 * 
 * Example:
 * {
 *   ifKeyIn: ['age', 'height'],
 *   do: Math.max,
 *   assignTo: ['maxValue']
 * }
 */
export async function processPositractions<TProps = any, TActions = TProps>(
    vm: TProps & TActions,
    positractions: Positractions<TProps, TActions>,
    onChange: (key: string) => Promise<void>
): Promise<() => void> {
    const vmAny = vm as any;
    
    // Register reactions for each positraction
    if (!vmAny.__roundaboutReactions) {
        vmAny.__roundaboutReactions = new Map();
    }
    
    for (const positraction of positractions) {
        await setupPositraction(vm, positraction);
    }
    
    // Return cleanup function
    return () => {
        // Cleanup handled by RoundaboutManager
    };
}

/**
 * Setup a single positraction
 */
async function setupPositraction<TProps, TActions>(
    vm: TProps & TActions,
    positraction: Positraction<TProps, TActions>
): Promise<void> {
    const vmAny = vm as any;
    
    // Determine which properties to monitor
    const monitoredProps: string[] = [];
    
    if (positraction.ifKeyIn) {
        monitoredProps.push(...positraction.ifKeyIn);
    }
    
    if (positraction.ifAllOf) {
        monitoredProps.push(...positraction.ifAllOf);
    }
    
    if (monitoredProps.length === 0) {
        console.warn('Positraction has no ifKeyIn or ifAllOf - cannot determine dependencies');
        return;
    }
    
    // Register reactions for monitored properties
    for (const prop of monitoredProps) {
        if (!vmAny.__roundaboutReactions.has(prop)) {
            vmAny.__roundaboutReactions.set(prop, []);
        }
        
        const reactionFn = async () => {
            await executePositraction(vm, positraction);
        };
        
        vmAny.__roundaboutReactions.get(prop).push(reactionFn);
    }
    
    // Execute immediately on initialization
    await executePositraction(vm, positraction);
}

/**
 * Execute a positraction
 */
async function executePositraction<TProps, TActions>(
    vm: TProps & TActions,
    positraction: Positraction<TProps, TActions>
): Promise<void> {
    const vmAny = vm as any;
    
    // Check conditions if using ifAllOf
    if (positraction.ifAllOf) {
        const allMet = positraction.ifAllOf.every(prop => !!vmAny[prop]);
        if (!allMet) {
            return; // Conditions not met
        }
    }
    
    // Resolve function
    let fn: Function;
    
    if (typeof positraction.do === 'string') {
        fn = vmAny[positraction.do];
        if (typeof fn !== 'function') {
            console.error(`Positraction function "${positraction.do}" not found on view model`);
            return;
        }
    } else if (typeof positraction.do === 'function') {
        fn = positraction.do;
    } else {
        console.error('Invalid positraction.do type');
        return;
    }
    
    // Build arguments array
    const args = buildArguments(vm, positraction);
    
    // Call function
    let result: any;
    try {
        result = fn.apply(vm, args);
        
        // Handle async functions
        if (result && typeof result.then === 'function') {
            result = await result;
        }
    } catch (error) {
        console.error('Error executing positraction:', error);
        return;
    }
    
    // Assign results
    if (positraction.assignTo) {
        assignResults(vm, result, positraction.assignTo);
    }
}

/**
 * Build arguments array from pass specification
 */
function buildArguments<TProps, TActions>(
    vm: TProps & TActions,
    positraction: Positraction<TProps, TActions>
): any[] {
    const vmAny = vm as any;
    
    // If no pass specified, use ifKeyIn properties
    const passSpec = positraction.pass || positraction.ifKeyIn || [];
    
    return passSpec.map(item => {
        // Handle special cases
        if (item === '$0') {
            // Pass self (vm)
            return vm;
        }
        
        if (item === '$0+') {
            // Pass enhancement (for enhanced elements)
            // For now, just pass vm
            return vm;
        }
        
        // Handle template literal strings: `hello`
        if (typeof item === 'string' && item.startsWith('`') && item.endsWith('`')) {
            // Remove backticks and return string literal
            return item.slice(1, -1);
        }
        
        // Handle numbers and booleans
        if (typeof item === 'number' || typeof item === 'boolean') {
            return item;
        }
        
        // Handle string - check if it's a property or literal
        if (typeof item === 'string') {
            // If property exists on vm, use its value
            if (item in vmAny) {
                return vmAny[item];
            }
            // Otherwise, pass as string literal
            return item;
        }
        
        return item;
    });
}

/**
 * Assign results to properties by position
 */
function assignResults<TProps>(
    vm: TProps,
    result: any,
    assignTo: Array<null | (keyof TProps & string)>
): void {
    const vmAny = vm as any;
    
    // Convert result to array if it isn't one
    const resultArray = Array.isArray(result) ? result : [result];
    
    // Assign each result to corresponding property
    for (let i = 0; i < assignTo.length; i++) {
        const targetProp = assignTo[i];
        
        // Skip null entries
        if (targetProp === null) {
            continue;
        }
        
        // Skip if no result at this position
        if (i >= resultArray.length) {
            continue;
        }
        
        // Assign value
        vmAny[targetProp] = resultArray[i];
    }
}
