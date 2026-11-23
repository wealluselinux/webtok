/* Landing page buttons & dynamic auth state */
const startBtn = $("start");
if (startBtn) startBtn.onclick = e => {
  e.preventDefault();
  location.href = "/scroll#fyp";
};
if (typeof initAuth === "function") initAuth();
