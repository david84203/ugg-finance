import './globals.css';

export const metadata = {
  title: '烏嘎嘎記帳',
  description: '烏嘎嘎桌遊店財務管理',
  manifest: '/manifest.json',
  themeColor: '#f97316',
  icons: { icon: '/icon.svg' },
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-TW">
      <body>{children}</body>
    </html>
  );
}
