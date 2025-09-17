/**
 * Admin Confirmation Dialog for System Admin Actions
 * Provides secure confirmation modal for critical admin operations
 */

import React, { useState, useEffect } from 'react';
import './AdminConfirmDialog.css';

interface AdminConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  targetUser: string;
  issueKey: string;
  adminUser?: string;
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  requireReason?: boolean;
  isDangerous?: boolean;
}

const AdminConfirmDialog: React.FC<AdminConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  targetUser,
  issueKey,
  adminUser,
  onConfirm,
  onCancel,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  requireReason = false,
  isDangerous = true
}) => {
  const [reason, setReason] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setReason('');
      setIsConfirming(false);
    }
  }, [isOpen]);

  const handleConfirm = async () => {
    if (requireReason && !reason.trim()) {
      return; // Don't proceed without reason when required
    }

    setIsConfirming(true);
    try {
      await onConfirm(reason.trim() || undefined);
    } finally {
      setIsConfirming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    } else if (e.key === 'Enter' && e.ctrlKey) {
      handleConfirm();
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="admin-confirm-overlay" onKeyDown={handleKeyDown} tabIndex={-1}>
      <div className={`admin-confirm-dialog ${isDangerous ? 'dangerous' : ''}`}>
        {/* Header */}
        <div className="admin-confirm-header">
          <div className="admin-confirm-icon">
            {isDangerous ? '🛡️⚠️' : '🛡️'}
          </div>
          <h3 className="admin-confirm-title">{title}</h3>
        </div>

        {/* Content */}
        <div className="admin-confirm-content">
          <p className="admin-confirm-message">{message}</p>

          {/* Action Details */}
          <div className="admin-action-details">
            <div className="action-detail">
              <span className="detail-label">Usuário Alvo:</span>
              <span className="detail-value user-target">{targetUser}</span>
            </div>
            <div className="action-detail">
              <span className="detail-label">Issue:</span>
              <span className="detail-value issue-key">{issueKey}</span>
            </div>
            {adminUser && (
              <div className="action-detail">
                <span className="detail-label">Admin:</span>
                <span className="detail-value admin-user">{adminUser}</span>
              </div>
            )}
          </div>

          {/* Reason Input */}
          <div className="reason-section">
            <label htmlFor="cancel-reason" className="reason-label">
              Motivo {requireReason ? '(obrigatório)' : '(opcional)'}:
            </label>
            <textarea
              id="cancel-reason"
              className="reason-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Descreva o motivo para cancelar este timer..."
              rows={3}
              maxLength={500}
              autoFocus
            />
            <div className="reason-counter">
              {reason.length}/500 caracteres
            </div>
          </div>

          {/* Warning for dangerous actions */}
          {isDangerous && (
            <div className="admin-warning">
              <span className="warning-icon">⚠️</span>
              <span className="warning-text">
                Esta ação será registrada no log de auditoria e não pode ser desfeita.
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="admin-confirm-actions">
          <button
            className="admin-confirm-cancel"
            onClick={onCancel}
            disabled={isConfirming}
          >
            {cancelText}
          </button>
          <button
            className={`admin-confirm-submit ${isDangerous ? 'dangerous' : ''}`}
            onClick={handleConfirm}
            disabled={isConfirming || (requireReason && !reason.trim())}
          >
            {isConfirming ? (
              <>
                <span className="loading-spinner">⟳</span>
                <span>Processando...</span>
              </>
            ) : (
              <>
                <span className="confirm-icon">🛡️</span>
                <span>{confirmText}</span>
              </>
            )}
          </button>
        </div>

        {/* Keyboard shortcuts hint */}
        <div className="keyboard-hints">
          <span>ESC para cancelar</span>
          <span>Ctrl+Enter para confirmar</span>
        </div>
      </div>
    </div>
  );
};

export default AdminConfirmDialog;