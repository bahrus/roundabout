export class RoundaboutManager {
    infractions;
    vm;
    propagator;
    options;
    abortController;
    processingQueue;
    cleanupFunctions = [];
    constructor(options, infractions) {
        this.infractions = infractions;
        this.options = options;
        this.abortController = new AbortController();
        this.processingQueue = new Map();
        this.propagator = new EventTarget();
    }
    async initialize() {
        // Step 1: Setup VM with RoundaboutReady interface
        await this.setupViewModel();
        // Step 2: Wrap VM in proxy for reactivity
        await this.wrapInProxy();
        // Step 3: Process configuration options
        await this.processOptions();
        return [this.vm, this.propagator];
    }
    async setupViewModel() {
        const vm = this.options.vm || {};
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
            vm.covertAssignment = async (obj) => {
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
        this.vm = vm;
    }
    async wrapInProxy() {
        const { ViewModelProxy } = await import('./ViewModelProxy.js');
        const propagateKeys = this.getPropagateKeys();
        this.vm = ViewModelProxy.create(this.vm, (key, value) => this.handlePropertyChange(key, value), propagateKeys);
    }
    getPropagateKeys() {
        const keys = new Set();
        const propagate = this.options.propagate;
        if (!propagate)
            return keys;
        if (typeof propagate === 'string') {
            keys.add(propagate);
        }
        else if (Array.isArray(propagate)) {
            propagate.forEach(key => keys.add(key));
        }
        return keys;
    }
    async handlePropertyChange(key, value) {
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
        }
        finally {
            this.processingQueue.delete(key);
        }
    }
    async processPropertyChangeInternal(key, value) {
        // Fire propagator event if this is a propagate key
        const propagateKeys = this.getPropagateKeys();
        if (propagateKeys.has(key)) {
            this.propagator.dispatchEvent(new CustomEvent(key, { detail: value }));
        }
        // Trigger any registered reactions for this property
        const vmAny = this.vm;
        const reactions = vmAny.__roundaboutReactions?.get(key);
        if (reactions && Array.isArray(reactions)) {
            for (const reaction of reactions) {
                try {
                    await reaction(value);
                }
                catch (err) {
                    console.error(`Error in reaction for ${key}:`, err);
                }
            }
        }
    }
    async processOptions() {
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
    async processCompacts() {
        const { processCompacts } = await import('../processors/compacts.js');
        const cleanup = await processCompacts(this.vm, this.options.compacts, (key) => this.handlePropertyChange(key, this.vm[key]));
        this.cleanupFunctions.push(cleanup);
    }
    async processActions() {
        const { processActions } = await import('../processors/actions.js');
        const cleanup = await processActions(this.vm, this.options.actions, (key) => this.handlePropertyChange(key, this.vm[key]));
        this.cleanupFunctions.push(cleanup);
    }
    async processHandlers() {
        const { processHandlers } = await import('../processors/handlers.js');
        const cleanup = await processHandlers(this.vm, this.options.handlers, this.abortController.signal);
        this.cleanupFunctions.push(cleanup);
    }
    async processHitches() {
        const { processHitches } = await import('../processors/hitches.js');
        const cleanup = await processHitches(this.vm, this.options.hitch, (key) => this.handlePropertyChange(key, this.vm[key]));
        this.cleanupFunctions.push(cleanup);
    }
    async processInfractions() {
        const { processInfractions } = await import('../processors/infractions.js');
        const cleanup = await processInfractions(this.vm, this.infractions, (key) => this.handlePropertyChange(key, this.vm[key]));
        this.cleanupFunctions.push(cleanup);
    }
    async processPositractions() {
        const { processPositractions } = await import('../processors/positractions.js');
        const cleanup = await processPositractions(this.vm, this.options.positractions, (key) => this.handlePropertyChange(key, this.vm[key]));
        this.cleanupFunctions.push(cleanup);
    }
    async cleanup() {
        this.abortController.abort();
        this.cleanupFunctions.forEach(fn => fn());
        this.cleanupFunctions = [];
    }
}
