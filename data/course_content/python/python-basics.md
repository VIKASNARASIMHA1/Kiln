# Python basics

A variable is a name bound to a value. Python is dynamically typed, so the type belongs to the value, not the name. Common types are int, float, str, bool and None.

Use `if`, `elif` and `else` for decisions. A `for` loop iterates over any iterable, such as a list or `range(5)`. A `while` loop repeats until its condition becomes false, so make sure something inside changes the condition.

```python
total = 0
for n in range(1, 6):
    total += n
print(total)  # 15
```

Indentation defines blocks in Python. Mixing tabs and spaces causes an IndentationError.
