import React from 'react';
import { cn } from '@/lib/utils';

export interface CardProps {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  headerClassName?: string;
  style?: React.CSSProperties;
}

export const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  action,
  children,
  className,
  headerClassName,
  style,
}) => {
  return (
    <section className={cn('card', className)} style={style}>
      {(title || action) && (
        <div className={cn('cardhead', headerClassName)}>
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <div className="sub">{subtitle}</div>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
};
