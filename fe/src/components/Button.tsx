import React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'soft' | 'warn' | 'default';
  size?: 'small' | 'default';
  full?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  className,
  variant = 'default',
  size = 'default',
  full = false,
  ...props
}) => {
  return (
    <button
      className={cn(
        'button',
        variant !== 'default' && variant,
        size === 'small' && 'small',
        full && 'full',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};
