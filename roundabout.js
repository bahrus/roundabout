export async function roundabout(options, infractions) {
    const { RoundaboutManager } = await import('./core/RoundaboutManager.js');
    const manager = new RoundaboutManager(options, infractions);
    const returnObj = await manager.initialize();
    const initVals = options.initialPropVals || options.defaultPropVals;
    if (initVals) {
        // A caller may have already set some of these properties directly on
        // the vm before `roundabout` finished wiring up accessors (e.g. an
        // imperative `instance.prop = value` racing the async `init`).
        // `convertPropertyToGetterSetter` marks any such property in
        // `__roundaboutRescuedProps` when it captures a non-undefined current
        // value as the accessor's initial storage. Respect those: `initVals`
        // (attribute-parsed values and `defaultPropVals`) should only fill in
        // properties nothing has claimed yet, not clobber ones already set.
        //
        // Deliberately *not* a blanket `vm[key] === undefined` check: roundabout
        // itself defaults several own conveniences (`nudge`, `rock`, `awake`,
        // `covertAssignment` -- see `setupViewModel`) the same way, and a plain
        // presence check can't tell "a real value was set" apart from "this
        // happens to collide with one of those names". The rescued-props set is
        // populated only by the accessor-conversion path, so it can't confuse
        // the two.
        const vmAny = returnObj[0];
        const rescued = vmAny.__roundaboutRescuedProps;
        const filteredInitVals = {};
        for (const key of Object.keys(initVals)) {
            if (rescued?.has(key))
                continue;
            filteredInitVals[key] = initVals[key];
        }
        if (Object.keys(filteredInitVals).length > 0) {
            if (options.protocols) {
                const { assignFrom } = await import('assign-gingerly/assignFrom.js');
                await assignFrom(returnObj[0], filteredInitVals, {
                    from: returnObj[0],
                    ...options.assignOptions,
                    protocols: options.protocols
                });
            }
            else {
                (await import('assign-gingerly/assignGingerly.js')).assignGingerly(returnObj[0], filteredInitVals, options.assignOptions);
            }
        }
    }
    return returnObj;
}
