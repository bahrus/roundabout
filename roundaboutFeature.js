import { roundaboutSync } from './roundaboutSync.js';
/**
 * RoundaboutFeature — a custom element feature that integrates roundabout
 * with assign-gingerly's `assignFeatures` system.
 *
 * Usage:
 * ```js
 * import 'assign-gingerly/assignFeatures.js';
 * import { RoundaboutFeature } from 'roundabout-lib/roundaboutFeature.js';
 *
 * class MyElement extends HTMLElement {
 *     static supportedFeatures = {
 *         roundabout: { fallbackSpawn: RoundaboutFeature }
 *     };
 *     // action methods live on the element as usual
 *     updateStatus(self) { ... }
 * }
 *
 * await customElements.assignFeatures(MyElement, {
 *     roundabout: {
 *         spawn: RoundaboutFeature,
 *         customData: {
 *             raConfig: { actions: {...}, compacts: {...}, merges: [...] },
 *         },
 *         withAttrs: { base: 'my-el', count: '${base}-count', _count: { instanceOf: 'Number' } }
 *     }
 * });
 * customElements.define('my-element', MyElement);
 * ```
 */
export class RoundaboutFeature {
    _vm;
    _propagator;
    /**
     * Called once by `assignFeatures` after registration.
     * Pre-loads processor modules and installs prototype getter/setters.
     */
    static async onAssigned(ctr, featureConfig) {
        const { makeRoundaboutReady } = await import('./makeRoundaboutReady.js');
        const { raConfig } = featureConfig.customData;
        await makeRoundaboutReady(ctr, raConfig);
    }
    /**
     * Per-instance setup. Called by the lazy feature getter on first access.
     */
    constructor(hostElement, ctx, initVals) {
        const customData = ctx.injection.customData;
        const { raConfig } = customData;
        // Run roundaboutSync — prototype is already prepared by onAssigned
        const [vm, propagator] = roundaboutSync({
            vm: hostElement,
            ...raConfig,
        });
        this._vm = vm;
        this._propagator = propagator;
        // Apply parsed attribute values (from withAttrs) via assignGingerly
        // to trigger reactive processing on initial values
        if (initVals && Object.keys(initVals).length > 0) {
            import('assign-gingerly/assignGingerly.js').then(({ assignGingerly }) => {
                assignGingerly(hostElement, initVals, raConfig.assignGingerlyOptions);
            });
        }
    }
}
