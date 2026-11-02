import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"
import { cn } from "@/lib/utils"

// Tactile glossy buttons (see .btn-gloss in globals.css): a lit top edge, a shaded bottom,
// scale(0.97) on press. One primary per view; sm 36 for dense rows, md 44, lg 52.
// Focus uses the global 2px ring with 2px offset from tokens.css.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 font-bold whitespace-nowrap select-none disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "btn-gloss btn-gloss-primary",
        brand: "btn-gloss btn-gloss-brand",
        secondary: "btn-gloss btn-gloss-secondary",
        outline: "btn-gloss btn-gloss-secondary",
        ghost: "bg-transparent text-foreground transition-colors duration-[120ms] ease-out hover:bg-accent hover:text-accent-foreground",
        destructive: "btn-gloss btn-gloss-destructive",
      },
      size: {
        sm: "h-9 rounded-[10px] px-3.5 text-sm",
        md: "h-11 rounded-[12px] px-5 text-[15px]",
        lg: "h-[52px] rounded-[12px] px-7 text-[17px]",
        icon: "size-11 rounded-[10px]",
        "icon-sm": "size-9 rounded-[10px]",
        // The dashboard's flatter, shorter set: 6px corners, 36 and 32 tall.
        compact: "h-9 rounded-[6px] px-3.5 text-sm",
        "compact-sm": "h-8 rounded-[6px] px-2.5 text-[13px]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
)

function Button({
  className,
  variant = "primary",
  size = "md",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
