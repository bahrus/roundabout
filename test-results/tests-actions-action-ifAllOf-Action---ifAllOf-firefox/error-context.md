# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests\actions\action-ifAllOf.spec.mjs >> Action - ifAllOf
- Location: tests\actions\action-ifAllOf.spec.mjs:3:1

# Error details

```
Error: expect(locator).toHaveAttribute(expected) failed

Locator:  locator('#target')
Expected: "good"
Received: "bad"
Timeout:  5000ms

Call log:
  - Expect "toHaveAttribute" with timeout 5000ms
  - waiting for locator('#target')
    8 × locator resolved to <div mark="bad" id="target">✗ Test failed! Expected formValid=true, got false</div>
      - unexpected value "bad"

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]: ✗ Test failed! Expected formValid=true, got false
  - generic [ref=e3]:
    - paragraph [ref=e4]: Starting ifAllOf action test...
    - paragraph [ref=e5]: Imported roundabout
    - paragraph [ref=e6]: Created myObject
    - paragraph [ref=e7]: Roundabout initialized
    - paragraph [ref=e8]: "Initial: formValid=false"
    - paragraph [ref=e9]: Set username
    - paragraph [ref=e10]: "After username: formValid=false"
    - paragraph [ref=e11]: Set password
    - paragraph [ref=e12]: "After password: formValid=false"
    - paragraph [ref=e13]: "validateForm called! Changed: email"
    - paragraph [ref=e14]: Set email
    - paragraph [ref=e15]: "After email: formValid=false"
    - paragraph [ref=e16]: TEST FAILED
```

# Test source

```ts
  1 | import { test, expect } from '@playwright/test';
  2 | 
  3 | test('Action - ifAllOf', async ({ page }) => {
  4 |     await page.goto('./tests/actions/action-ifAllOf.html');
  5 |     await page.waitForTimeout(2000);
  6 |     const target = page.locator('#target');
> 7 |     await expect(target).toHaveAttribute('mark', 'good');
    |                          ^ Error: expect(locator).toHaveAttribute(expected) failed
  8 | });
  9 | 
```