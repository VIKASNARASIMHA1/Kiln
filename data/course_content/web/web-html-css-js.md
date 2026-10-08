# HTML, CSS and JavaScript

HTML describes the structure of a page, CSS controls how it looks, and JavaScript adds behaviour. The browser turns HTML into the DOM, a tree of objects that JavaScript can read and change.

In JavaScript, use `const` for values that are not reassigned and `let` for those that are. Avoid `var`. Functions can be written as arrow functions, and arrays have methods such as `map`, `filter` and `reduce`.

```js
const prices = [10, 20, 30];
const doubled = prices.map(p => p * 2); // [20, 40, 60]
```

Events such as clicks are handled with `addEventListener`.
