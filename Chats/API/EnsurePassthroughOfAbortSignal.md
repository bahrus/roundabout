# Ensure Passthrough Of Abort Signal

---

## Human Ask

The roundaboutFeature isn't currently setting the RAController.  

I think we need to, and make sure the signal is passed to all assignFrom's, used by the merges option.  

We are currently creating the roundaboutSyncup in the constructor, but I think we need to add the disconnected callback, which aborts the controller.

And we need to add the connectedCallback to roundAbourHeature, that reconnects the roundaboutSync in the constructor only if disconnectedCallback was called.

Please do a lightweight inspection of the code pathways to make sure that eventHandlers that are invoked in assignGingerly with the += command, that the signal is passed through.  If this seems difficult to determine, please don't burn many tokens walking through it.  I will add console.logs as needed to make sure it gets passed through the food chain.

If you see any obvious "breakages" that could lead to a memory leak that needs addressing in the assign-gingerly library, please flag as such below, and I will work to rectify that.

Please make sure we are on the same page by providing your findings / implementation plan / concerns / blockers below.

Once we are on the same page I will ask you to implement it.

