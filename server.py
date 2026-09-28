#!/usr/bin/env python3
"""Web UI + JSON API for the todo app, backed by the same SQLite DB as todo.py.

Usage:
  python3 server.py [port]      Default port: 8765

Then open http://localhost:8765 in your browser.
"""
import json
import os
import sqlite3
import subprocess
import sys
import threading
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

DB_DIR = os.path.expanduser("~/.todo")
DB_PATH = os.path.join(DB_DIR, "todo.db")
STATIC_DIR = os.path.realpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "static"))

PRIORITY_ORDER = {"high": 0, "med": 1, "low": 2}
RECURRENCE_OPTIONS = {"none", "daily", "weekly", "monthly", "yearly"}
NOTIFY_INTERVAL_SECONDS = 15 * 60
MAX_JSON_BODY = 2 * 1024 * 1024


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
    existing_cols = {row[1] for row in conn.execute("PRAGMA table_info(tasks)")}
    if "due_date" not in existing_cols:
        conn.execute("ALTER TABLE tasks ADD COLUMN due_date TEXT")
    if "recurrence" not in existing_cols:
        conn.execute("ALTER TABLE tasks ADD COLUMN recurrence TEXT NOT NULL DEFAULT 'none'")
    if "last_notified" not in existing_cols:
        conn.execute("ALTER TABLE tasks ADD COLUMN last_notified TEXT")
    if "canceled_at" not in existing_cols:
        conn.execute("ALTER TABLE tasks ADD COLUMN canceled_at TEXT")
    conn.commit()
    return conn


def row_to_dict(row):
    return {
        "id": row[0],
        "text": row[1],
        "priority": row[2],
        "done": bool(row[3]),
        "created_at": row[4],
        "completed_at": row[5],
        "due_date": row[6],
        "recurrence": row[7],
        "canceled": row[8] is not None,
        "canceled_at": row[8],
        "status": "canceled" if row[8] is not None else ("done" if row[3] else "pending"),
    }


def list_tasks():
    conn = get_conn()
    rows = conn.execute(
        "SELECT id, text, priority, done, created_at, completed_at, due_date, recurrence, canceled_at FROM tasks"
    ).fetchall()
    conn.close()
    tasks = [row_to_dict(row) for row in rows]
    tasks.sort(
        key=lambda task: (
            task["done"] or task["canceled"],
            task["due_date"] is None,
            task["due_date"] or "",
            PRIORITY_ORDER.get(task["priority"], 1),
            task["id"],
        )
    )
    return tasks


def next_due_date(current_due, recurrence):
    """Compute the next due date (YYYY-MM-DD) for a recurring task."""
    base = datetime.now().date()
    if recurrence == "daily":
        delta_days = 1
    elif recurrence == "weekly":
        delta_days = 7
    elif recurrence == "monthly":
        month = base.month + 1
        year = base.year + (month - 1) // 12
        month = (month - 1) % 12 + 1
        day = min(
            base.day,
            [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
                month - 1
            ],
        )
        return base.replace(year=year, month=month, day=day).isoformat()
    elif recurrence == "yearly":
        try:
            return base.replace(year=base.year + 1).isoformat()
        except ValueError:
            return base.replace(year=base.year + 1, day=28).isoformat()
    else:
        return None

    from datetime import timedelta

    return (base + timedelta(days=delta_days)).isoformat()


