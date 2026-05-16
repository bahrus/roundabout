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

export interface YieldConfig {
    /** The source array property name */
    from: string;
    /** The index property name (Scenario I) */
    atIndex?: string;
    /**
     * Behavior when the index is out of bounds.
     * - 'undefined' (default): set target to undefined
     * - 'clamp': reset the index to 0 (selects first item)
     */
    outOfBounds?: 'undefined' | 'clamp';
    // Future: atKey, atIndices, keyProp, etc.
}

export type Yields = {
    [targetProp: string]: YieldConfig;
};

export async function processYields<TProps = any>(
    vm: TProps,
    yields: any,
    onChange: (key: string) => Promise<void>
): Promise<() => void> {
    const vmAny = vm as any;

    if (!vmAny.__roundaboutReactions) {
        vmAny.__roundaboutReactions = new Map();
    }

    const cleanupFns: Array<() => void> = [];

    for (const [targetProp, config] of Object.entries(yields) as [string, YieldConfig][]) {
        const { from, atIndex } = config;

        if (!from) {
            console.error(`yields: "${targetProp}" is missing required "from" property`);
            continue;
        }

        if (atIndex) {
            // Scenario I: single selection by index
            const outOfBounds = config.outOfBounds || 'undefined';

            const recompute = async () => {
                const arr = vmAny[from];
                let idx = vmAny[atIndex];
                
                if (!Array.isArray(arr) || arr.length === 0) {
                    if (vmAny[targetProp] !== undefined) {
                        vmAny[targetProp] = undefined;
                    }
                    return;
                }

                const inBounds = typeof idx === 'number' && idx >= 0 && idx < arr.length;

                if (!inBounds) {
                    if (outOfBounds === 'clamp') {
                        // Reset index to 0 and select first item
                        vmAny[atIndex] = 0;
                        // The index change will re-trigger this reaction,
                        // so just return — the next call will set the target.
                        return;
                    } else {
                        // Default: set target to undefined
                        if (vmAny[targetProp] !== undefined) {
                            vmAny[targetProp] = undefined;
                        }
                        return;
                    }
                }

                const newValue = arr[idx];
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
        } else {
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
function addReaction(vmAny: any, prop: string, reaction: (value: any) => Promise<void>): () => void {
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
