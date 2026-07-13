import { useAppStore } from "@/store";
import { useRef } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { useShallow } from "zustand/shallow";
import { toast } from "sonner";
import { PlusIcon } from "lucide-react";

export function AddPageButton() {
  const { addPage, pages } = useAppStore(
    useShallow((state) => ({
      addPage: state.addPage,
      pages: state.pages,
    })),
  );
  const closeRef = useRef<HTMLButtonElement>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = formData.get("name") as string;
    console.log("name", name);
    if (!name) {
      toast.error("Page name cannot be empty.");
      return;
    }
    if (name === "readme") {
      toast.error('Page name cannot be "readme".');
      return;
    }
    if (pages.some((page) => page.name === name)) {
      toast.error(`Page "${name}" already exists.`);
      return;
    }
    addPage({
      id: new Date().getTime().toString(),
      name,
    });
    toast.success(`Page "${name}" added successfully!`);
    closeRef.current?.click();
  }
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant={"ghost"} size={"icon"}>
            <PlusIcon />
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Page</DialogTitle>
          <DialogDescription>
            Add a new page to your application.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4 py-4" onSubmit={handleSubmit}>
          <Label htmlFor="name" className="text-right">
            Name
          </Label>
          <Input id="name" name="name" className="col-span-3" />
          <DialogClose ref={closeRef}>Cancel</DialogClose>
          <Button type="submit">Add Page</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
