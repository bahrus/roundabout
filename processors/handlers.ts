import type { Handlers } from '../types/roundabout/types.js';

export async function processHandlers<ETProps = any, TActions = ETProps>(
    vm: ETProps & TActions,
    handlers: Handlers<ETProps, TActions>,
    abortSignal: AbortSignal
): Promise<() => void> {
    // TODO: Implement handlers processing
    return () => {
        // Cleanup
    };
}
