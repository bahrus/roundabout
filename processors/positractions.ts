import type { Positractions } from '../types/roundabout/types.js';

export async function processPositractions<TProps = any, TActions = TProps>(
    vm: TProps & TActions,
    positractions: Positractions<TProps, TActions>,
    onChange: (key: string) => Promise<void>
): Promise<() => void> {
    // TODO: Implement positractions processing
    return () => {
        // Cleanup
    };
}
