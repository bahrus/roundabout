/**
 * Custom event classes for roundabout property changes
 * Following best practices: use custom Event classes instead of CustomEvent with detail objects
 */
/**
 * Event fired when a property changes on the view model
 */
export class PropertyChangeEvent extends Event {
    propertyName;
    oldValue;
    newValue;
    static eventName = 'propertyChange';
    constructor(propertyName, oldValue, newValue) {
        super(propertyName);
        this.propertyName = propertyName;
        this.oldValue = oldValue;
        this.newValue = newValue;
    }
}
/**
 * Event fired by compacts when using dispatch pattern
 */
export class CompactDispatchEvent extends Event {
    eventName;
    value;
    constructor(eventName, value) {
        super(eventName);
        this.eventName = eventName;
        this.value = value;
    }
}
