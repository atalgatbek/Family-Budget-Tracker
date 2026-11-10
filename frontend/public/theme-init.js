// Applies the saved theme before the first paint (kept external for the CSP).
(function () {
  try {
    var theme = localStorage.getItem("theme");
    if (theme === "light" || theme === "dark")
      document.documentElement.dataset.theme = theme;
  } catch (error) {
    /* Storage is unavailable: follow the system theme. */
  }
})();
