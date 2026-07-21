# Infractions Implementation - Complete

## Overview

Infractions (short for "inferred reactions") have been successfully implemented. They automatically determine dependencies by parsing function parameters, eliminating the need to explicitly declare which properties trigger reactions.

## Pattern

```typescript
const [vm] = await roundabout({
    vm: myObject,
    // ... options
}, [
    // Infractions array - second parameter to roundabout()
    ({age}) => ({agePlus10: age + 10}),
    'doSearch',
    myFunction
]);
```

## Key Features

### 1. Automatic Dependency Detection
- Parses function parameters to extract property names
- Supports destructured parameters: `({age, name}) => ...`
- Registers reactions for all detected properties

### 2. Three Definition Styles

**Inline Functions:**
```typescript
[({age}) => ({agePlus10: age + 10})]
```
- Pros: Locality of behavior, easy to understand
- Cons: Not JSON serializable

**Method Names:**
```typescript
['doSearch']
```
- Pros: JSON serializable, clean separation
- Cons: Extra indirection

**Function References:**
```typescript
[calcAgePlus10]
```
- Pros: Reusable, testable
- Cons: Requires assignment to instance for JSON serialization

### 3. Multiple Dependencies
Automatically detects all destructured parameters:
```typescript
({width, height}) => ({area: width * height})
// Detects dependencies: ['width', 'height']
```

### 4. Async Support
Supports both sync and async functions:
```typescript
async ({userId}) => {
    const data = await fetchUser(userId);
    return {userData: data};
}
```

### 5. Initial Execution
Infractions run immediately on initialization to set initial values.

## Implementation Details

### File: `processors/infractions.ts`

**Key Functions:**
- `processInfractions()` - Main processor, registers reactions for each infraction
- `extractParameterNames()` - Parses function to extract destructured parameter names
- `executeInfraction()` - Executes function and merges results via assignGingerly

**Parameter Parsing:**
- Uses regex to extract function parameters
- Handles destructured parameters: `{age, name}`
- Handles default values: `{age = 0}`
- Handles aliases: `{age: userAge}`
- Returns array of property names

**Reaction Registration:**
- For each detected parameter, registers a reaction
- Reaction calls the infraction function
- Results merged back into VM via assignGingerly

### Parameter Extraction Examples

```typescript
({age}) => ...
// Extracts: ['age']

({width, height}) => ...
// Extracts: ['width', 'height']

({age = 0, name = ''}) => ...
// Extracts: ['age', 'name']

({age: userAge}) => ...
// Extracts: ['age']
```

## Test Coverage

All 3 infraction tests passing:

### 1. Inline Function (`tests/infractions/inline-function.html`)
- Tests inline function with single parameter
- Verifies dependency detection
- Confirms automatic updates on property change

### 2. Method Name (`tests/infractions/method-name.html`)
- Tests method name reference
- Verifies method lookup on VM
- Confirms method execution and result merging

### 3. Multiple Parameters (`tests/infractions/multiple-params.html`)
- Tests function with multiple destructured parameters
- Verifies all dependencies detected
- Confirms updates when any dependency changes

## Usage Examples

### Simple Calculation
```typescript
const [vm] = await roundabout({
    vm: {age: 25, agePlus10: 0},
    propagate: ['age', 'agePlus10']
}, [
    ({age}) => ({agePlus10: age + 10})
]);
```

### Multiple Dependencies
```typescript
const [vm] = await roundabout({
    vm: {width: 10, height: 20, area: 0},
    propagate: ['width', 'height', 'area']
}, [
    ({width, height}) => ({area: width * height})
]);
```

### Method Name (JSON Serializable)
```typescript
class MyViewModel {
    searchString = '';
    results = [];
    
    doSearch({searchString}) {
        return {
            results: performSearch(searchString)
        };
    }
}

const [vm] = await roundabout({
    vm: new MyViewModel(),
    propagate: ['searchString', 'results']
}, [
    'doSearch'
]);
```

### Async Function
```typescript
const [vm] = await roundabout({
    vm: {userId: null, userData: null},
    propagate: ['userId', 'userData']
}, [
    async ({userId}) => {
        if (!userId) return {userData: null};
        const data = await fetchUser(userId);
        return {userData: data};
    }
]);
```

## Documentation

Comprehensive documentation added to README.md:
- Three definition styles
- Multiple dependencies
- How it works (parameter parsing)
- Function signature
- Async support
- Comparison with Actions
- Use cases
- Tips and best practices
- Quick reference

## Integration

Infractions integrate seamlessly with:
- **Compacts**: Can set properties that compacts monitor
- **Actions**: Can set properties that actions monitor
- **Hitches**: Can set properties that hitches increment
- **Propagate**: Works with propagated properties for event firing

## Comparison with Actions

| Feature | Infractions | Actions |
|---------|-------------|---------|
| Dependency Declaration | Inferred | Explicit |
| Syntax | Function params | Config object |
| Conditional Logic | Manual | Built-in |
| JSON Serializable | With method names | Yes |
| Best for | Simple calculations | Complex logic |

## Files Modified

1. **processors/infractions.ts** - Complete implementation (130 lines)
2. **README.md** - Added "Infractions Reference" section
3. **tests/infractions/** - Created 3 comprehensive tests

## All Tests Passing

Total: 22 tests passing
- ✓ 6 action tests
- ✓ 6 compact tests
- ✓ 3 hitch tests
- ✓ 3 infraction tests
- ✓ 2 basic tests
- ✓ 2 performance tests

## Benefits

1. **Less Boilerplate**: No need to explicitly declare dependencies
2. **Functional Style**: Clean, pure functions
3. **Easy to Test**: Functions are standalone and testable
4. **Flexible**: Three definition styles for different needs
5. **JSON Serializable**: When using method names
6. **Async Support**: Works with async operations

## Future Enhancements

Possible improvements:
- Support for nested destructuring
- Support for rest parameters
- Support for array destructuring
- Caching of parsed parameters
- Better error messages for invalid functions
- TypeScript type inference for parameters
