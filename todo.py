#!/usr/bin/env python3
"""A simple local to-do list app backed by SQLite.

Usage:
  todo add "Buy milk"                 Add a new task
  todo add "Buy milk" -p high         Add a task with priority (low/med/high)
  todo list                           List pending tasks
  todo list --all                     List all tasks (including done)
  todo done <id>                      Mark a task as done
  todo cancel <id>                    Mark a task as canceled
  todo restore <id>                   Restore a canceled task
  todo undone <id>                    Mark a task as not done
  todo rm <id>                        Delete a task
  todo edit <id> "New text"           Edit a task's text
  todo clear                          Delete all completed tasks
"""
import argparse
import os
import sqlite3
import sys
from datetime import datetime

DB_DIR = os.path.expanduser("~/.todo")
DB_PATH = os.path.join(DB_DIR, "todo.db")

PRIORITY_ORDER = {"high": 0, "med": 1, "low": 2}
PRIORITY_LABEL = {"high": "!!!", "med": "!! ", "low": "!  "}


def get_conn():
    os.makedirs(DB_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL,
            priority TEXT NOT NULL DEFAULT 'med',
            done INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            completed_at TEXT
        )
        """
    )
    cols = {row[1] for row in conn.execute("PRAGMA table_info(tasks)")}
    if "canceled_at" not in cols:
        conn.execute("ALTER TABLE tasks ADD COLUMN canceled_at TEXT")
        conn.commit()
    return conn


def cmd_add(args):
    priority = args.priority.lower()
    if priority not in PRIORITY_ORDER:
        print(f"Invalid priority '{priority}'. Use low, med, or high.")
        sys.exit(1)
    conn = get_conn()
    conn.execute(
        "INSERT INTO tasks (text, priority, done, created_at) VALUES (?, ?, 0, ?)",
        (args.text, priority, datetime.now().isoformat(timespec="seconds")),
    )
    conn.commit()
    task_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    print(f"Added task #{task_id}: {args.text}")


def cmd_list(args):
    conn = get_conn()
    if args.all:
        rows = conn.execute(
            "SELECT id, text, priority, done, completed_at, canceled_at FROM tasks"
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT id, text, priority, done, completed_at, canceled_at FROM tasks "
            "WHERE done = 0 AND canceled_at IS NULL"
        ).fetchall()

    if not rows:
        print("No tasks found." if not args.all else "No tasks yet.")
        return

    rows.sort(key=lambda r: (r[3] or r[5] is not None, PRIORITY_ORDER.get(r[2], 1)))

    for id_, text, priority, done, completed_at, canceled_at in rows:
        mark = "[-]" if canceled_at else "[x]" if done else "[ ]"
        label = PRIORITY_LABEL.get(priority, "!! ")
        if canceled_at:
            suffix = f" (canceled on {canceled_at})"
        elif done and completed_at:
            suffix = f" (completed on {completed_at})"
        else:
            suffix = ""
        print(f"{mark} #{id_:<3} {label} {text}{suffix}")


def cmd_done(args):
    conn = get_conn()
    cur = conn.execute(
        "UPDATE tasks SET done = 1, completed_at = ?, canceled_at = NULL WHERE id = ?",
        (datetime.now().isoformat(timespec="seconds"), args.id),
    )
    conn.commit()
    if cur.rowcount == 0:
        print(f"No task with id {args.id}")
        sys.exit(1)
    print(f"Marked task #{args.id} as done.")


def cmd_undone(args):
    conn = get_conn()
    cur = conn.execute(
        "UPDATE tasks SET done = 0, completed_at = NULL WHERE id = ?", (args.id,)
    )
    conn.commit()
    if cur.rowcount == 0:
        print(f"No task with id {args.id}")
        sys.exit(1)
    print(f"Marked task #{args.id} as not done.")


def cmd_cancel(args):
    conn = get_conn()
    cur = conn.execute(
        "UPDATE tasks SET canceled_at = ?, done = 0, completed_at = NULL WHERE id = ?",
        (datetime.now().isoformat(timespec="seconds"), args.id),
    )
    conn.commit()
    if cur.rowcount == 0:
        print(f"No task with id {args.id}")
        sys.exit(1)
    print(f"Canceled task #{args.id}.")


def cmd_restore(args):
    conn = get_conn()
    cur = conn.execute("UPDATE tasks SET canceled_at = NULL WHERE id = ?", (args.id,))
    conn.commit()
    if cur.rowcount == 0:
        print(f"No task with id {args.id}")
        sys.exit(1)
    print(f"Restored task #{args.id}.")


def cmd_rm(args):
    conn = get_conn()
    cur = conn.execute("DELETE FROM tasks WHERE id = ?", (args.id,))
    conn.commit()
    if cur.rowcount == 0:
        print(f"No task with id {args.id}")
        sys.exit(1)
    print(f"Deleted task #{args.id}.")


def cmd_edit(args):
    conn = get_conn()
    cur = conn.execute("UPDATE tasks SET text = ? WHERE id = ?", (args.text, args.id))
    conn.commit()
    if cur.rowcount == 0:
        print(f"No task with id {args.id}")
        sys.exit(1)
    print(f"Updated task #{args.id}.")


def cmd_clear(args):
    conn = get_conn()
    cur = conn.execute("DELETE FROM tasks WHERE done = 1")
    conn.commit()
    print(f"Removed {cur.rowcount} completed task(s).")


def main():
    parser = argparse.ArgumentParser(
        prog="todo", description="A simple local to-do list app."
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_add = sub.add_parser("add", help="Add a new task")
    p_add.add_argument("text", help="Task description")
    p_add.add_argument(
        "-p", "--priority", default="med", help="Priority: low, med, or high"
    )
    p_add.set_defaults(func=cmd_add)

    p_list = sub.add_parser("list", help="List tasks")
    p_list.add_argument(
        "-a", "--all", action="store_true", help="Show completed and canceled tasks too"
    )
    p_list.set_defaults(func=cmd_list)

    p_done = sub.add_parser("done", help="Mark a task as done")
    p_done.add_argument("id", type=int)
    p_done.set_defaults(func=cmd_done)

    p_undone = sub.add_parser("undone", help="Mark a task as not done")
    p_undone.add_argument("id", type=int)
    p_undone.set_defaults(func=cmd_undone)

    p_cancel = sub.add_parser("cancel", help="Mark a task as canceled")
    p_cancel.add_argument("id", type=int)
    p_cancel.set_defaults(func=cmd_cancel)

    p_restore = sub.add_parser("restore", help="Restore a canceled task")
    p_restore.add_argument("id", type=int)
    p_restore.set_defaults(func=cmd_restore)

    p_rm = sub.add_parser("rm", help="Delete a task")
    p_rm.add_argument("id", type=int)
    p_rm.set_defaults(func=cmd_rm)

    p_edit = sub.add_parser("edit", help="Edit a task's text")
    p_edit.add_argument("id", type=int)
    p_edit.add_argument("text")
    p_edit.set_defaults(func=cmd_edit)

    p_clear = sub.add_parser("clear", help="Delete all completed tasks")
    p_clear.set_defaults(func=cmd_clear)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
