import type { Actions } from '../types/roundabout/types.js';

export async function processActions<TProps = any, TActions = TProps>(
    vm: TProps & TActions,
    actions: Actions<TProps, TActions>,
    onChange: (key: string) => Promise<void>
): Promise<() => void> {
    // TODO: Implement actions processing
    return () => {
        // Cleanup
    };
}
