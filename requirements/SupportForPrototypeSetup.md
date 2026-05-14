# Support For Prototype Setup

the file tests/custom-element-example.html demonstrates how to integrate this package into a custom element.  What bothers a bit is this code:

```Javascript
async connectedCallback() {
    // Setup roundabout for reactive property management
    // This will convert properties to getter/setters
    const [vm, propagator] = await roundabout({
        vm: this,
        ...raConfig,
    });
    ...
}
```

What bothers a bit is the knowledge that in that call, roundabout if will be dynamically creating properties on the custom element prototype.  I think it would probably work okay, but it feels a little unsettling.  Also that we have to make connectedCallback async (of course we could do a fire and forget to an asymch method, but still...)

I wonder how much work it would take to define a cleaner way of doing that initial setup:

```JavaScript
import {makeRoundaboutReady} from 'roundabout-lib/makeRoundaboutReady.js';
class UserCounter extends HTMLElement {
    
    async connectedCallback() {
        // Setup roundabout for reactive property management
        // This will convert properties to getter/setters
        // would we still need await if we can skip the round about ready guarantee?
        const [vm, propagator] = await roundabout({
            skipRoundaboutReadyguarantee: true,
            vm: this,
            ...raConfig,
        });
        ...
    }
}

 // Register the custom element
await makeRoundaboutReady(UserCount, raConfig);
customElements.define('user-counter', UserCounter);
```

Alternatively, we define a different function than roundabout for when we know it's roundabout ready.

I can't recall how much we depend on the vm returns.  I don't think there's any issue spawning asynchronous logic to perform some of the actions, I don't think we need to wait on that before returning the propagator, etc. do we?



