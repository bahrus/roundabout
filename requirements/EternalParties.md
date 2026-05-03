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
