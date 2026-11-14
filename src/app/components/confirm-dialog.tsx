'use client';

import React, { useEffect, useId, useRef } from 'react';
import { Icon } from './icon';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDestructive?: boolean;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'تایید',
  cancelLabel = 'انصراف',
  onConfirm,
  onCancel,
  isDestructive = false,
}: ConfirmDialogProps): React.JSX.Element | null {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descId = useId();
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

    // Accessibility: Focus cancel button first on destructive actions to prevent
    // accidental destructive confirmation, otherwise focus confirm button
    const initialFocus = isDestructive ? cancelBtnRef.current : confirmBtnRef.current;
    if (initialFocus) {
      initialFocus.focus();
    } else {
      cancelBtnRef.current?.focus();
    }

    return () => {
      if (dialog.open) {
        dialog.close();
      }
      if (returnFocusRef.current && typeof returnFocusRef.current.focus === 'function') {
        returnFocusRef.current.focus();
      }
    };
  }, [isOpen, isDestructive]);

  if (!isOpen) return null;

  const handleCancel = (e: React.SyntheticEvent<HTMLDialogElement, Event>) => {
    e.preventDefault();
    onCancel();
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) {
      onCancel();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDialogElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onCancel();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="modal-dialog confirm-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <div className="modal-content">
        <header className="modal-header">
          <div className="modal-header-title-wrap">
            {isDestructive && (
              <span className="modal-alert-icon" aria-hidden="true">
                <Icon name="alert" size={20} />
              </span>
            )}
            <h2 id={titleId} className="modal-title">
              {title}
            </h2>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            aria-label="بستن"
            onClick={onCancel}
          >
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="modal-body">
          <p id={descId} className="modal-message">
            {message}
          </p>
        </div>

        <footer className="modal-footer">
          <button
            ref={cancelBtnRef}
            type="button"
            className="button subtle"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            className={`button ${isDestructive ? 'danger' : 'primary'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </footer>
      </div>
    </dialog>
  );
}
