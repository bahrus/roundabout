# Do Merge Check Only After Delay

---

## Bruce's Ask:

I'm finding a scenario where I need to delay the execution of a merge.  The use case is setting focus:

```JS
{
    ifAllOf: ['expanded'],
    assign: {
        '?.querySelector?.a?.focus|': null
    }
},
```

I would like if:

```JS
{
    delay: 10
    ifAllOf: ['expanded'],
    assign: {
        '?.querySelector?.a?.focus|': null
    }
},
```

... waits 10 milliseconds, then checks the conditions and if satisfied does the assignFrom.

---

## Kiro's Implementation Notes

Let me look at the merges processor to understand how to add delay support:

`delay` is already supported in `evaluateAndExecuteMerge` — it clears any pending timeout and schedules `executeMerge` after the delay. But the ask is subtly different: the delay should happen **before checking conditions**, not after. Currently the code checks conditions immediately, then delays the execution. The user wants: wait 10ms, *then* check conditions and execute if met.

Let me update `evaluateAndExecuteMerge` to apply the delay before the condition check:

Done. The key semantic change:

**Before**: check conditions immediately → if met, wait `delay`ms → execute
**After**: wait `delay`ms → check conditions → if still met, execute

This is exactly what you want for the focus case — by the time `delay` ms has passed, the DOM element is ready and conditions are checked fresh. If something changed in the meantime (e.g., `expanded` got set back to false before the timeout fires), the merge won't run.

The timeout cancellation on the next invocation also means rapid property changes won't queue up multiple delayed merges — only the last one fires.

