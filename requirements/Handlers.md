# Handlers

## Overview

Handlers provide a declarative way to wire up EventTarget properties to methods, automatically managing event listeners and cleanup. This addresses the complexity and memory leak risks associated with pub/sub patterns (like EventTargets) by ensuring proper lifecycle management.

## Pattern

```typescript
handlers: {
    eventTargetProp_to_methodName_on: 'event-name'
}
```

This declares: "When property `eventTargetProp` is set to an EventTarget (or WeakRef), add an event listener for `event-name`, and when that event fires, invoke method `methodName`."

## Key Features

1. **Automatic Listener Management**: Handlers automatically attach and detach event listeners as the EventTarget property changes
2. **WeakRef Support**: Supports both direct EventTarget references and WeakRef<EventTarget> for memory safety
3. **Result Merging**: Method results are automatically merged back into the view model using assignGingerly
4. **Proper Cleanup**: All event listeners are properly cleaned up when the roundabout is disconnected
5. **Dynamic Updates**: When the EventTarget property changes, the old listener is removed and a new one is attached

## Example

```typescript
const model = {
    timeEmitter: new EventTarget(),
    tickCount: 0,
    
    incTicks(self, event) {
        return {
            tickCount: self.tickCount + 1
        };
    }
};

const [vm, propagator] = await roundabout({
    vm: model,
    handlers: {
        timeEmitter_to_incTicks_on: 'value-changed'
    }
});

// Emit event - incTicks will be called automatically
model.timeEmitter.dispatchEvent(new CustomEvent('value-changed'));
```

## WeakRef Example

```typescript
const emitter = new EventTarget();

const model = {
    emitterRef: new WeakRef(emitter),
    eventCount: 0,
    
    handleEvent(self, event) {
        return {
            eventCount: self.eventCount + 1
        };
    }
};

const [vm, propagator] = await roundabout({
    vm: model,
    handlers: {
        emitterRef_to_handleEvent_on: 'custom-event'
    }
});
```

## Dynamic EventTarget Changes

```typescript
const emitter1 = new EventTarget();
const emitter2 = new EventTarget();

const model = {
    currentEmitter: emitter1,
    messageCount: 0,
    
    onMessage(self, event) {
        return {
            messageCount: self.messageCount + 1
        };
    }
};

const [vm, propagator] = await roundabout({
    vm: model,
    handlers: {
        currentEmitter_to_onMessage_on: 'message'
    }
});

// Events from emitter1 will trigger the handler
emitter1.dispatchEvent(new CustomEvent('message'));

// Change to emitter2 - old listener is removed, new one is attached
vm.currentEmitter = emitter2;

// Now only events from emitter2 will trigger the handler
emitter2.dispatchEvent(new CustomEvent('message'));
```

## Method Signature

Handler methods receive two parameters:
1. `self` - The view model instance
2. `event` - The Event object from the EventTarget

Methods can be synchronous or asynchronous, and should return an object with properties to merge back into the view model.

## Memory Safety

Handlers are designed to avoid memory leaks:
- All event listeners use AbortController for cleanup
- Listeners are tied to the roundabout's lifecycle via AbortSignal
- When the EventTarget property changes, old listeners are immediately removed
- WeakRef support allows EventTargets to be garbage collected when no longer needed

## Implementation Details

- Handler properties are automatically added to the propagator's monitored properties
- The EventTarget property is converted to a getter/setter that fires change events
- When the property changes, the handler processor updates the event listener
- All cleanup is handled automatically when the roundabout is disconnected
