export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import connectMongo from '@/lib/mongodb';
import User from '@/models/User';
import { getServerSession } from "next-auth/next";

export async function GET() {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  
  await connectMongo();
  const user = await User.findOne({ email: session.user.email });
  return NextResponse.json({ 
    systemStartDate: user?.systemStartDate || '2026-01-01',
    sandboxes: user?.sandboxes || [] // Récupère les dimensions
  });
}

export async function PUT(req) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  
  const { systemStartDate, sandboxes } = await req.json();
  await connectMongo();
  
  const updateData = {};
  if (systemStartDate) updateData.systemStartDate = systemStartDate;
  if (sandboxes) updateData.sandboxes = sandboxes;

  await User.findOneAndUpdate({ email: session.user.email }, updateData);
  return NextResponse.json({ success: true });
}