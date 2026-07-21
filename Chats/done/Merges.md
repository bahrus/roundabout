# Merges

I would like to add another category to the Round About Config:  Merges.  These would be 100% JSON serializable with no need for a method or code.

It isn't well documented yet, but the assign-gingerly package has an exported module:  assignFrom.js.  You can see it in the node_modules/assign-gingerly folder, and is nicely commented.



I would like to be able to replace this in custome-element-example.html:

```JavaScript
const raConfig = {
    ...
    actions: {
        ...
        updateUsernameDisplay: {
            ifKeyIn: ['username'],
            ifAllOf: ['clone'],
        },
    }

}

class UserCounter extends HTMLElement {
    updateUsernameDisplay(self) {
        return {
            '?.clone?.q?..username?.textContent': self.username
        }
    }
}
```

with simply:

```JavaScript
const raConfig = {
    ...
    merges: [
         {
            ifKeyIn: ['username'],
            ifAllOf: ['clone'],
            assignFrom: {
                '?.clone?.q?..username?.textContent': '?.username'
            }
        },
    ]

}

```

So the "from" property passed  into the assignFrom function would be the vm.


