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

One trick here:  The enhancedElement may start out empty, so anytime enhancedElement changes:

1)  If it becomes falsy, abort the existing listener.
2)  if a new enhancedElement (in this case) value presents itself, also abort the existing listener, before creating the new one.