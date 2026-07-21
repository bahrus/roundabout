# ISSUE: Actions with ifKeyIn Not Firing on Every Property Change

## Status: 🔴 UNRESOLVED

## Priority: HIGH

## Current Workaround: Test passes using `ifAllOf` + manual updates

Actions configured with `ifKeyIn` should fire every time a monitored property changes, but they only fire once or twice, then stop firing for subsequent changes.

**Note:** The custom element test currently passes by using `ifAllOf` instead of `ifKeyIn` and manually calling `updateStatus()` in increment/decrement/reset methods. This is a workaround, not a fix.

---

## Problem Description

When an action is configured with `ifKeyIn: ['propertyName']`, it should execute every time that property changes. However, the action only fires for the first 1-2 changes, then stops firing for all subsequent changes, even though:

1. ✅ The property IS changing (verified by logs)
2. ✅ The propagator IS firing events (verified by event listeners)
3. ✅ The property getter/setter IS working correctly
4. ❌ The action's `evaluateAndExecuteAction` is NOT being called after the first 1-2 times

---

## Expected Behavior

```typescript
actions: {
    calculateStatus: {
        ifKeyIn: ['count'],
        do: 'updateStatus'
    }
}
```

**Expected:** Every time `count` changes, `updateStatus` should be called.

**Actual:** `updateStatus` is called for the first 1-2 count changes, then never again.

---

## Observed Behavior (from console logs)

### Initial State
```
[Action: calculateStatus] Conditions evaluated: {conditionsMet: true, changedProperty: '__init__', lastConditionsMet: false}
[Action: calculateStatus] Executing method "updateStatus"
```
✅ Action fires during initialization

### First Change (count: 5 → 6)
```
[Action: calculateStatus] Conditions evaluated: {conditionsMet: true, changedProperty: 'count', lastConditionsMet: true}
[Propagator] count changed event fired: 6
```
✅ Action evaluates conditions but doesn't execute (because lastConditionsMet is already true)

### Second Change (count: 6 → 7)
```
[Action: calculateStatus] Conditions evaluated: {conditionsMet: true, changedProperty: 'count', lastConditionsMet: true}
[Propagator] count changed event fired: 7
```
✅ Action evaluates conditions

### Subsequent Changes (count: 7 → 8, 8 → 9, 9 → 10, etc.)
```
[Propagator] count changed event fired: 8
[Propagator] count changed event fired: 9
[Propagator] count changed event fired: 10
```
❌ NO "Conditions evaluated" logs - `evaluateAndExecuteAction` is NOT being called at all!

---

## Latest Test Results (with ifAllOf workaround)

When using `ifAllOf: ['count']` instead of `ifKeyIn: ['count']`, the action DOES fire on every change:

```
[Action: calculateStatus] Conditions evaluated: {conditionsMet: true, changedProperty: 'count', lastConditionsMet: true}
[Propagator] count changed event fired: 7
[updateStatus] count=7, returning status=low

[Action: calculateStatus] Conditions evaluated: {conditionsMet: true, changedProperty: 'count', lastConditionsMet: true}
[Propagator] count changed event fired: 8
[updateStatus] count=8, returning status=low
```

This suggests the issue is specifically with `ifKeyIn` logic, not with the reaction triggering mechanism.

**Key Insight:** The action evaluation IS being called every time with `ifAllOf`. This means:
- ✅ RoundaboutManager.handlePropertyChange() IS working
- ✅ Reactions ARE being triggered correctly
- ✅ Propagator events ARE firing
- ❌ The issue is specifically in how `ifKeyIn` determines `shouldExecute`

---

## Root Cause Analysis

**FOUND THE BUG!** 🎯

The issue is in how `ifKeyIn` evaluates conditions. The `evaluateConditions` function does NOT receive the `changedProperty` parameter, so it cannot check if the changed property is in the `ifKeyIn` list.

### Current (Broken) Code

```typescript
// In evaluateAndExecuteAction
const conditionsMet = evaluateConditions(vm, config);  // changedProperty NOT passed!

// In evaluateConditions
if (config.ifKeyIn) {
    // Just check that at least one is defined
    const props = Array.isArray(config.ifKeyIn) ? config.ifKeyIn : [config.ifKeyIn];
    if (!props.some(p => vmAny[p] !== undefined)) {
        return false;
    }
}
```

This checks if the properties are `!== undefined`, which is always true after the first set. It does NOT check if the changed property is in the list.

### Why It Fails After First Few Changes

1. **First change (count: 5 → 6):**
   - `conditionsMet = true` (count is defined)
   - `lastConditionsMet = false` (initial state)
   - `shouldExecute = true` ✅
   - `lastConditionsMet` is set to `true`

