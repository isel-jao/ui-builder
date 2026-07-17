import { cn } from "@/lib/utils";
import { useAppStore } from "@/store";
import {
  BookMarkedIcon,
  HomeIcon,
  NotepadTextDashedIcon,
  PinIcon,
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
  const { pages, deletePage, setHomePage } = useAppStore(
    useShallow((state) => ({
      pages: state.pages,
      deletePage: state.deletePage,
      setHomePage: state.setHomePage,
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
        const homePage = pages.find((p) => p.index === true);
        if (homePage) {
          navigate(`/${homePage.id}`);
        } else {
          navigate("/");
        }
      }
    }
  }

  function handleSetHomePage(
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) {
    e.stopPropagation();
    e.preventDefault();
    const id = e.currentTarget.dataset.id;
    if (id) {
      setHomePage(id);
      toast.success("Set home page successfully");
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
        <Link
          to={`/${page.id}`}
          key={page.id}
          className={cn("order-2", {
            "order-1": page.index === true,
          })}
        >
          <div
            className={cn("flex group gap-1 items-center", {
              "text-primary": page.id === pageId,
            })}
          >
            {<NotepadTextDashedIcon />}
            <span>{page.name}</span>
            <Button
              size={"icon-sm"}
              data-id={page.id}
              variant="ghost"
              className="ml-auto transition-opacity opacity-50 hover:opacity-100"
              onClick={handleDeletePage}
              disabled={page.index === true}
            >
              <Trash2Icon />
            </Button>
            <Button
              size={"icon-sm"}
              data-id={page.id}
              variant="ghost"
              onClick={handleSetHomePage}
            >
              {page.index ? (
                <HomeIcon />
              ) : (
                <PinIcon className={cn("opacity-50")} />
              )}
            </Button>
          </div>
        </Link>
      ))}
    </div>
  );
}
