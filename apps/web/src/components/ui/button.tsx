"use client";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

// Minimum target 48px, primary 56px (brief: reach and touch).
const buttonVariants = cva(
  "inline-flex max-w-full items-center justify-center gap-[8px] rounded-full font-bold transition-colors disabled:opacity-50 disabled:pointer-events-none select-none",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-ink hover:brightness-110",
        secondary: "bg-surface-2 text-ink border border-line hover:border-ink",
        ghost: "text-ink hover:bg-surface-2",
      },
      // Icon buttons keep a 48 px target at any text size: they hold no text, and growing them would squeeze what does (STAB-11).
      size: { md: "min-h-12 px-[20px] text-base", lg: "min-h-14 px-[24px] text-lg", icon: "size-[48px] shrink-0" },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, type = "button", ...props }, ref) => (
  <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
));
Button.displayName = "Button";
