import { requireUser } from "@/lib/auth/require-user";

export default async function CreateRoomPage() {
  await requireUser();

  return <div>Create Room</div>;
}
