# Concerns

My conversion of tests/custom-element-example.html, which I mostly did manually, is about 2/3 way done.  I thought it would be a good time and pause and address a concern, that follows.

I wrote much of the original documentation of README.md, without getting feedback from other developers.  AI (kiro) did an admirable job translating that documentation and perhaps examining the legacy folder, at developing the implementation .

My concern is that when I asked kiro to generate an example of a web component using roundabout, there were some significant misses, that make me think the documentation needs significant improvements, certainly for AI audiences, but probably for humans as well.

In particular, what kiro came up with is:

```JavaScript
class UserCounter extends HTMLElement {
    constructor() {
        super();
        
        // Don't initialize properties here - let roundabout handle them
        // This ensures they get converted to getter/setters properly
    }
    
    async connectedCallback() {
        // Initialize properties BEFORE roundabout
        this.count = 0;
        this.username = 'User';
        this.status = 'low';
        this.statusMessage = '';
        this.incrementButton = null;
        this.decrementButton = null;
        this.resetButton = null;
        
        addLog(`UserCounter connected: ${this.username}`);
        
        // Get initial attributes
        if (this.hasAttribute('username')) {
            this.username = this.getAttribute('username');
        }
        if (this.hasAttribute('initial-count')) {
            this.count = parseInt(this.getAttribute('initial-count'), 10) || 0;
        }
        
        // Render initial UI
        this.render();
        
        // Get button references
        this.incrementButton = this.querySelector('.increment');
        this.decrementButton = this.querySelector('.decrement');
        this.resetButton = this.querySelector('.reset');
        
        // Setup roundabout for reactive property management
        // This will convert properties to getter/setters
        const [vm, propagator] = await roundabout({
            vm: this,
            propagate: ['count', 'username', 'status', 'statusMessage'],
            
            // WeakRef for button references to prevent memory leaks
            weakRef: {
                properties: ['incrementButton', 'decrementButton', 'resetButton'],
                logIfCollected: 'warn'
            },
            
            // Actions: Calculate derived state based on count
            // Note: Using ifAllOf instead of ifKeyIn because ifKeyIn has issues with
            // firing on every change (it only fires once then stops)
            actions: {
                calculateStatus: {
                    ifAllOf: ['count'],  // Fire when count is truthy (always, since it's a number)
                    do: 'updateStatus'
                }
            },
            
            // Compacts: Simple property transformations
            compacts: {
                // When status changes, update the status message
                echo_status_to_statusMessage: 0
            }
        });
        
        // IMPORTANT: vm and this are the same object reference
        // roundabout modifies this in place, so we can continue using this
        // But we store vm for clarity
        this._vm = vm;
        
        // Store propagator for cleanup
        this._propagator = propagator;
        
        // Listen to property changes and update UI
        propagator.addEventListener('count', () => this.updateCountDisplay());
        propagator.addEventListener('status', () => this.updateStatusDisplay());
        propagator.addEventListener('username', () => this.updateUsernameDisplay());
        
        // Setup button event listeners
        if (this.incrementButton) {
            this.incrementButton.addEventListener('click', () => this.increment());
        }
        if (this.decrementButton) {
            this.decrementButton.addEventListener('click', () => this.decrement());
        }
        if (this.resetButton) {
            this.resetButton.addEventListener('click', () => this.reset());
        }
        
        // Note: Initial status calculation happens automatically via actions during roundabout initialization
        
        addLog(`UserCounter initialized: ${this.username}, count=${this.count}, status=${this.status}`);
    }
    
    disconnectedCallback() {
        addLog(`UserCounter disconnected: ${this.username}`);
        // Cleanup is handled automatically by roundabout's AbortController
    }
    
    // Action method: Calculate status based on count
    updateStatus(self) {
        let newStatus;
        let newMessage;
        
        if (self.count < 10) {
            newStatus = 'low';
            newMessage = 'Low count';
        } else if (self.count < 20) {
            newStatus = 'medium';
            newMessage = 'Medium count';
        } else {
            newStatus = 'high';
            newMessage = 'High count!';
        }
        
        return {
            status: newStatus,
            statusMessage: newMessage
        };
    }
    
    // User actions
    increment() {
        this.count++;
        addLog(`${this.username} incremented to ${this.count}`);
        // Manually trigger status update
        // (Workaround: actions with ifAllOf don't fire on every change, only on transitions)
        const result = this.updateStatus(this);
        if (result && result.status) {
            this.status = result.status;
            if (result.statusMessage) {
                this.statusMessage = result.statusMessage;
            }
        }
    }
    
    decrement() {
        if (this.count > 0) {
            this.count--;
            addLog(`${this.username} decremented to ${this.count}`);
            // Manually trigger status update
            const result = this.updateStatus(this);
            if (result && result.status) {
                this.status = result.status;
                if (result.statusMessage) {
                    this.statusMessage = result.statusMessage;
                }
            }
        }
    }
    
    reset() {
        this.count = 0;
        addLog(`${this.username} reset to 0`);
        // Manually trigger status update
        const result = this.updateStatus(this);
        if (result && result.status) {
            this.status = result.status;
            if (result.statusMessage) {
                this.statusMessage = result.statusMessage;
            }
        }
    }
    
    // UI rendering methods
    render() {
        this.innerHTML = `
            <div class="header">User: <span class="username">${this.username}</span></div>
            <div class="count">Count: <span class="count-value">${this.count}</span></div>
            <div class="status ${this.status}">
                Status: <span class="status-text">${this.statusMessage || this.status}</span>
            </div>
            <div class="controls">
                <button class="increment">+1</button>
                <button class="decrement">-1</button>
                <button class="reset">Reset</button>
            </div>
        `;
    }
    
    updateCountDisplay() {
        const countValue = this.querySelector('.count-value');
        if (countValue) {
            countValue.textContent = this.count;
        }
    }
    
    updateStatusDisplay() {
        const statusDiv = this.querySelector('.status');
        const statusText = this.querySelector('.status-text');
        
        if (statusDiv) {
            statusDiv.className = `status ${this.status}`;
        }
        if (statusText) {
            statusText.textContent = this.statusMessage || this.status;
        }
    }
    
    updateUsernameDisplay() {
        const usernameSpan = this.querySelector('.username');
        if (usernameSpan) {
            usernameSpan.textContent = this.username;
        }
    }
}
```

