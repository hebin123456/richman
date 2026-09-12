import { GameHost } from "@/game-client/phaser/GameHost";

interface RoomPageProps {
  params: Promise<{ roomCode: string }>;
}

export default async function RoomPage({ params }: RoomPageProps) {
  const { roomCode } = await params;
  return <GameHost route={{ kind: "room", roomCode }} />;
}
