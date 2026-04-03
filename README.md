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


## Wiring up EventTarget properties to other methods based on an event.

One example of the kind of complexity that roundabouts can handle cleanly is creating subscriptions between one property that is an instance of an EventTarget (or a weak reference to said instance), and a method of the class we want to call when that eventTarget instance changes, again merging in what the action method returns into the view model.  Once again, the [signals](https://github.com/proposal-signals) proposal warns us about the complexity and danger of using pub/sub (such as EventTargets).  This library sees it as a challenge that using declarative syntax can rise to, because it will be sure to do what is needed to [avoid the real disaster](https://jakearchibald.com/2024/garbage-collection-and-closures/) that that proposal warns us about.

How would this look?  Let's take a look at an example:

```TypeScript
handlers: {
    timeEmitter_to_incTicks_on: 'value-changed'
},
```

This is saying:  When property with name timeEmitter is set to an event target (or weak ref), add an event handler with event 'value-changed' and when that event fires, invoke method 'incTicks'.  And do cleanup as necessary. 

This is demonstrated by the [first web component in the universe to use roundabout](https://github.com/bahrus/time-ticker/blob/baseline/time-ticker.ts).

## Hitches

Whereas "Compacts" allow us to connect *two* members of the view model together, hitches allow us to coordinate *three* members.

```TypeScript

const model = {
    enhancedElement: HTMLElement,
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
        infractions: [calcAgePlus10, doSearch]
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

## Merging Traffic via assignGingerly [WIP]

The function assignGingerly in trans-render/lib/assignGingerly.js allows for safe, nested, recursive property setting, and allows for notifying the object containing the nested property that a change was made, no matter how deep.

It does optional chaining access, but in reverse.

The syntax looks like:

```JavaScript
const log = await assignGingerly(destObj, {
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
