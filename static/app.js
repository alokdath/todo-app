const taskList = document.getElementById("task-list");
const emptyMsg = document.getElementById("empty-msg");
const taskNewBtn = document.getElementById("task-new-btn");
const filterBtns = document.querySelectorAll(".filter-btn");
const taskSearchInput = document.getElementById("task-search");
const taskSortSelect = document.getElementById("task-sort");
const themeToggleBtn = document.getElementById("theme-toggle");
const taskDetailPane = document.getElementById("task-detail-pane");
const detailBackdrop = document.getElementById("detail-backdrop");

const toastContainer = document.getElementById("toast-container");
const confirmModal = document.getElementById("confirm-modal");
const confirmMessage = document.getElementById("confirm-message");
const confirmOkBtn = document.getElementById("confirm-ok");
const confirmCancelBtn = document.getElementById("confirm-cancel");

let currentFilter = "pending";
let currentSort = "default";
let taskSearch = "";
let tasks = [];
let selectedTaskId = null;
let isNewTask = false;

const FILTER_LABELS = { pending: "Pending", today: "Today", overdue: "Overdue", all: "All", done: "Done", canceled: "Canceled" };
const PRIORITY_ORDER = { high: 0, med: 1, low: 2 };

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function isOpen(task) {
  return !task.done && !task.canceled;
}

function isOverdue(task) {
  return !!task.due_date && isOpen(task) && task.due_date < todayStr();
}

function isDueToday(task) {
  return !!task.due_date && isOpen(task) && task.due_date === todayStr();
}

function formatCompletedDate(completedAt) {
  const datePart = completedAt.slice(0, 10);
  if (datePart === todayStr()) return "Today";
  const date = new Date(completedAt);
  if (Number.isNaN(date.getTime())) return datePart;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function animateRemoval(el) {
  return new Promise((resolve) => {
    if (!el) return resolve();
    el.classList.add("removing");
    setTimeout(resolve, 180);
  });
}

function showToast(message, action) {
  const toast = document.createElement("div");
  toast.className = "toast";

  const text = document.createElement("span");
  text.textContent = message;
  toast.appendChild(text);

  let timer;
  if (action) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toast-action";
    btn.textContent = action.label;
    btn.addEventListener("click", () => {
      clearTimeout(timer);
      toast.remove();
      action.onClick();
    });
    toast.appendChild(btn);
  }

  toastContainer.appendChild(toast);
  timer = setTimeout(() => {
    toast.remove();
    if (action && action.onExpire) action.onExpire();
  }, action ? 6000 : 3000);
}

function trapFocus(container) {
  const previouslyFocused = document.activeElement;
  const focusable = () =>
    [...container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
      (el) => !el.disabled && el.offsetParent !== null
    );

  const first = focusable()[0];
  if (first) first.focus();

  const onKeydown = (e) => {
    if (e.key !== "Tab") return;
    const items = focusable();
    if (items.length === 0) return;
    const firstEl = items[0];
    const lastEl = items[items.length - 1];
    if (e.shiftKey && document.activeElement === firstEl) {
      e.preventDefault();
      lastEl.focus();
    } else if (!e.shiftKey && document.activeElement === lastEl) {
      e.preventDefault();
      firstEl.focus();
    }
  };

  container.addEventListener("keydown", onKeydown);
  return () => {
    container.removeEventListener("keydown", onKeydown);
    if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
  };
}

function showConfirm(message) {
  return new Promise((resolve) => {
    confirmMessage.textContent = message;
    confirmModal.hidden = false;
    const releaseFocus = trapFocus(document.querySelector("#confirm-modal .confirm-box"));

    const cleanup = (result) => {
      confirmModal.hidden = true;
      confirmOkBtn.removeEventListener("click", onOk);
      confirmCancelBtn.removeEventListener("click", onCancel);
      releaseFocus();
      resolve(result);
    };

    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);

    confirmOkBtn.addEventListener("click", onOk);
    confirmCancelBtn.addEventListener("click", onCancel);
  });
}

