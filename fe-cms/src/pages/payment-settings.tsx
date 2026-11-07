import React, { useState } from 'react';
import { Card, Form, Input, InputNumber, Button, Typography, Row, Col, Alert, Select, message } from 'antd';
import { SaveOutlined, BankOutlined, CheckCircleOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

export default function PaymentSettingsPage() {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const handleSave = (values: any) => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      message.success('Đã lưu cấu hình tài khoản nhận tiền VietQR!');
    }, 600);
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>Cấu Hình Cổng Thanh Toán VietQR</Title>
        <Text style={{ fontSize: 13, color: '#64748b' }}>
          Quản lý tài khoản ngân hàng thụ hưởng và thời gian chờ thanh toán tự động tại Kiosk
        </Text>
      </div>

      <Alert
        message="Hệ Thống Xác Nhận Tự Động VietQR Active"
        description="Khi khách hàng chuyển khoản quét mã VietQR tại Kiosk, tiền về tài khoản ngân hàng sẽ được xác nhận tự động trong 1–3 giây mà không cần nhân viên kiểm tra."
        type="info"
        showIcon
        icon={<CheckCircleOutlined />}
        style={{ marginBottom: 24, borderRadius: 10 }}
      />

      <Card className="kpi-card" bodyStyle={{ padding: 24 }}>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSave}
          initialValues={{
            bank_id: 'MB',
            account_number: '2225589999',
            account_name: 'NGUYEN XUAN KHOA',
            qr_template: 'compact',
            payment_timeout: 300,
            webhook_path: 'vietqr',
          }}
        >
          <Row gutter={24}>
            <Col xs={24} md={12}>
              <Form.Item
                name="bank_id"
                label="Ngân hàng nhận tiền"
                rules={[{ required: true }]}
              >
                <Select size="large">
                  <Select.Option value="MB">MB Bank (Ngân hàng Quân Đội)</Select.Option>
                  <Select.Option value="VCB">Vietcombank</Select.Option>
                  <Select.Option value="TCB">Techcombank</Select.Option>
                  <Select.Option value="ACB">ACB Bank</Select.Option>
                  <Select.Option value="BIDV">BIDV</Select.Option>
                  <Select.Option value="ICB">VietinBank</Select.Option>
                </Select>
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item
                name="account_number"
                label="Số tài khoản ngân hàng (STK)"
                rules={[{ required: true, message: 'Vui lòng nhập STK' }]}
              >
                <Input size="large" prefix={<BankOutlined />} placeholder="Ví dụ: 0987654321" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={24}>
            <Col xs={24} md={12}>
              <Form.Item
                name="account_name"
                label="Tên chủ tài khoản (In hoa không dấu)"
                rules={[{ required: true }]}
              >
                <Input size="large" placeholder="NGUYEN VAN A" />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item
                name="qr_template"
                label="Mẫu hiển thị VietQR"
              >
                <Select size="large">
                  <Select.Option value="compact">Gọn nhẹ (Compact VietQR)</Select.Option>
                  <Select.Option value="standard">Tiêu chuẩn có khung (Standard)</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={24}>
            <Col xs={24} md={12}>
              <Form.Item
                name="payment_timeout"
                label="Thời gian chờ quét mã (Giây)"
                rules={[{ required: true }]}
              >
                <InputNumber size="large" min={60} max={900} style={{ width: '100%' }} />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item
                name="webhook_path"
                label="Đường dẫn Webhook (Callback Path)"
              >
                <Input size="large" disabled prefix="/" />
              </Form.Item>
            </Col>
          </Row>

          <Button
            type="primary"
            htmlType="submit"
            icon={<SaveOutlined />}
            loading={saving}
            size="large"
            style={{
              background: '#f86fa5',
              borderColor: '#f86fa5',
              borderRadius: 8,
              marginTop: 12,
              padding: '0 32px',
            }}
          >
            Lưu Cấu Hình Thanh Toán
          </Button>
        </Form>
      </Card>
    </div>
  );
}
