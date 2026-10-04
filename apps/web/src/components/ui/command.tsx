"use client";
import { Command as Cmdk } from "cmdk";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Command = React.forwardRef<React.ElementRef<typeof Cmdk>, React.ComponentPropsWithoutRef<typeof Cmdk>>(({ className, ...props }, ref) => (
  <Cmdk ref={ref} className={cn("flex flex-col", className)} {...props} />
));
Command.displayName = "Command";

export const CommandInput = React.forwardRef<React.ElementRef<typeof Cmdk.Input>, React.ComponentPropsWithoutRef<typeof Cmdk.Input>>(({ className, ...props }, ref) => (
  <Cmdk.Input
    ref={ref}
    className={cn("min-h-14 w-full rounded-2xl border border-line bg-surface-2 px-4 text-lg text-ink placeholder:text-muted outline-none focus-visible:outline-none", className)}
    {...props}
  />
));
CommandInput.displayName = "CommandInput";

export const CommandList = Cmdk.List;
export const CommandEmpty = Cmdk.Empty;
export const CommandGroup = Cmdk.Group;

export const CommandItem = React.forwardRef<React.ElementRef<typeof Cmdk.Item>, React.ComponentPropsWithoutRef<typeof Cmdk.Item>>(({ className, ...props }, ref) => (
  <Cmdk.Item
    ref={ref}
    className={cn("flex min-h-14 cursor-pointer items-center gap-3 rounded-xl px-3 text-base data-[selected=true]:bg-surface-2", className)}
    {...props}
  />
));
CommandItem.displayName = "CommandItem";
