export async function roundabout(options, infractions) {
    const { RoundaboutManager } = await import('./core/RoundaboutManager.js');
    const manager = new RoundaboutManager(options, infractions);
    const returnObj = await manager.initialize();
    const initVals = options.initialPropVals || options.defaultPropVals;
    if (initVals) {
        (await import('assign-gingerly/assignGingerly.js')).assignGingerly(returnObj[0], initVals);
    }
    return returnObj;
}
