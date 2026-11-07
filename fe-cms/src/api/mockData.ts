export interface PhotoLayoutMock {
  id: number;
  name: string;
  slug: string;
  layout_mode: string;
  price: number;
  max_photos: number;
  capture_count: number;
  is_split: boolean;
  use_holes_auto_capture: boolean;
  is_active: boolean;
  frame_count: number;
  pricing_tiers?: { quantity: number; price: number }[];
}

export const INITIAL_LAYOUTS: PhotoLayoutMock[] = [
  {
    id: 1,
    name: "Layout 2 Cut Strips (Dải ảnh đôi)",
    slug: "1x4",
    layout_mode: "1x4",
    price: 50000,
    max_photos: 4,
    capture_count: 8,
    is_split: true,
    use_holes_auto_capture: true,
    is_active: true,
    frame_count: 12,
    pricing_tiers: [
      { quantity: 2, price: 50000 },
      { quantity: 4, price: 90000 },
      { quantity: 6, price: 130000 }
    ]
  },
  {
    id: 2,
    name: "Layout 2x2 Square (4 ảnh vuông)",
    slug: "2x2",
    layout_mode: "2x2",
    price: 60000,
    max_photos: 4,
    capture_count: 6,
    is_split: false,
    use_holes_auto_capture: true,
    is_active: true,
    frame_count: 8,
    pricing_tiers: [
      { quantity: 1, price: 60000 },
      { quantity: 2, price: 100000 }
    ]
  },
  {
    id: 3,
    name: "Layout 6 Photos Classic",
    slug: "2x3",
    layout_mode: "2x3",
    price: 70000,
    max_photos: 6,
    capture_count: 10,
    is_split: false,
    use_holes_auto_capture: false,
    is_active: true,
    frame_count: 5
  }
];

export interface PhotoFrameMock {
  id: number;
  name: string;
  category: string;
  layout_id: number;
  filename: string;
  thumbnail_url: string;
  holes_count: number;
  holes_metadata?: { x: number; y: number; w: number; h: number }[];
  is_active: boolean;
}

export const INITIAL_FRAMES: PhotoFrameMock[] = [
  {
    id: 101,
    name: "BearPink Vintage",
    category: "Cute Animals",
    layout_id: 1,
    filename: "bear_pink_strip.png",
    thumbnail_url: "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=300&auto=format&fit=crop&q=60",
    holes_count: 4,
    is_active: true
  },
  {
    id: 102,
    name: "Y2K Cyberpunk",
    category: "Y2K Aesthetic",
    layout_id: 1,
    filename: "y2k_glow_strip.png",
    thumbnail_url: "https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=300&auto=format&fit=crop&q=60",
    holes_count: 4,
    is_active: true
  },
  {
    id: 103,
    name: "Minimalist Pastel White",
    category: "Minimalist",
    layout_id: 2,
    filename: "pastel_white_2x2.png",
    thumbnail_url: "https://images.unsplash.com/photo-1518495973542-4542c06a5843?w=300&auto=format&fit=crop&q=60",
    holes_count: 4,
    is_active: true
  }
];

export interface KioskMachineMock {
  id: number;
  name: string;
  code: string;
  status: 'active' | 'offline' | 'busy';
  business_mode: 'photobooth' | 'selfbooth';
  ip_address: string;
  last_heartbeat: string;
}

export const INITIAL_MACHINES: KioskMachineMock[] = [
  {
    id: 1,
    name: "Máy Booth Quầy 01 (Cửa hàng chính)",
    code: "BOOTH-01",
    status: "active",
    business_mode: "photobooth",
    ip_address: "192.168.1.105",
    last_heartbeat: "Vừa xong (1 phút trước)"
  },
  {
    id: 2,
    name: "Máy Kiosk Tự Chụp Studio 02",
    code: "STUDIO-02",
    status: "active",
    business_mode: "selfbooth",
    ip_address: "192.168.1.106",
    last_heartbeat: "5 phút trước"
  }
];

export interface PhotoSessionMock {
  id: string;
  order_id: string;
  machine_code: string;
  layout_name: string;
  photos_count: number;
  created_at: string;
  share_token: string;
  preview_url: string;
}

export const INITIAL_SESSIONS: PhotoSessionMock[] = [
  {
    id: "SES-98211",
    order_id: "ORD-89211",
    machine_code: "BOOTH-01",
    layout_name: "Layout 2 Cut Strips",
    photos_count: 8,
    created_at: "Hôm nay 10:35",
    share_token: "hihi-share-883a12",
    preview_url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=60"
  },
  {
    id: "SES-98210",
    order_id: "ORD-89210",
    machine_code: "BOOTH-01",
    layout_name: "Layout 2x2 Square",
    photos_count: 4,
    created_at: "Hôm nay 09:15",
    share_token: "hihi-share-772b99",
    preview_url: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&auto=format&fit=crop&q=60"
  }
];
