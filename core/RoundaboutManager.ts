import type { RoundaboutOptions, RoundaboutReady } from '../types/roundabout/types.js';

export class RoundaboutManager<TProps = any, TActions = TProps, ETProps = TProps> {
    private vm!: TProps & TActions & RoundaboutReady;
    private propagator: EventTarget;
    private options: RoundaboutOptions<TProps, TActions, ETProps>;
    private abortController: AbortController;
    private processingQueue: Map<string, Promise<void>>;
    private cleanupFunctions: Array<() => void> = [];

    constructor(
        options: RoundaboutOptions<TProps, TActions, ETProps>,
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
        
        // Step 2: Infer properties to monitor and setup propagator with getter/setters
        await this.setupPropagatorAndProperties();
        
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

        if (!vm.covertAssignment) {
            vm.covertAssignment = async (obj: any) => {
                // Import covert property setter
                const { covertlySetProperty } = await import('../utils/PropagatorSetup.js');
                
                // Set properties covertly (without triggering events)
                for (const [key, value] of Object.entries(obj)) {
                    covertlySetProperty(vm, key, value);
                }
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

        // Store assignGingerlyOptions on VM so processors can access them
        if (this.options.assignGingerlyOptions) {
            Object.defineProperty(vm, '__roundaboutAssignGingerlyOptions', {
                value: this.options.assignGingerlyOptions,
                enumerable: false,
                writable: false,
                configurable: true
            });
        }
    }

    private async setupPropagatorAndProperties(): Promise<void> {
        const { setupPropagator, inferPropertiesToMonitor } = await import('../utils/PropagatorSetup.js');
        
        // Infer which properties need monitoring
        const propertiesToMonitor = inferPropertiesToMonitor(this.options);
        
        // Setup propagator and convert properties to getter/setters
        this.propagator = await setupPropagator(this.vm, propertiesToMonitor, this.options.weakRef);
        
        // Subscribe to propagator events to trigger reactions
        for (const prop of propertiesToMonitor) {
            this.propagator.addEventListener(prop, (event: Event) => {
                const propChangeEvent = event as any; // PropertyChangeEvent
                this.handlePropertyChange(prop, propChangeEvent.newValue).catch(err => {
                    console.error(`Error handling property change for ${prop}:`, err);
                });
            }, { signal: this.abortController.signal });
        }
    }

    private pendingValues: Map<string, any> = new Map();

    private async handlePropertyChange(key: string, value: any): Promise<void> {
        // If already processing this key, store the latest value so it gets
        // picked up after the current cycle completes (don't drop it).
        const existing = this.processingQueue.get(key);
        if (existing) {
            this.pendingValues.set(key, value);
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

        // If another value arrived while we were processing, handle it now.
        if (this.pendingValues.has(key)) {
            const next = this.pendingValues.get(key);
            this.pendingValues.delete(key);
            await this.handlePropertyChange(key, next);
        }
    }

    private async processPropertyChangeInternal(key: string, value: any): Promise<void> {
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
            (key: string) => this.handlePropertyChange(key, this.vm[key as keyof typeof this.vm]),
            this.options.internalRouting === true // Default to false (traditional)
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
