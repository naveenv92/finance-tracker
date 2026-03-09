// Apply saved theme immediately to prevent flash of unstyled content.
// This is a plain (non-module) script that must run before the page renders.
(function () {
  try {
    var theme = localStorage.getItem('financeTracker:theme');
    if (theme && theme !== 'default') {
      document.documentElement.setAttribute('data-theme', theme);
    }
  } catch (e) {
    // localStorage may be unavailable in some contexts; silently ignore
  }
}());
