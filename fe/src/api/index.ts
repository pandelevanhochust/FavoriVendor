export * from './client';
export * from './reportsApi';

// Placeholder API stubs for future backend integration
export const attendanceApi = {
  recordAttendance: async (name: string, action: 'in' | 'out', at: string) => {
    // Blank for now
    return true;
  },
};

export const bookingApi = {
  createBooking: async (bookingData: any) => {
    // Blank for now
    return null;
  },
  generateGuestLink: async (payload: any) => {
    // Blank for now
    return null;
  },
};

export const guestApi = {
  getGuestRecord: async (token: string) => {
    // Blank for now
    return null;
  },
  saveProfile: async (token: string, profile: any) => {
    // Blank for now
    return true;
  },
  submitRating: async (token: string, rating: string) => {
    // Blank for now
    return true;
  },
  submitFeedback: async (token: string, feedback: string) => {
    // Blank for now
    return true;
  },
};

export const managerApi = {
  getStatus: async () => {
    // Blank for now
    return { configured: false, authenticated: false };
  },
  login: async (password: string) => {
    // Blank for now
    return { success: true };
  },
  setup: async (password: string) => {
    // Blank for now
    return { success: true };
  },
  logout: async () => {
    // Blank for now
    return { success: true };
  },
  saveRooms: async (options: any) => {
    // Blank for now
    return null;
  },
  getStorage: async () => {
    // Blank for now
    return { customers: [], attendance: [] };
  },
};

export const stateApi = {
  getState: async () => {
    // Blank for now
    return null;
  },
  saveState: async (state: any) => {
    // Blank for now
    return true;
  },
};
