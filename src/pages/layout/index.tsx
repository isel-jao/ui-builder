import { TooltipProvider } from "@/components/ui/tooltip";
import { Outlet } from "react-router";
import { Toaster } from "sonner";

export default function GlobalLayout() {
  return (
    <>
      <TooltipProvider>
        <Outlet />
      </TooltipProvider>
      <Toaster />
    </>
  );
}
