"use client";
import * as SliderPrimitive from "@radix-ui/react-slider";
import * as React from "react";
import { cn } from "@/lib/utils";

/** Large-thumb slider (28px thumb, 48px hit area) for profile thresholds. */
export const Slider = React.forwardRef<React.ElementRef<typeof SliderPrimitive.Root>, React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & { thumbLabel: string; valueText?: string }>(
  ({ className, thumbLabel, valueText, ...props }, ref) => (
    <SliderPrimitive.Root ref={ref} className={cn("relative flex h-12 w-full touch-none select-none items-center", className)} {...props}>
      <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-line">
        <SliderPrimitive.Range className="absolute h-full bg-accent" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={thumbLabel}
        aria-valuetext={valueText}
        className="block size-7 rounded-full border-[3px] border-accent bg-surface shadow-md focus-visible:outline-[3px] focus-visible:outline-offset-2"
      />
    </SliderPrimitive.Root>
  ),
);
Slider.displayName = "Slider";
