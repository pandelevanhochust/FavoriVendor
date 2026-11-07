import React, { useState } from 'react';
import { Button } from '@/components/Button';
import { getBaseApiUrl, setBaseApiUrl, DEFAULT_API_URL, DEFAULT_RENDER_URL } from '@/api/client';

export interface ReportFilterState {
  dateMode: 'single' | 'range';
  date: string;
  fromDate: string;
  toDate: string;
  hourPreset: 'all' | 'morning' | 'afternoon' | 'evening' | 'custom';
  fromHour: number;
  toHour: number;
  type: string;
  status: string;
  search: string;
}

export interface ReportFilterBarProps {
  filter: ReportFilterState;
  onChangeFilter: (updates: Partial<ReportFilterState>) => void;
  onRefresh: () => void;
  isLoading: boolean;
}

export const ReportFilterBar: React.FC<ReportFilterBarProps> = ({
  filter,
  onChangeFilter,
  onRefresh,
  isLoading,
}) => {
  const [showServerModal, setShowServerModal] = useState(false);
  const [serverUrlInput, setServerUrlInput] = useState(getBaseApiUrl());

  // Quick Date Helpers
  const setQuickDate = (mode: 'today' | 'yesterday' | 'week' | 'month') => {
    const now = new Date();
    const formatYMD = (d: Date) => d.toISOString().slice(0, 10);

    if (mode === 'today') {
      const todayStr = formatYMD(now);
      onChangeFilter({
        dateMode: 'single',
        date: todayStr,
        fromDate: '',
        toDate: '',
      });
    } else if (mode === 'yesterday') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yStr = formatYMD(y);
      onChangeFilter({
        dateMode: 'single',
        date: yStr,
        fromDate: '',
        toDate: '',
      });
    } else if (mode === 'week') {
      const w = new Date(now);
      w.setDate(w.getDate() - 7);
      onChangeFilter({
        dateMode: 'range',
        date: '',
        fromDate: formatYMD(w),
        toDate: formatYMD(now),
      });
    } else if (mode === 'month') {
      const m = new Date(now.getFullYear(), now.getMonth(), 1);
      onChangeFilter({
        dateMode: 'range',
        date: '',
        fromDate: formatYMD(m),
        toDate: formatYMD(now),
      });
    }
  };

  const handleHourPreset = (preset: 'all' | 'morning' | 'afternoon' | 'evening' | 'custom') => {
    switch (preset) {
      case 'all':
        onChangeFilter({ hourPreset: 'all', fromHour: 0, toHour: 23 });
        break;
      case 'morning':
        onChangeFilter({ hourPreset: 'morning', fromHour: 8, toHour: 12 });
        break;
      case 'afternoon':
        onChangeFilter({ hourPreset: 'afternoon', fromHour: 12, toHour: 17 });
        break;
      case 'evening':
        onChangeFilter({ hourPreset: 'evening', fromHour: 17, toHour: 22 });
        break;
      case 'custom':
        onChangeFilter({ hourPreset: 'custom' });
        break;
    }
  };

  const handleSaveServerUrl = () => {
    setBaseApiUrl(serverUrlInput);
    setShowServerModal(false);
    onRefresh();
  };

  return (
    <div className="filter-card">
      <div className="filter-grid">
        {/* Date Filter Selection */}
        <div>
          <label style={{ fontSize: '11px', fontWeight: 600, color: '#68746b' }}>
            Thời gian lọc (Ngày)
          </label>
          <div className="filter-chips">
            <button
              className={`filter-chip ${filter.dateMode === 'single' && filter.date === new Date().toISOString().slice(0, 10) ? 'active' : ''}`}
              onClick={() => setQuickDate('today')}
            >
              Hôm nay
            </button>
            <button
              className="filter-chip"
              onClick={() => setQuickDate('yesterday')}
            >
              Hôm qua
            </button>
            <button
              className={`filter-chip ${filter.dateMode === 'range' && filter.fromDate ? 'active' : ''}`}
              onClick={() => setQuickDate('week')}
            >
              7 ngày qua
            </button>
            <button
              className="filter-chip"
              onClick={() => setQuickDate('month')}
            >
              Tháng này
            </button>
          </div>

          <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
            {filter.dateMode === 'single' ? (
              <input
                type="date"
                value={filter.date}
                onChange={(e) => onChangeFilter({ date: e.target.value })}
                style={{
                  border: '1px solid var(--line)',
                  borderRadius: '8px',
                  padding: '7px 9px',
                  fontSize: '12px',
                  width: '100%',
                }}
              />
            ) : (
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center', width: '100%' }}>
                <input
                  type="date"
                  value={filter.fromDate}
                  onChange={(e) => onChangeFilter({ fromDate: e.target.value })}
                  style={{
                    border: '1px solid var(--line)',
                    borderRadius: '8px',
                    padding: '7px 6px',
                    fontSize: '11px',
                    width: '50%',
                  }}
                />
                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>→</span>
                <input
                  type="date"
                  value={filter.toDate}
                  onChange={(e) => onChangeFilter({ toDate: e.target.value })}
                  style={{
                    border: '1px solid var(--line)',
                    borderRadius: '8px',
                    padding: '7px 6px',
                    fontSize: '11px',
                    width: '50%',
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Hour Range Filter */}
        <div>
          <label style={{ fontSize: '11px', fontWeight: 600, color: '#68746b' }}>
            Khung giờ (Ca trực)
          </label>
          <div className="filter-chips">
            <button
              className={`filter-chip ${filter.hourPreset === 'all' ? 'active' : ''}`}
              onClick={() => handleHourPreset('all')}
            >
              Cả ngày (00h-24h)
            </button>
            <button
              className={`filter-chip ${filter.hourPreset === 'morning' ? 'active' : ''}`}
              onClick={() => handleHourPreset('morning')}
            >
              Sáng (08-12h)
            </button>
            <button
              className={`filter-chip ${filter.hourPreset === 'afternoon' ? 'active' : ''}`}
              onClick={() => handleHourPreset('afternoon')}
            >
              Chiều (12-17h)
            </button>
            <button
              className={`filter-chip ${filter.hourPreset === 'evening' ? 'active' : ''}`}
              onClick={() => handleHourPreset('evening')}
            >
              Tối (17-22h)
            </button>
          </div>

          <div className="hour-slider-box">
            <div className="hour-slider-row">
              <span>Khoảng giờ:</span>
              <b>
                {String(filter.fromHour).padStart(2, '0')}:00 - {String(filter.toHour).padStart(2, '0')}:59
              </b>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="range"
                min="0"
                max="23"
                value={filter.fromHour}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  onChangeFilter({
                    fromHour: Math.min(val, filter.toHour),
                    hourPreset: 'custom',
                  });
                }}
                style={{ width: '50%', accentColor: 'var(--green)' }}
              />
              <input
                type="range"
                min="0"
                max="23"
                value={filter.toHour}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  onChangeFilter({
                    toHour: Math.max(val, filter.fromHour),
                    hourPreset: 'custom',
                  });
                }}
                style={{ width: '50%', accentColor: 'var(--green)' }}
              />
            </div>
          </div>
        </div>

        {/* Type & Status Selectors */}
        <div>
          <label style={{ fontSize: '11px', fontWeight: 600, color: '#68746b' }}>
            Hình thức & Trạng thái
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '6px' }}>
            <select
              value={filter.type}
              onChange={(e) => onChangeFilter({ type: e.target.value })}
              style={{
                border: '1px solid var(--line)',
                borderRadius: '8px',
                padding: '8px 9px',
                fontSize: '11px',
                background: '#fff',
              }}
            >
              <option value="all">Tất cả loại tiền</option>
              <option value="cash">💵 Tiền mặt</option>
              <option value="bank">💳 VietQR (Bank)</option>
              <option value="no_order">🟣 Thiết bị khác</option>
            </select>

            <select
              value={filter.status}
              onChange={(e) => onChangeFilter({ status: e.target.value })}
              style={{
                border: '1px solid var(--line)',
                borderRadius: '8px',
                padding: '8px 9px',
                fontSize: '11px',
                background: '#fff',
              }}
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="PAID">Đã thanh toán (PAID)</option>
              <option value="PENDING">Chờ xử lý (PENDING)</option>
              <option value="EXPIRED">Hết hạn (EXPIRED)</option>
              <option value="CANCELLED">Đã huỷ (CANCELLED)</option>
            </select>
          </div>

          <div style={{ marginTop: '8px' }}>
            <input
              placeholder="🔍 Tìm mã đơn, mã GD, nội dung..."
              value={filter.search}
              onChange={(e) => onChangeFilter({ search: e.target.value })}
              style={{
                border: '1px solid var(--line)',
                borderRadius: '8px',
                padding: '7px 9px',
                fontSize: '11px',
                width: '100%',
              }}
            />
          </div>
        </div>

        {/* Action Buttons: Refresh & Server Setting */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Button
            variant="primary"
            disabled={isLoading}
            onClick={onRefresh}
            style={{ minWidth: '110px', height: '38px', fontSize: '12px' }}
          >
            {isLoading ? 'Đang tải...' : '🔄 Làm mới'}
          </Button>

          <button
            className="button"
            title="Cấu hình địa chỉ Server API"
            onClick={() => setShowServerModal(true)}
            style={{ height: '38px', padding: '0 12px', fontSize: '12px' }}
          >
            ⚙️ Server
          </button>
        </div>
      </div>

      {/* Server Configuration Modal */}
      {showServerModal && (
        <div
          className="modalback show"
          onClick={() => setShowServerModal(false)}
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '440px' }}
          >
            <div className="modalhead">
              <div>
                <h3>Cấu hình kết nối Server API</h3>
                <p>Chọn kết nối tới server chạy Local hoặc máy chủ Render trực tuyến.</p>
              </div>
              <button className="x" onClick={() => setShowServerModal(false)}>
                ×
              </button>
            </div>

            <div className="field">
              <label>Địa chỉ API Server</label>
              <input
                value={serverUrlInput}
                onChange={(e) => setServerUrlInput(e.target.value)}
                placeholder="http://localhost:5000 hoặc https://..."
              />
            </div>

            <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
              <button
                className="filter-chip"
                onClick={() => setServerUrlInput(DEFAULT_API_URL)}
              >
                Local (5000)
              </button>
              <button
                className="filter-chip"
                onClick={() => setServerUrlInput(DEFAULT_RENDER_URL)}
              >
                Render Cloud
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <Button onClick={() => setShowServerModal(false)}>Hủy</Button>
              <Button variant="primary" onClick={handleSaveServerUrl}>
                Lưu & Kết nối lại
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
