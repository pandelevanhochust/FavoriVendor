import React, { useState } from 'react';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { useRoomStore } from '@/store/roomStore';

export interface ManagerAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ManagerAccessModal: React.FC<ManagerAccessModalProps> = ({ isOpen, onClose }) => {
  const { managerConfigured, managerLogin, managerSetup } = useRoomStore();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const isSetup = !managerConfigured;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSetup) {
      if (password !== confirmPassword) {
        alert('Hai mật khẩu chưa khớp');
        return;
      }
      const ok = managerSetup(password);
      if (ok) {
        setPassword('');
        setConfirmPassword('');
        onClose();
      }
    } else {
      const ok = managerLogin(password);
      if (ok) {
        setPassword('');
        onClose();
      }
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isSetup ? 'Tạo tài khoản quản lý' : 'Đăng nhập quản lý'}
      subtitle={
        isSetup
          ? 'Đặt mật khẩu quản lý lần đầu. Mật khẩu chỉ được lưu dưới dạng mã hóa.'
          : 'Nhập mật khẩu quản lý để mở các công cụ quản lý.'
      }
    >
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Mật khẩu</label>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {isSetup && (
          <div className="field">
            <label>Nhập lại mật khẩu</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
        )}

        <Button variant="primary" full type="submit">
          {isSetup ? 'Tạo mật khẩu' : 'Đăng nhập'}
        </Button>
      </form>
    </Modal>
  );
};
