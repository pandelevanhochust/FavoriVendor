import React, { useState } from 'react';
import { useRoomStore } from '@/store/roomStore';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { cn } from '@/lib/utils';

export const CleaningReminder: React.FC = () => {
  const { showCleaningReminder, setShowCleaningReminder, showToast } = useRoomStore();
  const [selectedChecks, setSelectedChecks] = useState<Record<string, boolean>>({});

  const toggleCheck = (label: string) => {
    setSelectedChecks((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const skipClean = () => {
    setShowCleaningReminder(false);
    showToast('Đã hoãn nhắc dọn dẹp 20 phút');
  };

  const doneClean = () => {
    const active = Object.entries(selectedChecks)
      .filter(([, v]) => v)
      .map(([k]) => k);
    setShowCleaningReminder(false);
    setSelectedChecks({});
    showToast(
      active.length
        ? `Đã dọn xong · ${active.join(', ')}`
        : 'Đã đánh dấu dọn dẹp hoàn tất'
    );
  };

  return (
    <>
      <Card
        title="Lịch nhắc dọn dẹp"
        subtitle="Một lần mỗi ngày, sau đó cứ 4 giờ một lần."
        action={
          <Button size="small" variant="soft" onClick={() => setShowCleaningReminder(true)}>
            Nhắc ngay
          </Button>
        }
      >
        <div className="shiftbody">
          <div className="cleanhint">
            <span>✿</span>
            <span>
              Lần nhắc tiếp theo lúc <b>12:30 CH</b>
              <br />
              Nếu bỏ qua, sẽ nhắc lại sau 20 phút.
            </span>
          </div>
        </div>
      </Card>

      {/* Pop-up reminder with pixel runner animation */}
      <div className={cn('reminder', showCleaningReminder && 'show')}>
        <div className="remcard">
          <div className="pixel">🏃🏻‍♀️</div>
          <h2>Đến giờ dọn dẹp nhanh!</h2>
          <p>
            Đã đến lúc làm mới Favori Foto một chút.
            <br />
            Bạn và vị khách tiếp theo sẽ rất cảm ơn bạn.
          </p>
          <div className="checks">
            {['🧹 Lau sàn', '🪴 Sắp xếp lại', '✨ Lau kính & kệ'].map((item) => (
              <div
                key={item}
                className={cn('check', selectedChecks[item] && 'selected')}
                onClick={() => toggleCheck(item)}
              >
                {item}
              </div>
            ))}
          </div>
          <div className="remactions">
            <Button onClick={skipClean}>Bỏ qua · 20 phút</Button>
            <Button variant="primary" onClick={doneClean}>
              Hoàn tất
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};
