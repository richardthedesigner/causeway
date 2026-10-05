"use client";
import { useEffect, useState } from "react";
import { Check, Download, Trash2 } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { deleteMyData, myDataExport, myDataSummary, type MyDataSummary } from "@/lib/my-data";

/** Everything we keep about you, a copy to download, and one way to delete it all (SEC-06). */
export function MyDataSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [summary, setSummary] = useState<MyDataSummary | null>(null);
  const [step, setStep] = useState<"look" | "confirm" | "deleting" | "deleted" | "failed">("look");

  // Counted fresh each time it opens.
  useEffect(() => {
    if (open) setSummary(myDataSummary());
  }, [open]);

  const change = (v: boolean) => {
    if (!v && step === "deleted") location.reload();
    setStep("look");
    onOpenChange(v);
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([myDataExport()], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `causewayside-my-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const remove = async () => {
    setStep("deleting");
    setStep((await deleteMyData()) === "done" ? "deleted" : "failed");
  };

  const s = summary;
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  return (
    <Sheet open={open} onOpenChange={change}>
      <SheetContent title="Your data" description="What Causewayside keeps about you. Your devices and their limits never leave this phone.">
        {step === "deleted" ? (
          <div className="grid gap-4" role="status">
            <p className="m-0 flex items-center gap-2 text-lg font-bold">
              <Check aria-hidden className="size-6 text-ok" /> Deleted.
            </p>
            <p className="m-0 text-muted">Everything is gone{s?.shared ? ", here and on our server" : ""}. The app starts afresh when you close this.</p>
            <Button variant="primary" size="lg" onClick={() => change(false)}>
              Close and start afresh
            </Button>
          </div>
        ) : (
          <div className="grid gap-6">
            <section aria-labelledby="mine-h" className="grid gap-2">
              <h3 id="mine-h" className="m-0 text-base font-bold">
                On this phone
              </h3>
              {s ? (
                <ul className="m-0 grid list-none gap-1 p-0">
                  <li>{plural(s.devices, "device")} and their limits</li>
                  <li>{plural(s.notes, "note")}</li>
                  <li>{plural(s.reports, "problem report")}</li>
                  <li>{plural(s.recents, "recent place")}</li>
                  <li>Your city and settings</li>
                </ul>
              ) : null}
              <p className="m-0 text-sm text-muted">
                {s?.shared
                  ? "Notes and reports you shared are also on our server, under a random id, not your name. Shared notes carry only the words you chose to show, never your settings."
                  : "Nothing you've written has been shared."}
              </p>
            </section>

            <section aria-labelledby="copy-h" className="grid gap-2">
              <h3 id="copy-h" className="m-0 text-base font-bold">
                A copy
              </h3>
              <p className="m-0 text-sm text-muted">One file with everything on this phone, to keep or to read.</p>
              <Button variant="secondary" size="lg" onClick={download} className="justify-self-start">
                <Download aria-hidden className="size-5" /> Download a copy
              </Button>
            </section>

            <section aria-labelledby="delete-h" className="grid gap-2">
              <h3 id="delete-h" className="m-0 text-base font-bold">
                Delete everything
              </h3>
              {step === "look" ? (
                <Button variant="secondary" size="lg" onClick={() => setStep("confirm")} className="justify-self-start">
                  <Trash2 aria-hidden className="size-5" /> Delete everything
                </Button>
              ) : (
                <div className="grid gap-3 rounded-2xl border-2 border-stop p-[16px]" role={step === "failed" ? "alert" : undefined}>
                  {step === "failed" ? (
                    <p className="m-0">We couldn&apos;t reach our server to delete what you shared, so nothing has been deleted yet. Try again when you have signal.</p>
                  ) : (
                    <p className="m-0">
                      This can&apos;t be undone. Your devices, notes, reports, recent places and settings go from this phone{s?.shared ? ", and what you shared goes from our server" : ""}.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button disabled={step === "deleting"} onClick={remove} className="bg-stop text-stop-ink hover:brightness-110">
                      {step === "deleting" ? "Deleting…" : step === "failed" ? "Try again" : "Yes, delete everything"}
                    </Button>
                    <Button variant="ghost" disabled={step === "deleting"} onClick={() => setStep("look")}>
                      Keep it
                    </Button>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
