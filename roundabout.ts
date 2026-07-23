import type { RoundaboutOptions, RoundaboutReady } from './types/roundabout/types.js';

export async function roundabout<TProps = any, TActions = TProps, ETProps = TProps>(
    options: RoundaboutOptions<TProps, TActions, ETProps>,
    infractions?: Array<Function | string>
): Promise<[vm: TProps & TActions & RoundaboutReady, propagator: EventTarget]> {
    const { RoundaboutManager } = await import('./core/RoundaboutManager.js');
    const manager = new RoundaboutManager<TProps, TActions, ETProps>(options, infractions);
    const returnObj = await manager.initialize();
    const initVals = options.initialPropVals || options.defaultPropVals;
    if(initVals){
        if(options.protocols){
            const { assignFrom } = await import('assign-gingerly/assignFrom.js');
            await assignFrom(returnObj[0], initVals, {
                from: returnObj[0],
                ...options.assignOptions,
                protocols: options.protocols
            } as any);
        } else {
            (await import('assign-gingerly/assignGingerly.js')).assignGingerly(returnObj[0], initVals, options.assignOptions);
        }
    }
    return returnObj;
}
