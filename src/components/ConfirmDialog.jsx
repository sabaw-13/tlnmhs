import React from "react";
import { AlertTriangle, LogOut, Save, ShieldAlert } from "lucide-react";
import "./ConfirmDialog.css";

const toneConfig = {
  warning: {
    icon: AlertTriangle,
    eyebrow: "Please Confirm"
  },
  danger: {
    icon: LogOut,
    eyebrow: "Important Action"
  },
  info: {
    icon: Save,
    eyebrow: "Review Changes"
  },
  default: {
    icon: ShieldAlert,
    eyebrow: "Confirmation"
  }
};

const ConfirmDialog = ({
  title,
  message,
  tone = "warning",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  busy = false,
  onConfirm,
  onCancel
}) => {
  const { icon: Icon, eyebrow } = toneConfig[tone] || toneConfig.default;

  return (
    <div className="modal-overlay confirm-dialog-overlay" role="presentation">
      <div className={`modal-content confirm-dialog ${tone}`} role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <div className="confirm-dialog-accent" />
        <div className="confirm-dialog-body">
          <div className="confirm-dialog-icon">
            <Icon size={20} />
          </div>

          <div className="confirm-dialog-copy">
            <span className="confirm-dialog-eyebrow">{eyebrow}</span>
            <h3 id="confirm-dialog-title">{title}</h3>
            <p>{message}</p>
          </div>
        </div>

        <div className="confirm-dialog-actions">
          <button type="button" className="secondary-btn" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={tone === "danger" ? "danger-btn" : "primary-btn"}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Please wait..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
