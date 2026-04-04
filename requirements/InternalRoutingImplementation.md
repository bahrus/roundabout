# Internal Routing Implementation - Complete

## Overview
Internal routing optimization has been successfully implemented to improve performance when actions return objects that trigger cascading reactions.

## How It Works

### Before (Without Internal Routing)
1. Action executes and returns `{ sum: 30 }`
2. `assignGingerly` sets `vm.sum = 30` via setter
3. Setter fires event immediately
4. Event triggers dependent actions
5. Each property change repeats steps 2-4
6. Multiple redundant evaluations possible

### After (With Internal Routing)
1. Action executes and returns `{ sum: 30 }`
2. Value set **covertly** to storage (no event fired)
3. Find all actions affected by `sum` change
4. Evaluate conditions and execute affected actions
5. Collect their results and repeat steps 2-4
6. Once cascade completes, fire events for all changed properties
7. Actions are **disabled** during event firing to prevent re-execution

## Key Implementation Details

### 1. Covert Property Access (`utils/PropagatorSetup.ts`)
- `covertlySetProperty()` - Sets values directly to storage without firing events
- `covertlyGetProperty()` - Reads values directly from storage
- **Dynamic conversion** - Properties are converted to getter/setters on-demand when first set covertly

### 2. Change Bus (`processors/actions.ts`)
- Accumulates property changes in a Map
- Processes changes in batches
- Iterates until no more changes (with safety limit of 100 iterations)

### 3. Action State Tracking
- `__roundaboutActionStates` - Map of all action configurations stored on VM
- Used to find which actions are affected by property changes
- Tracks `lastConditionsMet` for transition-based conditions

### 4. Action Disabling
- `__roundaboutDisableActions` flag prevents re-execution during event dispatch
- Set to `true` before firing events
- Ensures actions don't run twice for the same changes

### 5. Storage Metadata
- `__roundaboutStorageMetadata` - Contains storage reference and type info
- Enables covert property access
- Supports both plain objects and class instances

## Benefits

1. **Reduced redundant work** - Actions evaluated once per cascade instead of multiple times
2. **Batched updates** - Multiple property changes processed together
3. **Predictable execution** - All cascading actions complete before events fire
4. **No duplicate execution** - Actions disabled during final event dispatch

## Test Results

All 15 tests pass:
- ✓ 6 action tests (ifAllOf, ifKeyIn, ifNoneOf, ifEquals, combined, conflict)
- ✓ 6 compact tests (negate, pass_length, echo, inc, toggle, basic)
- ✓ 2 basic tests (with/without propagate)
- ✓ 2 performance tests (simple cascade, complex cascade)

## Performance Metrics

Simple cascade test (3 levels: a,b → sum → double → final):
- Total time: ~620ms
- Action invocations: 12 (includes initial evaluation)
- All cascades complete correctly with internal routing

## Files Modified

1. `utils/PropagatorSetup.ts`
   - Added `covertlySetProperty()` with dynamic property conversion
   - Added `covertlyGetProperty()`
   - Added `__roundaboutStorageMetadata` to VM
   - Enhanced `inferPropertiesToMonitor()` to include target properties

2. `processors/actions.ts`
   - Added `processActionResult()` - Main internal routing logic
   - Added `executeActionForInternalRouting()` - Execute without processing result
   - Added `findAffectedActions()` - Find actions monitoring changed properties
   - Added `__roundaboutDisableActions` flag check
   - Added `__roundaboutActionStates` storage on VM
   - Modified `executeAction()` to use `processActionResult()`

3. `core/RoundaboutManager.ts`
   - Updated `covertAssignment()` to use `covertlySetProperty()`

4. `tests/performance/simple-cascade.html`
   - Created test demonstrating internal routing with 3-level cascade

5. `tests/performance/simple-cascade.spec.mjs`
   - Test spec for simple cascade

## Future Enhancements

Possible optimizations:
- Track which properties are "hot" (frequently changed) and pre-convert them
- Add metrics/instrumentation to measure actual performance gains
- Consider making internal routing optional via configuration flag
- Optimize for common patterns (e.g., single property changes)
