# Positractions Implementation - Complete

## Overview

Positractions (short for "positional reactions") have been successfully implemented. They enable calling generic, view-model-neutral functions with positional parameters and assigning results by position.

## Pattern

```typescript
positractions: [
    {
        ifKeyIn: ['prop1', 'prop2'],      // Dependencies
        do: functionOrMethodName,          // Function to call
        pass: ['prop1', 'prop2', literal], // Arguments (optional)
        assignTo: ['result1', 'result2']   // Where to assign results
    }
]
```

## Key Features

### 1. Positional Parameters
- By default, `ifKeyIn` properties passed as arguments in order
- `pass` array overrides default parameter passing
- Supports properties, literals (numbers, booleans), and special values

### 2. Positional Results
- Results assigned by position in `assignTo` array
- Non-array results treated as single-element arrays
- Use `null` to skip unwanted results

### 3. Generic Function Support
- Call any function without view model coupling
- Perfect for Math functions, utilities, pure functions
- High reusability across applications

### 4. Pass Parameter Types

**Property names:**
```typescript
pass: ['age', 'height']  // Passes vm.age, vm.height
```

**Literal numbers:**
```typescript
pass: ['value', 10, 2.5]  // Passes vm.value, 10, 2.5
```

**Literal booleans:**
```typescript
pass: ['enabled', true, false]
```

**String literals (with backticks):**
```typescript
pass: ['`hello`']  // Forces string literal
```

**Self reference:**
```typescript
pass: ['$0']  // Passes vm itself
```

**Enhancement reference:**
```typescript
pass: ['$0+']  // Passes enhancement (for enhanced elements)
```

### 5. String Resolution Rules

For string values in `pass`:
1. If property exists on VM → pass property value
2. If property doesn't exist → pass as string literal
3. To force string literal → wrap in backticks

### 6. Conditional Execution
- `ifKeyIn`: Monitor these properties
- `ifAllOf`: Only execute when all truthy
- Combines both for conditional monitoring

### 7. JSON Serializable
- Use method names (strings) instead of function references
- Assign function to VM property for lookup

## Implementation Details

### File: `processors/positractions.ts`

**Key Functions:**
- `processPositractions()` - Main processor, sets up reactions
- `setupPositraction()` - Registers reactions for single positraction
- `executePositraction()` - Executes function with conditions check
- `buildArguments()` - Builds argument array from pass specification
- `assignResults()` - Assigns results by position, skipping nulls

**Argument Building:**
- Handles special values: `$0`, `$0+`, backtick strings
- Resolves property names to values
- Passes literals directly
- Falls back to string literal if property doesn't exist

**Result Assignment:**
- Converts non-array results to arrays
- Assigns by position to `assignTo` properties
- Skips `null` entries
- Handles missing results gracefully

## Test Coverage

All 3 positraction tests passing:

### 1. Basic Math.max (`tests/positractions/basic-max.html`)
- Tests generic function (Math.max)
- Verifies default parameter passing (ifKeyIn)
- Confirms automatic updates on property change

### 2. Custom Pass (`tests/positractions/custom-pass.html`)
- Tests custom pass array with properties and literals
- Verifies multiple return values
- Confirms correct argument passing

### 3. Tuple Result (`tests/positractions/tuple-result.html`)
- Tests multiple return values (tuple)
- Verifies null skipping in assignTo
- Confirms positional assignment

## Usage Examples

### Basic Generic Function
```typescript
const [vm] = await roundabout({
    vm: {age: 25, height: 68, max: 0},
    positractions: [{
        ifKeyIn: ['age', 'height'],
        do: Math.max,
        assignTo: ['max']
    }]
});
```

### Custom Pass Parameters
```typescript
function calculateRange(min, max, multiplier) {
    return [(max - min), (max - min) * multiplier];
}

const [vm] = await roundabout({
    vm: {min: 10, max: 50, range: 0, scaled: 0},
    positractions: [{
        ifKeyIn: ['min', 'max'],
        do: calculateRange,
        pass: ['min', 'max', 2],
        assignTo: ['range', 'scaled']
    }]
});
```

### Multiple Results with Skip
```typescript
const [vm] = await roundabout({
    vm: {value: 5, doubled: 0, squared: 0, plus10: 0},
    positractions: [{
        ifKeyIn: ['value'],
        do: (x) => [x * 2, x * x, x + 10],
        assignTo: ['doubled', null, 'plus10']  // Skip squared
    }]
});
```

### Method Name (JSON Serializable)
```typescript
class MyViewModel {
    value = 10;
    result = 0;
    
    myFunction = (x, multiplier) => x * multiplier;
}

const [vm] = await roundabout({
    vm: new MyViewModel(),
    positractions: [{
        ifKeyIn: ['value'],
        do: 'myFunction',
        pass: ['value', 3],
        assignTo: ['result']
    }]
});
```

## Documentation

Comprehensive documentation added to README.md:
- Pattern explanation
- Key concepts (positional params/results)
- Pass parameter types
- String resolution rules
- Skipping results with null
- Conditional execution
- Method names for JSON serialization
- Complex example (loop counter)
- Async support
- Comparison with other features
- Use cases
- Tips and best practices
- Quick reference

## Integration

Positractions integrate seamlessly with:
- **Compacts**: Can set properties that compacts monitor
- **Actions**: Can set properties that actions monitor
- **Infractions**: Can set properties that infractions monitor
- **Hitches**: Can set properties that hitches increment
- **Propagate**: Works with propagated properties for event firing

## Comparison with Other Features

| Feature | Positractions | Infractions | Actions |
|---------|---------------|-------------|---------|
| Function Type | Generic/pure | VM aware | VM aware |
| Parameters | Positional | Destructured | N/A |
| Results | Positional array | Object merge | Object merge |
| Reusability | High | Medium | Low |
| Best for | Pure functions | Calculations | Complex logic |

## Files Modified

1. **processors/positractions.ts** - Complete implementation (200 lines)
2. **README.md** - Added "Positractions Reference" section
3. **tests/positractions/** - Created 3 comprehensive tests

## All Tests Passing

Total: 25 tests passing
- ✓ 6 action tests
- ✓ 6 compact tests
- ✓ 3 hitch tests
- ✓ 3 infraction tests
- ✓ 3 positraction tests
- ✓ 2 basic tests
- ✓ 2 performance tests

## Benefits

1. **Generic Functions**: Reuse pure functions without view model coupling
2. **Positional Control**: Full control over parameter order and values
3. **Multiple Results**: Handle functions that return multiple values
4. **Skip Results**: Use null to ignore unwanted results
5. **JSON Serializable**: Use method names for configuration
6. **Flexible**: Mix properties, literals, and special values
7. **Pure**: Encourages pure, testable functions

## Future Enhancements

Possible improvements:
- Support for spread operator in pass
- Support for computed pass values
- Caching of function results
- Better TypeScript type inference
- Support for named tuple results
- Batch multiple positractions on same dependencies
