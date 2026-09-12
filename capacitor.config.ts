import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.richman.app",
  appName: "掌上大富翁",
  webDir: "web",
  // 嵌入式模式:WebView 直接加载由内嵌 Node.js 服务提供的页面与 API,
  // 全部走相对路径 /api 与 EventSource,同源即可。
  server: {
    url: process.env.CAPACITOR_SERVER_URL || "http://127.0.0.1:10086",
    cleartext: true,
    androidScheme: "http",
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;