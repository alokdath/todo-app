#!/bin/bash
# Wait for the local todo server to be ready, then open the native Todo.app window.
URL="http://localhost:8765"
for i in $(seq 1 30); do
  if curl -s -o /dev/null "$URL"; then
    open "$HOME/Applications/Todo.app"
    exit 0
  fi
  sleep 1
done
