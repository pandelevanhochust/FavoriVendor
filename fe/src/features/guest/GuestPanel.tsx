import React, { useState, useEffect } from 'react';
import { useRoomStore } from '@/store/roomStore';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { canStartRound, formatMinutesSeconds, elapsed } from '@/lib/timeUtils';

export const GuestPanel: React.FC = () => {
  const {
    activeGuest,
    options,
    guestStep,
    setGuestStep,
    guestState,
    updateGuestState,
    submitGuestRating,
    submitGuestFeedback,
    saveGuestSource,
    resetGuestFlow,
  } = useRoomStore();

  const [feedbackText, setFeedbackText] = useState('');
  const [sourceSavedNote, setSourceSavedNote] = useState('');

  // Find corresponding round
  const optionIdx = options.findIndex(
    (o) => o.room === activeGuest.room && o.label === activeGuest.label
  );
  const round = optionIdx >= 0 ? options[optionIdx]?.slots[activeGuest.time] : null;

  const isUnderway = round?.status === 'on air';
  const isFinished = round?.status === 'done';

  const readyToEnter =
    isUnderway || (optionIdx >= 0 && canStartRound(options, optionIdx, activeGuest.time));

  // Countdown timer calculation
  const [countdownText, setCountdownText] = useState('00:00');
  useEffect(() => {
    if (guestStep !== 4) return;

    const tick = () => {
      if (isUnderway && round) {
        setCountdownText(formatMinutesSeconds(elapsed(round)));
        return;
      }
      const ms = Math.max(0, (activeGuest.waitUntil || Date.now()) - Date.now());
      setCountdownText(formatMinutesSeconds(ms));
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [guestStep, isUnderway, round, activeGuest.waitUntil]);

  const renderHeader = (stepNum: number) => (
    <>
      <div className="guestlogo">❋ Favori Foto</div>
      <div className="progress">Lời chào nhỏ · bước {stepNum}/3</div>
    </>
  );

  return (
    <div id="guestPanel">
      <div className="heading">
        <div>
          <h1>Đón khách</h1>
          <p>Quét mã QR của nhân viên hoặc trải nghiệm quy trình dành cho khách tại đây.</p>
        </div>
        <div className="date">Liên kết riêng cho khách · không cần đăng nhập</div>
      </div>

      <Card
        style={{ maxWidth: '630px', margin: 'auto' }}
        title="Favori Foto · Lượt ghé thăm của bạn"
        subtitle="Lời chào ngắn trong lúc chúng tôi chuẩn bị phòng."
        action={<span className="tag">Sắp đến lượt</span>}
      >
        <div className="guest" style={{ padding: '28px' }}>
          {guestStep === 1 && (
            <div>
              {renderHeader(1)}
              <h3>Chào mừng bạn 🌿</h3>
              <p>Chúng tôi nên gọi bạn là gì khi phòng sẵn sàng?</p>
              <div className="field" style={{ maxWidth: '290px', margin: '14px auto' }}>
                <input
                  id="gname"
                  placeholder="Tên của bạn (không bắt buộc)"
                  value={guestState.name}
                  onChange={(e) => updateGuestState({ name: e.target.value })}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                <Button
                  variant="primary"
                  onClick={() => setGuestStep(2)}
                >
                  Tiếp tục
                </Button>
                <Button
                  onClick={() => {
                    updateGuestState({ name: '' });
                    setGuestStep(2);
                  }}
                >
                  Bỏ qua
                </Button>
              </div>
            </div>
          )}

          {guestStep === 2 && (
            <div>
              {renderHeader(2)}
              <h3>Đây có phải lần đầu bạn đến đây không?</h3>
              <p>Chúng tôi muốn biết thêm một chút về chuyến ghé thăm của bạn.</p>
              <div className="choices">
                <button
                  className="choice"
                  onClick={() => {
                    updateGuestState({ first: true });
                    setGuestStep(3);
                  }}
                >
                  Đúng, lần đầu tiên
                </button>
                <button
                  className="choice"
                  onClick={() => {
                    updateGuestState({ first: false });
                    setGuestStep(4);
                  }}
                >
                  Không, tôi đã từng đến
                </button>
              </div>
            </div>
          )}

          {guestStep === 3 && (
            <div>
              {renderHeader(3)}
              <h3>Bạn biết đến chúng tôi qua đâu?</h3>
              <p>Hãy chọn câu trả lời phù hợp.</p>
              <div className="choices">
                <button
                  className="choice"
                  onClick={() => {
                    updateGuestState({ source: 'Mạng xã hội' });
                    setGuestStep(5);
                  }}
                >
                  Mạng xã hội
                </button>
                <button
                  className="choice"
                  onClick={() => {
                    updateGuestState({ source: 'Đi ngang qua' });
                    setGuestStep(4);
                  }}
                >
                  Đi ngang qua
                </button>
                <button
                  className="choice"
                  onClick={() => {
                    updateGuestState({ source: 'Bạn bè giới thiệu' });
                    setGuestStep(4);
                  }}
                >
                  Được giới thiệu
                </button>
              </div>
            </div>
          )}

          {guestStep === 5 && (
            <div>
              {renderHeader(3)}
              <h3>Bạn biết đến chúng tôi qua mạng xã hội nào?</h3>
              <p>Chúng tôi muốn gửi lời cảm ơn đến bạn!</p>
              <div className="choices">
                {['Facebook', 'Threads', 'TikTok', 'Instagram'].map((s) => (
                  <button
                    key={s}
                    className="choice"
                    onClick={() => {
                      updateGuestState({ social: s });
                      setGuestStep(4);
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {guestStep === 4 && (
            <div>
              <div className="guestlogo">❋ Favori Foto</div>

              {isFinished ? (
                <div className="guest-rating">
                  <h2>Bạn hài lòng chứ?</h2>
                  <p>Đánh giá chúng tớ:</p>
                  {activeGuest.rating ? (
                    activeGuest.rating === 'sad' && !activeGuest.feedbackSubmitted ? (
                      <div className="guest-feedback">
                        <h2>Bọn mình có thể cải thiện điều gì?</h2>
                        <textarea
                          maxLength={1000}
                          placeholder="Chia sẻ ngắn với chúng tớ nhé…"
                          value={feedbackText}
                          onChange={(e) => setFeedbackText(e.target.value)}
                        />
                        <div className="feedback-actions">
                          <Button onClick={() => submitGuestFeedback('')}>
                            Bỏ qua
                          </Button>
                          <Button
                            variant="primary"
                            onClick={() => submitGuestFeedback(feedbackText)}
                          >
                            Gửi
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="guest-thankyou">
                        <h2>Cảm ơn bạn!</h2>
                        <p>Hẹn gặp lại bạn nha 💚</p>
                      </div>
                    )
                  ) : (
                    <div className="rating-options">
                      <button
                        className="rating-choice"
                        onClick={() => submitGuestRating('sad')}
                      >
                        <span className="rating-emoji">😞</span>
                        <span>Không hài lòng</span>
                      </button>
                      <button
                        className="rating-choice"
                        onClick={() => submitGuestRating('neutral')}
                      >
                        <span className="rating-emoji">😐</span>
                        <span>Ổn thôi</span>
                      </button>
                      <button
                        className="rating-choice"
                        onClick={() => submitGuestRating('happy')}
                      >
                        <span className="rating-emoji">😁</span>
                        <span>Mình sẽ quay lại nha</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : isUnderway ? (
                <div className="output">
                  <div className="guest-number">Lượt của bạn là số {activeGuest.number}</div>
                  <div className="gueststatus">Đến lượt bạn rồi đó! Chụp vui nhé!</div>
                  <div style={{ color: '#829087', marginTop: '10px' }}>
                    {activeGuest.room} · Lựa chọn {activeGuest.label}
                  </div>
                </div>
              ) : (
                <>
                  <h3>
                    Bạn đã hoàn tất{guestState.name ? `, ${guestState.name}` : ''} ✨
                  </h3>
                  <p>Chúng tôi sẽ gọi bạn khi đến lượt.</p>

                  <div className="output">
                    {readyToEnter && (
                      <div className="yourturn">
                        Đến lượt bạn!
                        <br />
                        Mời vào!
                      </div>
                    )}
                    <b>Số thứ tự của bạn là #{activeGuest.number}.</b>
                    <br />
                    {readyToEnter ? (
                      'Phòng của bạn đã sẵn sàng!'
                    ) : (
                      <>
                        Đang chờ đến lượt · còn <b>{countdownText}</b> nữa
                      </>
                    )}
                    <br />
                    <span style={{ color: '#829087' }}>
                      {activeGuest.room} · Lựa chọn {activeGuest.label}
                    </span>

                    {round?.status === 'waiting' && (
                      <div className="guest-source">
                        <label htmlFor="guestSource">Bạn biết đến chúng tớ qua đâu?</label>
                        <select
                          id="guestSource"
                          value={activeGuest.profile?.source || ''}
                          onChange={(e) => {
                            saveGuestSource(e.target.value);
                            setSourceSavedNote('Đã lưu câu trả lời');
                          }}
                        >
                          <option value="">Chọn câu trả lời (không bắt buộc)</option>
                          <option value="Mạng xã hội">Mạng xã hội</option>
                          <option value="Bạn bè giới thiệu">Bạn bè giới thiệu</option>
                          <option value="Đi ngang qua">Đi ngang qua</option>
                          <option value="Khác">Khác</option>
                        </select>
                        <span>{sourceSavedNote}</span>
                      </div>
                    )}
                  </div>
                </>
              )}

              <p style={{ fontSize: '10px', marginTop: '14px', color: '#8b968d' }}>
                Cảm ơn bạn đã ghé Favori Foto
              </p>
              <Button size="small" onClick={resetGuestFlow}>
                Bắt đầu lại
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};
