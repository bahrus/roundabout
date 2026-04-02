export async function roundabout(options, infractions) {
    const { RoundaboutManager } = await import('./core/RoundaboutManager.js');
    const manager = new RoundaboutManager(options, infractions);
    return await manager.initialize();
}