function applyTheme(theme) {
  document.body.classList.toggle("dark", theme === "dark");
  themeToggleBtn.innerHTML = "";
  themeToggleBtn.appendChild(iconEl(theme === "dark" ? "sun" : "moon"));
}

function initTheme() {
  applyTheme(localStorage.getItem("theme") || "light");
}

themeToggleBtn.addEventListener("click", () => {
  const nextTheme = document.body.classList.contains("dark") ? "light" : "dark";
  localStorage.setItem("theme", nextTheme);
  applyTheme(nextTheme);
});

initTheme();

async function fetchTasks() {
  const res = await fetch("/api/tasks");
  tasks = await res.json();
  renderTaskList();
  renderTaskDetail();
}

function updateFilterCounts() {
  const counts = {
    pending: tasks.filter(isOpen).length,
    today: tasks.filter(isDueToday).length,
    overdue: tasks.filter(isOverdue).length,
    all: tasks.length,
    done: tasks.filter((task) => task.done).length,
    canceled: tasks.filter((task) => task.canceled).length,
  };

  filterBtns.forEach((btn) => {
    const key = btn.dataset.filter;
    btn.textContent = `${FILTER_LABELS[key]} (${counts[key]})`;
  });
}

function sortTasks(list) {
  const sorted = [...list];
  if (currentSort === "priority") {
    sorted.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.id - b.id);
  } else if (currentSort === "alpha") {
    sorted.sort((a, b) => a.text.localeCompare(b.text));
  } else {
    sorted.sort((a, b) => {
      if (!!a.due_date !== !!b.due_date) return a.due_date ? -1 : 1;
      if (a.due_date && b.due_date && a.due_date !== b.due_date) return a.due_date < b.due_date ? -1 : 1;
      return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.id - b.id;
    });
  }
  return sorted;
}

function buildTaskRow(task) {
  const li = document.createElement("li");
  li.className =
    "item-row task" +
    (task.done ? " done" : "") +
    (task.canceled ? " canceled" : "") +
    (isOverdue(task) ? " overdue" : "") +
    (selectedTaskId === task.id ? " selected" : "");
  li.tabIndex = 0;

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = task.done;
  checkbox.addEventListener("click", (e) => e.stopPropagation());
  checkbox.addEventListener("change", () => toggleDone(task));

  const dot = document.createElement("span");
  dot.className = "priority-dot " + task.priority;
  dot.title = task.priority + " priority";

  const main = document.createElement("div");
  main.className = "item-row-main";

  const text = document.createElement("span");
  text.className = "text";
  text.textContent = task.text;
  main.appendChild(text);

  const badges = document.createElement("div");
  badges.className = "item-row-badges";

  if (task.due_date) {
    const due = document.createElement("span");
    due.className = "due-badge" + (isOverdue(task) ? " overdue" : isDueToday(task) ? " due-today" : "");
    due.textContent = isDueToday(task) ? "Due Today" : "Due " + task.due_date;
    badges.appendChild(due);
  }

  if (task.recurrence && task.recurrence !== "none") {
    const repeatBadge = document.createElement("span");
    repeatBadge.className = "repeat-badge";
    repeatBadge.appendChild(iconEl("repeat"));
    repeatBadge.append(" " + task.recurrence);
    repeatBadge.title = `Repeats ${task.recurrence}`;
    badges.appendChild(repeatBadge);
  }

  if (task.done && task.completed_at) {
    const completed = document.createElement("span");
    completed.className = "completed-badge";
    completed.textContent = "Completed " + formatCompletedDate(task.completed_at);
    badges.appendChild(completed);
  }

  if (task.canceled) {
    const canceled = document.createElement("span");
    canceled.className = "canceled-badge";
    canceled.textContent = "Canceled" + (task.canceled_at ? " " + formatCompletedDate(task.canceled_at) : "");
    badges.appendChild(canceled);
  }

  if (badges.childElementCount) main.appendChild(badges);

  const del = document.createElement("button");
  del.className = "delete-btn row-hover-action";
  del.appendChild(iconEl("trash"));
  del.title = "Delete";
  del.addEventListener("click", (e) => {
    e.stopPropagation();
    deleteTask(task.id, task.text, li);
  });

  li.append(checkbox, dot, main, del);

  li.addEventListener("click", () => selectTask(task.id));
  li.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && document.activeElement === li) selectTask(task.id);
  });

  return li;
}

