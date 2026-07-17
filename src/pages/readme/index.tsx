import { Textarea } from "@/components/ui/textarea";
import { useAppStore } from "@/store";
import { useStore } from "zustand";

export default function ReadmePage() {
  const readme = useStore(useAppStore, (state) => state.readme);
  const setReadme = useStore(useAppStore, (state) => state.setReadme);
  function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setReadme(event.target.value);
  }
  return (
    <main className="debug container flex gap-4 flex-col">
      <h1 className="text-xl font-bold">Readme</h1>
      <Textarea className="flex-1" value={readme} onChange={handleChange} />
    </main>
  );
}
