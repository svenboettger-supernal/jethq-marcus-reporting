// SHA-256 of "marcus2026". Documented in README under "Access".
const PASSWORD_HASH = "2f20e672b412b098b18fb06895a36e9a57c2e36d4b7ad49a83adf58a27b53a7e";
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
  if (!lock) return;
  lock.classList.add("shake", "error-shown");
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
