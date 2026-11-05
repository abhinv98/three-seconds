import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"
import { cn } from "@/lib/utils"

// Two kinds across the app: primary (orange) and secondary (cream), both flat with an ink border and 6px corners at
// every size (.btn-flat in globals.css). Sizes: sm 36, md 44, lg 52; compact 36 and compact-sm 32 for dense dashboard
// rows. Focus uses the global 2px ring with 2px offset from tokens.css.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-[6px] font-bold whitespace-nowrap select-none disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "btn-flat btn-flat-primary",
        brand: "btn-flat btn-flat-primary",
        secondary: "btn-flat btn-flat-secondary",
        outline: "btn-flat btn-flat-secondary",
        ghost: "bg-transparent text-foreground transition-colors duration-[120ms] ease-out hover:bg-accent hover:text-accent-foreground",
        destructive: "btn-flat btn-flat-destructive",
      },
      size: {
        sm: "h-9 px-3.5 text-sm",
        md: "h-11 px-5 text-[15px]",
        lg: "h-[52px] px-7 text-[17px]",
        icon: "size-11",
        "icon-sm": "size-9",
        compact: "h-9 px-3.5 text-sm",
        "compact-sm": "h-8 px-2.5 text-[13px]",
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
