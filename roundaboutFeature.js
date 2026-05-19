import { roundaboutSync } from './roundaboutSync.js';
import { getFeatureInfoSuggestions } from 'assign-gingerly/assignFeatures.js';
export const id = Symbol.for('roundabout-lib-feature');
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
     * Also ensures sourceOfTruth attributes are added to observedAttributes.
     */
    static async onAssigned(ctr, featureConfig) {
        const { makeRoundaboutReady } = await import('./makeRoundaboutReady.js');
        // Read suggestions from other features
        const suggestions = getFeatureInfoSuggestions(id, ctr);
        for (const suggestion of suggestions) {
            if (suggestion.customData) {
                featureConfig.customData = {
                    ...featureConfig.customData,
                    ...suggestion.customData
                };
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
// ─── Helpers for sourceOfTruth / observedAttributes ──────────────────────────
/**
 * Check if a constructor is a custom element (extends HTMLElement).
 */
function isCustomElementConstructor(ctr) {
    let proto = ctr.prototype;
    while (proto) {
        if (proto === HTMLElement.prototype)
            return true;
        proto = Object.getPrototypeOf(proto);
    }
    return false;
}
/**
 * Resolve a template string like '${base}-count' against the withAttrs patterns.
 */
function resolveAttrName(withAttrs, key) {
    const value = withAttrs[key];
    if (!value)
        return null;
    if (typeof value !== 'string')
        return null;
    // Resolve ${var} references
    return value.replace(/\$\{(\w+)\}/g, (_match, varName) => {
        const resolved = withAttrs[varName];
        if (typeof resolved === 'string') {
            // Recursively resolve (one level deep is usually enough)
            return resolved.replace(/\$\{(\w+)\}/g, (_m, v) => {
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
function ensureObservedAttributes(ctr, withAttrs) {
    for (const [key, value] of Object.entries(withAttrs)) {
        // Config entries are underscore-prefixed (e.g., _count: { sourceOfTruth: true })
        if (!key.startsWith('_'))
            continue;
        if (typeof value !== 'object' || value === null)
            continue;
        if (!value.sourceOfTruth)
            continue;
        // The attribute name comes from the non-underscore sibling key
        const propKey = key.slice(1); // '_count' → 'count'
        const attrName = resolveAttrName(withAttrs, propKey);
        if (!attrName)
            continue;
        // Ensure static observedAttributes exists and includes this attribute
        if (!ctr.observedAttributes) {
            Object.defineProperty(ctr, 'observedAttributes', {
                value: [],
                writable: true,
                enumerable: false,
                configurable: true,
            });
        }
        if (!ctr.observedAttributes.includes(attrName)) {
            ctr.observedAttributes.push(attrName);
        }
    }
}
