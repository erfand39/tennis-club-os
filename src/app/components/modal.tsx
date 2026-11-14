'use client';

import React, { useEffect, useId, useRef } from 'react';
import { Icon } from './icon';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  titleId?: string;
  descriptionId?: string;
  children: React.ReactNode;
  className?: string;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
}

export function Modal({
  isOpen,
  onClose,
  title,
  titleId: customTitleId,
  descriptionId,
  children,
  className,
  initialFocusRef,
  closeOnBackdropClick = true,
  closeOnEscape = true,
  showCloseButton = true,
}: ModalProps): React.JSX.Element | null {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fallbackTitleId = useId();
  const effectiveTitleId = customTitleId || (title ? fallbackTitleId : undefined);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (!dialog.open) {
      try {
        dialog.showModal();
      } catch {
        // Fallback in case showModal is unavailable or already open
      }
    }

    if (initialFocusRef?.current) {
      initialFocusRef.current.focus();
    } else {
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length > 0) {
        focusable[0].focus();
      }
    }

    return () => {
      if (dialog.open) {
        dialog.close();
      }
      if (returnFocusRef.current && typeof returnFocusRef.current.focus === 'function') {
        returnFocusRef.current.focus();
      }
    };
  }, [isOpen, initialFocusRef]);

  if (!isOpen) return null;

  const handleCancel = (e: React.SyntheticEvent<HTMLDialogElement, Event>) => {
    e.preventDefault();
    if (closeOnEscape) {
      onClose();
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (closeOnBackdropClick && e.target === dialogRef.current) {
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDialogElement>) => {
    if (closeOnEscape && e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className={`modal-dialog ${className ?? ''}`.trim()}
      role="dialog"
      aria-modal="true"
      aria-labelledby={effectiveTitleId}
      aria-describedby={descriptionId}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <div className="modal-content">
        {(title || showCloseButton) && (
          <header className="modal-header">
            {title && (
              <h2 id={effectiveTitleId} className="modal-title">
                {title}
              </h2>
            )}
            {showCloseButton && (
              <button
                type="button"
                className="modal-close-btn"
                aria-label="بستن پنجره"
                onClick={onClose}
              >
                <Icon name="close" size={16} />
              </button>
            )}
          </header>
        )}
        <div className="modal-body">{children}</div>
      </div>
    </dialog>
  );
}

export { ConfirmDialog } from './confirm-dialog';
export type { ConfirmDialogProps } from './confirm-dialog';
