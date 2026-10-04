"use client";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Switch = React.forwardRef<React.ElementRef<typeof SwitchPrimitive.Root>, React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn("relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border border-line bg-line transition-colors data-[state=checked]:bg-accent", className)}
    {...props}
  >
    <SwitchPrimitive.Thumb className="block size-6 translate-x-1 rounded-full bg-surface shadow transition-transform data-[state=checked]:translate-x-7" />
  </SwitchPrimitive.Root>
));
Switch.displayName = "Switch";
