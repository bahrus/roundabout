import type { RoundaboutReady } from '../types/roundabout/types.js';

export class ViewModelProxy {
    static create<T extends object>(
        target: T,
        onChange: (key: string, value: any) => Promise<void>,
        propagateKeys: Set<string>
    ): T & RoundaboutReady {
        const handler: ProxyHandler<T> = {
            set(obj: T, prop: string | symbol, value: any): boolean {
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

            get(obj: T, prop: string | symbol): any {
                return Reflect.get(obj, prop);
            }
        };

        return new Proxy(target, handler) as T & RoundaboutReady;
    }
}
