import { NextResponse } from "next/server";
import { fetchShowcaseModels } from "@/lib/showcase-models";

export const revalidate = 86400;

export async function GET() {
  const payload = await fetchShowcaseModels();
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
    },
  });
}
