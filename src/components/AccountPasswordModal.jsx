import React, { useEffect, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";

const AccountPasswordModal = ({
  accountLabel,
  defaultPassword = "",
  description,
  saving = false,
  title,
  onClose,
  onSubmit
}) => {
  const [password, setPassword] = useState(defaultPassword);
  const [confirmState, setConfirmState] = useState(null);

  useEffect(() => {
    setPassword(defaultPassword);
    setConfirmState(null);
  }, [defaultPassword]);

  const handleSubmitRequest = (event) => {
    event.preventDefault();
    setConfirmState({
      tone: "warning",
      title: `Reset ${accountLabel} password?`,
      message: "The current password will stop working once the new password is saved."
    });
  };

  const handleConfirmAction = async () => {
    try {
      await onSubmit(password);
    } finally {
      setConfirmState(null);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content password-modal">
        <div className="panel-header">
          <h3>{title}</h3>
          <span className="meta-badge">Security</span>
        </div>

        {description && <p className="muted-text">{description}</p>}

        <form onSubmit={handleSubmitRequest}>
          <div className="form-group">
            <label>New Password</label>
            <input
              type="text"
              minLength="6"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter at least 6 characters"
              required
            />
          </div>

          <div className="modal-actions">
            <button type="submit" className="primary-btn">
              {saving ? "Saving..." : "Reset Password"}
            </button>
            <button type="button" className="secondary-btn" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>

      {confirmState && (
        <ConfirmDialog
          tone={confirmState.tone}
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel="Reset Password"
          cancelLabel="Go Back"
          busy={saving}
          onConfirm={handleConfirmAction}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </div>
  );
};

export default AccountPasswordModal;
