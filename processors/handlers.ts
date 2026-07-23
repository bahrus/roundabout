import type { Handlers } from '../types/roundabout/types.js';

export async function processHandlers<ETProps = any, TActions = ETProps>(
    vm: ETProps & TActions,
    handlers: Handlers<ETProps, TActions>,
    abortSignal: AbortSignal
): Promise<() => void> {
    const vmAny = vm as any;
    const abortControllers: AbortController[] = [];
    const propertyListeners = new Map<string, () => void>();

    for (const [handlerKey, eventName] of Object.entries(handlers)) {
        const parsed = parseHandler(handlerKey, eventName);
        if (!parsed) continue;

        // Setup handler for the EventTarget property
        await setupHandler(vm, parsed, abortSignal, abortControllers, propertyListeners);
    }

    // Return cleanup function
    return () => {
        // Abort all event listeners
        for (const controller of abortControllers) {
            controller.abort();
        }
        
        // Remove property listeners
        for (const cleanup of propertyListeners.values()) {
            cleanup();
        }
        
        abortControllers.length = 0;
        propertyListeners.clear();
    };
}

interface ParsedHandler {
    eventTargetProp: string;
    methodName: string;
    eventName: string;
}

function parseHandler(key: string, eventName: any): ParsedHandler | null {
    // Pattern: eventTargetProp_to_methodName_on
    const match = key.match(/^(.+)_to_(.+)_on$/);
    if (!match) return null;

    return {
        eventTargetProp: match[1],
        methodName: match[2],
        eventName: typeof eventName === 'string' ? eventName : ''
    };
}

async function setupHandler<ETProps, TActions>(
    vm: ETProps & TActions,
    parsed: ParsedHandler,
    abortSignal: AbortSignal,
    abortControllers: AbortController[],
    propertyListeners: Map<string, () => void>
): Promise<void> {
    const vmAny = vm as any;
    
    // Function to attach listener to an EventTarget
    const attachListener = (eventTarget: EventTarget | null) => {
        if (!eventTarget) return null;

        // Create a new AbortController for this specific listener
        const controller = new AbortController();
        abortControllers.push(controller);

        // Listen to the abort signal to clean up this listener
        abortSignal.addEventListener('abort', () => {
            controller.abort();
        }, { once: true });

        // Add event listener
        eventTarget.addEventListener(parsed.eventName, async (event: Event) => {
            // Call the method
            const method = vmAny[parsed.methodName];
            if (typeof method !== 'function') {
                console.error(`Handler method "${parsed.methodName}" not found on view model`);
                return;
            }

            try {
                let result = method.call(vm, vm, event);
                
                // Handle async methods
                if (result && typeof result.then === 'function') {
                    result = await result;
                }

                // Merge result back if it's an object
                if (result && typeof result === 'object' && !Array.isArray(result)) {
                    const { assignGingerly } = await import('assign-gingerly/assignGingerly.js');
                    await assignGingerly(vm, result, vmAny.__roundaboutAssignOptions);
                }
            } catch (error) {
                console.error(`Error executing handler method "${parsed.methodName}":`, error);
            }
        }, { signal: controller.signal });

        return controller;
    };

    // Function to resolve EventTarget from property value (handles WeakRef)
    const resolveEventTarget = (value: any): EventTarget | null => {
        if (!value) return null;
        
        // Check if it's a WeakRef
        if (value && typeof value === 'object' && 'deref' in value) {
            return value.deref() || null;
        }
        
        // Check if it's an EventTarget
        if (value instanceof EventTarget) {
            return value;
        }
        
        return null;
    };

    // Track the current listener controller
    let currentController: AbortController | null = null;

    // Function to update the listener when the property changes
    const updateListener = () => {
        // Remove old listener
        if (currentController) {
            currentController.abort();
            const index = abortControllers.indexOf(currentController);
            if (index !== -1) {
                abortControllers.splice(index, 1);
            }
        }

        // Get current value and attach new listener
        const value = vmAny[parsed.eventTargetProp];
        const eventTarget = resolveEventTarget(value);
        currentController = attachListener(eventTarget);
    };

    // Initial setup
    updateListener();

    // Listen for changes to the EventTarget property
    if (vmAny.propagator) {
        const propertyListener = () => {
            updateListener();
        };

        vmAny.propagator.addEventListener(parsed.eventTargetProp, propertyListener, { 
            signal: abortSignal 
        });

        propertyListeners.set(parsed.eventTargetProp, () => {
            vmAny.propagator.removeEventListener(parsed.eventTargetProp, propertyListener);
        });
    }
}
