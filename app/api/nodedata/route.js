import { NextResponse } from 'next/server';
import connectMongo from '@/lib/mongodb';
import NodeData from '@/models/NodeData';
import User from '@/models/User';
import { getServerSession } from "next-auth/next";

async function getUserId(email) {
  const user = await User.findOne({ email });
  return user ? user._id.toString() : null;
}

export async function POST(req) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { nodeId, notes, todos, activeRituals } = await req.json();
  await connectMongo();
  const userId = await getUserId(session.user.email);

  try {
    const data = await NodeData.findOneAndUpdate(
      { userId, nodeId },
      { notes, todos, activeRituals },
      { new: true, upsert: true }
    );
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(req) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  
  await connectMongo();
  const userId = await getUserId(session.user.email);
  
  const allNodes = await NodeData.find({ userId });
  return NextResponse.json(allNodes);
}