'use client';

import React, { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { useSpotlight } from '@/hooks/use-spotlight';

export interface DoubleBezelProps extends React.HTMLAttributes<HTMLDivElement> {
  spotlight?: boolean;
  shellClassName?: string;
  coreClassName?: string;
  as?: React.ElementType;
}

export const DoubleBezel = forwardRef<HTMLDivElement, DoubleBezelProps>(({
  children,
  spotlight = true,
  className,
  shellClassName,
  coreClassName,
  as: Component = 'div',
  ...props
}, forwardedRef) => {
  const { ref: internalRef } = useSpotlight<HTMLDivElement>({ disabled: !spotlight });

  const setRef = (node: HTMLDivElement | null) => {
    (internalRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    if (typeof forwardedRef === 'function') {
      forwardedRef(node);
    } else if (forwardedRef) {
      (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    }
  };

  return (
    <Component
      ref={setRef}
      className={cn('double-bezel-shell', shellClassName, className)}
      {...props}
    >
      <div className={cn('double-bezel-core', coreClassName)}>
        {children}
      </div>
    </Component>
  );
});

DoubleBezel.displayName = 'DoubleBezel';

export interface DoubleBezelShellProps extends React.HTMLAttributes<HTMLDivElement> {
  spotlight?: boolean;
}

export const DoubleBezelShell = forwardRef<HTMLDivElement, DoubleBezelShellProps>(({
  children,
  spotlight = true,
  className,
  ...props
}, forwardedRef) => {
  const { ref: internalRef } = useSpotlight<HTMLDivElement>({ disabled: !spotlight });

  const setRef = (node: HTMLDivElement | null) => {
    (internalRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    if (typeof forwardedRef === 'function') {
      forwardedRef(node);
    } else if (forwardedRef) {
      (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    }
  };

  return (
    <div ref={setRef} className={cn('double-bezel-shell', className)} {...props}>
      {children}
    </div>
  );
});

DoubleBezelShell.displayName = 'DoubleBezelShell';

export const DoubleBezelCore = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({
  children,
  className,
  ...props
}, ref) => (
  <div ref={ref} className={cn('double-bezel-core', className)} {...props}>
    {children}
  </div>
));

DoubleBezelCore.displayName = 'DoubleBezelCore';
