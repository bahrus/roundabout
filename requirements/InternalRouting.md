# Internal Routing

When I implemented this functionality previous to this new AI aided rework, I chose to add a significant technical in the pursuit of optimal performance -- 

When actions would return an object to be merged in to the vm, I would bypass the public property setters / getters, and instead use the covert assignment (if available):

```JavaScript
export interface RoundaboutReady{
    /**
     * Allow for assigning to read only props via the "backdoor"
     * Bypasses getters / setters, sets directly to (private) memory slots
     * Doesn't do any notification
     * Allows for nested property setting
    */
    covertAssignment(obj: any): Promise<void>;
}
```

After doing the covertAssignment, I would run through the relevant AND conditions that could be affected by the object returned by the action method. I wouldn't treat each property change as individual changes.  If one method depends on two properties, and both change, I would only call the action method. That itself could result in more actions returning objects, so a kind of "bus" of changes would accumulate.  Once the bus was fully exhausted, only then would I dispatch the events due to property changes manually (not via the property setter).