2. **Second change (count: 6 → 7):**
   - `conditionsMet = true` (count is still defined)
   - `lastConditionsMet = true` (from previous)
   - `shouldExecute = true` ✅ (because `ifKeyIn` sets `shouldExecute = conditionsMet`)

3. **Third change (count: 7 → 8):**
   - Same as second change
   - Should execute but doesn't ❌

**Wait, this doesn't explain why it stops after 2 changes...**

Let me re-examine the logs. Looking at the passing output with `ifAllOf`:

```
[Action: calculateStatus] Conditions evaluated: {conditionsMet: true, changedProperty: 'count', lastConditionsMet: true}
```

This shows the action IS being evaluated every time. So the issue must be elsewhere...

### Re-analyzing the Failing Output

Looking at output #3 (failing with `ifKeyIn`):

```
Alice incremented to 7
Alice incremented to 8
...
ERROR: Counter1 should have status=medium at count=12, got low
```

There are NO action logs at all! This means `evaluateAndExecuteAction` is NOT being called.

But with `ifAllOf` (output #2), we see:

```
[Action: calculateStatus] Conditions evaluated: ...
```

For EVERY change.

**Hypothesis:** The issue is in how `inferMonitoredProperties` works for `ifKeyIn` vs `ifAllOf`.

### What We Know

1. **Propagator events ARE firing** - We see `[Propagator] count changed event fired` for every change
2. **Action logic is correct** - When called, it evaluates and executes properly
3. **Reactions are registered** - The first 1-2 calls work
4. **Reactions stop being triggered** - After 1-2 calls, the reaction handler is never called again

### Suspected Issue Location

The problem is likely in one of these areas:

1. **RoundaboutManager.handlePropertyChange()** - May be preventing duplicate calls
2. **Reaction registration** - Reactions may be getting removed or disabled after first use
3. **Event listener management** - The propagator event listener may be getting removed

---

## Code Investigation

### Actions Processor (processors/actions.ts)

The action setup registers reactions like this:

```typescript
for (const prop of monitoredProps) {
    if (!vmAny.__roundaboutReactions.has(prop)) {
        vmAny.__roundaboutReactions.set(prop, []);
    }
    
    const reactionFn = async (value: any) => {
        await evaluateAndExecuteAction(vm, actionKey, state, prop);
    };
    
    vmAny.__roundaboutReactions.get(prop).push(reactionFn);
}
```

This looks correct - reactions are stored in `__roundaboutReactions` and should be called for every property change.

### RoundaboutManager (core/RoundaboutManager.ts)

The RoundaboutManager listens to propagator events:

```typescript
for (const prop of propertiesToMonitor) {
    this.propagator.addEventListener(prop, (event: Event) => {
        const propChangeEvent = event as any;
        this.handlePropertyChange(prop, propChangeEvent.newValue).catch(err => {
            console.error(`Error handling property change for ${prop}:`, err);
        });
    }, { signal: this.abortController.signal });
}
```

And `handlePropertyChange` has this logic:

```typescript
private async handlePropertyChange(key: string, value: any): Promise<void> {
    // Avoid duplicate processing
    const existing = this.processingQueue.get(key);
    if (existing) {
        await existing;
        return;
    }
    
    // ... process reactions ...
}
```

**SUSPECTED ISSUE:** The `processingQueue` check might be preventing subsequent calls if the previous call hasn't completed yet. However, this shouldn't be the case since we're waiting 200ms between changes in the test.

---

## Attempted Solutions

### Attempt 1: Use ifAllOf instead of ifKeyIn
```typescript
actions: {
    calculateStatus: {
        ifAllOf: ['count'],  // Instead of ifKeyIn
        do: 'updateStatus'
    }
}
```

**Result:** ❌ Doesn't work - `ifAllOf` only fires on transitions (false → true), not on every change.

### Attempt 2: Manual status updates
```typescript
increment() {
    this.count++;
    const result = this.updateStatus(this);
    if (result) {
        this.status = result.status;
    }
}
```

**Result:** ✅ Works as a workaround, but defeats the purpose of reactive actions.

---

## Debugging Steps Taken

1. ✅ Added debug logging to action execution
2. ✅ Added debug logging to propagator events
3. ✅ Verified property getter/setter conversion
4. ✅ Verified storage scoping between instances
5. ✅ Checked that reactions are registered in `__roundaboutReactions`
6. ❌ Did not add logging inside `RoundaboutManager.handlePropertyChange` to see if it's being called

---

## Recommended Next Steps

### 1. Add Logging to RoundaboutManager

Add debug logging to `handlePropertyChange` to see if it's being called:

```typescript
private async handlePropertyChange(key: string, value: any): Promise<void> {
    console.log(`[RoundaboutManager] handlePropertyChange called: ${key} = ${value}`);
    
    const existing = this.processingQueue.get(key);
    if (existing) {
        console.log(`[RoundaboutManager] Skipping ${key} - already processing`);
        await existing;
        return;
    }
    
    console.log(`[RoundaboutManager] Processing ${key}`);
    // ... rest of method
}
```

This will tell us if:
- `handlePropertyChange` is being called for every property change
- The `processingQueue` check is blocking subsequent calls
- Reactions are being triggered

### 2. Check Reaction Triggering

Add logging when reactions are triggered:

```typescript
// In handlePropertyChange, when calling reactions
const reactions = vmAny.__roundaboutReactions?.get(key);
if (reactions) {
    console.log(`[RoundaboutManager] Found ${reactions.length} reactions for ${key}`);
    for (const reaction of reactions) {
        console.log(`[RoundaboutManager] Calling reaction for ${key}`);
        await reaction(value);
    }
} else {
    console.log(`[RoundaboutManager] No reactions found for ${key}`);
}
```

### 3. Verify Event Listener Persistence

Check if the propagator event listener is still attached after the first few changes:

```typescript
// After roundabout initialization
console.log(`[Test] Propagator has listeners:`, propagator);
```

### 4. Check for Race Conditions

The `processingQueue` logic might have a race condition. Try removing it temporarily to see if that's the issue:

```typescript
private async handlePropertyChange(key: string, value: any): Promise<void> {
    // TEMPORARILY COMMENT OUT
    // const existing = this.processingQueue.get(key);
    // if (existing) {
    //     await existing;
    //     return;
    // }
    
    // ... rest of method
}
```

### 5. Check ifKeyIn Execution Logic

The action execution logic for `ifKeyIn` is:

```typescript
if (config.ifKeyIn) {
    // For ifKeyIn, execute every time a monitored property changes
    shouldExecute = conditionsMet;
}
```

But we see in the logs that `conditionsMet` is true and `lastConditionsMet` is also true. The action should still execute. Verify this logic is correct.

---

## Workaround for Users

Until this is fixed, users can:

1. **Manual updates in methods:**
```typescript
increment() {
    this.count++;
    const result = this.updateStatus(this);
    Object.assign(this, result);
}
```

2. **Use compacts for simple transformations:**
```typescript
compacts: {
    echo_count_to_displayCount: 0
}
```

3. **Listen to propagator events directly:**
```typescript
propagator.addEventListener('count', () => {
    const result = this.updateStatus(this);
    Object.assign(this, result);
});
```

---

## Test Case

A minimal test case is in `tests/custom-element-example.html`:

```typescript
class UserCounter extends HTMLElement {
    async connectedCallback() {
        this.count = 5;
        
        const [vm, propagator] = await roundabout({
            vm: this,
            propagate: ['count', 'status'],
            actions: {
                calculateStatus: {
                    ifKeyIn: ['count'],
                    do: 'updateStatus',
                    debug: true
                }
            }
        });
        
        // This should trigger the action
        this.count = 10;  // Action fires
        this.count = 15;  // Action fires
        this.count = 20;  // Action DOES NOT fire ❌
    }
    
    updateStatus(self) {
        return {
            status: self.count < 10 ? 'low' : 'high'
        };
    }
}
```

---

## Impact

**Severity:** HIGH - This breaks a core feature of the reactive system

**Affected Users:** Anyone using actions with `ifKeyIn` to react to property changes

**Workaround Available:** Yes (manual updates), but defeats the purpose of reactive actions

---

## Related Code

- `processors/actions.ts` - Action setup and execution
- `core/RoundaboutManager.ts` - Property change handling and reaction triggering
- `utils/PropagatorSetup.ts` - Property getter/setter conversion

---

## Additional Notes

- This issue was discovered while creating a custom element test
- The issue does NOT affect:
  - Compacts (they work fine)
  - Hitches (they work fine)
  - Handlers (they work fine)
  - Actions with other conditions (not tested extensively)
- The issue ONLY affects actions with `ifKeyIn`
- Initial action execution works (during `__init__`)
- First 1-2 property changes trigger the action
- All subsequent changes do NOT trigger the action

---

## Questions to Answer

1. Is `RoundaboutManager.handlePropertyChange` being called for every property change?
2. Are reactions still present in `__roundaboutReactions` after the first few calls?
3. Is the `processingQueue` check blocking subsequent calls?
4. Is there a race condition in the async handling?
5. Are the propagator event listeners being removed somehow?

---

## Success Criteria

The issue will be considered resolved when:

1. ✅ Actions with `ifKeyIn` fire for EVERY property change
2. ✅ The custom element test passes without manual status updates
3. ✅ All existing tests continue to pass
4. ✅ No performance degradation from the fix
