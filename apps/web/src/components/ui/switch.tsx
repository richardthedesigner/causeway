"use client";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as React from "react";
import { cn } from "@/lib/utils";

/** Sized in pixels: it holds no text, so it needn't grow with large text (STAB-11). */
export const Switch = React.forwardRef<React.ElementRef<typeof SwitchPrimitive.Root>, React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn("relative inline-flex h-[32px] w-[56px] shrink-0 items-center rounded-full border border-line bg-line transition-colors data-[state=checked]:bg-accent", className)}
    {...props}
  >
    <SwitchPrimitive.Thumb className="block size-[24px] translate-x-[4px] rounded-full bg-surface shadow transition-transform data-[state=checked]:translate-x-[28px]" />
  </SwitchPrimitive.Root>
));
Switch.displayName = "Switch";