What I would have liked to see is where we are now:

```JavaScript
//JSON Serializable
const raConfig = {
                
    // WeakRef for button references to prevent memory leaks
    weakRef: {
        properties: ['incrementButton', 'decrementButton', 'resetButton'],
        logIfCollected: 'warn'
    },
    
    // Actions: Calculate derived state based on count
    // Note: Using ifAllOf instead of ifKeyIn because ifKeyIn has issues with
    // firing on every change (it only fires once then stops)
    actions: {
        createClone: {
            ifAllOf: ['template'],
        },
        updateStatus: {
            ifKeyIn: ['count'],  // Fire when count is truthy (always, since it's a number)
        },
        updateStatusDisplay: {
            ifKeyIn: ['status', 'statusMessage'],
            ifAllOf: ['clone'],
        },
        updateUsernameDisplay: {
            ifKeyIn: ['username'],
            ifAllOf: ['clone'],
        },
        updateCountDisplay: {
            ifKeyIn: ['count'],
            ifAllOf: ['clone']
        },
        render: {
            ifAllOf: ['renderCount'],
        },


    },
    handlers: {
        resetButton_to_reset_on: 'click',
        incrementButton_to_increment_on: 'click',
        decrementButton_to_decrement_on: 'click',
    },
    
    assignGingerlyOptions: {
        withMethods: ['querySelector', 'appendChild', 'add'],
        aka: {
            q: 'querySelector'
        }
    },
    customData: {

        innerHTML: String.raw `
