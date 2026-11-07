export interface NavItem {
  id: string;
  label: string;
  ico: string;
  active?: boolean;
  demoMessage?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'rooms', label: 'Quản lý phòng', ico: '▦' },
  { id: 'shifts', label: 'Nhân viên & ca làm', ico: '◷', demoMessage: 'Mục nhân viên và ca làm trong bản demo' },
  { id: 'customers', label: 'Khách hàng', ico: '♧', demoMessage: 'Danh sách khách hàng sẽ có trong bản cập nhật sau' },
  { id: 'reports', label: 'Báo cáo', ico: '▤' },
];
