// Renders the weekly class grid from classes.json and posts the submission
// to the Apps Script web app defined in config.js.

const gridContainer = document.getElementById("grid-container");
const form = document.getElementById("availability-form");
const submitBtn = document.getElementById("submit-btn");
const statusMsg = document.getElementById("status-msg");
const weekOfInput = document.getElementById("week-of");

// Default the date field to the coming Monday, to nudge people toward the right week.
function upcomingMonday() {
  const d = new Date();
  const day = d.getDay(); // 0 = Sunday
  const diff = (8 - day) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}
weekOfInput.value = upcomingMonday();

let classesById = {};

fetch("classes.json")
  .then((r) => r.json())
  .then((data) => {
    classesById = Object.fromEntries(data.classes.map((c) => [c.id, c]));
    renderGrid(data);
  })
  .catch((err) => {
    gridContainer.innerHTML = `<p class="loading">Couldn't load the class grid (${err.message}). Reload the page or tell Toby.</p>`;
  });

function renderGrid(data) {
  gridContainer.innerHTML = "";
  for (const day of data.days) {
    const dayClasses = data.classes.filter((c) => c.day === day);
    if (dayClasses.length === 0) continue;

    const block = document.createElement("div");
    block.className = "day-block";

    const heading = document.createElement("h2");
    heading.textContent = day;
    block.appendChild(heading);

    for (const cls of dayClasses) {
      const row = document.createElement("div");
      row.className = "class-option";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = cls.id;
      checkbox.name = cls.id;
      checkbox.value = cls.id;

      const label = document.createElement("label");
      label.setAttribute("for", cls.id);
      label.textContent = cls.label;

      row.appendChild(checkbox);
      row.appendChild(label);
      block.appendChild(row);
    }

    gridContainer.appendChild(block);
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("coach-name").value.trim();
  const weekOf = weekOfInput.value;
  const notes = document.getElementById("notes").value.trim();
  const availability = Object.keys(classesById).filter(
    (id) => document.getElementById(id) && document.getElementById(id).checked
  );

  if (!name || !weekOf) {
    statusMsg.textContent = "Please fill in your name and the week.";
    statusMsg.className = "err";
    return;
  }

  const payload = {
    name,
    weekOf,
    notes,
    availability,
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
  } catch (err) {
    statusMsg.textContent = `Something went wrong (${err.message}). Try again or text Toby.`;
    statusMsg.className = "err";
  } finally {
    submitBtn.disabled = false;
  }
});