<div class="header">User: <span class="username"></span></div>
<div class="count">Count: <span class="count-value"></span></div>
<div class="status">
Status: <span class="status-text"></span>
</div>
<div class="controls">
<button class="increment">+1</button>
<button class="decrement">-1</button>
<button class="reset">Reset</button>
</div>
        ` 
    }
};

class UserCounter extends HTMLElement {
    
    async connectedCallback() {
        // Setup roundabout for reactive property management
        // This will convert properties to getter/setters
        const [vm, propagator] = await roundabout({
            vm: this,
            ...raConfig,
        });
        // Render initial UI
        this.count = 0;
        this.username = 'User';
        this.status = 'low';
        this.statusMessage = '';
        this.renderCount = 0;
        this.template = template;

        
        //addLog(`UserCounter connected: ${this.username}`);
        
        // Get initial attributes
        if (this.hasAttribute('username')) {
            this.username = this.getAttribute('username');
        }
        if (this.hasAttribute('initial-count')) {
            this.count = parseInt(this.getAttribute('initial-count'), 10) || 0;
        }
        

        
        // Get button references
        
        

        
        // IMPORTANT: vm and this are the same object reference
        // roundabout modifies this in place, so we can continue using this
        // But we store vm for clarity
        this._vm = vm;
        
        // Store propagator for cleanup
        this._propagator = propagator;
        

    }



    createClone(self){
        const {template} = self;
        const clone = template.content.cloneNode(true);
        const incrementButton = clone.querySelector('.increment');
        const decrementButton = clone.querySelector('.decrement');
        const resetButton = clone.querySelector('.reset');
        return {
            incrementButton,
            decrementButton,
            resetButton,
            clone,
        }
    }
    

    
    // Action method: Calculate status based on count
    updateStatus(self) {
        const {count} = self;
        //console.log('updateStatus', {count});
        
        let newStatus;
        let newMessage;
        
        if (count < 10) {
            newStatus = 'low';
            newMessage = 'Low count';
        } else if (count < 20) {
            newStatus = 'medium';
            newMessage = 'Medium count';
        } else {
            newStatus = 'high';
            newMessage = 'High count!';
        }
        
        return {
            status: newStatus,
            statusMessage: newMessage,
            
        };
    }
    
    // User actions
    increment(self) {
        return {
            count: self.count + 1,
        }
    }
    
    decrement(self) {
        return {
            count: self.count - 1,
        }
    }
    
    reset(self) {
        return {
            count: 0
        }
    }
    
    // UI rendering methods
    render(self) {
        return {
            '?.appendChild': self.clone,
            clone: self,
        }
    }
    

    
    updateStatusDisplay(self) {
        const {status, statusMessage} = self;
        return {
            '?.clone?.q?..status?.className': `status ${status}`,
            '?.clone?.q?..status-text?.textContent': statusMessage || status,
        }
    }

    updateUsernameDisplay(self) {
        return {
            '?.clone?.q?..username?.textContent': self.username
        }
    }

    updateCountDisplay(self) {
        return {
            '?.clone?.q?..count-value?.textContent': self.count,
            renderCount: 1,
        }
    }

    disconnectedCallback() {
        addLog(`UserCounter disconnected: ${this.username}`);
        // Cleanup is handled automatically by roundabout's AbortController
    }
    

}
```



My goal is that by reading README.md, what AI, at least, would have come up with  would be closer to the second than the first.  Ideally a human too.

The README.md states:

> As we will see below, roundabout can JSON serialize much of the logic, making parsing the instructions easier on the browser.

Maybe there should be more emphasis on this -- that lots of imperative code is seen as failure to roundabout, that roundabout isn't living up to its potential.

Some of what you see here are things that have been added to the assign-gingerly package after AI generated the initial take on the class (like support for withMethods). 

I wonder if we should include in this README.md an introduction to the most salient features of assign-gingerly, as it pertains to roundabout, in addition to the existing link.  Would that help AI, do you think?

This was kind of concerning in the original take:

```JavaScript
    actions: {
        calculateStatus: {
            ifAllOf: ['count'],  // Fire when count is truthy (always, since it's a number)
            do: 'updateStatus'
        }
    },
```

There may be some obscure role for do in actions (like auto generating a class), but normally do should never be used for actions.  "calculateStatus" is the name of the method, and giving it another name is confusing. 

The do property is mostly only to be used by positractions

The type of LogicOp in the types file, that is shared by both actions and positractions, does have a do property.  Can you check if the do property is used at all within an action?  If not, maybe we should extend LogicOp with do, and make positractions refer to the extended one, and not actions?

This also took me by surprise:

```JavaScript
// When status changes, update the status message
echo_status_to_statusMessage: 0
```

This is puzzling, because this literally means "make the status value get copied to the statusMessage property", but those two values are generally calculated differently from what I can tell.

Anything else you can think of for updating README.md would to get more fidelity of the goal of roundabout (declarative, JSON serializable configuration and declarative, easy to test code as much as possible) more obvious to AI engines how to achieve?  If so, please update at will.



