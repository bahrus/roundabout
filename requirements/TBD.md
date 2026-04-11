# TBD

There is a common reactive requirement that comes up:

A method of a class searches for an element, based on some criteria.  We want the method to return the found element, and make it available as a readonly property to other methods of the class.  But we don't want to cause memory leak issues if the element is removed by other logic, so we really want to make a weak reference to it.  An example of this can be seen with [this example](https://raw.githubusercontent.com/bahrus/be-clonable/refs/heads/baseline/be-clonable.js) with the trigger property.  I would like to be able to configure this declaratively so that:

1.  A readonly property is created either on the object if it isn't an instance of a class, or on the class prototype that provides the deref()'ed value if available, logs a console error if not, similar (but not exactly like) the enhancedElement property in the link above.
2. Stores the weakRef in some private location.

This means a method should be able to return:

```JavaScript
return /** @type {PAP} */ ({
    trigger //: new WeakRef(trigger),
    resolved: true,
    byob
});
```

Would this fit in with any of the existing patterns?  Compacts? Handlers?  Infractions?  Positractions  If not, should we create another category to describe this linkage declaratively?  If so, I would prefer some name that relates to cars / transportation to fit in with the "roundabout" metaphor.