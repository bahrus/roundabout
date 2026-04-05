/**
 * Custom event classes for roundabout property changes
 * Following best practices: use custom Event classes instead of CustomEvent with detail objects
 */

/**
 * Event fired when a property changes on the view model
 */
export class PropertyChangeEvent extends Event {
    static eventName = 'propertyChange';
    
    constructor(
        public propertyName: string,
        public oldValue: any,
        public newValue: any
    ) {
        super(propertyName);
    }
}

/**
 * Interface for PropertyChangeEvent (for type safety)
 */
export interface IPropertyChangeEvent {
    propertyName: string;
    oldValue: any;
    newValue: any;
}

/**
 * Event fired by compacts when using dispatch pattern
 */
export class CompactDispatchEvent extends Event {
    constructor(
        public eventName: string,
        public value: any
    ) {
        super(eventName);
    }
}

/**
 * Interface for CompactDispatchEvent (for type safety)
 */
export interface ICompactDispatchEvent {
    eventName: string;
    value: any;
}
