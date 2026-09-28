# Todo App

A lightweight local to-do list with a command-line interface and a web UI, built with only the Python standard library and SQLite.

## Features
- Add, edit, complete, cancel/restore and delete tasks
- Priorities (low / med / high)
- CLI (`todo.py`) and browser UI (`server.py`) share the same database
- No external dependencies

## Run
```bash
# Web UI
python3 server.py            # then open http://localhost:8765

# CLI
python3 todo.py add "Buy milk" -p high
python3 todo.py list
python3 todo.py done 1
```

Data is stored locally in `~/.todo/todo.db` (not part of this repo).
