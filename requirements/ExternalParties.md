# Knowing How External Parties Can Get The Propagator Reliably

---

## Human Ask

External parties (like element extensions that work with binding) will find it quite useful to be able to latch onto the propagator that the roundabout library creates.

Just to prove there's an issue I added the following to tests/custom-element-example.html:

```html
<user-counter id="counter1" username="Alice" initial-count="5"></user-counter>
<script type=module>
    await customElements.whenDefined('user-counter');
    console.log({propagator1: counter1.propagator});
    setTimeout(() => {
        console.log({propagator1SecondTime: counter1.propagator});
    }, 2000);
</script>
```

and the results are exactly what I expected:

```
custom-element-example.html:94 {propagator1: undefined}
custom-element-example.html:96 {propagator1SecondTime: EventTarget}
```

So I'm thinking maybe the moment the propagator is created, if the passed in object is an EventTarget, it should dispatch some event.  BTW, I prefer to avoid CustomEvents.  For now it could be a simple event:

```JavaScript
oEventTarget.dispatchEvent(new Event('TBD'));
```

So one question is what should TBD be? 

Any other suggestions?

---

## Kiro Comments

The timing issue is real and worth solving. A few thoughts:

**On the event approach:**

Dispatching an event on the element when the propagator is ready is clean and fits the platform. External parties can do:

```javascript
counter1.addEventListener('roundabout-ready', () => {
    // counter1.propagator is now available
});
```

Or if they missed it:

```javascript
if (counter1.propagator) {
    // already ready
} else {
    counter1.addEventListener('roundabout-ready', () => { ... });
}
```

**On the event name:**

A few options:
- `roundabout-ready` — clear, namespaced, no ambiguity about what's ready
- `propagator-ready` — more specific, but couples the name to the implementation detail
- `ra-ready` — shorter, matches the `RA` prefix used elsewhere (`RAController`)

I'd lean toward `roundabout-ready`. It's self-documenting and the `roundabout-` prefix avoids collision with any platform or library events.

**On when to dispatch:**

The propagator is created in `setupPropagator` (step 2 of `RoundaboutManager.initialize`), but the processors haven't run yet at that point. If an external party grabs the propagator and starts listening for property change events immediately, they'd get events before actions/compacts/merges are wired up. That's probably fine — the propagator is usable as soon as it exists — but worth noting.

The natural place to dispatch would be at the end of `RoundaboutManager.initialize`, after `processOptions` completes. That way the propagator is not just created but fully wired — all processors are registered, initial evaluations have run. The element is truly "roundabout-ready" at that point.

**On using plain `Event` vs `CustomEvent`:**

Agree with avoiding `CustomEvent` here. There's no meaningful detail to attach — the propagator is already accessible as `element.propagator`. A plain `new Event('roundabout-ready')` is sufficient.

**One alternative to consider: a promise-based API**

In addition to (not instead of) the event, you could add a static or instance method like `whenReady()` that returns a promise:

```javascript
await counter1.whenReady(); // resolves when propagator is available
console.log(counter1.propagator); // guaranteed to exist
```

This would be easy to implement — store a resolve function during `connectedCallback`, call it at the end of roundabout initialization. It's more ergonomic than event listeners for one-shot "wait for ready" scenarios. But this would be a convention for the custom element author to implement, not something roundabout itself would enforce.

---

## Human Response I

On when to dispatch:  Let's go with your recommendation of the most natural place to add it.

On the event name:  I like roundabout-ready, good idea!

Ona promise-based API: For now, we should document that a package dependency assign-gingerly, has an exported module, waitForEvent.js:

```TypeScript
/**
 * Wait for an event to be fired on an EventTarget
 * @param et - The EventTarget to listen on
 * @param eventName - The event name to wait for (resolves the promise)
 * @param failureEventName - Optional event name that rejects the promise
 * @param timeout - Optional timeout in milliseconds (rejects if exceeded)
 * @returns Promise that resolves with the event
 */
export function waitForEvent<TEvent extends Event = Event>(...
```


