import { BrowserRouter, Route, Routes } from "react-router";
import Page from "./page";
import HomePage from "./page/home";
import PageLayout from "./page/layout";
import GlobalLayout from "./layout";

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<GlobalLayout />}>
          <Route element={<PageLayout />}>
            <Route index element={<HomePage />} />
            <Route path=":pageId" element={<Page />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
