import type { AppProps } from 'next/app';
import Head from 'next/head';
import { AppProvider } from '@/providers/AppProvider';
import '@/index.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>Favori Foto · Quản lý phòng</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <AppProvider>
        <Component {...pageProps} />
      </AppProvider>
    </>
  );
}