function renderTaskList() {
  updateFilterCounts();

  const term = taskSearch.trim().toLowerCase();
  let filtered = tasks.filter((task) => {
    if (currentFilter === "pending" && !isOpen(task)) return false;
    if (currentFilter === "done" && !task.done) return false;
    if (currentFilter === "canceled" && !task.canceled) return false;
    if (currentFilter === "overdue" && !isOverdue(task)) return false;
    if (currentFilter === "today" && !isDueToday(task)) return false;
    if (term && !task.text.toLowerCase().includes(term)) return false;
    return true;
  });

  filtered = sortTasks(filtered);
  taskList.innerHTML = "";

  if (filtered.length === 0) {
    emptyMsg.hidden = false;
    emptyMsg.textContent = term
      ? "No tasks match your search."
      : currentFilter === "done"
      ? "No completed tasks yet."
      : currentFilter === "canceled"
      ? "No canceled tasks."
      : currentFilter === "overdue"
      ? "Nothing overdue 🎉"
      : currentFilter === "today"
      ? "Nothing due today 🎉"
      : "No tasks here. Click + New Task to add one.";
  } else {
    emptyMsg.hidden = true;
  }

  for (const task of filtered) taskList.appendChild(buildTaskRow(task));
}

function selectTask(id) {
  isNewTask = false;
  selectedTaskId = id;
  renderTaskList();
  renderTaskDetail();
}

