import { SearchX } from "lucide-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router";
import "./index.css";
import { AppLayout, GroupLayout } from "./app/layout.tsx";
import { EmptyState } from "./components/app/empty-state.tsx";
import { Page } from "./components/app/page.tsx";
import { Button } from "./components/ui/button.tsx";
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
    <Page title="Not found">
      <EmptyState
        icon={<SearchX />}
        title="Nothing here"
        description="This link doesn't match a group or a receipt."
        action={
          <Button asChild variant="outline">
            <Link to="/">Back to the groups</Link>
          </Button>
        }
      />
    </Page>
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
