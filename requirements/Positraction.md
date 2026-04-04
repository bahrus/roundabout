# Positractions

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
const instance = new MoodStone();
roundAbout({vm: instance, positractions: MoodStone.config.positractions})
```

The "positional" part of the name comes from our mapping approach -- the function is expected to return an array of unnamed results (a "tuple"), which we then map to various properties of our view model to assign the result to, based on the position in the assignTo array.  (Note that in this case the function doesn't return an array.  In that case, we treat it as the first element of an imaginary array, for mapping purposes). If a returned element of the tuple can be ignored, simply place a null in that spot of the assignTo array.

By default, the "ifKeyIn" array of property names is passed into the function.  An additional option ("pass"), not shown here, allows us to explicitly list the properties to pass, which may be different from the dependencies we want to trigger the function call on.

## Instant gratification

This should also work:



## Making it JSON serializable

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