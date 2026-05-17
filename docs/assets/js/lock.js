// SHA-256 of "ainative". Documented in README under "Access".
const PASSWORD_HASH = "0c3a0b2dd2dc0dbc5277d59904abebe8ff3424fe14156fdef892567f35d67c1d";
const SESSION_KEY = "marcus_unlocked";

async function sha256(text) {
  const buf = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function reveal() {
  const lock = document.getElementById("lockscreen");
  const dash = document.getElementById("dashboard");
  if (!lock || !dash) return;
  lock.remove();
  document.body.classList.remove("lock-active");
  dash.hidden = false;
  document.dispatchEvent(new CustomEvent("dashboard:unlocked"));
}

function bindShake() {
  const lock = document.getElementById("lockscreen");
  const err = document.getElementById("lock-error");
  if (!lock) return;
  lock.classList.add("shake");
  if (err) err.hidden = false;
  setTimeout(() => lock.classList.remove("shake"), 500);
}

if (sessionStorage.getItem(SESSION_KEY) === "1") {
  reveal();
} else {
  const form = document.getElementById("lockform");
  const input = document.getElementById("lockpw");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const value = (input.value || "").trim();
    if (!value) return;
    const hash = await sha256(value);
    if (hash === PASSWORD_HASH) {
      sessionStorage.setItem(SESSION_KEY, "1");
      reveal();
    } else {
      bindShake();
      input.select();
    }
  });
}
