import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { Form, Input, Button, Card, Typography, Alert, Space } from 'antd';
import { UserOutlined, LockOutlined, CameraOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import { LoadingCircle } from '../components/common/LoadingCircle';

const { Title, Text } = Typography;

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, isLoading } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      setIsRedirecting(true);
      router.replace('/');
    }
  }, [isAuthenticated, isLoading, router]);

  const onFinish = async (values: { username: string; password: string }) => {
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await login(values.username.trim(), values.password);
      setIsRedirecting(true);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Tên đăng nhập hoặc mật khẩu không chính xác.';
      setErrorMsg(msg);
      setIsRedirecting(false);
      setSubmitting(false);
    }
  };

  return (
    <>
      <Head>
        <title>Đăng nhập | Favori CMS PhotoBooth</title>
      </Head>

      {/* High-Agency Loading Circle during Authentication & Route Transition */}
      {(submitting || isRedirecting) && (
        <LoadingCircle
          fullScreen
          title={isRedirecting ? 'Đăng nhập thành công!' : 'Đang xác thực thông tin...'}
          subtitle={
            isRedirecting
              ? 'Đang khởi tạo không gian làm việc & chuyển hướng đến trang chủ...'
              : 'Hệ thống đang kiểm tra bảo mật và đồng bộ phiên làm việc...'
          }
        />
      )}

      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
          padding: '24px',
        }}
      >
        <Card
          bordered={false}
          style={{
            width: '100%',
            maxWidth: 420,
            borderRadius: 16,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
            background: '#ffffff',
            padding: '12px 8px',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                display: 'inline-flex',
                justifyContent: 'center',
                alignItems: 'center',
                color: '#fff',
                fontSize: 28,
                marginBottom: 12,
                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)',
              }}
            >
              <CameraOutlined />
            </div>
            <Title level={3} style={{ margin: 0, fontWeight: 700, color: '#0f172a' }}>
              Favori PhotoBooth
            </Title>
            <Text type="secondary" style={{ fontSize: 14 }}>
              Hệ thống Quản trị & Đối soát Doanh thu
            </Text>
          </div>

          {errorMsg && (
            <Alert
              message={errorMsg}
              type="error"
              showIcon
              closable
              onClose={() => setErrorMsg(null)}
              style={{ marginBottom: 20, borderRadius: 8 }}
            />
          )}

          <Form
            name="login_form"
            layout="vertical"
            initialValues={{ username: 'admin', password: 'admin' }}
            onFinish={onFinish}
            size="large"
          >
            <Form.Item
              name="username"
              rules={[{ required: true, message: 'Vui lòng nhập tên đăng nhập!' }]}
            >
              <Input
                prefix={<UserOutlined style={{ color: '#94a3b8' }} />}
                placeholder="Tên đăng nhập (ví dụ: admin)"
                autoComplete="username"
                disabled={submitting || isRedirecting}
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[{ required: true, message: 'Vui lòng nhập mật khẩu!' }]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: '#94a3b8' }} />}
                placeholder="Mật khẩu"
                autoComplete="current-password"
                disabled={submitting || isRedirecting}
              />
            </Form.Item>

            <Form.Item style={{ marginBottom: 16 }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={submitting || isRedirecting}
                block
                style={{
                  height: 46,
                  borderRadius: 10,
                  fontSize: 15,
                  fontWeight: 600,
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                }}
              >
                {isRedirecting ? 'Đang chuyển hướng...' : submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
              </Button>
            </Form.Item>
          </Form>

          <div
            style={{
              textAlign: 'center',
              padding: '12px',
              background: '#f8fafc',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
            }}
          >
            <Space>
              <SafetyCertificateOutlined style={{ color: '#10b981' }} />
              <Text type="secondary" style={{ fontSize: 13 }}>
                Tài khoản mặc định: <b>admin</b> / <b>admin</b>
              </Text>
            </Space>
          </div>
        </Card>
      </div>
    </>
  );
}
