import type { RoundaboutOptions } from './types/roundabout/types.js';
import { roundaboutSync } from './roundaboutSync.js';
import { getFeatureInfoSuggestions } from 'assign-gingerly/assignFeatures.js';
import {assignGingerly} from 'assign-gingerly/assignGingerly.js';

export const id = Symbol.for('roundabout-lib-feature');

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
     * Also ensures sourceOfTruth attributes are added to observedAttributes.
     */
    static async onAssigned(
        ctr: { new(...args: any[]): any; prototype: any; observedAttributes?: string[] },
        featureConfig: { customData: RoundaboutFeatureConfig; withAttrs?: Record<string, any>; [key: string]: any }
    ): Promise<void> {
        const { makeRoundaboutReady } = await import('./makeRoundaboutReady.js');
        // Read suggestions from other features
        const suggestions = getFeatureInfoSuggestions(id, ctr);
        for (const suggestion of suggestions) {
            if (suggestion.customData) {
                assignGingerly(featureConfig.customData, suggestion.customData);
            }
            if (suggestion.withAttrs) {
                // Merge withAttrs (this needs thought — how to merge AttrPatterns?)
                featureConfig.withAttrs = {
                    ...featureConfig.withAttrs,
                    ...suggestion.withAttrs
                };
            }
        }
        const { raConfig } = featureConfig.customData;
        await makeRoundaboutReady(ctr, raConfig);

        // If withAttrs has sourceOfTruth entries, add them to static observedAttributes
        const withAttrs = featureConfig.withAttrs;
        if (withAttrs && isCustomElementConstructor(ctr)) {
            ensureObservedAttributes(ctr, withAttrs);
        }
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
                assignGingerly(hostElement, initVals, raConfig.assignOptions as any);
            });
        }
    }
}


// ─── Helpers for sourceOfTruth / observedAttributes ──────────────────────────

/**
 * Check if a constructor is a custom element (extends HTMLElement).
 */
function isCustomElementConstructor(ctr: any): boolean {
    let proto = ctr.prototype;
    while (proto) {
        if (proto === HTMLElement.prototype) return true;
        proto = Object.getPrototypeOf(proto);
    }
    return false;
}

/**
 * Resolve a template string like '${base}-count' against the withAttrs patterns.
 */
function resolveAttrName(withAttrs: Record<string, any>, key: string): string | null {
    const value = withAttrs[key];
    if (!value) return null;
    if (typeof value !== 'string') return null;

    // Resolve ${var} references
    return value.replace(/\$\{(\w+)\}/g, (_match: string, varName: string) => {
        const resolved = withAttrs[varName];
        if (typeof resolved === 'string') {
            // Recursively resolve (one level deep is usually enough)
            return resolved.replace(/\$\{(\w+)\}/g, (_m: string, v: string) => {
                const r = withAttrs[v];
                return typeof r === 'string' ? r : '';
            });
        }
        return '';
    });
}

/**
 * For each withAttrs entry where sourceOfTruth is true,
 * ensure the resolved attribute name is in static observedAttributes.
 */
function ensureObservedAttributes(
    ctr: { observedAttributes?: string[]; [key: string]: any },
    withAttrs: Record<string, any>
): void {
    for (const [key, value] of Object.entries(withAttrs)) {
        // Config entries are underscore-prefixed (e.g., _count: { sourceOfTruth: true })
        if (!key.startsWith('_')) continue;
        if (typeof value !== 'object' || value === null) continue;
        if (!value.sourceOfTruth) continue;

        // The attribute name comes from the non-underscore sibling key
        const propKey = key.slice(1); // '_count' → 'count'
        const attrName = resolveAttrName(withAttrs, propKey);
        if (!attrName) continue;

        // Ensure static observedAttributes exists and includes this attribute
        if (!ctr.observedAttributes) {
            Object.defineProperty(ctr, 'observedAttributes', {
                value: [],
                writable: true,
                enumerable: false,
                configurable: true,
            });
        }
        if (!ctr.observedAttributes!.includes(attrName)) {
            ctr.observedAttributes!.push(attrName);
        }
    }
}
