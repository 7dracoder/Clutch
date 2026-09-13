import { PhoneSender } from "@/app/phone/phone-sender";
import { isValidPhoneRoom } from "@/lib/phone-stream-store";

export default async function PhonePage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string }>;
}) {
  const requestedRoom = (await searchParams).room ?? "";
  const room = isValidPhoneRoom(requestedRoom)
    ? requestedRoom
    : "CLUTCH01";

  return <PhoneSender room={room} />;
}
