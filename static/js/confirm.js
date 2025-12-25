document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("confirmModal");
  if (!modal) return;
  const msgEl = document.getElementById("confirmMessage");
  const okBtn = document.getElementById("confirmOk");
  const cancelBtn = document.getElementById("confirmCancel");

  let resolver = null;

  function show(message) {
    return new Promise((resolve) => {
      resolver = resolve;
      msgEl.textContent = message;
      modal.classList.remove("hidden");
      modal.classList.add("flex");
      // focus
      cancelBtn.focus();
    });
  }

  function hide(result) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    if (resolver) {
      resolver(result === true);
      resolver = null;
    }
  }

  okBtn.addEventListener("click", () => hide(true));
  cancelBtn.addEventListener("click", () => hide(false));

  modal.addEventListener("click", (e) => {
    if (e.target === modal) hide(false);
  });

  document.addEventListener("keydown", (e) => {
    if (modal.classList.contains("flex")) {
      if (e.key === "Escape") return hide(false);
      if (e.key === "Enter") return hide(true);
    }
  });

  window.confirmModal = {
    show,
  };
});
