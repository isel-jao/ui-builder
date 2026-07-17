import { BrowserRouter, Route, Routes } from "react-router";
import Page from "./page";
import ReadmePage from "./readme";
import GlobalLayout from "./layout";
import AppLayoutLayout from "./app/layout";

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<GlobalLayout />}>
          <Route element={<AppLayoutLayout />}>
            <Route index element={<ReadmePage />} />
            <Route path=":pageId" element={<Page />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
