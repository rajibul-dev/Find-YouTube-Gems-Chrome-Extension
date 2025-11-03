import { createRoot } from "react-dom/client";
import "./index.css";
import { StrictMode } from "react";
import ContentPage from "./content/ContentPage";

const root = document.createElement("div");
root.id = "find-youtube-gems-root";
document.querySelector(".ytSearchboxComponentSearchButton")?.after(root);

createRoot(root).render(
  <StrictMode>
    <ContentPage />
  </StrictMode>
);
