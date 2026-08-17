# Do Merge Check Only After Delay

---

## Bruce's Ask:

I'm finding a scenario where I need to delay the execution of a merge.  The use case is setting focus:

```JS
{
    ifAllOf: ['expanded'],
    assign: {
        '?.querySelector?.a?.focus|': null
    }
},
```

I would like if:

```JS
{
    delay: 10
    ifAllOf: ['expanded'],
    assign: {
        '?.querySelector?.a?.focus|': null
    }
},
```

... waits 10 milliseconds, then checks the conditions and if satisfied does the assignFrom.

