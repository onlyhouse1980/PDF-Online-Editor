import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const family = searchParams.get("family");
  
  if (!family) {
    return NextResponse.json({ error: "Missing family" }, { status: 400 });
  }

  const url = `https://gwfh.mranftl.com/api/fonts/${family}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch from font API" }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