class Handler(BaseHTTPRequestHandler):
    def _send_json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
        except ValueError as exc:
            raise ValueError("invalid Content-Length") from exc
        if length == 0:
            return {}
        if length > MAX_JSON_BODY:
            raise ValueError("request body too large")
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise ValueError("malformed JSON body") from exc

    # Block DNS-rebinding and cross-site requests: only the app's own origin may talk to the server.
    def _request_allowed(self):
        port = self.server.server_address[1]
        allowed_hosts = {f"localhost:{port}", f"127.0.0.1:{port}"}
        if self.headers.get("Host", "") not in allowed_hosts:
            return False
        origin = self.headers.get("Origin")
        if origin is not None and origin not in {f"http://{h}" for h in allowed_hosts}:
            return False
        if self.command in ("POST", "PUT"):
            ctype = self.headers.get("Content-Type", "").split(";")[0].strip().lower()
            if ctype != "application/json":
                return False
        return True

    def _serve_static(self, path):
        if path == "/":
            path = "/index.html"
        path = urlparse(path).path
        requested = os.path.normpath(os.path.join(STATIC_DIR, path.lstrip("/")))
        real_path = os.path.realpath(requested)
        if real_path != STATIC_DIR and not real_path.startswith(STATIC_DIR + os.sep):
            self.send_error(403)
            return
        if not os.path.isfile(real_path):
            self.send_error(404)
            return

        ctype = "text/html"
        if real_path.endswith(".css"):
            ctype = "text/css"
        elif real_path.endswith(".js"):
            ctype = "application/javascript"

        with open(real_path, "rb") as fh:
            body = fh.read()

        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache, must-revalidate")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self._safe_dispatch(self._handle_GET)

    def do_POST(self):
        self._safe_dispatch(self._handle_POST)

    def do_PUT(self):
        self._safe_dispatch(self._handle_PUT)

    def do_DELETE(self):
        self._safe_dispatch(self._handle_DELETE)

    def _safe_dispatch(self, handler_fn):
        if not self._request_allowed():
            try:
                self._send_json({"error": "forbidden"}, 403)
            except Exception:
                pass
            return
        try:
            handler_fn()
        except (ValueError, KeyError) as exc:
            try:
                self._send_json({"error": str(exc) or "bad request"}, 400)
            except Exception:
                pass
        except Exception as exc:
            print(f"Unhandled error: {exc}", file=sys.stderr)
            try:
                self._send_json({"error": "internal server error"}, 500)
            except Exception:
                pass

    def _handle_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/tasks":
            self._send_json(list_tasks())
        else:
            self._serve_static(parsed.path)

    def _handle_POST(self):
        parsed = urlparse(self.path)
        parts = [part for part in parsed.path.split("/") if part]

        if parsed.path == "/api/tasks":
            data = self._read_json()
            text = (data.get("text") or "").strip()
            priority = (data.get("priority") or "med").lower()
            due_date = (data.get("due_date") or "").strip() or None
            recurrence = (data.get("recurrence") or "none").lower()
            if not text:
                self._send_json({"error": "text is required"}, 400)
                return
            if priority not in PRIORITY_ORDER:
                priority = "med"
            if recurrence not in RECURRENCE_OPTIONS:
                recurrence = "none"

            conn = get_conn()
            conn.execute(
                "INSERT INTO tasks (text, priority, done, created_at, due_date, recurrence) VALUES (?, ?, 0, ?, ?, ?)",
                (text, priority, datetime.now().isoformat(timespec="seconds"), due_date, recurrence),
            )
            conn.commit()
            new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
            conn.close()
            self._send_json({"id": new_id}, 201)
        elif len(parts) == 4 and parts[0] == "api" and parts[1] == "tasks" and parts[3] in ("done", "undone"):
            task_id = int(parts[2])
            conn = get_conn()
            new_task_id = None
            if parts[3] == "done":
                cur = conn.execute(
                    "UPDATE tasks SET done = 1, completed_at = ?, canceled_at = NULL WHERE id = ?",
                    (datetime.now().isoformat(timespec="seconds"), task_id),
                )
                if cur.rowcount > 0:
                    row = conn.execute(
                        "SELECT text, priority, due_date, recurrence FROM tasks WHERE id = ?",
                        (task_id,),
                    ).fetchone()
                    if row and row[3] and row[3] != "none":
                        text, priority, due_date, recurrence = row
                        new_due = next_due_date(due_date, recurrence)
                        conn.execute(
                            "INSERT INTO tasks (text, priority, done, created_at, due_date, recurrence) VALUES (?, ?, 0, ?, ?, ?)",
                            (text, priority, datetime.now().isoformat(timespec="seconds"), new_due, recurrence),
                        )
                        new_task_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
            else:
                cur = conn.execute("UPDATE tasks SET done = 0, completed_at = NULL WHERE id = ?", (task_id,))
            conn.commit()
            found = cur.rowcount > 0
            conn.close()
            payload = {"ok": found}
            if new_task_id is not None:
                payload["next_task_id"] = new_task_id
            self._send_json(payload, 200 if found else 404)
        elif len(parts) == 4 and parts[0] == "api" and parts[1] == "tasks" and parts[3] in ("cancel", "restore"):
            task_id = int(parts[2])
            conn = get_conn()
            if parts[3] == "cancel":
                cur = conn.execute(
                    "UPDATE tasks SET canceled_at = ?, done = 0, completed_at = NULL WHERE id = ?",
                    (datetime.now().isoformat(timespec="seconds"), task_id),
                )
            else:
                cur = conn.execute("UPDATE tasks SET canceled_at = NULL WHERE id = ?", (task_id,))
            conn.commit()
            found = cur.rowcount > 0
            conn.close()
            self._send_json({"ok": found}, 200 if found else 404)
        else:
            self.send_error(404)

    def _handle_PUT(self):
        parts = [part for part in urlparse(self.path).path.split("/") if part]
        if len(parts) == 3 and parts[0] == "api" and parts[1] == "tasks":
            task_id = int(parts[2])
            data = self._read_json()
            conn = get_conn()
            fields, values = [], []

            if "text" in data:
                fields.append("text = ?")
                values.append(data["text"])
            if "priority" in data and data["priority"] in PRIORITY_ORDER:
                fields.append("priority = ?")
                values.append(data["priority"])
            if "due_date" in data:
                fields.append("due_date = ?")
                values.append(data["due_date"] or None)
            if "recurrence" in data and data["recurrence"] in RECURRENCE_OPTIONS:
                fields.append("recurrence = ?")
                values.append(data["recurrence"])

            if not fields:
                conn.close()
                self._send_json({"error": "nothing to update"}, 400)
                return

            values.append(task_id)
            cur = conn.execute(f"UPDATE tasks SET {', '.join(fields)} WHERE id = ?", values)
            conn.commit()
            found = cur.rowcount > 0
            conn.close()
            self._send_json({"ok": found}, 200 if found else 404)
        else:
            self.send_error(404)

    def _handle_DELETE(self):
        parts = [part for part in urlparse(self.path).path.split("/") if part]
        if len(parts) == 3 and parts[0] == "api" and parts[1] == "tasks":
            task_id = int(parts[2])
            conn = get_conn()
            cur = conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
            conn.commit()
            found = cur.rowcount > 0
            conn.close()
            self._send_json({"ok": found}, 200 if found else 404)
        else:
            self.send_error(404)

    def log_message(self, fmt, *args):
        pass


