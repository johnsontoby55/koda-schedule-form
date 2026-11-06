// Renders the day x AM/PM "when are you UNAVAILABLE" grid from
// classes.json and posts the submission to the Apps Script web app defined
// in config.js.
//
// 2026-11 redesign: this used to be an opt-in grid (check every class you
// can coach). Coaches were under-selecting classes they actually wanted,
// so it's now opt-out - mark only the day/half-days you CANNOT coach;
// everything else is assumed available. Backend (Code.js) and the
// generator (buildAvailability.js) both expand "unavailable" against
// classes.json to get the same per-class availability the scheduler needs.

const gridContainer = document.getElementById("grid-container");
const form = document.getElementById("availability-form");
const submitBtn = document.getElementById("submit-btn");
const statusMsg = document.getElementById("status-msg");
const weekOfInput = document.getElementById("week-of");
const nameInput = document.getElementById("coach-name");
const notesField = document.getElementById("notes");
const copyLastBtn = document.getElementById("copy-last-btn");
const noAvailabilityBtn = document.getElementById("no-availability-btn");
const quickStatusMsg = document.getElementById("quick-status-msg");

// Day name -> the 3-letter prefix used in classes.json ids and in the
// "unavailable" day/half-day codes this form submits (mon-am, mon-pm, ...).
// Must match generator/src/buildAvailability.js's DAY_PREFIX exactly.
const DAY_PREFIX = {
  Monday: "mon",
  Tuesday: "tue",
  Wednesday: "wed",
  Thursday: "thu",
  Friday: "fri",
  Saturday: "sat",
  Sunday: "sun",
};

// Default the date field to the coming Monday, to nudge people toward the right week.
function upcomingMonday() {
  const d = new Date();
  const day = d.getDay(); // 0 = Sunday
  const diff = (8 - day) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}
weekOfInput.value = upcomingMonday();

let allHalfKeys = []; // every "dayPrefix-half" key that's actually rendered (has >=1 class)
const unavailableSet = new Set();

fetch("classes.json")
  .then((r) => r.json())
  .then((data) => {
    renderGrid(data);
  })
  .catch((err) => {
    gridContainer.innerHTML = `<p class="loading">Couldn't load the class grid (${err.message}). Reload the page or tell Toby.</p>`;
  });

function classHalf(cls) {
  const hour = parseInt(String(cls.time).split(":")[0], 10);
  return hour < 12 ? "am" : "pm";
}

function formatHalfTimes(classes) {
  // e.g. "5:30, 6:30, 8:30, 10:00" for the muted detail line under a toggle.
  return classes.map((c) => c.label.replace(/:00(?= ?[AP]M)/, "")).join(", ");
}

function renderGrid(data) {
  gridContainer.innerHTML = "";
  allHalfKeys = [];

  const intro = document.createElement("p");
  intro.className = "grid-intro";
  intro.textContent =
    "Mark any day/half-day you CANNOT coach. Leave everything else alone — it's assumed you're available.";
  gridContainer.appendChild(intro);

  for (const day of data.days) {
    const dayClasses = data.classes.filter((c) => c.day === day);
    if (dayClasses.length === 0) continue;

    const dayPrefix = DAY_PREFIX[day];
    const amClasses = dayClasses.filter((c) => classHalf(c) === "am");
    const pmClasses = dayClasses.filter((c) => classHalf(c) === "pm");

    const block = document.createElement("div");
    block.className = "day-block";

    const heading = document.createElement("h2");
    heading.textContent = day;
    block.appendChild(heading);

    const toggleRow = document.createElement("div");
    toggleRow.className = "half-toggle-row";

    if (amClasses.length > 0) {
      toggleRow.appendChild(makeHalfToggle(`${dayPrefix}-am`, "AM", amClasses));
    }
    if (pmClasses.length > 0) {
      toggleRow.appendChild(makeHalfToggle(`${dayPrefix}-pm`, "PM", pmClasses));
    }

    block.appendChild(toggleRow);
    gridContainer.appendChild(block);
  }
}

function makeHalfToggle(key, halfLabel, classesInHalf) {
  allHalfKeys.push(key);

  const wrap = document.createElement("div");
  wrap.className = "half-toggle-wrap";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "half-toggle";
  btn.id = `half-${key}`;
  btn.dataset.key = key;
  btn.textContent = halfLabel;
  btn.setAttribute("aria-pressed", "false");
  btn.addEventListener("click", () => setHalfUnavailable(key, !unavailableSet.has(key)));

  const detail = document.createElement("div");
  detail.className = "half-detail";
  detail.textContent = formatHalfTimes(classesInHalf);

  wrap.appendChild(btn);
  wrap.appendChild(detail);
  return wrap;
}

