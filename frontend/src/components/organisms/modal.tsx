'use client';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/atoms/sheet';
import type { ReactNode } from 'react';
import { Button } from '../atoms/button';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footerContent?: ReactNode;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footerContent,
  primaryActionLabel = 'Confirm',
  onPrimaryAction,
}: ModalProps) {
  const handlePrimaryAction = () => {
    if (onPrimaryAction) {
      onPrimaryAction();
    } else {
      onClose();
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent
        side="right"
        className="sm:max-w-[580px] top-0 sm:top-8 bottom-0 sm:bottom-8 right-0 sm:right-8 w-full sm:w-[calc(100%-64px)] h-full sm:h-[calc(100%-64px)] rounded-none sm:rounded-lg overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && (
            <SheetDescription className="text-sm">
              {description}
            </SheetDescription>
          )}
        </SheetHeader>
        <div className="py-4">{children}</div>

        <SheetFooter className='w-full'>
          {footerContent ? (
            footerContent
          ) : (
            <Button variant="purple" size="full" onClick={handlePrimaryAction}>
              {primaryActionLabel}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
