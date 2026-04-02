export class ViewModelProxy {
    static create(target, onChange, propagateKeys) {
        const handler = {
            set(obj, prop, value) {
                if (typeof prop === 'symbol') {
                    Reflect.set(obj, prop, value);
                    return true;
                }
                const oldValue = Reflect.get(obj, prop);
                // Only trigger change if value actually changed
                if (oldValue === value) {
                    return true;
                }
                Reflect.set(obj, prop, value);
                // Trigger change handler asynchronously for ALL properties
                // The handler will determine if it needs to propagate events
                onChange(prop, value).catch(err => {
                    console.error(`Error processing property change for ${prop}:`, err);
                });
                return true;
            },
            get(obj, prop) {
                return Reflect.get(obj, prop);
            }
        };
        return new Proxy(target, handler);
    }
}
