import type { roundaboutOptions, RoundaboutReady } from '../types/roundabout/types.js';

export class RoundaboutManager<TProps = any, TActions = TProps, ETProps = TProps> {
    private vm!: TProps & TActions & RoundaboutReady;
    private propagator: EventTarget;
    private options: roundaboutOptions<TProps, TActions, ETProps>;
    private abortController: AbortController;
    private processingQueue: Map<string, Promise<void>>;
    private cleanupFunctions: Array<() => void> = [];

    constructor(
        options: roundaboutOptions<TProps, TActions, ETProps>,
        private infractions?: Array<Function | string>
    ) {
        this.options = options;
        this.abortController = new AbortController();
        this.processingQueue = new Map();
        this.propagator = new EventTarget();
    }

    async initialize(): Promise<[vm: TProps & TActions & RoundaboutReady, propagator: EventTarget]> {
        // Step 1: Setup VM with RoundaboutReady interface
        await this.setupViewModel();
        
        // Step 2: Wrap VM in proxy for reactivity
        await this.wrapInProxy();
        
        // Step 3: Process configuration options
        await this.processOptions();
        
        return [this.vm, this.propagator];
    }

    private async setupViewModel(): Promise<void> {
        const vm = this.options.vm || {} as any;
        
        // Add RoundaboutReady interface if not present
        if (!vm.RAController) {
            vm.RAController = this.abortController;
        }
        
        if (!vm.propagator) {
            Object.defineProperty(vm, 'propagator', {
                get: () => this.propagator,
                enumerable: false,
                configurable: true
            });
        }

        if (!vm.covertAssignment) {
            vm.covertAssignment = async (obj: any) => {
                const { assignGingerly } = await import('assign-gingerly/assignGingerly.js');
                await assignGingerly(vm, obj);
            };
        }

        if (!vm.awake) {
            vm.awake = async () => {
                // TODO: Implement sleep/awake mechanism
            };
        }

        if (!vm.nudge) {
            vm.nudge = () => {
                // TODO: Implement nudge
            };
        }

        if (!vm.rock) {
            vm.rock = () => {
                // TODO: Implement rock
            };
        }

        this.vm = vm as TProps & TActions & RoundaboutReady;
    }

    private async wrapInProxy(): Promise<void> {
        const { ViewModelProxy } = await import('./ViewModelProxy.js');
        const propagateKeys = this.getPropagateKeys();
        
        this.vm = ViewModelProxy.create(
            this.vm,
            (key: string, value: any) => this.handlePropertyChange(key, value),
            propagateKeys
        );
    }

    private getPropagateKeys(): Set<string> {
        const keys = new Set<string>();
        const propagate = this.options.propagate;
        
        if (!propagate) return keys;
        
        if (typeof propagate === 'string') {
            keys.add(propagate);
        } else if (Array.isArray(propagate)) {
            propagate.forEach(key => keys.add(key));
        }
        
        return keys;
    }

    private async handlePropertyChange(key: string, value: any): Promise<void> {
        // Avoid duplicate processing
        const existing = this.processingQueue.get(key);
        if (existing) {
            await existing;
            return;
        }

        const promise = this.processPropertyChangeInternal(key, value);
        this.processingQueue.set(key, promise);
        
        try {
            await promise;
        } finally {
            this.processingQueue.delete(key);
        }
    }

    private async processPropertyChangeInternal(key: string, value: any): Promise<void> {
        // Fire propagator event if this is a propagate key
        const propagateKeys = this.getPropagateKeys();
        if (propagateKeys.has(key)) {
            this.propagator.dispatchEvent(new CustomEvent(key, { detail: value }));
        }

        // Trigger any registered reactions for this property
        const vmAny = this.vm as any;
        const reactions = vmAny.__roundaboutReactions?.get(key);
        if (reactions && Array.isArray(reactions)) {
            for (const reaction of reactions) {
                try {
                    await reaction(value);
                } catch (err) {
                    console.error(`Error in reaction for ${key}:`, err);
                }
            }
        }
    }

    private async processOptions(): Promise<void> {
        // Dynamically import and process each configuration type
        if (this.options.compacts) {
            await this.processCompacts();
        }

        if (this.options.actions) {
            await this.processActions();
        }

        if (this.options.handlers) {
            await this.processHandlers();
        }

        if (this.options.hitch) {
            await this.processHitches();
        }

        if (this.infractions) {
            await this.processInfractions();
        }

        if (this.options.positractions) {
            await this.processPositractions();
        }
    }

    private async processCompacts(): Promise<void> {
        const { processCompacts } = await import('../processors/compacts.js');
        const cleanup = await processCompacts(
            this.vm,
            this.options.compacts!,
            (key: string) => this.handlePropertyChange(key, this.vm[key as keyof typeof this.vm])
        );
        this.cleanupFunctions.push(cleanup);
    }

    private async processActions(): Promise<void> {
        const { processActions } = await import('../processors/actions.js');
        const cleanup = await processActions(
            this.vm,
            this.options.actions!,
            (key: string) => this.handlePropertyChange(key, this.vm[key as keyof typeof this.vm])
        );
        this.cleanupFunctions.push(cleanup);
    }

    private async processHandlers(): Promise<void> {
        const { processHandlers } = await import('../processors/handlers.js');
        const cleanup = await processHandlers(
            this.vm as any,
            this.options.handlers!,
            this.abortController.signal
        );
        this.cleanupFunctions.push(cleanup);
    }

    private async processHitches(): Promise<void> {
        const { processHitches } = await import('../processors/hitches.js');
        const cleanup = await processHitches(
            this.vm,
            this.options.hitch!,
            (key: string) => this.handlePropertyChange(key, this.vm[key as keyof typeof this.vm])
        );
        this.cleanupFunctions.push(cleanup);
    }

    private async processInfractions(): Promise<void> {
        const { processInfractions } = await import('../processors/infractions.js');
        const cleanup = await processInfractions(
            this.vm,
            this.infractions!,
            (key: string) => this.handlePropertyChange(key, this.vm[key as keyof typeof this.vm])
        );
        this.cleanupFunctions.push(cleanup);
    }

    private async processPositractions(): Promise<void> {
        const { processPositractions } = await import('../processors/positractions.js');
        const cleanup = await processPositractions(
            this.vm,
            this.options.positractions!,
            (key: string) => this.handlePropertyChange(key, this.vm[key as keyof typeof this.vm])
        );
        this.cleanupFunctions.push(cleanup);
    }

    async cleanup(): Promise<void> {
        this.abortController.abort();
        this.cleanupFunctions.forEach(fn => fn());
        this.cleanupFunctions = [];
    }
}
