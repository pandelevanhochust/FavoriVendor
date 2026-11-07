import { useRoomStore } from '@/store/roomStore';

export const useToast = () => {
  const { showToast, toastMessage, toastVisible } = useRoomStore();
  return { showToast, toastMessage, toastVisible };
};
