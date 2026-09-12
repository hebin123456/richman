import type { Metadata } from "next";

import { TabletopHelper } from "@/components/tabletop-helper";

export const metadata: Metadata = {
  title: "实体局助手 | 掌上大富翁",
  description: "给线下大富翁实体局使用的掷骰、抽卡和记账助手。",
};

export default function TabletopPage() {
  return <TabletopHelper />;
}
