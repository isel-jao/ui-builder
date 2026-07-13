import { useAppStore } from "@/store";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectItem,
  SelectContent,
} from "@/components/ui/select";
import { useNavigate, useParams } from "react-router";
import { twMerge } from "tailwind-merge";
import { useShallow } from "zustand/shallow";

interface PageSelectProps extends Omit<
  React.HTMLAttributes<HTMLElement>,
  "children"
> {}

export function PageSelect({ className, ...props }: PageSelectProps) {
  const navigate = useNavigate();
  const { pages } = useAppStore(
    useShallow((state) => ({
      pages: state.pages,
    })),
  );
  const pageId = useParams<{
    pageId: string;
  }>();
  const currentPage = pages.find((page) => page.id === pageId?.pageId);

  const allPages = [
    {
      name: "Readme",
      id: "readme",
    },
    ...pages,
  ];

  return (
    <div className={twMerge("", className)} {...props}>
      <Select
        onValueChange={(value) => {
          navigate(value === "readme" ? "/" : `/${value}`);
        }}
        value={currentPage?.id || "readme"}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select a page...">
            {currentPage?.name || "Readme"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {allPages.map((page) => (
            <SelectItem key={page.id} value={page.id}>
              {page.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
