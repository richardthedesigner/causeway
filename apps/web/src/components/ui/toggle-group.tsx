"use client";
import * as TG from "@radix-ui/react-toggle-group";
import * as React from "react";
import { cn } from "@/lib/utils";

export const ToggleGroup = React.forwardRef<React.ElementRef<typeof TG.Root>, React.ComponentPropsWithoutRef<typeof TG.Root>>(({ className, ...props }, ref) => (
  <TG.Root ref={ref} className={cn("flex flex-wrap gap-2", className)} {...props} />
));
ToggleGroup.displayName = "ToggleGroup";

export const ToggleGroupItem = React.forwardRef<React.ElementRef<typeof TG.Item>, React.ComponentPropsWithoutRef<typeof TG.Item>>(({ className, ...props }, ref) => (
  <TG.Item
    ref={ref}
    className={cn(
      "min-h-12 rounded-full border border-line bg-surface px-4 text-base text-ink",
      "data-[state=on]:border-ink data-[state=on]:bg-ink data-[state=on]:text-surface",
      className,
    )}
    {...props}
  />
));
ToggleGroupItem.displayName = "ToggleGroupItem";
