export async function roundabout(options, infractions) {
    const { RoundaboutManager } = await import('./core/RoundaboutManager.js');
    const manager = new RoundaboutManager(options, infractions);
    const returnObj = await manager.initialize();
    const initVals = options.initialPropVals || options.defaultPropVals;
    if (initVals) {
        if (options.protocols) {
            const { assignFrom } = await import('assign-gingerly/assignFrom.js');
            await assignFrom(returnObj[0], initVals, {
                from: returnObj[0],
                ...options.assignGingerlyOptions,
                protocols: options.protocols
            });
        } else {
            (await import('assign-gingerly/assignGingerly.js')).assignGingerly(returnObj[0], initVals, options.assignGingerlyOptions);
        }
    }
    return returnObj;
}
