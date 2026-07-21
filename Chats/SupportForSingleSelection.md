# Support For Single Selection, Scenario I

---

## Human Ask

One of the most common relation between members of a class is the following:

We have:

1.  A list (of options).
2.  A selected item, described in some abbreviated way.
3.  What we want is the option from the list in 1.  that derives from the selected item in 2.

For example:

```TypeScript
{
    items: T[],
    item: T,
    idx: number
}
```

Whenever items or idx changes, we need to set item to items[idx].  Since this is coordinating three members it might fall under hitches.  We could use hitches, but because there are so many things to configure, I'm thinking it would be best to just do:

```JavaScript
hitches: {
    item: {
        from: items,
        atIndex: idx
    }
}
```

Or maybe because hitches are kind of using sentences like compacts, we should have a separate category?

```JavaScript
singleSelections: {
    item: {
        from: items,
        atIndex: idx
    }
}
```

If so, ideally, there would be a name that relates to driving / roundabouts instead of singleSelections, but I could live with it.

---

## Kiro's Analysis

This is a common enough pattern that dedicated support makes sense. A few thoughts:

### On naming and categorization

Hitches coordinate three members where one is an EventTarget — they're about event-driven coordination. This pattern is different: it's purely data-driven (array + index → selected item). No events, no listeners, just reactive derivation.

I'd lean toward a **separate category** rather than overloading hitches. The semantics are different enough that mixing them would muddy the concept of what a "hitch" is.

For the roundabout/driving metaphor: how about **`exits`**? In a roundabout, you take a specific exit (index) from the available options (the circle of exits). "Exit 3 from the roundabout" → "item at index 3 from the list."

```javascript
exits: {
    item: {
        from: 'items',
        atIndex: 'idx'
    }
}
```

Other metaphor options: `lanes` (pick a lane), `turnoffs`, `offramps`. Or just `selections` if we want clarity over metaphor.

### Reactive behavior

When either `items` or `idx` changes, `item` should be recomputed as `items[idx]`. This means we need to monitor both `items` and `idx` and react to changes in either.

