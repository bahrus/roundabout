[![Playwright Tests](https://github.com/bahrus/roundabout/actions/workflows/CI.yml/badge.svg)](https://github.com/bahrus/roundabout/actions/workflows/CI.yml)
[![NPM version](https://badge.fury.io/js/roundabout-lib.png)](http://badge.fury.io/js/roundabout-lib)
[![How big is this package in your project?](https://img.shields.io/bundlephobia/minzip/roundabout-lib?style=for-the-badge)](https://bundlephobia.com/result?p=roundabout-lib)
<img src="http://img.badgesize.io/https://cdn.jsdelivr.net/npm/roundabout-lib?compression=gzip">

# roundabout

## Signals Vs Roundabouts

The world needs both traffic signals and roundabouts.  This shouldn't be an either or.

Signals:

<img align="right" src="https://github.com/tc39/proposal-signals/raw/main/Signals.svg" alt="Signals logo" width="100" style="max-width: 100%;">

```JavaScript
const counter = new Signal.State(0);
const isEven = new Signal.Computed(() => (counter.get() & 1) == 0);
const parity = new Signal.Computed(() => isEven.get() ? "even" : "odd");

effect(() => element.innerText = parity.get());

// Simulate external updates to counter...
setInterval(() => counter.set(counter.get() + 1), 1000);
```

Roundabouts:

<img align="right" src="https://www.trafficdepot.ca/wp-content/uploads/2020/08/reg6bb.png" width="100px">

```JavaScript
const rxns = [({counter}) => ({isEven: counter & 1 === 0}),
    ({isEven}) => ({parity: isEven ? 'even' : 'odd'}),
    ({parity}) => ({'?.element?.innerText': parity})];

const [vm] = await roundabout({propagate: {count: 0}}, rxns);

// Simulate external updates to counter...
setInterval(() => vm.count++, 1000);
```

## Somewhat biased(?) comparison

Both examples above require about the same number of lines of code.  But most statements, where the developer spends more eyeball time, are smaller with roundabouts, are easier to test, and involve less distracting binding noise.  One statement is admittedly a bit larger.

For both examples, all the functions are side effect free and don't do any state mutation at all.  They are purely functional.

As we will see below, roundabout can JSON serialize much of the logic, making parsing the instructions easier on the browser.

In general, signals involve "busier" syntax that seems to be less declarative, especially less JSON serializable.  On the plus side, the developer can be far less disciplined.  

Roundabouts encourage small, loosely coupled functions, which are easy to test (but may suffer from more bouncing around), and the code is far more "clean", in the sense that there are no api calls required to worry about.  Just focus in what output you want merged into the view model, and leave it at that.  

It requires more disciplined patience from the developer, but it allows for a large solution space of code-free declarative solutions. 

While the argument against signals weakens if it becomes part of the underlying platform (in particular, escaping the charge of getting stuck in proprietary vendor lock-in land), I still think the argument of requiring the code to integrate with signals has a kind of "coupling" cost. 

roundabout "guesses" when the developer wants to call the functions to compute new values, if not specified, based on the lhs of the arrow expressions.  But developers can take hold of the reigns, and be more explicit:

```JavaScript
const [vm, propagator] = await roundabout(
    {   
        vm: {element, isEven, parity, effect},
        propagator,
        compacts: {
            when_count_changes_call_isEven: 0,
            when_isEven_changes_call_parity: 0
        },
        actions:{
            effect: {
                ifAllOf: ['count', 'isEven', 'parity']
            }
        },
        
    }
);
```

I suspect roundabouts also require less run time analysis.

It certainly benefits from fewer (nested) parenthesis.

State is all in one place -- the vm (view model), which could also be the custom element class instance.

In my view, roundabouts require a lower learning curve.

For both roundabouts and signals, they don't execute code if the field value is unchanged, so they are on par as far as that concern goes.

Neither requires pub/sub.

No creation of getters/setters required (other than count for roundabouts, so that count++ works).

Basically, what roundabout does is it looks at what subset of properties of the view model is returned from the action methods (isEven, parity, effect), and directs traffic accordingly after doing an Object.assignGingerly.

propagator is an EventTarget, that publishes events when the propagate properties are changed (just count).



<!--
roundabout could support deep memoization (parity), which seems like a good idea
-->

## Design Philosophy: Declarative First

The core goal of roundabout is to **maximize declarative, JSON-serializable configuration** and **minimize imperative code**. If you find yourself writing lots of imperative glue code around roundabout, that's a signal that roundabout isn't being used to its full potential.

Roundabout is also designed to be non-invasive. If the view model already provides a propagator, property getter/setters, or other members of the `RoundaboutReady` interface, roundabout uses what's there and only fills in the gaps. Libraries can implement their own reactive property system and still benefit from roundabout's declarative processors.

### What "declarative" means here

The roundabout configuration object should describe *what* happens, not *how*. Action methods should be pure functions: receive the view model state, return the new state to merge. Roundabout handles the wiring — when to call what, how to merge results, how to propagate changes.

### Action methods are pure functions

Action methods receive `self` (the view model) and return a partial object to merge back:

```javascript
updateStatus(self) {
    const { count } = self;
    if (count < 10) return { status: 'low', statusMessage: 'Low count' };
    if (count < 20) return { status: 'medium', statusMessage: 'Medium count' };
    return { status: 'high', statusMessage: 'High count!' };
}
```

No `this.status = ...` assignments. No manual event dispatching. Just return what changed and roundabout handles the rest.

### Handlers replace imperative event wiring

Instead of manually adding event listeners to buttons, use handlers:

```javascript
// ❌ Imperative: manual event listener setup
this.querySelector('.increment').addEventListener('click', () => this.increment());

// ✅ Declarative: roundabout wires it up
handlers: {
    incrementButton_to_increment_on: 'click',
    decrementButton_to_decrement_on: 'click',
    resetButton_to_reset_on: 'click',
}
```

The handler methods follow the same pattern — receive `self`, return partial state:

```javascript
increment(self) {
    return { count: self.count + 1 };
}
```

### assignGingerly enables declarative DOM updates

Roundabout uses [assignGingerly](https://github.com/bahrus/assign-gingerly) to merge action results back into the view model. assignGingerly supports optional-chaining-in-reverse syntax and method invocation, which means DOM updates can be expressed declaratively in action return values:

```javascript
// With assignGingerlyOptions: { withMethods: ['querySelector'], aka: { q: 'querySelector' } }

updateCountDisplay(self) {
    return {
        '?.clone?.q?..count-value?.textContent': self.count,
    };
}

updateStatusDisplay(self) {
    return {
        '?.clone?.q?..status?.className': `status ${self.status}`,
        '?.clone?.q?..status-text?.textContent': self.statusMessage || self.status,
    };
}
```

Key assignGingerly features used with roundabout:
- **Optional chaining in reverse** (`?.prop?.subProp`): safely navigates nested properties, creating intermediates if needed
- **Method invocation** (`withMethods`): allows calling methods like `querySelector` or `appendChild` through the declarative syntax
- **Aliases** (`aka`): shortens verbose method names (e.g., `q` for `querySelector`)
- **Class selector shorthand** (`q?..className`): the `?..` syntax passes the next segment as an argument to the preceding method (e.g., `querySelector('.className')`)

Pass these options via `assignGingerlyOptions` in the roundabout config:

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

## Web Component Example

Here is a complete example showing how roundabout enables a mostly-declarative web component. The configuration is JSON-serializable and can be shared or parsed independently of the class:

```javascript
// JSON-serializable configuration — the "what"
const raConfig = {
    weakRef: {
        properties: ['incrementButton', 'decrementButton', 'resetButton'],
        logIfCollected: 'warn'
    },
    actions: {
        createClone: { ifAllOf: ['template'] },
        updateStatus: { ifKeyIn: ['count'] },
        updateStatusDisplay: { ifKeyIn: ['status', 'statusMessage'], ifAllOf: ['clone'] },
        updateUsernameDisplay: { ifKeyIn: ['username'], ifAllOf: ['clone'] },
        updateCountDisplay: { ifKeyIn: ['count'], ifAllOf: ['clone'] },
        render: { ifAllOf: ['renderCount'] },
    },
    handlers: {
        incrementButton_to_increment_on: 'click',
        decrementButton_to_decrement_on: 'click',
        resetButton_to_reset_on: 'click',
    },
    assignGingerlyOptions: {
        withMethods: ['querySelector', 'appendChild'],
        aka: { q: 'querySelector' }
    },
    customData: {
        innerHTML: `
            <div class="header">User: <span class="username"></span></div>
            <div class="count">Count: <span class="count-value"></span></div>
            <div class="status">Status: <span class="status-text"></span></div>
            <div class="controls">
                <button class="increment">+1</button>
                <button class="decrement">-1</button>
                <button class="reset">Reset</button>
            </div>`
    }
};

const template = document.createElement('template');
template.innerHTML = raConfig.customData.innerHTML;

// The class — pure methods, minimal lifecycle glue
class UserCounter extends HTMLElement {
    async connectedCallback() {
        const [vm, propagator] = await roundabout({ vm: this, ...raConfig });

        // Set initial state — roundabout's getter/setters are already in place,
        // so actions fire reactively as properties are assigned
        this.count = 0;
        this.username = 'User';
        this.status = 'low';
        this.statusMessage = '';
        this.template = template;  // triggers createClone → render chain

        if (this.hasAttribute('username')) this.username = this.getAttribute('username');
        if (this.hasAttribute('initial-count'))
            this.count = parseInt(this.getAttribute('initial-count'), 10) || 0;
    }

    createClone(self) {
        const clone = self.template.content.cloneNode(true);
        return {
            incrementButton: clone.querySelector('.increment'),
            decrementButton: clone.querySelector('.decrement'),
            resetButton: clone.querySelector('.reset'),
            clone,
        };
    }

    render(self) {
        return { '?.appendChild': self.clone, clone: self };
    }

    updateStatus(self) {
        const { count } = self;
        if (count < 10) return { status: 'low', statusMessage: 'Low count' };
        if (count < 20) return { status: 'medium', statusMessage: 'Medium count' };
        return { status: 'high', statusMessage: 'High count!' };
    }

    increment(self) { return { count: self.count + 1 }; }
    decrement(self) { return { count: self.count - 1 }; }
    reset(self) { return { count: 0 }; }

    updateCountDisplay(self) {
        return {
            '?.clone?.q?..count-value?.textContent': self.count,
            renderCount: 1,
        };
    }

    updateStatusDisplay(self) {
        return {
            '?.clone?.q?..status?.className': `status ${self.status}`,
            '?.clone?.q?..status-text?.textContent': self.statusMessage || self.status,
        };
    }

    updateUsernameDisplay(self) {
        return { '?.clone?.q?..username?.textContent': self.username };
    }
}
```

Notice what's absent: no manual `addEventListener` calls, no `this.querySelector(...)` in lifecycle code, no imperative `this.status = ...` assignments inside action methods. Every method is a pure function that receives state and returns new state. Roundabout handles the reactive wiring.

### Going fully declarative with merges and compacts

The example above still has methods for `increment`, `decrement`, `reset`, `createClone`, `render`, `updateCountDisplay`, `updateStatusDisplay`, and `updateUsernameDisplay`. Most of these are simple enough to express declaratively. Using **merges** (JSON-serializable reactive assignments) and the **`on_EVENT_of_X`** compact patterns, we can eliminate all but the one method that contains real logic (`updateStatus`):

```javascript
const raConfig = {
    weakRef: {
        properties: ['incrementButton', 'decrementButton', 'resetButton'],
        logIfCollected: 'warn'
    },
    actions: {
        // The only action left — contains branching logic that can't be JSON-serialized
        updateStatus: { ifKeyIn: ['count'] },
    },
    compacts: {
        // Button clicks directly modify count — no methods needed
        on_click_of_incrementButton_inc_count_by: 1,
        on_click_of_decrementButton_inc_count_by: -1,
        on_click_of_resetButton_set_count_to: 0,
    },
    merges: [
        // Clone the template when it becomes available
        { ifAllOf: ['template'], assign: { clone: '?.template?.content?.cloneNode?.true' } },
        // Extract button references from the clone
        {
            ifAllOf: ['clone'],
            assign: {
                incrementButton: '?.clone?.q?..increment',
                decrementButton: '?.clone?.q?..decrement',
                resetButton: '?.clone?.q?..reset',
            }
        },
        // Push username into the DOM
        { ifKeyIn: ['username'], ifAllOf: ['clone'], assign: { '?.clone?.q?..username?.textContent': '?.username' } },
        // Push status into the DOM
        {
            ifKeyIn: ['statusClassName', 'statusMessageText'],
            ifAllOf: ['clone'],
            assign: {
                '?.clone?.q?..status?.className': '?.statusClassName',
                '?.clone?.q?..status-text?.textContent': '?.statusMessageText',
            }
        },
        // Push count into the DOM and trigger render
        { ifKeyIn: ['count'], ifAllOf: ['clone'], assign: { '?.clone?.q?..count-value?.textContent': '?.count', renderCount: 1 } },
        // Append clone to the element
        { ifAllOf: ['renderCount'], assign: { '?.appendChild': '?.clone', clone: '?.' } },
    ],
    assignGingerlyOptions: {
        withMethods: ['querySelector', 'appendChild', 'add', 'cloneNode'],
        aka: { q: 'querySelector' }
    },
};
```

The class shrinks to just lifecycle glue and the one method with real logic:

```javascript
class UserCounter extends HTMLElement {
    async connectedCallback() {
        const [vm] = await roundabout({ vm: this, ...raConfig });
        this.count = 0;
        this.username = 'User';
        this.status = 'low';
        this.statusMessage = '';
        this.renderCount = 0;
        this.template = template;
        if (this.hasAttribute('username')) this.username = this.getAttribute('username');
        if (this.hasAttribute('initial-count'))
            this.count = parseInt(this.getAttribute('initial-count'), 10) || 0;
    }

    // The only method — branching logic that can't be expressed declaratively
    updateStatus(self) {
        const { count } = self;
        let status = 'high', statusMessage = 'High count!';
        if (count < 10) { status = 'low'; statusMessage = 'Low count'; }
        else if (count < 20) { status = 'medium'; statusMessage = 'Medium count'; }
        return {
            status, statusMessage,
            statusClassName: `status ${status}`,
            statusMessageText: statusMessage || status,
        };
    }
}
```

What changed:
- **`increment`, `decrement`, `reset`** → replaced by `on_click_of_X_inc_Y_by` and `on_click_of_X_set_Y_to` compacts
- **`createClone`, `render`** → replaced by merges using assignGingerly's `cloneNode` and `appendChild` method invocation
- **`updateCountDisplay`, `updateUsernameDisplay`, `updateStatusDisplay`** → replaced by merges that push vm properties into the DOM
- **`updateStatus`** stays as an action — it contains branching logic (`if/else`) that can't be expressed in JSON

The entire `raConfig` object is JSON-serializable. The only imperative code left is `connectedCallback` (lifecycle glue) and `updateStatus` (real logic).

## Synchronous Setup with `makeRoundaboutReady` + `roundaboutSync`

The examples above use `async connectedCallback()` because `roundabout()` dynamically imports processor modules. This works fine, but for custom elements it means:

1. `connectedCallback` must be async (or use fire-and-forget)
2. Prototype getter/setters are installed at instance-creation time rather than class-definition time

If you'd prefer a synchronous `connectedCallback`, roundabout provides a two-step alternative:

```javascript
import { makeRoundaboutReady, roundaboutSync } from 'roundabout-lib';

const raConfig = { /* same config as before */ };

class UserCounter extends HTMLElement {
    // No async needed!
    connectedCallback() {
        const [vm, propagator] = roundaboutSync({ vm: this, ...raConfig });

        this.status = 'low';
        this.template = template;
        // ... set initial state
    }

    updateStatus(self) {
        const { count } = self;
        if (count < 10) return { status: 'low', statusMessage: 'Low count' };
        if (count < 20) return { status: 'medium', statusMessage: 'Medium count' };
        return { status: 'high', statusMessage: 'High count!' };
    }
}

// One-time async setup — call before customElements.define()
await makeRoundaboutReady(UserCounter, raConfig);
customElements.define('user-counter', UserCounter);
```

### How it works

**`makeRoundaboutReady(Constructor, config)`** does the async work once, up front:
- Pre-imports all processor modules the config requires (compacts, actions, merges, etc.)
- Infers which properties need monitoring from the config
- Installs getter/setters on `Constructor.prototype`
- Caches everything so `roundaboutSync` can use it without any imports

**`roundaboutSync(options)`** then runs fully synchronously per instance:
- Initializes per-instance storage
- Creates the propagator EventTarget
- Wires up property-change listeners and processors using the cached modules
- Returns `[vm, propagator]` immediately

### Fallback behavior

If `roundaboutSync` is called without a prior `makeRoundaboutReady`, it still works — getter/setters are installed inline (synchronous), and processor module loading is deferred to a microtask. The return value is always `[vm, propagator]` synchronously either way. This means you can use `roundaboutSync` as a drop-in replacement for `roundabout` without the `makeRoundaboutReady` call — you just won't get the benefit of pre-loaded processors on the first tick.

### When to use which

| Approach | Use when |
|----------|----------|
| `roundabout()` | Simple cases, plain objects, one-off VMs, or when async `connectedCallback` is acceptable |
| `makeRoundaboutReady` + `roundaboutSync` | Custom elements where you want synchronous lifecycle, or when multiple instances share the same config |
| `RoundaboutFeature` + `assignFeatures` | Custom elements using assign-gingerly's feature system, attribute parsing, or dependency injection |

### Note on `roundabout-ready` event

`roundaboutSync` does not dispatch the `roundabout-ready` event. If external parties need to detect when the element is initialized, check for `element.propagator` directly — it's available immediately after `roundaboutSync` returns.

## Using RoundaboutFeature with `assignFeatures`

For the cleanest integration with custom elements, roundabout provides a **feature class** that plugs into [assign-gingerly's](https://github.com/bahrus/assign-gingerly) `assignFeatures` dependency injection system. This eliminates the need to import roundabout directly in your element file — the feature system handles everything.

```javascript
import 'assign-gingerly/assignFeatures.js';
import { RoundaboutFeature } from 'roundabout-lib/roundaboutFeature.js';

const raConfig = {
    actions: { updateStatus: { ifKeyIn: ['count'] } },
    compacts: {
        on_click_of_incrementButton_inc_count_by: 1,
        on_click_of_decrementButton_inc_count_by: -1,
        on_click_of_resetButton_set_count_to: 0,
    },
    merges: [ /* ... */ ],
    assignGingerlyOptions: { withMethods: ['querySelector', 'appendChild'], aka: { q: 'querySelector' } }
};

class UserCounter extends HTMLElement {
    static supportedFeatures = {
        roundabout: { fallbackSpawn: RoundaboutFeature }
    };

    connectedCallback() {
        this.roundabout; // access the lazy getter — triggers roundaboutSync
        this.template = template;
        this.status = 'low';
        this.renderCount = 0;
    }

    updateStatus(self) {
        const { count } = self;
        if (count < 10) return { status: 'low', statusMessage: 'Low count' };
        if (count < 20) return { status: 'medium', statusMessage: 'Medium count' };
        return { status: 'high', statusMessage: 'High count!' };
    }
}

// One-time async setup — calls makeRoundaboutReady via static onAssigned
await customElements.assignFeatures(UserCounter, {
    roundabout: {
        spawn: RoundaboutFeature,
        customData: { raConfig },
        withAttrs: {
            base: 'user-counter',
            count: '${base}-count',
            _count: { instanceOf: 'Number', valIfNull: 0 },
            username: '${base}-username',
        }
    }
});

customElements.define('user-counter', UserCounter);
```

```html
<user-counter user-counter-username="Alice" user-counter-count="5"></user-counter>
```

### How it works

1. **`assignFeatures`** installs a lazy getter for `this.roundabout` on the prototype.
2. **`RoundaboutFeature.onAssigned`** is called automatically — it runs `makeRoundaboutReady(Constructor, raConfig)` to install prototype getter/setters and pre-load processor modules.
3. **`withAttrs`** (top-level in the feature config) is handled by assign-gingerly — it parses element attributes and passes the result as `initVals` to the feature constructor.
4. **On first access** (`this.roundabout` in `connectedCallback`), the feature constructor runs `roundaboutSync` to wire up the propagator and processors, then applies the parsed attribute values via `assignGingerly`.

### What goes where

| Config key | Purpose | Who reads it |
|-----------|---------|-------------|
| `customData.raConfig` | Roundabout config (actions, compacts, merges, etc.) | `RoundaboutFeature` |
| `withAttrs` (top-level) | Attribute parsing patterns | assign-gingerly's feature system |

### Benefits over direct `roundaboutSync` usage

- No roundabout imports needed in the element file
- Attribute parsing handled automatically by the feature system
- Swappable for mocks in tests (standard `assignFeatures` pattern)
- `connectedCallback` is synchronous and minimal
- Works with `callbackForwarding` if you want auto-spawn on connect

## How to be roundabout ready

For a class to be optimized to work most effectively with roundabouts, it should implement interface RoundaboutReady.

Libraries and frameworks can provide their own implementations of the propagator, property getter/setters, and other RoundaboutReady members. Roundabout checks for existing implementations and only adds its own defaults where none are found. This means you can bring your own reactive property system — as long as property changes dispatch events on the propagator, roundabout's processors will work with it.

```TypeScript
interface RoundaboutReady{
    /**
     * Allow for assigning to read only props via the "backdoor"
     * Bypasses getters / setters, sets directly to (private) memory slots
     * Doesn't do any notification
     * Allows for nested property setting via assignGingerly
    */
    covertAssignment(obj: any): void;

    /**
     * fires event with name matching the name of the property when the value changes (but not via covertAssignment)
     * when property is set via public interface, not via an action method's return object
     */
    get propagator() : EventTarget;


    /**
     * Only useful if there are scenarios where you need to reactively 
     * respond to deeply nested prop modifications [TODO]
     */
    set gingerLog(log: Set<string>);

    /**
     * https://github.com/whatwg/dom/issues/1296
     *
     */
    get disconnectedSignal(): AbortSignal;


    /**
     * During this time, queues/buses continue to perform "bookkeeping"
     * but doesn't process the queue until sleep property becomes falsy.
     * If truthy, can call await awake() before processing should resume
     */ 
    get sleep(): any;

    async awake();

    //make the value sleep 1 step closer to be falsy
    nudge();

    //make the value of sleep 1 step further away from being falsy
    rock();

}
```

So yes, we are still "clinging" to the notion that EventTargets are useful, despite the [forewarning](https://github.com/proposal-signals/proposal-signals?tab=readme-ov-file#example---a-vanillajs-counter):

> Unfortunately, not only has our boilerplate code exploded, but we're stuck with a ton of bookkeeping of subscriptions, and a potential memory leak disaster if we don't properly clean everything up in the right way.

So to make concern seem, perhaps, overly alarmist, we add one more "soft" requirement to make the view model be roundabout ready -- the interface should provide a disconnectedSignal abort signal, as recommended by [this proposal](https://github.com/whatwg/dom/issues/1296). 

## Detecting when roundabout is ready

When roundabout initializes a view model that is an `EventTarget` (such as a custom element), it dispatches a `roundabout-ready` event on the element once initialization is complete — propagator created, all processors wired up, initial evaluations run.

This is useful for external parties (like element extensions or binding libraries) that need to access the propagator:

```javascript
const counter = document.querySelector('user-counter');

if (counter.propagator) {
    // Already initialized
    usePropagator(counter.propagator);
} else {
    counter.addEventListener('roundabout-ready', () => {
        usePropagator(counter.propagator);
    }, { once: true });
}
```

For a promise-based approach, the dependency [assign-gingerly](https://github.com/bahrus/assign-gingerly) exports a `waitForEvent` utility:

```javascript
import { waitForEvent } from 'assign-gingerly/waitForEvent.js';

const counter = document.querySelector('user-counter');
if (!counter.propagator) {
    await waitForEvent(counter, 'roundabout-ready');
}
// counter.propagator is guaranteed to exist here
```

> **Important:** Always check `counter.propagator` first. If roundabout already initialized, the `roundabout-ready` event has already fired and won't fire again — `waitForEvent` would hang forever without the guard.

The event name is also available as a constant:

```javascript
import { ROUNDABOUT_READY_EVENT } from 'roundabout-lib/core/Events.js';
// ROUNDABOUT_READY_EVENT === 'roundabout-ready'
```

> **Note:** The event is a plain `Event`, not a `CustomEvent`. The propagator is accessible directly as `element.propagator` — no need for event detail.

> **Note:** If the vm already provides its own propagator and getter/setters (i.e., a library implements the RoundaboutReady interface), roundabout respects those and skips its own setup. The `roundabout-ready` event still fires once all processors are wired up, regardless of who provided the propagator.

# RoundAbout Options

In addition to the class definition or object that needs managing in a roundabout way need to implement the RoundaboutReady interface, when we invoke the RoundAbout manager, we can pass in a configuration objection, containing multiple declarative settings.

The sections below discuss these settings


## Compacts

"Compacts" refers to one-way "agreements" between two members of the view model.

Let's say our view model looks like this:

```Typescript
interface MoodStoneProps{
    isHappy: boolean,
    isNotHappy: boolean,
    data: Array<UppersAndDowners>,
    dataLength: number,
    someOtherLength: number,
    readyToPartyTonight: boolean,
    age: number,
    ageChanged: boolean,
    ageChangeCount: number,
}

interface MoodStoneActions{
    throwBirthdayParty(self: this): Partial<MoodStoneProps>
}
```

"compacts" look as follows:

```TypeScript
const raConfig = {
    ...
    compacts:{
        //rhs indicates delay if any
        when_age_changes_call_throwBirthdayParty: 0
        //rhs indicates delay if any
        negate_isHappy_to_isNotHappy: 0,
        // if data is falsy, set dataLength to the rhs value
        pass_length_of_data_to_dataLength: 0,
        //rhs indicates delay if any before echoing the value
        echo_dataLength_to_someOtherLength: 20, 
        
        //rhs is a property that specifies how long to wait
        echo_inputCount_to_inputCountEcho_after: debounceInterval,  
        
        
        // the number on the rhs is the delay to apply, if any
        when_age_changes_toggle_ageChangedToggle: 0,
        //rhs specifies amount to increment, which could even be negative!
        when_age_changes_inc_ageChangeCount_by: 1,
    }
};

export class MoodStone extends O implements IMoodStoneActions {
    async connectedCallback() {
        const [vm, propagator] = await roundabout({ vm: this, ...raConfig });
        ...
    }
    
    
}
```

> [!NOTE]
> Compacts that invoke a method, like the first example, can't be mixed with actions that are tied to the same method, as it creates too much ambiguity, and would thus defeat the purpose of providing better developer ergonomics.

## Fully configurable actions

On the opposite extreme of compacts are actions, where we can fine tune exactly when and how to invoke an action. The action key names the method to call on the view model — `updateStatus: { ifKeyIn: ['count'] }` calls `vm.updateStatus(self)` when `count` changes. Actions can pretty much do what all the other configurable settings described in this page can do, but we need to be explicit, so it is a bit more time consuming to set up.

We can specify lists of properties that are required to be truthy before invoking the action, or properties none of which should be truthy, etc.


## Handlers - Wiring up EventTarget properties to methods

One example of the kind of complexity that roundabouts can handle cleanly is creating subscriptions between one property that is an instance of an EventTarget (or a weak reference to said instance), and a method of the class we want to call when that eventTarget instance changes, again merging in what the action method returns into the view model.  Once again, the [signals](https://github.com/proposal-signals) proposal warns us about the complexity and danger of using pub/sub (such as EventTargets).  This library sees it as a challenge that using declarative syntax can rise to, because it will be sure to do what is needed to [avoid the real disaster](https://jakearchibald.com/2024/garbage-collection-and-closures/) that that proposal warns us about.

### Pattern

```TypeScript
handlers: {
    timeEmitter_to_incTicks_on: 'value-changed'
}
```

This declares: When property `timeEmitter` is set to an EventTarget (or WeakRef), add an event listener for `value-changed`, and when that event fires, invoke method `incTicks`. The method result is automatically merged back into the view model.

### Key Features

- **Automatic Listener Management**: Handlers automatically attach and detach event listeners as the EventTarget property changes
- **WeakRef Support**: Supports both direct EventTarget references and `WeakRef<EventTarget>` for memory safety
- **Result Merging**: Method results are automatically merged back into the view model using assignGingerly
- **Proper Cleanup**: All event listeners are properly cleaned up when the roundabout is disconnected
- **Dynamic Updates**: When the EventTarget property changes, the old listener is removed and a new one is attached

### Example

```TypeScript
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

### WeakRef Support

For memory safety, handlers support WeakRef:

```TypeScript
const emitter = new EventTarget();

const model = {
    emitterRef: new WeakRef(emitter),
    eventCount: 0,
    
    handleEvent(self, event) {
        return { eventCount: self.eventCount + 1 };
    }
};

const [vm, propagator] = await roundabout({
    vm: model,
    handlers: {
        emitterRef_to_handleEvent_on: 'custom-event'
    }
});
```

### Dynamic EventTarget Changes

When the EventTarget property changes, handlers automatically update:

```TypeScript
const emitter1 = new EventTarget();
const emitter2 = new EventTarget();

const model = {
    currentEmitter: emitter1,
    messageCount: 0,
    
    onMessage(self, event) {
        return { messageCount: self.messageCount + 1 };
    }
};

const [vm, propagator] = await roundabout({
    vm: model,
    handlers: {
        currentEmitter_to_onMessage_on: 'message'
    }
});

// Events from emitter1 trigger the handler
emitter1.dispatchEvent(new CustomEvent('message'));

// Change to emitter2 - old listener removed, new one attached
vm.currentEmitter = emitter2;

// Now only emitter2 events trigger the handler
emitter2.dispatchEvent(new CustomEvent('message'));
```

This is demonstrated by the [first web component in the universe to use roundabout](https://github.com/bahrus/time-ticker/blob/baseline/time-ticker.ts).

## Hitches

Whereas "Compacts" allow us to connect *two* members of the view model together, hitches allow us to coordinate *three* members.

```TypeScript

const model = {
    enhancedElement: HTMLElement | WeakRef<HTMLElement>,
    eventProp: 'click',
    ageCount: 23
};
...
hitches:{
    when_enhancedElement_emits_eventProp_inc_ageCount_by: 1,
}
```

## Infractions and Positractions

Infractions and Positractions don't open anything up that couldn't be done with the highly configurable but verbose Actions.  Infractions and Positractions just specialize in some common scenarios, and strive to eliminate boilerplate while continuing to encourage JSON driven configuration (easier to parse) and highly performant reactive analysis, without calling code unnecessarily.

### Infractions

Infractions is a portmanteau of "inferred reactions", where we "parse" the left hand side of the arrow function or method, in order to determine which parameters it depends on.

```Typescript
const calcAgePlus10: PropsToPartialProps<IMoodStoneProps> = ({age}: IMoodStoneProps) => ({agePlus10: age + 10});

const raConfig = {
    infractions: [calcAgePlus10, 'doSearch']
}

export class MoodStone extends HTMLElement implements IMoodStoneActions {
    async connectedCallback() {
        await roundabout({ vm: this, ...raConfig });
    }
    doSearch({searchString}){
        return {
            foundIt: true,
            hereItIs: element
        }
    }
}
```

#### Making it JSON Serializable

It was briefly mentioned before that one of the goals of roundabouts is that they accept as much JSON serializable information as possible.  The config property above isn't serializable as it currently stands.  So to make it JSON serializable, we must burden the developer with an extra step:

```Typescript

const raConfig = {
    infractions: ['calcAgePlus10']
}
const calcAgePlus10: PropsToPartialProps<IMoodStoneProps> = ({age}: IMoodStoneProps) => ({agePlus10: age + 10});

export class MoodStone extends HTMLElement implements IMoodStoneActions {
    calcAgePlus10 = calcAgePlus10;
    
    async connectedCallback() {
        await roundabout({ vm: this, ...raConfig });
    }
}
```

#### Instant gratification

We can go in the opposite direction, away from a disciplined approach of making things JSON serializable, but in the direction of "locality of behavior", and inline the infraction:

```Typescript
const raConfig = {
    infractions: [({age}: IMoodStoneProps) => ({agePlus10: age + 10})]
};
export class MoodStone extends HTMLElement implements IMoodStoneActions {
    async connectedCallback() {
        await roundabout({ vm: this, ...raConfig });
    }
}
```

### Positractions

[![Watch the video](https://img.youtube.com/vi/W7YoxrKa4f0/maxresdefault.jpg)](https://www.youtube.com/watch?v=W7YoxrKa4f0)



Another class of arrow functions roundabout recognizes are "positractions" -- a portmanteau of "positional" and "reactions".  The examples above have relied on linking to functionality that is intimately aware of the structure of the view model.

But much functionality we want to share within an application and even across applications can be written in a purely generic manner, completely viewModel neutral.  For example, suppose we want to reuse a function that takes the maximum of two values and applies it to a third value?  We do so as follows:


```TypeScript

export interface IMoodStoneProps{
    age: number,
    heightInInches: number,
    maxOfAgeAndHeightInInches: number,
}

const raConfig = {
    positractions: [
        {
            ifKeyIn: ['age', 'heightInInches'],
            do: Math.max,
            assignTo: ['maxOfAgeAndHeightInInches']
        }
    ]
}
export class MoodStone extends HTML implements IMoodStoneActions {
    async connectedCallback() {
        await roundabout({ vm: this, ...raConfig });
    }
}

export interface MoodStone extends IMoodStoneProps{}
```

The "positional" part of the name comes from our mapping approach -- the function is expected to return an array of unnamed results (a "tuple"), which we then map to various properties of our view model to assign the result to, based on the position in the assignTo array.  (Note that in this case the function doesn't return an array.  In that case, we treat it as the first element of an imaginary array, for mapping purposes). If a returned element of the tuple can be ignored, simply place a null in that spot of the assignTo array.

By default, the "ifKeyIn" array of property names is passed into the function.  An additional option ("pass"), not shown here, allows us to explicitly list the properties to pass, which may be different from the dependencies we want to trigger the function call on.

#### Making it JSON serializable

Once again, the problem here is we are trying to make  our config as JSON serializable as possible.  To make it serializable, the developer must add a few steps:


```TypeScript

export interface IMoodStoneProps{
    age: number,
    heightInInches: number,
    maxOfAgeAndHeightInInches: number,
}

const raConfig = {
    positractions: [
        {
            ifKeyIn: ['age', 'heightInInches'],
            do: 'max',
            //pass: ['age', 'heightInInches'],
            assignTo: ['maxOfAgeAndHeightInInches']
        }
    ]
}
export class MoodStone extends HTMLElement implements IMoodStoneActions {
    max = Math.max;
    async connectedCallback() {
        await roundabout({ vm: this, ...raConfig });
    }
}

export interface MoodStone extends IMoodStoneProps{}
```



More complex example:  Looping counter

```TypeScript
const getNextValOfLoop = (currentVal: number, from: number,  to: number, step=1, loopIfMax=false)
    : [number | undefined | null, number, number, number, boolean] => {
    let hitMax = false, nextVal = currentVal, startedLoop = false;
    if(currentVal === undefined || currentVal === null || currentVal < from){
        nextVal = from;
        startedLoop = true;
    }else{
        const possibleNextVal = currentVal + step;
        if(possibleNextVal > to){
            
            if(loopIfMax){
                nextVal = from;
            }else{
                hitMax = true;
            }
        }else{
            nextVal = possibleNextVal;
        }
    }
    return [nextVal, hitMax, startedLoop];
    
}

interface TimeTickerEndUserProps{
    /**
     * Loop the time ticker.
     */
    loop: boolean;
    /**
     * Upper bound for idx before being reset to 0
     */
    repeat: boolean;
    enabled: boolean;
    disabled: boolean;
}

interface TimeTickerAllProps extends TimeTickerEndUserProps{
    ticks: number,
    idx: number,
}


export class TimeTicker{
    getNextValOfLoop = getNextValOfLoop;
    static override config: OConfig<TimeTickerAllProps> = {
        positractions: [
            {
                ifAllOf: ['ticks'],
                do: 'getNextValOfLoop',
                pass: ['idx', 0, 'repeat', 1, true],
                assignTo: ['idx', 'disabled', 'enabled']
            }
        ]

        
    }
}
```

For string members of the pass array, if the string resolves to a member of the class, it dynamically passes that value.  Otherwise, it passes the string literal.  To pass a string literal even if there is a member of the class with that name, wrap the string in a template literal:  '`hello`'

To pass self, use '$0'. Exception:  If working with enhancements, which also use roundabouts, use $0 to pass in the element being enhanced, but $0+ to pass in the enhancement.

## Merging Traffic via assignGingerly

The function [assignGingerly](https://github.com/bahrus/assign-gingerly) allows for safe, nested, recursive property setting, and allows for notifying the object containing the nested property that a change was made, no matter how deep.

It does optional chaining access, but in reverse.

The syntax looks like:

```JavaScript
const log = assignGingerly(destObj, {
    myProp1: 'hello',
    '?.myProp2?.mySubProp3': 'goodbye'
});
```

The second setter prop shown above does the equivalent of:

```JavaScript
let log = undefined;
if('assignGingerlyLog' in destObj.assignGingerly){
    log = new Set();
}
if(log){
    log.add('myProp2')
}
if(destObj.myProp2 === undefined){
    destObj.myProp2 = {};
}
if(log){
    log.add('myProp2.mySubProp3');
}
destObj.myProp2.mySubProp3 = 'goodbye';
if(log){
    destObj.assignGingerlyLog = log;
}
```

## Specifying a class to instantiate from when undefined via naming convention

Suppose instead of creating an empty object prototype when referencing a property, we want to instead instantiate a class?  I.e. we want to be able to configure what to do when a property is undefined, in the case that we are merging the object into a custom element, or a custom enhancement, or some other JS class instance.  I.e. we can tweak this part of the code above:

```JavaScript
if(destObj.myProp2 === undefined){
    destObj.myProp2 = {};
}
```

Here's how we can do this.  Suppose destObj is an instance of class DestObj.

We can define myProp2 thusly:

```JavaScript
class DestObj{
    async newMyProp2(): MyPropClass{
        //do some asynchronous work if nessary;
        const returnObj = new MyPropClass();
        await returnObj.doSomeInitializationIfNecessary();
        return returnObj;
    }
    #myProp2 : MyPropClass | undefined;
    get myProp2(){
        return this.#myProp2;
    }
    set myProp2(newVal){
        this.#myProp2 = newVal;
    }
}

```

The thing to note here is that we must (in the absence of a standard decorator built into the platform for this) rely on a specific naming convention between the name of the prop and the method used to instantiate a new instance if that prop is undefined:

myProp2 => newMyProp2. 



So this gets translated to:

```JavaScript
if(destObj.myProp2 === undefined){
    let newInstance;
    if(typeof destObj['newMyProp2'] === 'function'){
        newInstance = await destObj.newMyProp2();
    }else{
        newInstance = {};
    }
    //might have gotten a value during the await
    if(destObj.myProp2 === undefined){
        destObj.myProp2 = newInstance;
    }else{
        assignGingerly(destObj.myProp2, newInstance)
    }
}
```








---

# Reference

## Compacts Reference

Compacts provide a declarative way to connect properties in your view model using naming conventions. The right-hand side value is always the delay in milliseconds (or a property name for `echo_X_to_Y_after`).

### Property Transformation Compacts

#### `negate_X_to_Y`
Negates a boolean value from property X to property Y.

```typescript
compacts: {
    negate_isHappy_to_isNotHappy: 0  // When isHappy changes, isNotHappy = !isHappy
}
```

**Example:**
```javascript
vm.isHappy = false;  // → vm.isNotHappy becomes true
```

---

#### `pass_length_of_X_to_Y`
Passes the `.length` property of X (array or string) to Y.

```typescript
compacts: {
    pass_length_of_data_to_dataLength: 0  // When data changes, dataLength = data.length
}
```

**Example:**
```javascript
vm.data = ['a', 'b', 'c'];  // → vm.dataLength becomes 3
```

---

#### `echo_X_to_Y`
Copies/echoes the value from X to Y with optional delay.

```typescript
compacts: {
    echo_inputValue_to_outputValue: 0,      // Immediate echo
    echo_searchText_to_debouncedSearch: 300 // Echo after 300ms delay
}
```

**Example:**
```javascript
vm.inputValue = 'hello';  // → vm.outputValue becomes 'hello'
```

---

#### `echo_X_to_Y_after`
Echoes value from X to Y, with delay specified by another property.

```typescript
compacts: {
    echo_inputCount_to_inputCountEcho_after: 'debounceInterval'  // Delay from vm.debounceInterval
}
```

**Example:**
```javascript
vm.debounceInterval = 500;
vm.inputCount = 5;  // → vm.inputCountEcho becomes 5 after 500ms
```

---

### Action Invocation Compacts

#### `when_X_changes_call_Y`
Calls method Y whenever property X changes. The method receives `self` as parameter and can return a partial object to merge back into the view model.

```typescript
compacts: {
    when_age_changes_call_throwBirthdayParty: 0  // Call method when age changes
}
```

**Example:**
```javascript
// Method definition
throwBirthdayParty(self) {
    return { partyCount: self.partyCount + 1 };
}

vm.age = 26;  // → throwBirthdayParty() is called, partyCount increments
```

---

### State Mutation Compacts

#### `when_X_changes_toggle_Y`
Toggles boolean property Y whenever X changes.

```typescript
compacts: {
    when_age_changes_toggle_ageChangedToggle: 0  // Toggle on each age change
}
```

**Example:**
```javascript
vm.ageChangedToggle = false;
vm.age = 26;  // → vm.ageChangedToggle becomes true
vm.age = 27;  // → vm.ageChangedToggle becomes false
```

---

#### `when_X_changes_inc_Y_by`
Increments (or decrements) property Y by the specified amount whenever X changes.

```typescript
compacts: {
    when_age_changes_inc_ageChangeCount_by: 1,   // Increment by 1
    when_errors_changes_inc_errorTotal_by: -1    // Decrement by 1 (negative increment)
}
```

**Example:**
```javascript
vm.ageChangeCount = 0;
vm.age = 26;  // → vm.ageChangeCount becomes 1
vm.age = 27;  // → vm.ageChangeCount becomes 2
vm.age = 28;  // → vm.ageChangeCount becomes 3
```

---

#### `when_X_changes_dispatch`
Dispatches a custom event on the propagator when X changes.

```typescript
compacts: {
    when_status_changes_dispatch: 'status-changed'  // Event name
}
```

**Example:**
```javascript
propagator.addEventListener('status-changed', (e) => {
    console.log('Status changed to:', e.value);
});

vm.status = 'active';  // → 'status-changed' event is dispatched on the propagator
```

**RHS value:** The event name to dispatch. If the RHS is a non-empty string, that string is used as the event name. If omitted or falsy, the source property name is used as the event name.

**Event type:** The dispatched event is a `CompactDispatchEvent` with properties:
- `eventName` — the event name string
- `value` — the current value of the source property

---

### Event Listener Compacts

#### `on_EVENT_of_X_inc_Y_by`
Listens for a DOM event on an EventTarget property and increments a target property. Supports both live references and WeakRef-wrapped references. The listener is automatically attached when the element property is set and cleaned up when it changes or is removed.

```typescript
compacts: {
    on_click_of_incrementButton_inc_count_by: 1,    // Increment by 1 on click
    on_click_of_decrementButton_inc_count_by: -1,   // Decrement by 1 on click
}
```

**Example:**
```javascript
vm.incrementButton = document.querySelector('.increment');
// Now clicking the button increments vm.count by 1

vm.incrementButton = anotherButton;
// Old listener removed, new listener attached to anotherButton
```

---

#### `on_EVENT_of_X_set_Y_to`
Listens for a DOM event on an EventTarget property and sets a target property to a fixed value. Supports both live references and WeakRef-wrapped references.

```typescript
compacts: {
    on_click_of_resetButton_set_count_to: 0,        // Reset to 0 on click
    on_click_of_clearButton_set_searchText_to: '',   // Clear text on click
}
```

**Example:**
```javascript
vm.resetButton = document.querySelector('.reset');
// Now clicking the button sets vm.count to 0
```

---

## Quick Reference Table

| Pattern | Purpose | RHS Value | Example |
|---------|---------|-----------|---------|
| `negate_X_to_Y` | Boolean negation | Delay (ms) | `negate_isOpen_to_isClosed: 0` |
| `pass_length_of_X_to_Y` | Array/string length | Delay (ms) | `pass_length_of_items_to_count: 0` |
| `echo_X_to_Y` | Copy value | Delay (ms) | `echo_input_to_output: 0` |
| `echo_X_to_Y_after` | Copy with dynamic delay | Property name | `echo_value_to_delayed_after: 'debounce'` |
| `when_X_changes_call_Y` | Invoke method | Delay (ms) | `when_data_changes_call_process: 0` |
| `when_X_changes_toggle_Y` | Toggle boolean | Delay (ms) | `when_click_changes_toggle_active: 0` |
| `when_X_changes_inc_Y_by` | Increment counter | Amount | `when_event_changes_inc_count_by: 1` |
| `when_X_changes_dispatch` | Fire event | Event name | `when_state_changes_dispatch: 'changed'` |
| `on_EVENT_of_X_inc_Y_by` | Increment on DOM event | Amount | `on_click_of_button_inc_count_by: 1` |
| `on_EVENT_of_X_set_Y_to` | Set value on DOM event | Value to set | `on_click_of_reset_set_count_to: 0` |

---

## Tips

- **Delays**: Use `0` for immediate execution, or specify milliseconds for debouncing
- **Method calls**: Methods receive `self` as parameter and should return `Partial<Props>` to merge
- **Chaining**: Multiple compacts can work together - one compact's output can trigger another
- **Testing**: Each compact type has test examples in `tests/compacts/`

---

## Hitches Reference

Hitches coordinate three members of the view model: an EventTarget element, an event type property, and a target property to modify. They're perfect for connecting DOM events to view model state.

### Pattern

```typescript
hitches: {
    when_X_emits_Y_inc_Z_by: number
}
```

- **X**: Property containing an EventTarget (element or WeakRef<element>)
- **Y**: Property containing the event name (string)
- **Z**: Property to increment
- **Value**: The increment amount (number)

### Basic Example

```typescript
const myObject = {
    button: document.querySelector('#myButton'),
    eventName: 'click',
    clickCount: 0
};

const [vm] = await roundabout({
    vm: myObject,
    propagate: ['clickCount'],
    hitches: {
        when_button_emits_eventName_inc_clickCount_by: 1
    }
});

// Now clicking the button increments clickCount
```

### Dynamic Element Changes

Hitches automatically handle element changes:

```typescript
const myObject = {
    activeButton: button1,  // Start with button1
    eventName: 'click',
    count: 0
};

const [vm] = await roundabout({
    vm: myObject,
    propagate: ['activeButton', 'count'],
    hitches: {
        when_activeButton_emits_eventName_inc_count_by: 1
    }
});

// Clicks on button1 increment count
button1.click();  // count = 1

// Change to button2
vm.activeButton = button2;

// Now clicks on button2 increment count
button2.click();  // count = 2

// button1 clicks no longer affect count
button1.click();  // count still = 2
```

**Behavior:**
- When element property changes, old listener is automatically removed
- New listener is attached to the new element
- If element becomes falsy, listener is removed (no error)

### Dynamic Event Type Changes

Hitches also handle event type changes:

```typescript
const myObject = {
    button: document.querySelector('#myButton'),
    eventType: 'click',  // Start with click
    eventCount: 0
};

const [vm] = await roundabout({
    vm: myObject,
    propagate: ['eventType', 'eventCount'],
    hitches: {
        when_button_emits_eventType_inc_eventCount_by: 1
    }
});

// Clicks increment count
button.click();  // eventCount = 1

// Change to mouseenter
vm.eventType = 'mouseenter';

// Now mouseenter increments count
button.dispatchEvent(new MouseEvent('mouseenter'));  // eventCount = 2

// Clicks no longer affect count
button.click();  // eventCount still = 2
```

### WeakRef Support

Hitches support WeakRef for elements to prevent memory leaks:

```typescript
const myObject = {
    elementRef: new WeakRef(document.querySelector('#myElement')),
    eventName: 'click',
    count: 0
};

const [vm] = await roundabout({
    vm: myObject,
    hitches: {
        when_elementRef_emits_eventName_inc_count_by: 1
    }
});

// WeakRef is automatically dereferenced
// If element is garbage collected, listener is cleaned up
```

### Cleanup

Hitches automatically clean up listeners:

```typescript
const [vm, propagator] = await roundabout({
    vm: myObject,
    hitches: { /* ... */ }
});

// Later, when done:
vm.RAController.abort();  // All hitch listeners are removed
```

### Use Cases

**Click counters:**
```typescript
hitches: {
    when_button_emits_click_inc_clickCount_by: 1
}
```

**Multi-button interfaces:**
```typescript
// Track which button is active
hitches: {
    when_activeButton_emits_click_inc_actionCount_by: 1
}
```

**Different event types:**
```typescript
// Switch between click, mouseenter, focus, etc.
hitches: {
    when_element_emits_eventType_inc_interactionCount_by: 1
}
```

**Custom increments:**
```typescript
// Increment by different amounts
hitches: {
    when_button_emits_click_inc_score_by: 10
}
```

### Error Handling

Hitches handle edge cases gracefully:

- **Element is falsy**: Listener removed, no error
- **Element is not EventTarget**: Error logged to console, no crash
- **Event type is falsy**: Listener removed, no error
- **Target property not a number**: Initialized to increment value

### Quick Reference

| Component | Type | Purpose |
|-----------|------|---------|
| X (element) | EventTarget or WeakRef | Element to listen to |
| Y (event) | string | Event type name |
| Z (target) | number | Property to increment |
| Value | number | Increment amount |

**Pattern**: `when_X_emits_Y_inc_Z_by: number`

**Testing**: See `tests/hitches/` for comprehensive examples.

---

## Yields Reference

Yields derive a value from a collection using an index (or in the future, a key). When the source collection or the selector property changes, the target property is automatically recomputed.

### Scenario I: Single Selection by Index

Select one item from an array by index. When either the array or the index changes, the target is updated.

```javascript
const [vm] = await roundabout({
    vm: {
        items: ['apple', 'banana', 'cherry'],
        idx: 0,
        item: undefined,
    },
    yields: {
        item: { from: 'items', atIndex: 'idx' }
    }
});

// item is immediately computed as 'apple' (items[0])

vm.idx = 2;
// → vm.item becomes 'cherry'

vm.items = ['x', 'y', 'z'];
// → vm.item becomes 'z' (items[2])

vm.idx = 10;
// → vm.item becomes undefined (out of bounds)
```

### Configuration

```typescript
yields: {
    [targetProp: string]: {
        from: string;              // Source array property name
        atIndex?: string;          // Index property name
        outOfBounds?: 'undefined'  // What to do when index is out of bounds:
                    | 'clamp';     //   'undefined' (default): set target to undefined
                                   //   'clamp': reset index to 0, select first item
        // Future: atKey, atIndices, keyProp, etc.
    }
}
```

### Behavior

- **Initial computation**: The target is computed immediately when yields are processed (no need to trigger a change first).
- **One-way**: Changing the target property directly does NOT update the index. The flow is strictly `array + index → item`.
- **Out of bounds (default)**: If the index is negative, non-numeric, or >= array length, the target is set to `undefined`.
- **Out of bounds (clamp)**: If the index is out of bounds, it's reset to 0 and the first item is selected. Useful for UI scenarios where "no selection" isn't valid.
- **Null/undefined source**: If the source array is not an array or is empty, the target is set to `undefined`.

### Future Expansion

The config shape is designed to accommodate additional selection modes:

```javascript
// Key-based lookup (future)
yields: {
    selectedUser: { from: 'users', atKey: 'selectedId', keyProp: 'id' }
}

// Multi-select by indices (future)
yields: {
    selectedItems: { from: 'items', atIndices: 'selectedIndices' }
}
```

---

## Merges Reference

Merges are fully JSON-serializable reactive rules. When their conditions are met, they resolve RHS path strings against the view model and assign the results into the view model using `assignFrom` from assign-gingerly. No methods or code required.

### Pattern

```typescript
merges: [
    {
        ifKeyIn: ['username'],       // Standard LogicOp conditions
        ifAllOf: ['clone'],
        assign: {                    // LHS = target path, RHS = source path resolved against vm
            '?.clone?.q?..username?.textContent': '?.username'
        }
    }
]
```

### How it works

Each merge entry has:
- **Conditions** (`ifKeyIn`, `ifAllOf`, `ifNoneOf`, etc.) — same as actions, determines when the merge fires
- **`assign`** — an object where keys are assignGingerly LHS paths (targets) and values are `?.`-prefixed path strings resolved against the view model (sources). Non-path values pass through as literals.

When conditions are met, roundabout calls `assignFrom(vm, assign, { from: vm, ...assignGingerlyOptions })`, which:
1. Resolves each RHS `?.` path against the vm
2. Assigns the resolved values into the vm using assignGingerly

### Examples

**Simple property-to-DOM binding:**
```typescript
merges: [
    {
        ifKeyIn: ['username'],
        ifAllOf: ['clone'],
        assign: {
            '?.clone?.q?..username?.textContent': '?.username'
        }
    }
]
```

**Multiple assignments in one merge:**
```typescript
merges: [
    {
        ifKeyIn: ['statusClassName', 'statusMessageText'],
        ifAllOf: ['clone'],
        assign: {
            '?.clone?.q?..status?.className': '?.statusClassName',
            '?.clone?.q?..status-text?.textContent': '?.statusMessageText',
        }
    }
]
```

**Literal values (non-path RHS):**
```typescript
merges: [
    {
        ifKeyIn: ['count'],
        ifAllOf: ['clone'],
        assign: {
            '?.clone?.q?..count-value?.textContent': '?.count',
            renderCount: 1,  // Literal value, not a path
        }
    }
]
```

**Method invocation via assignGingerly:**
```typescript
merges: [
    {
        ifAllOf: ['template'],
        assign: {
            clone: '?.template?.content?.cloneNode?.true'
        }
    },
    {
        ifAllOf: ['renderCount'],
        assign: {
            '?.appendChild': '?.clone',
            clone: '?.',  // Resolves to the vm itself
        }
    }
]
```

### Key points

- Merges inherit `assignGingerlyOptions` from the roundabout config (e.g., `withMethods`, `aka`)
- RHS strings starting with `?.` are resolved as paths against the vm; all other values pass through as-is
- Merges use the same condition evaluation as actions (`ifKeyIn` fires on every change, others fire on transition)
- The `delay` and `debug` options from `LogicOp` are supported

### Advanced: Handlers, Template Looping, and Inferred Assignments

Merges use `assignFrom` under the hood, which supports powerful handler patterns beyond simple property assignment. These enable fully declarative template rendering, conditional display, and data distribution — all JSON-serializable, no imperative code needed.

#### Template Looping with `builtIns.manageTemplateList`

Render a list from an array by cloning a template for each item, with keyed reconciliation for efficient updates:

```html
<template id="user-row">
    <tr itemscope="UserRow">
        <td itemprop="name"></td>
        <td itemprop="email"></td>
    </tr>
</template>
<table><tbody id="user-list"></tbody></table>
```

```javascript
merges: [
    {
        ifKeyIn: ['users'],
        assign: {
            '?.userListElement =>': {
                do: 'builtIns.manageTemplateList',
                resolve: {
                    forEach: '?.users',
                    instantiate: 'globalThis://user-row',
                },
                fromEachItem: {
                    assignToFragment: { '?.querySelector?.tr?.ish': '?.' },
                    withOptions: {
                        withMethods: ['querySelector'],
                        infer: { byItemprop: true }
                    },
                    resolve: { key: '?.id' }
                }
            }
        }
    }
]
```

Key features:
- **Keyed reconciliation** — items matched by `key` field; new items are cloned, removed items are hidden/deleted, existing items are updated in place (no re-cloning)
- **Batched DOM insertion** — all clones are assembled in a DocumentFragment and inserted in one operation
- **`waitForSettled`** — optionally waits for async work (itemscope managers, enhancements) before inserting into the live DOM
- **`yieldEvery`** — yields to the browser event loop periodically for very large lists (prevents jank)
- **Performance** — benchmarks show 2-23x faster than vanilla JS for large list creation, competitive with framework rendering

#### Inferred Assignments with `infer`

Instead of writing explicit paths for every DOM element, let the system distribute values based on structural conventions:

```javascript
merges: [
    {
        ifKeyIn: ['name', 'email', 'joinDate'],
        assign: {
            '?.querySelector?.[itemscope]?.ish': '?.'
        }
    }
]
```

Or use `infer` in the `assignGingerlyOptions`:

```html
<div itemscope>
    <span itemprop="name"></span>
    <input itemprop="email" type="email">
    <time itemprop="joinDate"></time>
</div>
```

The inferencer automatically determines the correct property for each element type:
- `<input type="text">` → `value`
- `<input type="checkbox">` → `checked`
- `<time>` → `dateTime`
- `<a>` → `href`
- Elements with `itemscope` → `ish` (routes to itemscope manager)
- Other elements → `textContent`

**Scope perimeter** is respected — elements inside nested `[itemscope]` boundaries are excluded (donut-hole scoping).

#### Looped Substitution with `where_x_in`

Expand a single pattern into multiple assignments using template variables:

```javascript
merges: [
    {
        ifKeyIn: ['firstName', 'lastName'],
        assign: {
            '?.[name="${x}"]': '?.${x}'
        },
        // resolves to two assignments: [name="firstName"] and [name="lastName"]
    }
]
// with assignGingerlyOptions: { where_x_in: ['firstName', 'lastName'] }
```

Multiple variables produce a cartesian product — `where_x_in` × `where_y_in` × `where_z_in`.

#### Cached Element Resolution with `#[x]` and `withIds`

For reactive merges that repeatedly update the same DOM elements, `querySelector` on every cycle is wasteful. The `#[x]` syntax provides cached element references via `WeakRef` — near-zero-cost repeated access (~10ns) vs expensive queries (~3,000-17,000ns at scale):

```javascript
merges: [
    {
        ifKeyIn: ['greeting'],
        assign: {
            '#[main]?.textContent': '?.greeting'
        }
    },
    {
        ifKeyIn: ['showContent'],
        assign: {
            '#[main] =>': {
                do: 'builtIns.lazyLoad',
                resolve: { if: '?.showContent', instantiate: 'globalThis://myTemplate' }
            }
        }
    }
]
// with assignGingerlyOptions: { withIds: { main: { qry: '.mainView' } } }
```

On first encounter, the element is found via `querySelector`, auto-assigned an ID if it doesn't have one, and cached as a `WeakRef`. Subsequent merge cycles resolve in ~10ns via the cache. GC-safe — if the element is collected, it falls back to `getElementById`.

Two forms:
- `withIds: { x: { qry: '.myClass' } }` — find by selector, auto-assign ID, cache
- `withIds: { x: 'existingId' }` — element already has an ID, just cache it

#### Conditional display with `builtIns.lazyLoad`

Conditionally render templates based on view model state:

```javascript
merges: [
    {
        ifKeyIn: ['activeView'],
        assign: {
            '?.viewContainer =>': {
                do: 'builtIns.lazyLoad',
                resolve: {
                    if: '?.isSettingsVisible',
                    instantiate: 'globalThis://settingsTemplate'
                }
            }
        }
    }
]
```

#### What this means for roundabout

Since merges call `assignFrom` with the full power of its handler system, a roundabout merge can declaratively express:

- **Template-driven list rendering** from an array property — re-renders reactively when the array changes
- **Automatic DOM binding** via microdata (`itemprop`) conventions — no manual path strings per element
- **Conditional display** — show/hide template content based on VM state
- **Cached element references** via `#[x]` + `withIds` — near-zero-cost repeated DOM access in reactive cycles
- **Form binding** via `where_x_in` loop expansion — bind multiple form fields with one pattern
- **Nested composition** — itemscope managers receive data via `ish`, enabling recursive component patterns

All of this is JSON-serializable and reactive — roundabout evaluates conditions, `assignFrom` handles the rendering. No imperative code, no virtual DOM, no framework runtime.

For full documentation see:
- [assignFrom reference](https://github.com/bahrus/assign-gingerly/blob/baseline/docs/assignFrom.md)
- [manageTemplateList](https://github.com/bahrus/assign-gingerly/blob/baseline/docs/manage-template-list.md)
- [inferred assignments](https://github.com/bahrus/assign-gingerly/blob/baseline/docs/inferred-assignments.md)
- [paths DX utilities](https://github.com/bahrus/assign-gingerly/blob/baseline/docs/paths-dx.md)

### Type-safe path authoring with `paths.js`

Writing `?.clone?.q?..status?.className` strings by hand is error-prone. The [assign-gingerly `paths.js`](https://github.com/bahrus/assign-gingerly/blob/baseline/docs/paths-dx.md) module provides utilities for type-safe, IDE-friendly authoring of merge configs.

```typescript
import { paths, set, doAssign, smoothOver } from 'assign-gingerly/paths.js';

interface MyVM extends HTMLElement {
    clone: DocumentFragment;
    username: string;
    count: number;
    statusClassName: string;
    template: HTMLTemplateElement;
}

const aka = { q: 'querySelector' };
const withMethods = ['querySelector', 'appendChild', 'cloneNode'];
const $ = paths<MyVM>({ aka, withMethods });
```

**Property access** produces path strings:
```typescript
$.username.path   // '?.username'
$.clone.path      // '?.clone'
```

**Method calls** use real syntax — aliases are applied automatically:
```typescript
$.clone.querySelector('.status').className.path
// '?.clone?.q?..status?.className'

$.template.content.cloneNode(true).path
// '?.template?.content?.cloneNode?.true'
```

**`set(lhs).to(rhs)`** produces assignment pairs:
```typescript
set($.clone.querySelector('.username').textContent).to($.username)
// { '?.clone?.q?..username?.textContent': '?.username' }
```

**`doAssign(...pairs)`** merges multiple assignments into `{ assign: {...} }`:
```typescript
{
    ifKeyIn: ['statusClassName'],
    ifAllOf: ['clone'],
    ...doAssign(
        set($.clone.querySelector('.status').className).to($.statusClassName),
        set($.clone.querySelector('.status-text').textContent).to($.statusMessageText),
    )
}
```

**`smoothOver(value)`** recursively converts all proxies in a structure to path strings:
```typescript
merges: smoothOver([
    { ifAllOf: ['template'], assign: { clone: $.template.content.cloneNode(true) } },
    { ifAllOf: ['clone'], assign: { incrementButton: $.clone.querySelector('.increment') } },
])
```

Benefits:
- Full IDE autocomplete on VM property names
- Compile-time errors for typos (`$.usernam` → TS error)
- Method call syntax reads like real code
- Aliases applied automatically (`querySelector` → `q` in output)
- Output is the same JSON as hand-written configs

See the [full documentation](https://github.com/bahrus/assign-gingerly/blob/baseline/docs/paths-dx.md) for additional utilities like `sp` (split-join templates) and `md` (microdata templates).

---

## Infractions Reference

Infractions (short for "inferred reactions") automatically determine dependencies by parsing function parameters. Instead of explicitly declaring which properties trigger a reaction, infractions infer them from destructured parameters.

### Pattern

```typescript
const [vm] = await roundabout({
    vm: myObject,
    // ... other options
}, [
    // Array of functions or method names
    ({age}) => ({agePlus10: age + 10}),
    'doSearch',
    myFunction
]);
```

### Three Ways to Define Infractions

#### 1. Inline Functions (Instant Gratification)

Most direct - define the function right in the infractions array:

```typescript
const [vm] = await roundabout({
    vm: {
        age: 25,
        agePlus10: 0
    },
    propagate: ['age', 'agePlus10']
}, [
    // Infers dependency on 'age' from parameter
    ({age}) => ({agePlus10: age + 10})
]);

vm.age = 30;  // Automatically updates agePlus10 to 40
```

**Pros**: Locality of behavior, easy to understand
**Cons**: Not JSON serializable

#### 2. Method Names (JSON Serializable)

Reference methods by name as strings:

```typescript
class MyViewModel {
    searchString = '';
    foundIt = false;
    
    doSearch({searchString}) {
        return {
            foundIt: searchString.length > 0,
            results: searchString.split(' ')
        };
    }
}

const instance = new MyViewModel();

const [vm] = await roundabout({
    vm: instance,
    propagate: ['searchString', 'foundIt', 'results']
}, [
    'doSearch'  // Reference by name
]);
```

**Pros**: JSON serializable, clean separation
**Cons**: Extra indirection

#### 3. Function References

Define functions separately and reference them:

```typescript
const calcAgePlus10 = ({age}) => ({agePlus10: age + 10});

class MyViewModel {
    age = 25;
    agePlus10 = 0;
    
    // Assign to instance for JSON serialization
    calcAgePlus10 = calcAgePlus10;
}

const instance = new MyViewModel();

const [vm] = await roundabout({
    vm: instance,
    propagate: ['age', 'agePlus10']
}, [
    calcAgePlus10  // Direct reference
    // OR: 'calcAgePlus10'  // By name (JSON serializable)
]);
```

**Pros**: Reusable, testable, can be JSON serializable
**Cons**: Requires assignment to instance for serialization

### Multiple Dependencies

Infractions automatically detect all destructured parameters:

```typescript
const [vm] = await roundabout({
    vm: {
        width: 10,
        height: 20,
        area: 0,
        perimeter: 0
    },
    propagate: ['width', 'height', 'area', 'perimeter']
}, [
    // Depends on BOTH width and height
    ({width, height}) => ({
        area: width * height,
        perimeter: 2 * (width + height)
    })
]);

vm.width = 15;   // Recalculates area and perimeter
vm.height = 25;  // Also recalculates area and perimeter
```

### How It Works

1. **Parameter Parsing**: Extracts property names from destructured parameters
2. **Reaction Registration**: Registers reactions for each detected property
3. **Initial Execution**: Runs immediately on initialization
4. **Automatic Updates**: Runs whenever any dependency changes

**Example parsing:**
```typescript
({age}) => ...              // Detects: ['age']
({width, height}) => ...    // Detects: ['width', 'height']
({a, b, c}) => ...          // Detects: ['a', 'b', 'c']
```

### Function Signature

Infraction functions receive the view model and return partial updates:

```typescript
type InfractionFn<TProps> = (props: TProps) => Partial<TProps> | Promise<Partial<TProps>>
```

**Parameters:**
- Destructured properties from view model

**Return value:**
- `Partial<Props>` - Merged back into VM via `assignGingerly`
- Supports both sync and async functions

**Example:**
```typescript
({searchString, filters}) => {
    const results = performSearch(searchString, filters);
    return {
        results,
        resultCount: results.length,
        searchedAt: Date.now()
    };
}
```

### Async Support

Infractions support async functions:

```typescript
const [vm] = await roundabout({
    vm: {
        userId: null,
        userData: null,
        loading: false
    },
    propagate: ['userId', 'userData', 'loading']
}, [
    async ({userId}) => {
        if (!userId) return { userData: null, loading: false };
        
        return { loading: true };
    },
    async ({userId}) => {
        if (!userId) return {};
        
        const data = await fetchUser(userId);
        return {
            userData: data,
            loading: false
        };
    }
]);
```

### Comparison with Actions

| Feature | Infractions | Actions |
|---------|-------------|---------|
| **Dependency Declaration** | Inferred from params | Explicit (ifKeyIn, etc.) |
| **Syntax** | Function parameters | Configuration object |
| **Conditional Logic** | Manual (in function) | Built-in (ifAllOf, etc.) |
| **JSON Serializable** | With method names | Yes |
| **Best for** | Simple calculations | Complex conditional logic |
| **Learning Curve** | Lower | Higher |

**When to use Infractions:**
- Simple derived properties
- Calculations based on multiple inputs
- When dependencies are obvious from code
- Prefer concise, functional style

**When to use Actions:**
- Complex conditional logic
- Need multiple condition types
- Transition-based triggers
- Need debugging support

### Use Cases

**Derived calculations:**
```typescript
[
    ({price, quantity}) => ({total: price * quantity}),
    ({total, taxRate}) => ({totalWithTax: total * (1 + taxRate)})
]
```

**Data transformation:**
```typescript
[
    ({rawData}) => ({
        processedData: rawData.map(transform),
        dataCount: rawData.length
    })
]
```

**Search/filter:**
```typescript
[
    ({items, searchQuery}) => ({
        filteredItems: items.filter(item => 
            item.name.includes(searchQuery)
        )
    })
]
```

**Validation:**
```typescript
[
    ({email, password}) => ({
        isValid: email.includes('@') && password.length >= 8,
        errors: validateForm({email, password})
    })
]
```

### Tips

- **Keep functions pure**: Avoid side effects, return new state
- **Use descriptive names**: Make dependencies clear
- **Test separately**: Infraction functions are easy to unit test
- **Combine with actions**: Use infractions for calculations, actions for complex logic
- **Initial execution**: Remember infractions run immediately on initialization

### Quick Reference

**Inline function:**
```typescript
[({age}) => ({agePlus10: age + 10})]
```

**Method name:**
```typescript
['doSearch']
```

**Function reference:**
```typescript
[calcAgePlus10]
```

**Multiple dependencies:**
```typescript
[({width, height}) => ({area: width * height})]
```

**Async:**
```typescript
[async ({userId}) => {
    const data = await fetchUser(userId);
    return {userData: data};
}]
```

**Testing**: See `tests/infractions/` for comprehensive examples.

---

## Positractions Reference

Positractions (short for "positional reactions") enable calling generic, view-model-neutral functions with positional parameters and assigning results by position. Perfect for reusing pure functions across applications.

### Pattern

```typescript
positractions: [
    {
        ifKeyIn: ['prop1', 'prop2'],     // Dependencies
        do: functionOrMethodName,         // Function to call
        pass: ['prop1', 'prop2', literal], // Arguments (optional)
        assignTo: ['result1', 'result2']  // Where to assign results
    }
]
```

### Basic Example

Use any generic function without coupling it to your view model:

```typescript
const [vm] = await roundabout({
    vm: {
        age: 25,
        heightInInches: 68,
        maxOfAgeAndHeightInInches: 0
    },
    propagate: ['age', 'heightInInches', 'maxOfAgeAndHeightInInches'],
    positractions: [
        {
            ifKeyIn: ['age', 'heightInInches'],
            do: Math.max,  // Generic function - no view model knowledge
            assignTo: ['maxOfAgeAndHeightInInches']
        }
    ]
});

vm.age = 75;  // maxOfAgeAndHeightInInches automatically becomes 75
```

### Key Concepts

#### 1. Positional Parameters

By default, `ifKeyIn` properties are passed as arguments in order:

```typescript
{
    ifKeyIn: ['width', 'height'],
    do: Math.max,
    // Calls: Math.max(vm.width, vm.height)
    assignTo: ['maxDimension']
}
```

#### 2. Positional Results

Results are assigned by position. Non-array results are treated as single-element arrays:

```typescript
{
    ifKeyIn: ['value'],
    do: (x) => x * 2,  // Returns single value
    assignTo: ['doubled']  // Assigned to first position
}

{
    ifKeyIn: ['value'],
    do: (x) => [x * 2, x * 3],  // Returns array
    assignTo: ['doubled', 'tripled']  // Assigned by position
}
```

#### 3. Custom Pass Parameters

Override which arguments to pass and in what order:

```typescript
function calculateRange(min, max, multiplier) {
    const range = max - min;
    return [range, range * multiplier];
}

{
    ifKeyIn: ['minValue', 'maxValue'],  // Dependencies
    do: calculateRange,
    pass: ['minValue', 'maxValue', 2],  // Arguments: props + literal
    assignTo: ['range', 'scaledRange']
}
```

### Pass Parameter Types

The `pass` array supports multiple value types:

#### Property Names (strings)
```typescript
pass: ['age', 'height']
// Passes: vm.age, vm.height
```

#### Literal Numbers
```typescript
pass: ['value', 10, 2.5]
// Passes: vm.value, 10, 2.5
```

#### Literal Booleans
```typescript
pass: ['enabled', true, false]
// Passes: vm.enabled, true, false
```

#### String Literals (with backticks)
```typescript
pass: ['name', '`hello`']
// Passes: vm.name, "hello" (literal string)
```

#### Self Reference
```typescript
pass: ['$0']
// Passes: vm (the view model itself)
```

#### Enhancement Reference
```typescript
pass: ['$0+']
// Passes: enhancement (for enhanced elements)
```

### String Resolution Rules

For string values in `pass`:

1. **If property exists on VM**: Pass property value
2. **If property doesn't exist**: Pass as string literal
3. **To force string literal**: Wrap in backticks: `` '`hello`' ``

```typescript
const vm = {
    name: 'John',
    greeting: 'Hello'
};

pass: ['name']        // Passes: 'John' (property value)
pass: ['missing']     // Passes: 'missing' (string literal)
pass: ['`name`']      // Passes: 'name' (forced literal)
```

### Skipping Results with Null

Use `null` in `assignTo` to skip unwanted results:

```typescript
function calculateStats(value) {
    return [
        value * 2,      // doubled
        value * value,  // squared
        value + 10      // plus10
    ];
}

{
    ifKeyIn: ['inputValue'],
    do: calculateStats,
    pass: ['inputValue'],
    assignTo: ['doubled', null, 'plus10']  // Skip squared
}
```

### Conditional Execution

Use `ifAllOf` for conditional execution:

```typescript
{
    ifAllOf: ['enabled', 'ready'],  // Only execute when both truthy
    ifKeyIn: ['value'],              // But monitor value changes
    do: processValue,
    assignTo: ['result']
}
```

### Method Names (JSON Serializable)

Reference methods by name for JSON serializability:

```typescript
class MyViewModel {
    minValue = 10;
    maxValue = 50;
    range = 0;
    
    calculateRange = (min, max, multiplier) => {
        return [(max - min), (max - min) * multiplier];
    };
}

const [vm] = await roundabout({
    vm: new MyViewModel(),
    positractions: [
        {
            ifKeyIn: ['minValue', 'maxValue'],
            do: 'calculateRange',  // Reference by name
            pass: ['minValue', 'maxValue', 2],
            assignTo: ['range', 'scaledRange']
        }
    ]
});
```

### Complex Example: Loop Counter

```typescript
function getNextValOfLoop(currentVal, from, to, step = 1, loopIfMax = false) {
    let hitMax = false;
    let nextVal = currentVal;
    let startedLoop = false;
    
    if (currentVal === undefined || currentVal === null || currentVal < from) {
        nextVal = from;
        startedLoop = true;
    } else {
        const possibleNextVal = currentVal + step;
        if (possibleNextVal > to) {
            if (loopIfMax) {
                nextVal = from;
            } else {
                hitMax = true;
            }
        } else {
            nextVal = possibleNextVal;
        }
    }
    
    return [nextVal, hitMax, startedLoop];
}

class TimeTicker {
    ticks = 0;
    idx = 0;
    repeat = 10;
    disabled = false;
    enabled = false;
    
    getNextValOfLoop = getNextValOfLoop;
}

const [vm] = await roundabout({
    vm: new TimeTicker(),
    positractions: [
        {
            ifAllOf: ['ticks'],
            do: 'getNextValOfLoop',
            pass: ['idx', 0, 'repeat', 1, true],
            assignTo: ['idx', 'disabled', 'enabled']
        }
    ]
});
```

### Async Support

Positractions support async functions:

```typescript
async function fetchAndProcess(userId) {
    const data = await fetch(`/api/users/${userId}`);
    const json = await data.json();
    return [json, json.name, json.email];
}

{
    ifKeyIn: ['userId'],
    do: fetchAndProcess,
    pass: ['userId'],
    assignTo: ['userData', 'userName', 'userEmail']
}
```

### Comparison with Other Features

| Feature | Positractions | Infractions | Actions |
|---------|---------------|-------------|---------|
| **Function Type** | Generic/pure | View model aware | View model aware |
| **Parameters** | Positional | Destructured | N/A |
| **Results** | Positional array | Object merge | Object merge |
| **Reusability** | High (generic) | Medium | Low |
| **JSON Serializable** | With method names | With method names | Yes |
| **Best for** | Pure functions | Calculations | Complex logic |

**When to use Positractions:**
- Reusing generic functions (Math.max, custom utilities)
- Pure functions without view model coupling
- Functions that return multiple values
- Need positional parameter control

**When to use Infractions:**
- Functions aware of view model structure
- Prefer destructured parameters
- Single or object return values

**When to use Actions:**
- Complex conditional logic
- Need multiple condition types
- Transition-based triggers

### Use Cases

**Generic math operations:**
```typescript
{
    ifKeyIn: ['a', 'b'],
    do: Math.max,
    assignTo: ['maximum']
}
```

**String manipulation:**
```typescript
{
    ifKeyIn: ['text'],
    do: (str) => [str.toUpperCase(), str.toLowerCase(), str.length],
    assignTo: ['upper', 'lower', 'length']
}
```

**Array operations:**
```typescript
{
    ifKeyIn: ['items'],
    do: (arr) => [arr.length, arr[0], arr[arr.length - 1]],
    assignTo: ['count', 'first', 'last']
}
```

**Custom calculations:**
```typescript
function calculateStats(values) {
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const max = Math.max(...values);
    return [sum, avg, max];
}

{
    ifKeyIn: ['values'],
    do: calculateStats,
    assignTo: ['sum', 'average', 'maximum']
}
```

### Tips

- **Keep functions pure**: No side effects, just transformations
- **Return arrays for multiple results**: Or single value for one result
- **Use null to skip**: Don't assign unwanted results
- **Leverage generics**: Reuse functions across different view models
- **Test separately**: Pure functions are easy to unit test
- **Mix with other features**: Combine with actions, infractions, compacts

### Quick Reference

**Basic:**
```typescript
{
    ifKeyIn: ['a', 'b'],
    do: Math.max,
    assignTo: ['max']
}
```

**Custom pass:**
```typescript
{
    ifKeyIn: ['value'],
    do: myFunction,
    pass: ['value', 10, true],
    assignTo: ['result']
}
```

**Multiple results:**
```typescript
{
    ifKeyIn: ['input'],
    do: (x) => [x * 2, x * 3],
    assignTo: ['doubled', 'tripled']
}
```

**Skip result:**
```typescript
{
    ifKeyIn: ['input'],
    do: (x) => [x, x * 2, x * 3],
    assignTo: ['value', null, 'tripled']  // Skip middle
}
```

**Method name:**
```typescript
{
    ifKeyIn: ['a', 'b'],
    do: 'myMethod',
    assignTo: ['result']
}
```

**Testing**: See `tests/positractions/` for comprehensive examples.

---


## Actions Reference

Actions provide fine-grained control over when and how methods are invoked. Unlike compacts which use naming conventions, actions use explicit conditional logic.

### Basic Structure

```typescript
actions: {
    methodName: {
        // Conditional logic (all are AND-ed together)
        ifAllOf?: string | string[],
        ifKeyIn?: string | string[],
        ifNoneOf?: string | string[],
        ifEquals?: string[],
        ifAtLeastOneOf?: string | string[],
        ifNotAllOf?: string | string[],
        
        // Execution options
        delay?: number,
        debug?: boolean,
        do?: Function | string | ((props) => Partial<Props>)
    }
}
```

### Conditional Logic Options

#### `ifAllOf`
Execute only when ALL specified properties are truthy.

```typescript
actions: {
    validateForm: {
        ifAllOf: ['username', 'password', 'email']
    }
}
```

**Behavior**: 
- Triggers only on transition to "all conditions met"
- Won't trigger again until at least one becomes falsy, then all become truthy again

**Example:**
```javascript
vm.username = 'john';     // Not triggered (password, email still falsy)
vm.password = 'secret';   // Not triggered (email still falsy)
vm.email = 'john@ex.com'; // → validateForm() called (all now truthy)
vm.username = 'jane';     // Not triggered (already all truthy)
```

---

#### `ifKeyIn`
Execute whenever ANY of the specified properties change.

```typescript
actions: {
    recalculate: {
        ifKeyIn: ['width', 'height', 'depth']
    }
}
```

**Behavior**:
- Triggers on EVERY change to monitored properties
- Also triggers on initialization if properties are defined

**Example:**
```javascript
// Initial: recalculate() called
vm.width = 15;   // → recalculate() called
vm.height = 25;  // → recalculate() called
vm.depth = 35;   // → recalculate() called
```

---

#### `ifNoneOf`
Execute only when NONE of the specified properties are truthy.

```typescript
actions: {
    showEmptyState: {
        ifNoneOf: ['data', 'loading', 'error']
    }
}
```

**Behavior**:
- Triggers when transitioning to "all falsy"
- Won't trigger again until at least one becomes truthy, then all become falsy again

**Example:**
```javascript
// Initial: all falsy → showEmptyState() called
vm.loading = true;   // Condition no longer met
vm.loading = false;  // → showEmptyState() called (all falsy again)
```

---

#### `ifEquals`
Execute when all specified properties have equal values.

```typescript
actions: {
    confirmMatch: {
        ifEquals: ['password', 'confirmPassword']
    }
}
```

**Behavior**:
- Triggers when transitioning to "all equal"
- Uses strict equality (`===`)

**Example:**
```javascript
vm.password = 'secret123';
vm.confirmPassword = 'different';  // Not triggered (not equal)
vm.confirmPassword = 'secret123';  // → confirmMatch() called (now equal)
```

---

#### `ifAtLeastOneOf`
Execute when AT LEAST ONE of the specified properties is truthy.

```typescript
actions: {
    handleError: {
        ifAtLeastOneOf: ['networkError', 'validationError', 'serverError']
    }
}
```

**Behavior**:
- Triggers when transitioning from "all falsy" to "at least one truthy"

---

#### `ifNotAllOf`
Execute when NOT ALL properties are truthy (at least one is falsy).

```typescript
actions: {
    showIncompleteWarning: {
        ifNotAllOf: ['step1Complete', 'step2Complete', 'step3Complete']
    }
}
```

**Behavior**:
- Triggers when transitioning to "not all truthy"
- Opposite of `ifAllOf`

---

### Combining Conditions

Multiple conditions can be used together and are AND-ed:

```typescript
actions: {
    checkAccess: {
        ifAllOf: ['isLoggedIn', 'hasPermission'],  // Must be logged in AND have permission
        ifKeyIn: ['resourceId']                     // AND resourceId must change
    }
}
```

**Behavior**: All conditions must be satisfied for the action to execute.

---

### Execution Options

#### `delay`
Debounce execution by specified milliseconds.

```typescript
actions: {
    search: {
        ifKeyIn: ['searchQuery'],
        delay: 300  // Wait 300ms after last change
    }
}
```

---

#### `debug`
Enable console logging for debugging.

```typescript
actions: {
    complexCalculation: {
        ifAllOf: ['x', 'y', 'z'],
        debug: true  // Logs condition checks and execution
    }
}
```

---

#### `do` (discouraged for actions)

The `do` property exists on the shared `LogicOp` type but is primarily intended for **positractions**, where you call generic functions that don't live on the view model. For actions, the action key itself is the method name — using `do` adds unnecessary indirection:

```typescript
// ✅ Preferred: action key = method name
actions: {
    processData: {
        ifKeyIn: ['data']
    }
}

// ❌ Discouraged: using do to alias the method
actions: {
    onDataChange: {
        ifKeyIn: ['data'],
        do: 'processData'
    }
}
```

---

### Method Signature

Action methods receive two parameters:

```typescript
methodName(self: VM, context: ActionContext): Partial<Props> | void
```

**Parameters:**
- `self` - The view model instance
- `context` - Object with:
  - `rule` - The action key that triggered this call
  - `changedProperty` - The property that changed

**Return value:**
- `Partial<Props>` - Merged back into VM via `assignGingerly`
- `void` - No merge, side effects only
- Supports both sync and async methods

**Example:**
```typescript
validateForm(self, context) {
    console.log(`Triggered by: ${context.changedProperty}`);
    return {
        isValid: self.username && self.password && self.email,
        validatedAt: Date.now()
    };
}
```

---

### Initial Evaluation

Actions are evaluated once on initialization:

```typescript
const [vm] = await roundabout({
    vm: { username: 'john', password: 'secret', email: 'john@ex.com' },
    actions: {
        validateForm: {
            ifAllOf: ['username', 'password', 'email']
        }
    }
});
// validateForm() is called immediately since all conditions are met
```

---

### Conflict Detection

Actions cannot share methods with compacts:

```typescript
// ❌ ERROR - Conflict!
{
    compacts: {
        when_age_changes_call_throwBirthdayParty: 0
    },
    actions: {
        throwBirthdayParty: {
            ifAllOf: ['age']
        }
    }
}
// Throws: "Conflict detected: Method 'throwBirthdayParty' is invoked by both a compact and an action"
```

---

## Actions vs Compacts

| Feature | Compacts | Actions |
|---------|----------|---------|
| **Syntax** | Naming convention | Explicit configuration |
| **Simplicity** | Very simple | More verbose |
| **Flexibility** | Limited patterns | Highly flexible |
| **Conditions** | Implicit (from name) | Explicit (multiple options) |
| **Combining** | Not supported | Multiple conditions AND-ed |
| **JSON Serializable** | Yes (with string refs) | Yes (with string refs) |
| **Best for** | Common patterns | Complex conditional logic |

**When to use Compacts:**
- Simple property transformations
- Common reactive patterns
- Minimal configuration needed

**When to use Actions:**
- Complex conditional logic
- Multiple conditions need to be combined
- Need fine-grained control over execution
- Debugging complex reactive behavior

---

## Quick Reference - Actions

| Condition | Triggers When | Re-triggers |
|-----------|---------------|-------------|
| `ifAllOf` | All properties truthy | On transition to "all met" |
| `ifKeyIn` | Any property changes | On every change |
| `ifNoneOf` | All properties falsy | On transition to "all falsy" |
| `ifEquals` | All properties equal | On transition to "all equal" |
| `ifAtLeastOneOf` | At least one truthy | On transition to "at least one" |
| `ifNotAllOf` | Not all truthy | On transition to "not all" |

**Testing**: See `tests/actions/` for comprehensive examples of each condition type.

---

## Internal Routing (Advanced)

Internal routing is an optional optimization for actions that batch property changes and reduce redundant action invocations in complex reactive scenarios.

### Overview

**Default Behavior (Traditional Approach):**
```javascript
// Action returns multiple properties
calculateSums(self) {
    return {
        sum1: self.input1 * 2,
        sum2: self.input2 * 2,
        sum3: self.input3 * 2
    };
}

// Another action monitors all three
calculateTotal(self) {
    return { total: self.sum1 + self.sum2 + self.sum3 };
}
```

**Without internal routing:**
1. `calculateSums()` returns `{ sum1, sum2, sum3 }`
2. `sum1` set → event fired → `calculateTotal()` called
3. `sum2` set → event fired → `calculateTotal()` called again
4. `sum3` set → event fired → `calculateTotal()` called again
5. Result: `calculateTotal()` runs **3 times**

**With internal routing:**
1. `calculateSums()` returns `{ sum1, sum2, sum3 }`
2. All three properties set covertly (no events yet)
3. Find affected actions: `calculateTotal` monitors all three
4. Evaluate conditions once: all three changed
5. `calculateTotal()` runs **1 time**
6. Fire events for all changed properties
7. Result: `calculateTotal()` runs **1 time**

---

### Enabling Internal Routing

Internal routing is **disabled by default**. Enable it explicitly:

```typescript
const [vm] = await roundabout({
    vm: myObject,
    actions: {
        calculateSums: { ifKeyIn: ['input1', 'input2', 'input3'] },
        calculateTotal: { ifKeyIn: ['sum1', 'sum2', 'sum3'] }
    },
    internalRouting: true  // Enable optimization
});
```

---

### When to Enable Internal Routing

✅ **Enable when you have:**

1. **Actions that return multiple properties**
   ```typescript
   processData(self) {
       return {
           result1: /* ... */,
           result2: /* ... */,
           result3: /* ... */
       };
   }
   ```

2. **Diamond dependencies** (multiple paths to same action)
   ```
   input1, input2, input3
        ↓       ↓       ↓
      sum1    sum2    sum3
        ↓       ↓       ↓
        └───→ total ←───┘
   ```

3. **Multiple actions monitoring the same properties**
   ```typescript
   actions: {
       action1: { ifKeyIn: ['x', 'y'] },
       action2: { ifKeyIn: ['x', 'y'] },
       action3: { ifKeyIn: ['x', 'y'] }
   }
   ```

4. **Complex cascading updates** where actions trigger other actions

❌ **Keep disabled when you have:**

1. **Simple linear cascades** (A → B → C)
2. **Performance-critical paths** where every millisecond counts
3. **Debugging complex issues** (traditional approach is easier to trace)
4. **Actions with side effects** that must run immediately

---

### Performance Characteristics

Based on benchmark tests:

| Scenario | Traditional | Internal Routing | Winner |
|----------|-------------|------------------|--------|
| Simple cascade (A→B→C) | 100ms | 101ms | Traditional (~1% faster) |
| Diamond dependencies | 100ms | 98.5ms | Internal Routing (~1.5% faster) |
| Complex multi-path | 100ms | 95ms | Internal Routing (~5% faster) |

**Key Insight:** The benefit grows with complexity. More diamond dependencies and multi-property returns = greater benefit.

---

### How It Works

Internal routing uses a "change bus" pattern:

1. **Covert Assignment**: Properties are set directly to storage without firing events
2. **Change Accumulation**: All changes from action returns are collected in a Map
3. **Batch Processing**: 
   - Find all actions affected by accumulated changes
   - Evaluate conditions once per action
   - Execute affected actions
   - Collect their results and repeat
4. **Event Dispatch**: Once cascade completes, fire events for all changed properties
5. **Action Disabling**: Actions are temporarily disabled during event dispatch to prevent re-execution

**Safety Features:**
- Maximum 100 iterations to prevent infinite loops
- Actions disabled during final event dispatch
- Dynamic property conversion (properties converted to getter/setters on-demand)

---

### Example: Diamond Dependency

```typescript
const myObject = {
    input1: 1,
    input2: 2,
    input3: 3,
    sum1: 0,
    sum2: 0,
    sum3: 0,
    total: 0,
    
    // Returns multiple properties at once
    calculateSums(self) {
        return {
            sum1: self.input1 * 2,
            sum2: self.input2 * 2,
            sum3: self.input3 * 2
        };
    },
    
    // Monitors all three sums
    calculateTotal(self) {
        return { total: self.sum1 + self.sum2 + self.sum3 };
    }
};

const [vm] = await roundabout({
    vm: myObject,
    actions: {
        calculateSums: { ifKeyIn: ['input1', 'input2', 'input3'] },
        calculateTotal: { ifKeyIn: ['sum1', 'sum2', 'sum3'] }
    },
    internalRouting: true  // Eliminates redundant calculateTotal calls
});

// Change inputs
vm.input1 = 10;
vm.input2 = 20;
vm.input3 = 30;

// Without internal routing: calculateTotal runs 3 times
// With internal routing: calculateTotal runs 1 time
```

---

### Debugging Internal Routing

Enable debug mode to see internal routing in action:

```typescript
actions: {
    calculateTotal: {
        ifKeyIn: ['sum1', 'sum2', 'sum3'],
        debug: true  // Logs internal routing steps
    }
}
```

**Console output:**
```
[Internal Routing] Iteration 1, processing 3 changes: ['sum1', 'sum2', 'sum3']
[Internal Routing] Affected actions: ['calculateTotal']
[Internal Routing] Executing action: calculateTotal
[Internal Routing] Firing event for: sum1 = 20
[Internal Routing] Firing event for: sum2 = 40
[Internal Routing] Firing event for: sum3 = 60
```

---

### Comparison Tests

Run performance comparison tests:

```bash
# Simple cascade comparison
open http://localhost:8000/tests/performance/comparison.html

# Complex diamond dependency comparison
open http://localhost:8000/tests/performance/complex-comparison.html
```

These tests run both approaches side-by-side and show:
- Total execution time
- Action invocation counts
- Performance difference percentage

---

### Best Practices

1. **Start without internal routing** - Enable only when you identify a need
2. **Profile first** - Use comparison tests to measure actual benefit
3. **Document why** - Comment why you enabled it for future maintainers
4. **Test both modes** - Ensure your app works correctly with and without it
5. **Consider complexity** - More complex = more benefit from internal routing

**Example with documentation:**
```typescript
const [vm] = await roundabout({
    vm: myObject,
    actions: {
        // ... action definitions
    },
    // Enable internal routing because:
    // - calculateSums returns 3 properties
    // - calculateTotal monitors all 3
    // - Reduces calculateTotal calls from 3 to 1
    internalRouting: true
});
```

---

### Technical Details

**Storage Access:**
- Properties converted to getter/setters dynamically
- Storage metadata stored in `__roundaboutStorageMetadata`
- Covert functions: `covertlySetProperty()`, `covertlyGetProperty()`

**Action State:**
- Action configurations stored in `__roundaboutActionStates`
- Used to find affected actions during batching
- Tracks `lastConditionsMet` for transition-based conditions

**Flags:**
- `__roundaboutUseInternalRouting` - Whether internal routing is enabled
- `__roundaboutDisableActions` - Temporarily disables actions during event dispatch

**See also:**
- `requirements/InternalRouting.md` - Original design proposal
- `requirements/InternalRoutingImplementation.md` - Implementation details
- `tests/performance/` - Performance comparison tests


## Viewing Demos Locally

1. Install git
2. Fork/clone this repo
3. Install node.js
4. Open command window to folder where you cloned this repo
5. > git submodule add https://github.com/bahrus/types.git types
6. > git submodule update --init --recursive
7. > npm install
8. > npm run serve
9. Open http://localhost:8000/ in a modern browser

## Running Tests

```
> npm run test
```

## Using from ESM Module:

```JavaScript
import 'roundabout-lib/roundabout.js';
```

## Using from CDN:

```html
<script type=module crossorigin=anonymous>
    import 'https://esm.sh/roundabout-lib';
</script>
```


