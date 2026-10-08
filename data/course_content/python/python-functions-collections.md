# Functions and collections

A function is defined with `def`, takes parameters and returns a value with `return`. A function without `return` gives back `None`. Default arguments let callers omit values, but never use a mutable default such as an empty list, because it is shared between calls.

A list is an ordered, mutable sequence. A dictionary maps unique keys to values and gives fast lookup by key. A list comprehension builds a list in one expression.

```python
squares = [n * n for n in range(5)]   # [0, 1, 4, 9, 16]
ages = {"asha": 21, "ravi": 25}
print(ages["asha"])
```
