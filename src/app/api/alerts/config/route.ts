export const dynamic = "force-dynamic";

export async function GET() {
  const publicKey = process.env.CLASSSTATUS_VAPID_PUBLIC_KEY?.trim();
  return Response.json({ enabled: Boolean(publicKey), publicKey: publicKey || undefined }, {
    headers: { "Cache-Control": "no-store, private" },
  });
}
