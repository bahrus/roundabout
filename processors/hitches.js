/**
 * Process hitches - coordinate three members of the view model
 * Pattern: when_X_emits_Y_inc_Z_by
 *
 * Example: when_button_emits_click_inc_count_by: 1
 * - X (button) is an EventTarget (element or WeakRef<element>)
 * - Y (click) is a property containing the event name
 * - Z (count) is a property to increment
 * - Value is the increment amount
 */
export async function processHitches(vm, hitches, onChange) {
    const vmAny = vm;
    // Track active listeners for cleanup
    const activeListeners = new Map();
    // Register reactions for each hitch
    if (!vmAny.__roundaboutReactions) {
        vmAny.__roundaboutReactions = new Map();
    }
    for (const [hitchKey, incrementValue] of Object.entries(hitches)) {
        const parsed = parseHitchKey(hitchKey);
        if (!parsed) {
            console.error(`Invalid hitch key: ${hitchKey}`);
            continue;
        }
        const { elementProp, eventProp, targetProp } = parsed;
        // Setup hitch - create listener when element or event changes
        await setupHitch(vm, elementProp, eventProp, targetProp, incrementValue, activeListeners, hitchKey);
        // Monitor element property changes
        if (!vmAny.__roundaboutReactions.has(elementProp)) {
            vmAny.__roundaboutReactions.set(elementProp, []);
        }
        vmAny.__roundaboutReactions.get(elementProp).push(async () => {
            await setupHitch(vm, elementProp, eventProp, targetProp, incrementValue, activeListeners, hitchKey);
        });
        // Monitor event property changes
        if (!vmAny.__roundaboutReactions.has(eventProp)) {
            vmAny.__roundaboutReactions.set(eventProp, []);
        }
        vmAny.__roundaboutReactions.get(eventProp).push(async () => {
            await setupHitch(vm, elementProp, eventProp, targetProp, incrementValue, activeListeners, hitchKey);
        });
    }
    // Return cleanup function
    return () => {
        // Abort all active listeners
        for (const [key, listener] of activeListeners) {
            listener.abortController.abort();
        }
        activeListeners.clear();
    };
}
/**
 * Parse hitch key to extract element, event, and target properties
 * Pattern: when_X_emits_Y_inc_Z_by
 */
function parseHitchKey(key) {
    const match = key.match(/^when_(.+?)_emits_(.+?)_inc_(.+?)_by$/);
    if (!match) {
        return null;
    }
    return {
        elementProp: match[1],
        eventProp: match[2],
        targetProp: match[3]
    };
}
/**
 * Setup or update a hitch listener
 * Handles element changes, event type changes, and cleanup
 */
async function setupHitch(vm, elementProp, eventProp, targetProp, incrementValue, activeListeners, hitchKey) {
    // Get current values
    let element = vm[elementProp];
    const eventType = vm[eventProp];
    // Resolve WeakRef if needed
    if (element && typeof element === 'object' && 'deref' in element) {
        element = element.deref();
    }
    // Cleanup existing listener for this hitch
    const existing = activeListeners.get(hitchKey);
    if (existing) {
        existing.abortController.abort();
        activeListeners.delete(hitchKey);
    }
    // If element is falsy or eventType is falsy, just cleanup and return
    if (!element || !eventType) {
        return;
    }
    // Verify element is an EventTarget
    if (!(element instanceof EventTarget)) {
        console.error(`Hitch element "${elementProp}" is not an EventTarget:`, element);
        return;
    }
    // Create new listener
    const abortController = new AbortController();
    const handler = (event) => {
        // Increment the target property
        const currentValue = vm[targetProp];
        if (typeof currentValue === 'number') {
            vm[targetProp] = currentValue + incrementValue;
        }
        else {
            // Initialize to increment value if not a number
            vm[targetProp] = incrementValue;
        }
    };
    // Add event listener with abort signal
    element.addEventListener(eventType, handler, { signal: abortController.signal });
    // Store listener info for cleanup
    activeListeners.set(hitchKey, {
        target: element,
        eventType,
        handler,
        abortController
    });
}
