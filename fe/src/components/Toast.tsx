import React from 'react';
import { cn } from '@/lib/utils';

export interface ToastProps {
  message: string | null;
  isVisible: boolean;
}

export const Toast: React.FC<ToastProps> = ({ message, isVisible }) => {
  if (!message) return null;
  return (
    <div className={cn('toast', isVisible && 'show')}>
      {message}
    </div>
  );
};
