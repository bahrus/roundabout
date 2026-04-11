# Support for weak references

utils/PropagatorSetup.ts has a method "convertPropertyToGetterSetter" that has this logic (currently line 158):

```TypeScript
    // Define getter/setter
    Object.defineProperty(vm, prop, {
        get() {
            return isPlainObject ? storage[prop] : storage[storageKey];
        },
        set(newValue: any) {
            const oldValue = isPlainObject ? storage[prop] : storage[storageKey];
            
            // Only fire event if value actually changed
            if (oldValue !== newValue) {
                if (isPlainObject) {
                    storage[prop] = newValue;
                } else {
                    storage[storageKey] = newValue;
                }
                
                // Fire event on propagator
                propagator.dispatchEvent(new PropertyChangeEvent(prop, oldValue, newValue));
            }
        },
        enumerable: true,
        configurable: true
    });
}
```

First, I think this is really important to verify:  I asked you to dynamically define the property at the class prototype level if roundabout is being applied to a class instance rather than a simple object.  The thinking that the browser can more efficiently "shape" the memory footprint for classes if properties are defined at the prototype level, rather than just added to the class instance.  So the first class instance to pass through roundabout will get the property defined, and then the property will be set.  Subsequent class instances will already have the property defined.  What isn't clear to me is if the storage used to store the private value of the property is scoped to each instance.  It has to be.  I don't want values to leak across instances.

Once that's fixed, I would like to amend the logic above so that if the newValue passed in is an instance of Element, it is stored in storage using a weak reference, and the getter should know this, and call a deref() in the getter in this case.

