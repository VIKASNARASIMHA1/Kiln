# Classes, exceptions and files

A class bundles data and behaviour. `__init__` sets up a new instance and `self` refers to that instance. Inheritance lets a subclass reuse and override behaviour from a parent class.

Exceptions signal errors. Wrap risky code in `try`, handle specific errors in `except`, and use `finally` for cleanup. Catch the narrowest exception you can, not a bare `except`.

The `with` statement manages resources such as files. It closes the file even if an error occurs.

```python
with open("notes.txt") as f:
    text = f.read()
```
