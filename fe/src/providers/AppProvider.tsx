import React from 'react';
import { RoomStoreProvider, useRoomStore } from '@/store/roomStore';
import { Toast } from '@/components/Toast';

const GlobalToast: React.FC = () => {
  const { toastMessage, toastVisible } = useRoomStore();
  return <Toast message={toastMessage} isVisible={toastVisible} />;
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <RoomStoreProvider>
      {children}
      <GlobalToast />
    </RoomStoreProvider>
  );
};
