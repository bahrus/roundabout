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

### What "declarative" means here

The roundabout configuration object should describe *what* happens, not *how*. Action methods should be pure functions: receive the view model state, return the new state to merge. Roundabout handles the wiring — when to call what, how to merge results, how to propagate changes.

### The action key IS the method name

For actions, the key in the configuration object is the name of the method to call. There is no need for a separate `do` property:

```javascript
// ✅ Correct: action key matches the method name
actions: {
    updateStatus: {
        ifKeyIn: ['count']
    }
}
// roundabout calls vm.updateStatus(self) when count changes

// ❌ Avoid: using `do` to alias the method name adds confusion
actions: {
    calculateStatus: {
        ifKeyIn: ['count'],
        do: 'updateStatus'  // unnecessary indirection
    }
}
```

The `do` property exists primarily for **positractions**, where you're calling generic, view-model-neutral functions (like `Math.max`) that don't live on the view model as methods with matching names.

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

## How to be roundabout ready

For a class to be optimized to work most effectively with roundabouts, it should implement interface RoundaboutReady:

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
export class MoodStone extends O implements IMoodStoneActions {
    static override config: OConfig<MoodStoneProps, MoodStoneActions> = {
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
    }
    
}
```

> [!NOTE]
> Compacts that invoke a method, like the first example, can't be mixed with actions that are tied to the same method, as it creates too much ambiguity, and would thus defeat the purpose of providing better developer ergonomics.

## Fully configurable actions

On the opposite extreme of compacts are actions, where we can fine tune exactly when and how to invoke an action.  They can pretty much do what all the other configurable settings described in this page can do, but we need to be explicit, so it is a bit more time consuming to set up.

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
hitch:{
    when_enhancedElement_emits_eventProp_inc_ageCount_by: 1,
}
```

## Infractions and Positractions

Infractions and Positractions don't open anything up that couldn't be done with the highly configurable but verbose Actions.  Infractions and Positractions just specialize in some common scenarios, and strive to eliminate boilerplate while continuing to encourage JSON driven configuration (easier to parse) and highly performant reactive analysis, without calling code unnecessarily.

### Infractions

Infractions is a portmanteau of "inferred reactions", where we "parse" the left hand side of the arrow function or method, in order to determine which parameters it depends on.

```Typescript
const calcAgePlus10: PropsToPartialProps<IMoodStoneProps> = ({age}: IMoodStoneProps) => ({agePlus10: age + 10});

export class MoodStone extends O implements IMoodStoneActions {
    doSearch({searchString}){
        return {
            foundIt: true,
            hereItIs: element
        }
    }
    static override config: OConfig<IMoodStoneProps> = {
        infractions: [calcAgePlus10, 'doSearch']
    }
}
```

#### Making it JSON Serializable

It was briefly mentioned before that one of the goals of roundabouts is that they accept as much JSON serializable information as possible.  The config property above isn't serializable as it currently stands.  So to make it JSON serializable, we must burden the developer with an extra step:

```Typescript
const calcAgePlus10: PropsToPartialProps<IMoodStoneProps> = ({age}: IMoodStoneProps) => ({agePlus10: age + 10});

export class MoodStone extends O implements IMoodStoneActions {
    calcAgePlus10 = calcAgePlus10;
    static override config: OConfig<IMoodStoneProps> = {
        infractions: ['calcAgePlus10']
    }
}
```

#### Instant gratification

We can go in the opposite direction, away from a disciplined approach of making things JSON serializable, but in the direction of "locality of behavior", and inline the infraction:

```Typescript

export class MoodStone extends O implements IMoodStoneActions {
    static override config: OConfig<IMoodStoneProps> = {
        infractions: [({age}: IMoodStoneProps) => ({agePlus10: age + 10})]
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
export class MoodStone extends O implements IMoodStoneActions {
    static override config: OConfig<IMoodStoneProps, IMoodStoneActions> = {
        positractions: [
            {
                ifKeyIn: ['age', 'heightInInches'],
                do: Math.max,
                assignTo: ['maxOfAgeAndHeightInInches']
            }
        ]

        
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
export class MoodStone extends O implements IMoodStoneActions {
    max = Math.max;
    static override config: OConfig<IMoodStoneProps, IMoodStoneActions> = {
        positractions: [
            {
                ifKeyIn: ['age', 'heightInInches'],
                do: 'max',
                //pass: ['age', 'heightInInches'],
                assignTo: ['maxOfAgeAndHeightInInches']
            }
        ]

        
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

## The class hierarchy food chain

I don't know about you, but when there's life or death struggle between a virus vs a human being, I for one root for the human.  A parent risking their life for their child is much more aesthetic than the reverse.   Weird, I know.

assignGingerly follows a similar pattern when merging an object into a property.

If the property value already exists, and if the object being merged in is a superclass of the target property, then rather doing an Object.assign from the superclass into the subclass, the reverse is done.  The existing property value gets merged into the new value, and the new value replaces the old value.







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
    console.log('Status changed to:', e.detail);
});

vm.status = 'active';  // → 'status-changed' event is dispatched
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
hitch: {
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
    hitch: {
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
    hitch: {
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
    hitch: {
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
    hitch: {
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
    hitch: { /* ... */ }
});

// Later, when done:
vm.RAController.abort();  // All hitch listeners are removed
```

### Use Cases

**Click counters:**
```typescript
hitch: {
    when_button_emits_click_inc_clickCount_by: 1
}
```

**Multi-button interfaces:**
```typescript
// Track which button is active
hitch: {
    when_activeButton_emits_click_inc_actionCount_by: 1
}
```

**Different event types:**
```typescript
// Switch between click, mouseenter, focus, etc.
hitch: {
    when_element_emits_eventType_inc_interactionCount_by: 1
}
```

**Custom increments:**
```typescript
// Increment by different amounts
hitch: {
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


