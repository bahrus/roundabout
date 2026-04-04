# Infractions

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

const instance = new MoodStone();
roundAbout({
    vm: instance,
}, MoodStone.config.infractions)
```

## Making it JSON Serializable

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

## Instant gratification

We can go in the opposite direction, away from a disciplined approach of making things JSON serializable, but in the direction of "locality of behavior", and inline the infraction:

```Typescript

export class MoodStone extends O implements IMoodStoneActions {
    static override config: OConfig<IMoodStoneProps> = {
        infractions: [({age}: IMoodStoneProps) => ({agePlus10: age + 10})]
    }
}
```