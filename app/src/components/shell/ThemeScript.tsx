/* Applies the saved theme before first paint so the page never flashes the wrong one. */

const script = `(function(){var t;try{t=localStorage.getItem("horizon-theme")}catch(e){}document.documentElement.dataset.theme=(t==="light"||t==="dark")?t:"dark"})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
