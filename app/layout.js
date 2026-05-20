import './globals.css';

export const metadata = {
  title: '烏嘎嘎記帳',
  description: '烏嘎嘎桌遊店財務管理',
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-TW">
      <body>{children}</body>
    </html>
  );
}
