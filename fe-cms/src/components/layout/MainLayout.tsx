import React, { useState } from 'react';
import { Layout, ConfigProvider } from 'antd';
import { AppSidebar } from './AppSidebar';
import { AppHeader } from './AppHeader';

const { Sider, Content } = Layout;

interface MainLayoutProps {
  children: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);

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
        {/* Sider Sidebar */}
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

        {/* Main Content Area */}
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
