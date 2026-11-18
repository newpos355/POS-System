import React from 'react';
import Modal from './Modal';
import Button from './Button';
import { FiAlertTriangle, FiInfo } from 'react-icons/fi';

const ConfirmDialog = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  variant = 'danger',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  loading = false,
}) => {
  const Icon = variant === 'danger' ? FiAlertTriangle : FiInfo;
  const iconColor = variant === 'danger' ? 'text-danger' : 'text-warning';

  const footer = (
    <>
      <Button variant="ghost" onClick={onClose} disabled={loading}>
        {cancelLabel}
      </Button>
      <Button variant={variant} onClick={onConfirm} loading={loading}>
        {confirmLabel}
      </Button>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Confirmation Required" footer={footer} size="sm">
      <div className="flex items-start gap-4">
        <div className={`mt-1 ${iconColor}`}>
          <Icon size={24} />
        </div>
        <div>
          <h4 className="font-semibold text-lg mb-1">{title}</h4>
          <p className="text-secondary">{message}</p>
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmDialog;
