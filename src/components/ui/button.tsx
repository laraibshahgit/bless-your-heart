import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/cn"

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-serif text-label font-medium transition-all duration-150 ease-touch focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-sage/50 focus-visible:ring-offset-2 focus-visible:ring-offset-lavender disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-[#D4960D] text-black shadow-[0_4px_20px_rgba(212,150,13,0.45)] hover:bg-[#C08A0C] active:scale-[0.98]',
        secondary: 'bg-white text-ink-deep border border-border-mist hover:border-accent-sage active:scale-[0.98]',
        preset: 'bg-white text-[#4A4458] border border-[#D4CFDF] hover:border-accent-sage data-[selected=true]:border-accent-sage data-[selected=true]:text-ink-deep',
        ghost: 'text-ink-soft hover:text-accent-sage',
      },
      size: {
        default: 'h-11 px-6 py-2 rounded-pill',
        sm: 'h-9 px-4 rounded-pill',
        lg: 'h-12 px-8 rounded-pill',
        icon: 'h-10 w-10 rounded-full',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
