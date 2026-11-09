import React, { useState, useEffect } from 'react';
import { Layout, ConfigProvider } from 'antd';
import { useRouter } from 'next/router';
import { AppSidebar } from './AppSidebar';
import { AppHeader } from './AppHeader';
import { useAuth } from '../../context/AuthContext';
import { LoadingCircle } from '../common/LoadingCircle';

const { Sider, Content } = Layout;

interface MainLayoutProps {
  children: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const isLoginPage = router.pathname === '/login';

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isLoginPage) {
      router.replace('/login');
    }
  }, [isLoading, isAuthenticated, isLoginPage, router]);

  // If on login page, render children directly without dashboard shell
  if (isLoginPage) {
    return <>{children}</>;
  }

  // Loading state while checking authentication
  if (isLoading) {
    return (
      <LoadingCircle
        fullScreen
        title="Favori PhotoBooth"
        subtitle="Đang tải dữ liệu phiên làm việc..."
      />
    );
  }

  // If not authenticated, do not show dashboard shell while redirecting
  if (!isAuthenticated) {
    return (
      <LoadingCircle
        fullScreen
        title="Đang chuyển hướng..."
        subtitle="Chuyển đến màn hình đăng nhập..."
      />
    );
  }

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#f86fa5',
          borderRadius: 8,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          colorBgContainer: '#ffffff',
          colorBgLayout: '#f6f8fb',
        },
      }}
    >
      <Layout style={{ minHeight: '100vh' }}>
        <Sider
          trigger={null}
          collapsible
          collapsed={collapsed}
          width={240}
          collapsedWidth={70}
          style={{
            background: '#ffffff',
            borderRight: '1px solid #f1f5f9',
            position: 'sticky',
            top: 0,
            height: '100vh',
            zIndex: 100,
          }}
        >
          <AppSidebar collapsed={collapsed} />
        </Sider>

        <Layout>
          <AppHeader
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed(!collapsed)}
          />
          <Content
            style={{
              padding: '24px',
              minHeight: 280,
              maxWidth: 1400,
              margin: '0 auto',
              width: '100%',
            }}
          >
            {children}
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
};