Edge cases to consider:
- `idx` is out of bounds → set `item` to `undefined`?
- `items` is `null`/`undefined` → set `item` to `undefined`?
- `idx` is negative → support Python-style negative indexing (`items[items.length + idx]`)?
- Should setting `item` directly be allowed, or is it strictly derived (read-only from the reactive system's perspective)?

### Implementation sketch

This would be a new processor (`processors/exits.ts` or `processors/selections.ts`) that:

1. Parses the config to extract the target prop, source array prop, and index prop
2. Registers reactions on both the array prop and the index prop
3. When either fires, computes `target = source[index]` and sets it (triggering downstream reactions)

```typescript
export async function processExits<TProps = any>(
    vm: TProps,
    exits: Exits<TProps>,
    onChange: (key: string) => Promise<void>
): Promise<() => void> {
    const vmAny = vm as any;
    if (!vmAny.__roundaboutReactions) {
        vmAny.__roundaboutReactions = new Map();
    }

    for (const [targetProp, config] of Object.entries(exits)) {
        const { from, atIndex } = config;

        const recompute = async () => {
            const arr = vmAny[from];
            const idx = vmAny[atIndex];
            const newValue = (Array.isArray(arr) && typeof idx === 'number') 
                ? arr[idx] 
                : undefined;
            if (vmAny[targetProp] !== newValue) {
                vmAny[targetProp] = newValue;
            }
        };

        // React to changes in the array
        addReaction(vmAny, from, recompute);
        // React to changes in the index
        addReaction(vmAny, atIndex, recompute);
    }

    return () => { /* cleanup reactions */ };
}
```

### Type definition

```typescript
export interface ExitConfig<TProps = any> {
    from: keyof TProps & string;
    atIndex: keyof TProps & string;
}

export type Exits<TProps = any> = {
    [K in keyof TProps & string]?: ExitConfig<TProps>;
};
```

### Questions for you

1. **Naming** — `exits`, `selections`, `singleSelections`, or something else?
2. **Edge cases** — should out-of-bounds index set `undefined`, or leave the value unchanged?
3. **Bidirectional** — if `item` is set directly (to a value that exists in `items`), should `idx` be updated to match? Or is this strictly one-way (array + index → item)?
4. **Future expansion** — do you foresee needing `atKey` (for Map/object lookup by key) alongside `atIndex`? If so, the config shape should accommodate that from the start.

---

## Human Response I

1.  Naming -- exits (and the others like offramps) feels forced.  Just to give hitches another chance -- we've only defined one hitch so far, and yes, it has an event in it, but the way we are advertising hitches is:

> Whereas "Compacts" allow us to connect *two* members of the view model together, hitches allow us to coordinate *three* members.

My bigger concern is that in the end, we will want hitches to read like complete sentences (coordinating three members together).

My concern with selections is we will probably want another category for allowing multi selects.

Can you give one more go at seeing if you can come up with a better term?

2.  Edge cases -- Yes, undefined.

3.  One way only

4.  Yes, we will definitely want to expand the use cases to include key matching, so we don't want to box ourself in and prevent that. with the implementation or configuration semantics of scenario I.

---

## Kiro's Response I

Good points. Let me take another run at naming.

### The constraint

We need a term that:
- Fits the roundabout/driving metaphor (ideally)
- Covers "pick one from many" (single selection by index)
- Can naturally extend to "pick several from many" (multi-selection)
- Can extend to "pick by key" (not just by index)
- Doesn't sound forced

### Naming candidates

**`yields`** — A roundabout yield sign means "give way to what's already in the circle." In our context: the list *yields* a specific item based on a selector. "The items yield an item at idx." Multi-select: "items yield selectedItems at indices." Key lookup: "items yield item atKey id."

```javascript
yields: {
    item: { from: 'items', atIndex: 'idx' }
}
// Future multi-select:
yields: {
    selectedItems: { from: 'items', atIndices: 'selectedIndices' }
}
// Future key lookup:
yields: {
    item: { from: 'items', atKey: 'selectedId', keyProp: 'id' }
}
```

**`picks`** — Simple, clear, verb-based. "Pick item from items at idx." Extends naturally: "pick selectedItems from items at indices." Not strongly roundabout-themed but very readable.

```javascript
picks: {
    item: { from: 'items', atIndex: 'idx' }
}
```

**`navigations`** — Navigating a roundabout to reach a destination. "Navigate to item from items at idx." A bit verbose but fits the metaphor.

**`routes`** — "Route from items at idx to item." Roundabout-adjacent (routing traffic). But might conflict with URL routing concepts.

**`merges`** — Already taken.

### My recommendation: `yields`

It reads naturally ("items yields item at index"), extends cleanly to multi-select and key-based lookup, and has a legitimate roundabout connection (yield signs are fundamental to roundabout traffic flow). It's also short and doesn't clash with any JS keyword in a confusing way (generator `yield` is different enough context).

### On hitches

I hear you that hitches was advertised as "coordinate three members." But the current implementation is specifically about EventTarget + event name + target property — it's wired around `addEventListener`. Putting array-index derivation under the same umbrella would mean hitches has two completely different internal mechanisms sharing a name. That said, if you'd prefer to keep it under hitches with a different sentence pattern, something like:

```javascript
hitches: {
    when_idx_selects_from_items_set_item: 0
}
```

...that could work syntactically, but it's a stretch of the "sentence" pattern and the implementation would still be a separate code path internally.

### Decisions so far

- One-way only (array + index → item)
- Out-of-bounds → `undefined`
- Config shape must accommodate future `atKey` / `atIndices` expansion

What's your preference on the name?

## Human Response II

Yields is a great idea because it is used with iterating, so doesn't feel forced.
