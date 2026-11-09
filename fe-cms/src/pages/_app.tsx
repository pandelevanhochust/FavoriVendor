import React from 'react';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import { AuthProvider } from '../context/AuthContext';
import { MainLayout } from '../components/layout/MainLayout';
import '../styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <AuthProvider>
      <Head>
        <title>Favori CMS - PhotoBooth Management</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <MainLayout>
        <Component {...pageProps} />
      </MainLayout>
    </AuthProvider>
  );
}
