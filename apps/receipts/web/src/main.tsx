import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router";
import "./index.css";
import { AppLayout, GroupLayout } from "./components/layout.tsx";
import { BoardPage } from "./pages/board.tsx";
import { HomePage } from "./pages/home.tsx";
import { LearningPage } from "./pages/learning.tsx";
import { MemoryPage } from "./pages/memory.tsx";
import { ReceiptPage } from "./pages/receipt.tsx";
import { ScoresPage } from "./pages/scores.tsx";
import { Providers } from "./providers.tsx";

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");

function NotFound() {
  return (
    <div className="py-16 text-center">
      <p className="text-lg font-semibold">Nothing here.</p>
      <Link to="/" className="mt-2 inline-block text-sm underline">
        Back to the groups
      </Link>
    </div>
  );
}

// The same paths the bot links to (ADR-0064): /g/:id, /g/:id/scores, /g/:id/learning,
// /g/:id/memory and /p/:pickId.
createRoot(root).render(
  <StrictMode>
    <Providers>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<HomePage />} />
            <Route path="g/:id" element={<GroupLayout />}>
              <Route index element={<BoardPage />} />
              <Route path="scores" element={<ScoresPage />} />
              <Route path="learning" element={<LearningPage />} />
              <Route path="memory" element={<MemoryPage />} />
            </Route>
            <Route path="p/:pickId" element={<ReceiptPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </Providers>
  </StrictMode>,
);
