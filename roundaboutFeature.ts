import type { RoundaboutOptions } from './types/roundabout/types.js';
import { roundaboutSync } from './roundaboutSync.js';

/**
 * Custom element feature configuration for roundabout.
 * Passed as `customData` in the feature injection config.
 */
export interface RoundaboutFeatureConfig {
    /** The roundabout configuration (actions, compacts, merges, etc.) */
    raConfig: RoundaboutOptions;
}

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
    _vm: any;
    _propagator: EventTarget;

    /**
     * Called once by `assignFeatures` after registration.
     * Pre-loads processor modules and installs prototype getter/setters.
     */
    static async onAssigned(
        ctr: { new(...args: any[]): any; prototype: any },
        featureConfig: { customData: RoundaboutFeatureConfig; [key: string]: any }
    ): Promise<void> {
        const { makeRoundaboutReady } = await import('./makeRoundaboutReady.js');
        const { raConfig } = featureConfig.customData;
        await makeRoundaboutReady(ctr, raConfig);
    }

    /**
     * Per-instance setup. Called by the lazy feature getter on first access.
     */
    constructor(hostElement: any, ctx: any, initVals?: any) {
        const customData: RoundaboutFeatureConfig = ctx.injection.customData;
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
                assignGingerly(hostElement, initVals, raConfig.assignGingerlyOptions as any);
            });
        }
    }
}
