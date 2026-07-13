import { cn } from "@/lib/utils";
import { useAppStore } from "@/store";
import {
  BookMarkedIcon,
  NotepadTextDashedIcon,
  Trash2Icon,
} from "lucide-react";
import React from "react";
import { Link, useNavigate, useParams } from "react-router";
import { twMerge } from "tailwind-merge";
import { useShallow } from "zustand/shallow";
import { AddPageButton } from "../add-page-button";
import { Button } from "../ui/button";
import { toast } from "sonner";

interface PagesViewProps extends Omit<
  React.HTMLAttributes<HTMLElement>,
  "children"
> {}

export function PagesView({ className, ...props }: PagesViewProps) {
  const pageId = useParams<{ pageId: string }>().pageId;
  const navigate = useNavigate();
  const { pages, deletePage } = useAppStore(
    useShallow((state) => ({
      pages: state.pages,
      addPage: state.addPage,
      deletePage: state.deletePage,
    })),
  );

  function handleDeletePage(
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) {
    e.stopPropagation();
    e.preventDefault();
    const id = e.currentTarget.dataset.id;
    toast.error("Delete page is disabled for now");
    if (id) {
      deletePage(id);
      if (pageId === id) {
        navigate("/");
      }
    }
  }
  return (
    <div
      className={twMerge("flex flex-col [&_svg]:size-4 gap-2", className)}
      {...props}
    >
      <div className="flex justify-between">
        <span>pages {`(${pages.length})`}</span>
        <AddPageButton />
      </div>
      <Link to="/">
        <div
          className={cn("flex gap-2 items-center", {
            "text-primary": !pageId,
          })}
        >
          <BookMarkedIcon />
          <span>Readme</span>
        </div>
      </Link>
      {pages.map((page) => (
        <Link to={`/${page.id}`} key={page.id}>
          <div
            className={cn("flex group gap-2 items-center", {
              "text-primary": page.id === pageId,
            })}
          >
            {<NotepadTextDashedIcon />}
            <span>{page.name}</span>
            <Button
              size={"icon"}
              data-id={page.id}
              variant="ghost"
              className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={handleDeletePage}
            >
              <Trash2Icon />
            </Button>
          </div>
        </Link>
      ))}
    </div>
  );
}
