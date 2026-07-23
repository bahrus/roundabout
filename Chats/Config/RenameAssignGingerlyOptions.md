# Rename assignGingerlyOptions to assignOptions

---

## Human Ask

I'd like to please replace:

```javascript
const [vm, propagator] = await roundabout({
    vm: this,
    assignGingerlyOptions: {
        withMethods: ['querySelector', 'appendChild'],
        aka: { q: 'querySelector' }
    },
    // ... actions, compacts, etc.
});
```

with

```javascript
const [vm, propagator] = await roundabout({
    vm: this,
    assignOptions: {
        withMethods: ['querySelector', 'appendChild'],
        aka: { q: 'querySelector' }
    },
    // ... actions, compacts, etc.
});
```

everywhere.  Do not worry about bckwards compatibility.

---

## Kiro's Response

Straightforward rename. Here's the scope:

| Location | Count | Notes |
|----------|-------|-------|
| `types/roundabout/types.d.ts` | 1 | Public type definition |
| `core/RoundaboutManager.ts` | 2 | Stores on VM as `__roundaboutAssignOptions` |
| `roundabout.ts` | 2 | Passes to assignGingerly/assignFrom |
| `roundaboutSync.ts` | 4 | Same pattern |
| `roundaboutFeature.ts` | 1 | Passes to assignGingerly |
| `processors/actions.ts` | 1 | Reads from VM |
| `processors/compacts.ts` | 1 | Reads from VM |
| `processors/handlers.ts` | 1 | Reads from VM |
| `processors/merges.ts` | 1 | Reads from VM |
| `tests/*.html` | 2 | Test configs |
| `README.md` | ~10 | Documentation |
| `legacy/froop/Concerns.md` | 1 | Legacy doc |

The internal storage key (`__roundaboutAssignGingerlyOptions`) should also be renamed to `__roundaboutAssignOptions` for consistency.

No concerns — this is a clean rename with no semantic change. Ready to proceed?

---

## Human Response I

Yes, please.

---

## Implementation Notes


