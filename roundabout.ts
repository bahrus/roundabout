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
        (await import('assign-gingerly/assignGingerly.js')).assignGingerly(returnObj[0], initVals);
    }
    return returnObj;
}
