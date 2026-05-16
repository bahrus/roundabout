/**
 * Process yields - derive a value from an array/collection using an index or key.
 *
 * Scenario I: Single selection by index
 * When either the source array or the index property changes,
 * the target property is set to source[index].
 *
 * Example:
 * ```javascript
 * yields: {
 *     item: { from: 'items', atIndex: 'idx' }
 * }
 * ```
 * When `items` or `idx` changes, `item` is set to `items[idx]`.
 * Out-of-bounds index results in `undefined`.
 */
export async function processYields(vm, yields, onChange) {
    const vmAny = vm;
    if (!vmAny.__roundaboutReactions) {
        vmAny.__roundaboutReactions = new Map();
    }
    const cleanupFns = [];
    for (const [targetProp, config] of Object.entries(yields)) {
        const { from, atIndex } = config;
        if (!from) {
            console.error(`yields: "${targetProp}" is missing required "from" property`);
            continue;
        }
        if (atIndex) {
            // Scenario I: single selection by index
            const recompute = async () => {
                const arr = vmAny[from];
                const idx = vmAny[atIndex];
                const newValue = (Array.isArray(arr) && typeof idx === 'number' && idx >= 0 && idx < arr.length)
                    ? arr[idx]
                    : undefined;
                if (vmAny[targetProp] !== newValue) {
                    vmAny[targetProp] = newValue;
                }
            };
            // React to changes in the source array
            const cleanupFrom = addReaction(vmAny, from, recompute);
            // React to changes in the index
            const cleanupIndex = addReaction(vmAny, atIndex, recompute);
            cleanupFns.push(cleanupFrom, cleanupIndex);
            // Initial computation
            await recompute();
        }
        else {
            console.error(`yields: "${targetProp}" needs at least one selector (atIndex, atKey, etc.)`);
        }
    }
    return () => {
        for (const fn of cleanupFns) {
            fn();
        }
    };
}
/**
 * Register a reaction for a property on the vm.
 * Returns a cleanup function that removes the reaction.
 */
function addReaction(vmAny, prop, reaction) {
    if (!vmAny.__roundaboutReactions) {
        vmAny.__roundaboutReactions = new Map();
    }
    let reactions = vmAny.__roundaboutReactions.get(prop);
    if (!reactions) {
        reactions = [];
        vmAny.__roundaboutReactions.set(prop, reactions);
    }
    reactions.push(reaction);
    return () => {
        const arr = vmAny.__roundaboutReactions.get(prop);
        if (arr) {
            const idx = arr.indexOf(reaction);
            if (idx !== -1) {
                arr.splice(idx, 1);
            }
        }
    };
}
