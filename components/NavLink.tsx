import Link from "next/link";
import { usePathname } from "next/navigation";
import { ComponentProps, forwardRef } from "react";
import { cn } from "@/lib/utils";

type NavLinkProps = ComponentProps<typeof Link> & {
  className?: string;
  activeClassName?: string;
  pendingClassName?: string;
};

const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(
  ({ className, activeClassName, pendingClassName: _pendingClassName, href, ...props }, ref) => {
    const pathname = usePathname();
    const hrefPathname = typeof href === "string" ? href : href.pathname ?? "";
    const isActive = pathname === hrefPathname || pathname === `/${hrefPathname?.replace(/^\/+/, "")}`;

    return (
      <Link ref={ref} href={href} className={cn(className, isActive && activeClassName)} {...props} />
    );
  },
);

NavLink.displayName = "NavLink";

export { NavLink };