def send_mac_notification(title, message):
    script = (
        f'display notification {json.dumps(message)} with title {json.dumps(title)} '
        f'sound name "Ping"'
    )
    try:
        subprocess.run(["osascript", "-e", script], capture_output=True, timeout=10)
    except Exception:
        pass


def check_due_notifications():
    today = datetime.now().date().isoformat()
    conn = get_conn()
    rows = conn.execute(
        "SELECT id, text, due_date FROM tasks "
        "WHERE done = 0 AND canceled_at IS NULL AND due_date IS NOT NULL AND due_date <= ? "
        "AND (last_notified IS NULL OR last_notified != ?)",
        (today, today),
    ).fetchall()
    for task_id, text, due_date in rows:
        label = "Overdue" if due_date < today else "Due today"
        send_mac_notification(f"{label}: {text}", f"Due {due_date}")
        conn.execute("UPDATE tasks SET last_notified = ? WHERE id = ?", (today, task_id))
    if rows:
        conn.commit()
    conn.close()


def notification_loop(stop_event):
    while not stop_event.is_set():
        try:
            check_due_notifications()
        except Exception as exc:
            print(f"[notify] error: {exc}", file=sys.stderr)
        stop_event.wait(NOTIFY_INTERVAL_SECONDS)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    server = ThreadingHTTPServer(("localhost", port), Handler)

    stop_event = threading.Event()
    notifier = threading.Thread(target=notification_loop, args=(stop_event,), daemon=True)
    notifier.start()

    print(f"Todo UI running at http://localhost:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()
    finally:
        stop_event.set()


if __name__ == "__main__":
    main()