function setHalfUnavailable(key, unavailable) {
  const btn = document.getElementById(`half-${key}`);
  if (!btn) return;
  if (unavailable) {
    unavailableSet.add(key);
    btn.classList.add("unavailable");
    btn.setAttribute("aria-pressed", "true");
  } else {
    unavailableSet.delete(key);
    btn.classList.remove("unavailable");
    btn.setAttribute("aria-pressed", "false");
  }
}

function setAllUnavailable(keys, unavailable) {
  keys.forEach((key) => setHalfUnavailable(key, unavailable));
}

function showQuickStatus(text, cls) {
  quickStatusMsg.textContent = text;
  quickStatusMsg.className = cls || "";
}

copyLastBtn.addEventListener("click", async () => {
  const name = nameInput.value.trim();
  const weekOf = weekOfInput.value;

  if (!name) {
    showQuickStatus("Enter your name first.", "err");
    return;
  }
  if (allHalfKeys.length === 0) {
    showQuickStatus("Class grid is still loading - try again in a second.", "err");
    return;
  }
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.startsWith("PASTE_")) {
    showQuickStatus("Form isn't wired up to the backend yet (missing Apps Script URL in config.js).", "err");
    return;
  }

  copyLastBtn.disabled = true;
  showQuickStatus("Looking up your last submission…", "");

  try {
    const url =
      `${APPS_SCRIPT_URL}?action=getLastSubmission` +
      `&name=${encodeURIComponent(name)}` +
      `&beforeWeekOf=${encodeURIComponent(weekOf)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== "ok") {
      showQuickStatus(`Couldn't look that up (${data.error || "unknown error"}).`, "err");
      return;
    }
    if (!data.found) {
      showQuickStatus("No earlier submission found for that name - nothing to copy yet.", "err");
      return;
    }
    if (!Array.isArray(data.submission.unavailable)) {
      showQuickStatus(
        `Your submission from ${data.submission.weekOf} used the old form - please mark this week's unavailability manually.`,
        "err"
      );
      return;
    }

    setAllUnavailable(allHalfKeys, false);
    setAllUnavailable(data.submission.unavailable, true);
    notesField.value = data.submission.notes || "";

    showQuickStatus(
      `Copied your unavailability from the week of ${data.submission.weekOf}. Review it before submitting.`,
      "ok"
    );
  } catch (err) {
    showQuickStatus(`Couldn't look that up (${err.message}). Try again.`, "err");
  } finally {
    copyLastBtn.disabled = false;
  }
});

noAvailabilityBtn.addEventListener("click", () => {
  if (allHalfKeys.length === 0) {
    showQuickStatus("Class grid is still loading - try again in a second.", "err");
    return;
  }

  setAllUnavailable(allHalfKeys, true);
  if (!notesField.value.trim()) {
    notesField.value = "No availability this week.";
  }
  showQuickStatus("Marked every day/half-day unavailable. Add any details in the notes box, then submit.", "ok");
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = nameInput.value.trim();
  const weekOf = weekOfInput.value;
  const notes = notesField.value.trim();
  const unavailable = Array.from(unavailableSet);

  if (!name || !weekOf) {
    statusMsg.textContent = "Please fill in your name and the week.";
    statusMsg.className = "err";
    return;
  }

  const payload = {
    name,
    weekOf,
    notes,
    unavailable,
    submittedAt: new Date().toISOString(),
  };

  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.startsWith("PASTE_")) {
    statusMsg.textContent = "Form isn't wired up to the backend yet (missing Apps Script URL in config.js).";
    statusMsg.className = "err";
    return;
  }

  submitBtn.disabled = true;
  statusMsg.textContent = "Submitting…";
  statusMsg.className = "";

  try {
    // Apps Script web apps don't send CORS headers for simple requests reliably,
    // so we use no-cors + text/plain and let the script parse the JSON body itself.
    await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
    statusMsg.textContent = "Got it — thanks! You can resubmit any time before the schedule is built if your availability changes.";
    statusMsg.className = "ok";
    form.reset();
    weekOfInput.value = upcomingMonday();
    setAllUnavailable(allHalfKeys, false);
    showQuickStatus("", "");
  } catch (err) {
    statusMsg.textContent = `Something went wrong (${err.message}). Try again or text Toby.`;
    statusMsg.className = "err";
  } finally {
    submitBtn.disabled = false;
  }
});