function buildTaskDetailForm(task, isNew) {
  const wrap = document.createElement("div");
  wrap.className = "detail-form";

  const header = document.createElement("div");
  header.className = "detail-form-header";

  const heading = document.createElement("h2");
  heading.textContent = isNew ? "New Task" : "Edit Task";
  header.appendChild(heading);

  if (!isNew) {
    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn-danger";
    del.textContent = "Delete";
    del.addEventListener("click", () => deleteTask(task.id, task.text, null));
    header.appendChild(del);
  }

  wrap.appendChild(header);

  const textInputEl = document.createElement("input");
  textInputEl.type = "text";
  textInputEl.placeholder = "What needs doing?";
  textInputEl.value = isNew ? "" : task.text;
  textInputEl.className = "detail-text-input";

  const row = document.createElement("div");
  row.className = "detail-form-row";

  const prioritySelect = document.createElement("select");
  for (const priority of ["low", "med", "high"]) {
    const opt = document.createElement("option");
    opt.value = priority;
    opt.textContent = priority.charAt(0).toUpperCase() + priority.slice(1) + " priority";
    if ((isNew ? "med" : task.priority) === priority) opt.selected = true;
    prioritySelect.appendChild(opt);
  }

  const dateInputEl = document.createElement("input");
  dateInputEl.type = "date";
  dateInputEl.title = "Due by";
  dateInputEl.value = isNew ? todayStr() : task.due_date || "";

  const recurrenceSelect = document.createElement("select");
  for (const [value, label] of [
    ["none", "No repeat"],
    ["daily", "Daily"],
    ["weekly", "Weekly"],
    ["monthly", "Monthly"],
    ["yearly", "Yearly"],
  ]) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    if ((isNew ? "none" : task.recurrence || "none") === value) opt.selected = true;
    recurrenceSelect.appendChild(opt);
  }

  row.append(prioritySelect, dateInputEl, recurrenceSelect);

  if (!isNew && task.done) {
    const undoneBtn = document.createElement("button");
    undoneBtn.type = "button";
    undoneBtn.className = "btn-secondary";
    undoneBtn.textContent = "Mark as not done";
    undoneBtn.addEventListener("click", () => toggleDone(task));
    row.appendChild(undoneBtn);
  } else if (!isNew) {
    const doneBtn = document.createElement("button");
    doneBtn.type = "button";
    doneBtn.className = "btn-secondary";
    doneBtn.textContent = "Mark as done";
    doneBtn.addEventListener("click", () => toggleDone(task));
    row.appendChild(doneBtn);
  }

  if (!isNew) {
    const cancelTaskBtn = document.createElement("button");
    cancelTaskBtn.type = "button";
    cancelTaskBtn.className = "btn-secondary";
    cancelTaskBtn.textContent = task.canceled ? "Restore task" : "Cancel task";
    cancelTaskBtn.addEventListener("click", () => toggleCanceled(task));
    row.appendChild(cancelTaskBtn);
  }

  const actions = document.createElement("div");
  actions.className = "detail-form-actions";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "btn-primary";
  saveBtn.textContent = isNew ? "Add Task" : "Save";
  saveBtn.addEventListener("click", async () => {
    const text = textInputEl.value.trim();
    if (!text) return;

    const payload = {
      text,
      priority: prioritySelect.value,
      due_date: dateInputEl.value || null,
      recurrence: recurrenceSelect.value,
    };

    if (isNew) {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      isNewTask = false;
      showToast("Task added");
      await fetchTasks();
      const created = [...tasks].sort((a, b) => b.id - a.id)[0];
      if (created) selectTask(created.id);
    } else {
      await fetch(`/api/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      showToast("Task updated");
      await fetchTasks();
    }
  });

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "cancel-btn";
  cancelBtn.textContent = isNew ? "Discard" : "Close";
  cancelBtn.addEventListener("click", closeDetailPane);

  actions.append(saveBtn, cancelBtn);
  wrap.append(textInputEl, row, actions);

  wrap.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      saveBtn.click();
    } else if (e.key === "Escape") {
      cancelBtn.click();
    }
  });

  return wrap;
}

function renderTaskDetail() {
  taskDetailPane.innerHTML = "";

  const isOpen = isNewTask || !!tasks.find((item) => item.id === selectedTaskId);
  taskDetailPane.classList.toggle("open", isOpen);
  detailBackdrop.hidden = !isOpen;

  if (isNewTask) {
    taskDetailPane.appendChild(buildTaskDetailForm(null, true));
    return;
  }

  const task = tasks.find((item) => item.id === selectedTaskId);
  if (!task) {
    return;
  }

  taskDetailPane.appendChild(buildTaskDetailForm(task, false));
}

function closeDetailPane() {
  isNewTask = false;
  selectedTaskId = null;
  renderTaskList();
  renderTaskDetail();
}

detailBackdrop.addEventListener("click", closeDetailPane);

async function toggleDone(task) {
  const action = task.done ? "undone" : "done";
  await fetch(`/api/tasks/${task.id}/${action}`, { method: "POST" });
  await fetchTasks();
}

async function toggleCanceled(task) {
  const action = task.canceled ? "restore" : "cancel";
  await fetch(`/api/tasks/${task.id}/${action}`, { method: "POST" });
  showToast(task.canceled ? "Task restored" : "Task canceled", task.canceled ? null : {
    label: "Undo",
    onClick: async () => {
      await fetch(`/api/tasks/${task.id}/restore`, { method: "POST" });
      await fetchTasks();
    },
  });
  await fetchTasks();
}

async function deleteTask(id, text, li) {
  const ok = await showConfirm(`Delete task "${text}"?`);
  if (!ok) return;
  if (li) await animateRemoval(li);
  if (selectedTaskId === id) selectedTaskId = null;
  await fetch(`/api/tasks/${id}`, { method: "DELETE" });
  showToast("Task deleted");
  await fetchTasks();
}

taskNewBtn.addEventListener("click", () => {
  isNewTask = true;
  selectedTaskId = null;
  renderTaskList();
  renderTaskDetail();
});

filterBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    filterBtns.forEach((item) => item.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    renderTaskList();
  });
});

taskSearchInput.addEventListener("input", () => {
  taskSearch = taskSearchInput.value;
  renderTaskList();
});

taskSortSelect.addEventListener("change", () => {
  currentSort = taskSortSelect.value;
  renderTaskList();
});

document.getElementById("logo-icon").appendChild(iconEl("check"));
document.getElementById("task-search-icon").appendChild(iconEl("search"));

renderTaskDetail();
fetchTasks();
