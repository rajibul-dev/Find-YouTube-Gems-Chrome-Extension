import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import ContentPage from "./content/ContentPage";

// Function to inject after the search box
function mountReactApp() {
  const existing = document.getElementById("find-youtube-gems-root");
  if (existing) return; // prevent duplicates

  const searchBox = document.querySelector(".yt-searchbox-filled-query");
  if (!searchBox) return;

  const root = document.createElement("div");
  root.id = "find-youtube-gems-root";
  root.style.display = "inline-flex";
  root.style.alignItems = "center";
  root.style.marginLeft = "8px"; // adjust spacing to taste
  root.style.zIndex = "9999";

  searchBox.after(root);

  createRoot(root).render(
    <StrictMode>
      <ContentPage />
    </StrictMode>
  );
}

// Observe header area for dynamic changes
const observer = new MutationObserver(() => {
  const searchBox = document.querySelector(".yt-searchbox-filled-query");
  if (searchBox && !document.getElementById("find-youtube-gems-root")) {
    mountReactApp();
  }
});

// Watch for header changes — YouTube re-renders #masthead a lot
observer.observe(document.body, {
  childList: true,
  subtree: true,
});

// Re-inject on navigation (YouTube is an SPA)
window.addEventListener("yt-navigate-finish", mountReactApp);
