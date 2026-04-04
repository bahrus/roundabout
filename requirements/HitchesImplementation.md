# Hitches Implementation - Complete

## Overview

Hitches have been successfully implemented to coordinate three members of the view model: an EventTarget element, an event type property, and a target property to modify.

## Pattern

```typescript
hitch: {
    when_X_emits_Y_inc_Z_by: number
}
```

- **X**: Property containing an EventTarget (or WeakRef<EventTarget>)
- **Y**: Property containing the event name (string)
- **Z**: Property to increment (number)
- **Value**: The increment amount

## Key Features

### 1. Dynamic Element Binding
- Automatically removes old listener when element changes
- Attaches new listener to new element
- Handles falsy elements gracefully (removes listener, no error)

### 2. Dynamic Event Type Binding
- Automatically updates listener when event type changes
- Removes old event listener before adding new one
- Handles falsy event types gracefully

### 3. WeakRef Support
- Automatically dereferences WeakRef<EventTarget>
- Prevents memory leaks for temporary elements
- Cleans up when element is garbage collected

### 4. Automatic Cleanup
- All listeners use AbortController
- Cleanup on element/event change
- Cleanup on roundabout disposal (via RAController.abort())

### 5. Error Handling
- Validates element is EventTarget
- Logs errors to console without crashing
- Initializes target property if not a number

## Implementation Details

### File: `processors/hitches.ts`

**Key Functions:**
- `processHitches()` - Main processor, sets up reactions for element and event properties
- `parseHitchKey()` - Extracts element, event, and target properties from hitch key
- `setupHitch()` - Creates/updates event listener, handles cleanup

**Data Structures:**
- `activeListeners` Map - Tracks all active listeners for cleanup
- Each listener stores: target, eventType, handler, abortController

**Reaction Registration:**
- Monitors element property changes
- Monitors event property changes
- Both trigger `setupHitch()` to update listener

### Cleanup Strategy

1. **On element change**: Abort existing listener, create new one
2. **On event change**: Abort existing listener, create new one
3. **On disposal**: Abort all listeners via cleanup function
4. **On falsy values**: Abort listener, don't create new one

## Test Coverage

All 3 hitch tests passing:

### 1. Basic Hitch (`tests/hitches/basic-hitch.html`)
- Tests basic increment functionality
- Verifies button clicks increment counter
- Confirms hitch setup and event listening

### 2. Element Change (`tests/hitches/hitch-element-change.html`)
- Tests switching between two buttons
- Verifies old button stops working
- Verifies new button starts working
- Confirms listener cleanup and re-attachment

### 3. Event Type Change (`tests/hitches/hitch-event-change.html`)
- Tests switching from 'click' to 'mouseenter'
- Verifies old event type stops working
- Verifies new event type starts working
- Confirms listener update on event type change

## Usage Examples

### Basic Click Counter
```typescript
const [vm] = await roundabout({
    vm: {
        button: document.querySelector('#btn'),
        eventName: 'click',
        count: 0
    },
    propagate: ['count'],
    hitch: {
        when_button_emits_eventName_inc_count_by: 1
    }
});
```

### Multi-Button Interface
```typescript
const [vm] = await roundabout({
    vm: {
        activeButton: button1,
        eventName: 'click',
        score: 0
    },
    propagate: ['activeButton', 'score'],
    hitch: {
        when_activeButton_emits_eventName_inc_score_by: 10
    }
});

// Switch active button
vm.activeButton = button2;
```

### Dynamic Event Types
```typescript
const [vm] = await roundabout({
    vm: {
        element: myDiv,
        eventType: 'click',
        interactions: 0
    },
    propagate: ['eventType', 'interactions'],
    hitch: {
        when_element_emits_eventType_inc_interactions_by: 1
    }
});

// Switch to different event
vm.eventType = 'mouseenter';
```

### WeakRef for Memory Safety
```typescript
const [vm] = await roundabout({
    vm: {
        elementRef: new WeakRef(tempElement),
        eventName: 'click',
        count: 0
    },
    hitch: {
        when_elementRef_emits_eventName_inc_count_by: 1
    }
});
```

## Documentation

Comprehensive documentation added to README.md:
- Pattern explanation
- Basic examples
- Dynamic element changes
- Dynamic event type changes
- WeakRef support
- Cleanup behavior
- Use cases
- Error handling
- Quick reference table

## Integration

Hitches integrate seamlessly with:
- **Compacts**: Can increment properties that compacts monitor
- **Actions**: Can increment properties that actions monitor
- **Propagate**: Works with propagated properties for event firing

## Files Modified

1. **processors/hitches.ts** - Complete implementation
2. **README.md** - Added "Hitches Reference" section
3. **tests/hitches/** - Created 3 comprehensive tests

## All Tests Passing

Total: 19 tests passing
- ✓ 6 action tests
- ✓ 6 compact tests
- ✓ 3 hitch tests
- ✓ 2 basic tests
- ✓ 2 performance tests

## Benefits

1. **Declarative**: Connect DOM events to state without manual addEventListener
2. **Dynamic**: Element and event type can change at runtime
3. **Clean**: Automatic cleanup prevents memory leaks
4. **Safe**: Handles edge cases gracefully
5. **Flexible**: Works with any EventTarget and event type
6. **Memory-efficient**: Supports WeakRef for temporary elements

## Future Enhancements

Possible improvements:
- Support for decrement operations
- Support for custom handler functions (not just increment)
- Support for event filtering (e.g., only certain keys)
- Support for multiple increments from same event
- Batch multiple hitches on same element
