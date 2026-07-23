/**
 * Process infractions - inferred reactions
 * Parse function parameters to determine dependencies and setup reactions
 * 
 * Supports:
 * - Inline functions: ({age}) => ({agePlus10: age + 10})
 * - Method names: 'doSearch'
 * - Method references: calcAgePlus10
 */
export async function processInfractions<TProps = any>(
    vm: TProps,
    infractions: Array<Function | string>,
    onChange: (key: string) => Promise<void>
): Promise<() => void> {
    const vmAny = vm as any;
    
    // Register reactions for each infraction
    if (!vmAny.__roundaboutReactions) {
        vmAny.__roundaboutReactions = new Map();
    }
    
    for (const infraction of infractions) {
        let fn: Function;
        let fnName: string;
        
        // Resolve function
        if (typeof infraction === 'string') {
            // Method name - look it up on vm
            fn = vmAny[infraction];
            fnName = infraction;
            
            if (typeof fn !== 'function') {
                console.error(`Infraction method "${infraction}" not found on view model`);
                continue;
            }
        } else if (typeof infraction === 'function') {
            // Direct function reference
            fn = infraction;
            fnName = infraction.name || 'anonymous';
        } else {
            console.error('Invalid infraction type:', infraction);
            continue;
        }
        
        // Parse function to extract parameter names
        const paramNames = extractParameterNames(fn);
        
        if (paramNames.length === 0) {
            console.warn(`Infraction "${fnName}" has no parameters - cannot infer dependencies`);
            continue;
        }
        
        // Register reactions for each parameter
        for (const paramName of paramNames) {
            if (!vmAny.__roundaboutReactions.has(paramName)) {
                vmAny.__roundaboutReactions.set(paramName, []);
            }
            
            const reactionFn = async (value: any) => {
                await executeInfraction(vm, fn, fnName);
            };
            
            vmAny.__roundaboutReactions.get(paramName).push(reactionFn);
        }
        
        // Execute immediately on initialization
        await executeInfraction(vm, fn, fnName);
    }
    
    // Return cleanup function
    return () => {
        // Cleanup handled by RoundaboutManager
    };
}

/**
 * Extract parameter names from a function
 * Handles destructured parameters: ({age, name}) => ...
 */
function extractParameterNames(fn: Function): string[] {
    const fnStr = fn.toString();
    
    // Match function parameters
    // Handles: function({age}) {}, ({age}) => {}, async ({age}) => {}
    const match = fnStr.match(/(?:function\s*)?(?:\w+\s*)?\(([^)]*)\)/);
    
    if (!match || !match[1]) {
        return [];
    }
    
    const params = match[1].trim();
    
    if (!params) {
        return [];
    }
    
    // Check if it's destructured: {age, name}
    const destructuredMatch = params.match(/\{\s*([^}]+)\s*\}/);
    
    if (destructuredMatch) {
        // Extract property names from destructuring
        const properties = destructuredMatch[1]
            .split(',')
            .map(prop => {
                // Handle: age, age: alias, age = default
                const cleaned = prop.trim().split(/[=:]/)[0].trim();
                return cleaned;
            })
            .filter(name => name.length > 0);
        
        return properties;
    }
    
    // Not destructured - single parameter name
    // This is less common for infractions but support it
    return [params.split(/[=:]/)[0].trim()];
}

/**
 * Execute an infraction function and merge results
 */
async function executeInfraction(vm: any, fn: Function, fnName: string): Promise<void> {
    try {
        // Call function with vm as parameter
        let result = fn.call(vm, vm);
        
        // Handle async functions
        if (result && typeof result.then === 'function') {
            result = await result;
        }
        
        // Merge result back into vm
        if (result && typeof result === 'object' && !Array.isArray(result)) {
            const { assignGingerly } = await import('assign-gingerly/assignGingerly.js');
            await assignGingerly(vm, result, (vm as any).__roundaboutAssignOptions);
        }
    } catch (error) {
        console.error(`Error executing infraction "${fnName}":`, error);
    }
}
