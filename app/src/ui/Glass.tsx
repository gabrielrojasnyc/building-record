import type { ComponentPropsWithRef, ElementType } from 'react';

type GlassProps<T extends ElementType> = {
  as?: T;
} & Omit<ComponentPropsWithRef<T>, 'as'>;

export function Glass<T extends ElementType = 'div'>({
  as,
  className,
  ...rest
}: GlassProps<T>) {
  const Element: ElementType = as ?? 'div';
  return <Element className={className ? `glass ${className}` : 'glass'} {...rest} />;
}
